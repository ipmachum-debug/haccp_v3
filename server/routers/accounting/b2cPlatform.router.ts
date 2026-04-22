/**
 * B2C 플랫폼 정산 라우터 (Phase 2, 2026-04-22)
 *
 * 기능:
 *   1. 셀러 CRUD (플랫폼 × 셀러 계정 관리)
 *   2. 매출 항목 입력 (플랫폼 × 셀러 × 결제수단 × 월)
 *   3. 분기/월별 조회 + 집계
 *   4. 분기 확정 → 자동 분개 생성 (Phase 3, 2026-04-22)
 *   5. 분기 확정 해제 (역분개)
 */

import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../_core/trpc";
import { getRawConnection, withTransaction } from "../../db";
import { resolveSystemAccount, insertJournalLine } from "../../db/accounting/journalHelper";
import { SYSTEM_ACCOUNTS } from "../../../drizzle/schema/accountingAccounts";

export const b2cPlatformRouter = router({
  // ─── 셀러 관리 ──────────────────────────────────────────

  /** 플랫폼 (b2c_platform 타입 파트너) 목록 + 각 플랫폼의 셀러 */
  listPlatforms: tenantRequiredProcedure.query(async ({ ctx }) => {
    const conn = await getRawConnection();
    const [rows] = await conn.execute(
      `SELECT
         p.id AS platform_id,
         p.company_name AS platform_name,
         (SELECT COUNT(*) FROM b2c_sellers s
            WHERE s.tenant_id = ? AND s.platform_partner_id = p.id AND s.is_active = 1) AS seller_count,
         (SELECT COUNT(*) FROM b2c_sales_entries e
            WHERE e.tenant_id = ? AND e.platform_partner_id = p.id) AS entry_count
       FROM partners p
       WHERE p.tenant_id = ? AND p.customer_type = 'b2c_platform' AND p.is_active = 1
       ORDER BY p.company_name ASC`,
      [ctx.tenantId, ctx.tenantId, ctx.tenantId],
    );
    return rows as Array<{
      platform_id: number;
      platform_name: string;
      seller_count: number;
      entry_count: number;
    }>;
  }),

  /** 특정 플랫폼의 셀러 목록 */
  listSellers: tenantRequiredProcedure
    .input(z.object({ platformPartnerId: z.number() }))
    .query(async ({ input, ctx }) => {
      const conn = await getRawConnection();
      const [rows] = await conn.execute(
        `SELECT id, platform_partner_id, seller_code, seller_name, notes, is_active, created_at
           FROM b2c_sellers
          WHERE tenant_id = ? AND platform_partner_id = ?
          ORDER BY seller_code ASC`,
        [ctx.tenantId, input.platformPartnerId],
      );
      return rows as Array<{
        id: number;
        platform_partner_id: number;
        seller_code: string;
        seller_name: string | null;
        notes: string | null;
        is_active: number;
        created_at: Date;
      }>;
    }),

  /** 셀러 생성 */
  createSeller: tenantRequiredProcedure
    .input(
      z.object({
        platformPartnerId: z.number(),
        sellerCode: z.string().min(1).max(100),
        sellerName: z.string().max(200).optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const conn = await getRawConnection();
      const [result] = await conn.execute(
        `INSERT INTO b2c_sellers
           (tenant_id, platform_partner_id, seller_code, seller_name, notes)
         VALUES (?, ?, ?, ?, ?)`,
        [
          ctx.tenantId,
          input.platformPartnerId,
          input.sellerCode,
          input.sellerName ?? null,
          input.notes ?? null,
        ],
      );
      return { id: (result as { insertId: number }).insertId };
    }),

  /** 셀러 수정 */
  updateSeller: tenantRequiredProcedure
    .input(
      z.object({
        id: z.number(),
        sellerCode: z.string().min(1).max(100).optional(),
        sellerName: z.string().max(200).optional(),
        notes: z.string().optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const conn = await getRawConnection();
      const fields: string[] = [];
      const values: any[] = [];
      if (input.sellerCode !== undefined) {
        fields.push("seller_code = ?");
        values.push(input.sellerCode);
      }
      if (input.sellerName !== undefined) {
        fields.push("seller_name = ?");
        values.push(input.sellerName);
      }
      if (input.notes !== undefined) {
        fields.push("notes = ?");
        values.push(input.notes);
      }
      if (input.isActive !== undefined) {
        fields.push("is_active = ?");
        values.push(input.isActive ? 1 : 0);
      }
      if (fields.length === 0) return { success: true, message: "변경 없음" };

      values.push(input.id, ctx.tenantId);
      await conn.execute(
        `UPDATE b2c_sellers SET ${fields.join(", ")} WHERE id = ? AND tenant_id = ?`,
        values,
      );
      return { success: true };
    }),

  /** 셀러 삭제 (soft: is_active=0) */
  deactivateSeller: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const conn = await getRawConnection();
      await conn.execute(
        `UPDATE b2c_sellers SET is_active = 0 WHERE id = ? AND tenant_id = ?`,
        [input.id, ctx.tenantId],
      );
      return { success: true };
    }),

  // ─── 매출 항목 ──────────────────────────────────────────

  /** 매출 항목 입력 (upsert — 이미 있으면 UPDATE, 없으면 INSERT) */
  upsertSalesEntry: tenantRequiredProcedure
    .input(
      z.object({
        platformPartnerId: z.number(),
        sellerId: z.number(),
        paymentMethod: z.string().min(1).max(50),
        periodYear: z.number().int().min(2020).max(2100),
        periodMonth: z.number().int().min(1).max(12),
        grossAmount: z.number().min(0),
        supplyAmount: z.number().min(0).optional(),
        vatAmount: z.number().min(0).optional(),
        commissionAmount: z.number().min(0).optional(),
        refundAmount: z.number().min(0).optional(),
        netAmount: z.number().min(0).optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      // 공급가/부가세 자동 계산 (미지정 시)
      const supplyAmount =
        input.supplyAmount ?? Math.round(input.grossAmount / 1.1);
      const vatAmount =
        input.vatAmount ?? input.grossAmount - supplyAmount;
      const commissionAmount = input.commissionAmount ?? 0;
      const refundAmount = input.refundAmount ?? 0;
      const netAmount =
        input.netAmount ?? input.grossAmount - commissionAmount - refundAmount;

      const conn = await getRawConnection();
      await conn.execute(
        `INSERT INTO b2c_sales_entries
           (tenant_id, platform_partner_id, seller_id, payment_method,
            period_year, period_month,
            gross_amount, supply_amount, vat_amount, commission_amount, refund_amount, net_amount,
            notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           gross_amount = VALUES(gross_amount),
           supply_amount = VALUES(supply_amount),
           vat_amount = VALUES(vat_amount),
           commission_amount = VALUES(commission_amount),
           refund_amount = VALUES(refund_amount),
           net_amount = VALUES(net_amount),
           notes = VALUES(notes),
           updated_at = CURRENT_TIMESTAMP`,
        [
          ctx.tenantId,
          input.platformPartnerId,
          input.sellerId,
          input.paymentMethod,
          input.periodYear,
          input.periodMonth,
          input.grossAmount,
          supplyAmount,
          vatAmount,
          commissionAmount,
          refundAmount,
          netAmount,
          input.notes ?? null,
          ctx.user.id,
        ],
      );
      return { success: true };
    }),

  /** 매출 항목 삭제 (하드 삭제 — draft 만) */
  deleteSalesEntry: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const conn = await getRawConnection();
      const [rows] = await conn.execute(
        `SELECT status FROM b2c_sales_entries WHERE id = ? AND tenant_id = ?`,
        [input.id, ctx.tenantId],
      );
      const r = (rows as Array<{ status: string }>)[0];
      if (!r) throw new Error(`매출 항목 #${input.id} 없음`);
      if (r.status === "confirmed") {
        throw new Error("확정된 항목은 삭제 불가 (분기 확정 해제 먼저)");
      }
      await conn.execute(
        `DELETE FROM b2c_sales_entries WHERE id = ? AND tenant_id = ?`,
        [input.id, ctx.tenantId],
      );
      return { success: true };
    }),

  // ─── 조회 ───────────────────────────────────────────────

  /**
   * 분기/월 조회 — 스크린샷 양식 그대로의 3차원 집계
   *
   * input: periodYear, periodQuarter (1~4) — periodMonth 대신 분기
   * returns: 플랫폼 × 셀러 × 결제수단 × 월 매트릭스
   */
  getSalesMatrix: tenantRequiredProcedure
    .input(
      z.object({
        periodYear: z.number().int().min(2020).max(2100),
        // 조회 단위: 분기 (1~4) 또는 특정 월 (1~12)
        periodQuarter: z.number().int().min(1).max(4).optional(),
        periodMonth: z.number().int().min(1).max(12).optional(),
        platformPartnerId: z.number().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const conn = await getRawConnection();

      const conditions: string[] = ["e.tenant_id = ?", "e.period_year = ?"];
      const params: any[] = [ctx.tenantId, input.periodYear];

      if (input.periodQuarter) {
        const startMonth = (input.periodQuarter - 1) * 3 + 1;
        const endMonth = startMonth + 2;
        conditions.push("e.period_month BETWEEN ? AND ?");
        params.push(startMonth, endMonth);
      } else if (input.periodMonth) {
        conditions.push("e.period_month = ?");
        params.push(input.periodMonth);
      }

      if (input.platformPartnerId) {
        conditions.push("e.platform_partner_id = ?");
        params.push(input.platformPartnerId);
      }

      const [rows] = await conn.execute(
        `SELECT
           e.id,
           e.platform_partner_id,
           p.company_name AS platform_name,
           e.seller_id,
           s.seller_code,
           s.seller_name,
           e.payment_method,
           e.period_year,
           e.period_month,
           e.gross_amount,
           e.supply_amount,
           e.vat_amount,
           e.commission_amount,
           e.refund_amount,
           e.net_amount,
           e.status,
           e.notes
         FROM b2c_sales_entries e
         JOIN partners p ON p.id = e.platform_partner_id AND p.tenant_id = e.tenant_id
         JOIN b2c_sellers s ON s.id = e.seller_id AND s.tenant_id = e.tenant_id
         WHERE ${conditions.join(" AND ")}
         ORDER BY p.company_name, s.seller_code, e.payment_method, e.period_month`,
        params,
      );

      return rows as Array<{
        id: number;
        platform_partner_id: number;
        platform_name: string;
        seller_id: number;
        seller_code: string;
        seller_name: string | null;
        payment_method: string;
        period_year: number;
        period_month: number;
        gross_amount: string;
        supply_amount: string;
        vat_amount: string;
        commission_amount: string;
        refund_amount: string;
        net_amount: string;
        status: "draft" | "confirmed";
        notes: string | null;
      }>;
    }),

  /** 분기 총괄 요약 (플랫폼별 합계) */
  getQuarterSummary: tenantRequiredProcedure
    .input(
      z.object({
        periodYear: z.number().int(),
        periodQuarter: z.number().int().min(1).max(4),
      }),
    )
    .query(async ({ input, ctx }) => {
      const startMonth = (input.periodQuarter - 1) * 3 + 1;
      const endMonth = startMonth + 2;

      const conn = await getRawConnection();
      const [rows] = await conn.execute(
        `SELECT
           p.id AS platform_id,
           p.company_name AS platform_name,
           SUM(e.gross_amount) AS total_gross,
           SUM(e.supply_amount) AS total_supply,
           SUM(e.vat_amount) AS total_vat,
           SUM(e.commission_amount) AS total_commission,
           SUM(e.net_amount) AS total_net,
           COUNT(DISTINCT e.seller_id) AS seller_count,
           COUNT(*) AS entry_count
         FROM partners p
         LEFT JOIN b2c_sales_entries e
           ON e.platform_partner_id = p.id
          AND e.tenant_id = p.tenant_id
          AND e.period_year = ?
          AND e.period_month BETWEEN ? AND ?
         WHERE p.tenant_id = ? AND p.customer_type = 'b2c_platform'
         GROUP BY p.id, p.company_name
         ORDER BY total_gross DESC`,
        [input.periodYear, startMonth, endMonth, ctx.tenantId],
      );

      return rows as Array<{
        platform_id: number;
        platform_name: string;
        total_gross: string | null;
        total_supply: string | null;
        total_vat: string | null;
        total_commission: string | null;
        total_net: string | null;
        seller_count: number;
        entry_count: number;
      }>;
    }),

  // ─── 분기 확정 (Phase 3, 2026-04-22) ─────────────────────

  /**
   * 분기 확정 — 자동 분개 생성
   *
   * 동작:
   *   1. 해당 분기의 draft 상태 entries 조회 (플랫폼별)
   *   2. 각 플랫폼별로 분개 1건 생성:
   *        차) 외상매출금 (partner=해당 플랫폼)  총매출 (부가세 포함)
   *        (대) 제품매출                         공급가액
   *        (대) 부가세예수금                     부가세
   *   3. 각 entry.status='confirmed', journal_entry_id=생성된 분개 ID
   *
   * 멱등성:
   *   이미 confirmed 상태는 skip. 새로 추가된 draft 만 처리.
   *
   * 에러:
   *   - 대상 entries 0건 → 아무것도 안 함
   *   - 시스템 계정 누락 → resolveSystemAccount 내부에서 에러
   */
  confirmQuarter: tenantRequiredProcedure
    .input(z.object({
      periodYear: z.number().int().min(2020).max(2100),
      periodQuarter: z.number().int().min(1).max(4),
    }))
    .mutation(async ({ input, ctx }) => {
      const startMonth = (input.periodQuarter - 1) * 3 + 1;
      const endMonth = startMonth + 2;
      const entryDate = `${input.periodYear}-${String(endMonth).padStart(2, "0")}-${String(
        new Date(input.periodYear, endMonth, 0).getDate(),
      ).padStart(2, "0")}`;

      const conn0 = await getRawConnection();

      // 플랫폼별 draft 집계
      const [platformSums] = await conn0.execute(
        `SELECT
           e.platform_partner_id,
           p.company_name AS platform_name,
           SUM(e.gross_amount) AS sum_gross,
           SUM(e.supply_amount) AS sum_supply,
           SUM(e.vat_amount) AS sum_vat,
           COUNT(*) AS entry_count
         FROM b2c_sales_entries e
         JOIN partners p ON p.id = e.platform_partner_id AND p.tenant_id = e.tenant_id
         WHERE e.tenant_id = ?
           AND e.period_year = ?
           AND e.period_month BETWEEN ? AND ?
           AND e.status = 'draft'
         GROUP BY e.platform_partner_id, p.company_name`,
        [ctx.tenantId, input.periodYear, startMonth, endMonth],
      );

      const platforms = platformSums as Array<{
        platform_partner_id: number;
        platform_name: string;
        sum_gross: string;
        sum_supply: string;
        sum_vat: string;
        entry_count: number;
      }>;

      if (platforms.length === 0) {
        return {
          success: true,
          confirmedCount: 0,
          journalEntries: [],
          message: "확정할 draft 매출이 없습니다.",
        };
      }

      // 시스템 계정 조회
      const receivableAcc = await resolveSystemAccount(
        ctx.tenantId, SYSTEM_ACCOUNTS.ACCOUNTS_RECEIVABLE, "1030", "외상매출금",
      );
      const salesAcc = await resolveSystemAccount(
        ctx.tenantId, SYSTEM_ACCOUNTS.SALES_REVENUE, "4010", "제품매출",
      );
      const vatAcc = await resolveSystemAccount(
        ctx.tenantId, SYSTEM_ACCOUNTS.VAT_OUTPUT, "2350", "부가세예수금",
      );

      const userId = ctx.user.id as number;

      // 트랜잭션 내부에서 각 플랫폼별 분개 생성
      const results = await withTransaction(async (conn) => {
        const journalEntries: Array<{
          platformPartnerId: number;
          platformName: string;
          journalEntryId: number;
          grossAmount: number;
        }> = [];

        for (const plt of platforms) {
          const gross = Number(plt.sum_gross);
          const supply = Number(plt.sum_supply);
          const vat = Number(plt.sum_vat);

          const description = `[B2C 정산] ${plt.platform_name} ${input.periodYear}Q${input.periodQuarter}`;

          // 1. 분개 헤더
          const [jeResult] = await conn.execute(
            `INSERT INTO expense_journal_entries
               (tenant_id, voucher_id, entry_date, description,
                total_debit, total_credit, posted_by, posted_at)
             VALUES (?, NULL, ?, ?, ?, ?, ?, NOW())`,
            [ctx.tenantId, entryDate, description, gross, gross, userId],
          );
          const journalEntryId = Number((jeResult as { insertId: number }).insertId);

          let sortOrder = 0;

          // 2-1. 차변: 외상매출금
          await insertJournalLine(conn, {
            tenantId: ctx.tenantId,
            journalEntryId,
            accountId: receivableAcc.id,
            accountCode: receivableAcc.code,
            accountName: receivableAcc.name,
            debitAmount: gross,
            creditAmount: 0,
            description: `외상매출금: ${plt.platform_name} Q${input.periodQuarter}`,
            sortOrder: sortOrder++,
            partnerId: plt.platform_partner_id,
          });

          // 2-2. 대변: 제품매출 (공급가)
          await insertJournalLine(conn, {
            tenantId: ctx.tenantId,
            journalEntryId,
            accountId: salesAcc.id,
            accountCode: salesAcc.code,
            accountName: salesAcc.name,
            debitAmount: 0,
            creditAmount: supply,
            description: `매출: ${plt.platform_name} Q${input.periodQuarter}`,
            sortOrder: sortOrder++,
          });

          // 2-3. 대변: 부가세예수금 (VAT > 0 일 때만)
          if (vat > 0) {
            await insertJournalLine(conn, {
              tenantId: ctx.tenantId,
              journalEntryId,
              accountId: vatAcc.id,
              accountCode: vatAcc.code,
              accountName: vatAcc.name,
              debitAmount: 0,
              creditAmount: vat,
              description: `매출 부가세: ${plt.platform_name} Q${input.periodQuarter}`,
              sortOrder: sortOrder++,
            });
          }

          // 3. b2c_sales_entries 확정
          await conn.execute(
            `UPDATE b2c_sales_entries
                SET status = 'confirmed',
                    confirmed_at = NOW(),
                    confirmed_by = ?,
                    journal_entry_id = ?
              WHERE tenant_id = ?
                AND platform_partner_id = ?
                AND period_year = ?
                AND period_month BETWEEN ? AND ?
                AND status = 'draft'`,
            [
              userId,
              journalEntryId,
              ctx.tenantId,
              plt.platform_partner_id,
              input.periodYear,
              startMonth,
              endMonth,
            ],
          );

          journalEntries.push({
            platformPartnerId: plt.platform_partner_id,
            platformName: plt.platform_name,
            journalEntryId,
            grossAmount: gross,
          });
        }

        return journalEntries;
      }, `b2cQuarterConfirm:${input.periodYear}Q${input.periodQuarter}`);

      const totalConfirmed = platforms.reduce((s, p) => s + p.entry_count, 0);
      const totalGross = results.reduce((s, r) => s + r.grossAmount, 0);

      return {
        success: true,
        confirmedCount: totalConfirmed,
        journalEntries: results,
        totalGross,
        message: `${input.periodYear}Q${input.periodQuarter} ${platforms.length}개 플랫폼 / ${totalConfirmed}건 / ₩${totalGross.toLocaleString()} 확정 완료`,
      };
    }),

  /**
   * 분기 확정 해제 — 분개 삭제 + status='draft' 복구
   *
   * 동작:
   *   1. 해당 분기의 confirmed entries 에 연결된 journal_entry_id 수집
   *   2. expense_journal_lines + expense_journal_entries 삭제
   *   3. entries.status='draft', journal_entry_id=NULL, confirmed_at=NULL
   *
   * 안전장치:
   *   - 매출 기록 자체는 유지 (수정 가능하도록)
   *   - 연결된 분개만 되돌림
   */
  unconfirmQuarter: tenantRequiredProcedure
    .input(z.object({
      periodYear: z.number().int().min(2020).max(2100),
      periodQuarter: z.number().int().min(1).max(4),
    }))
    .mutation(async ({ input, ctx }) => {
      const startMonth = (input.periodQuarter - 1) * 3 + 1;
      const endMonth = startMonth + 2;

      const conn0 = await getRawConnection();
      const [jeRows] = await conn0.execute(
        `SELECT DISTINCT journal_entry_id
           FROM b2c_sales_entries
          WHERE tenant_id = ?
            AND period_year = ?
            AND period_month BETWEEN ? AND ?
            AND status = 'confirmed'
            AND journal_entry_id IS NOT NULL`,
        [ctx.tenantId, input.periodYear, startMonth, endMonth],
      );
      const journalIds = (jeRows as Array<{ journal_entry_id: number }>).map(r => r.journal_entry_id);

      if (journalIds.length === 0) {
        return {
          success: true,
          removedJournals: 0,
          removedLines: 0,
          updatedEntries: 0,
          message: "확정된 분개가 없습니다.",
        };
      }

      const result = await withTransaction(async (conn) => {
        const placeholders = journalIds.map(() => "?").join(",");

        // 1. 분개 라인 삭제
        const [linesRes] = await conn.execute(
          `DELETE FROM expense_journal_lines
             WHERE tenant_id = ? AND journal_entry_id IN (${placeholders})`,
          [ctx.tenantId, ...journalIds],
        );
        const removedLines = (linesRes as { affectedRows: number }).affectedRows;

        // 2. 분개 헤더 삭제
        const [jeRes] = await conn.execute(
          `DELETE FROM expense_journal_entries
             WHERE tenant_id = ? AND id IN (${placeholders})`,
          [ctx.tenantId, ...journalIds],
        );
        const removedJournals = (jeRes as { affectedRows: number }).affectedRows;

        // 3. entries draft 복구
        const [updRes] = await conn.execute(
          `UPDATE b2c_sales_entries
              SET status = 'draft',
                  confirmed_at = NULL,
                  confirmed_by = NULL,
                  journal_entry_id = NULL
            WHERE tenant_id = ?
              AND period_year = ?
              AND period_month BETWEEN ? AND ?
              AND status = 'confirmed'`,
          [ctx.tenantId, input.periodYear, startMonth, endMonth],
        );
        const updatedEntries = (updRes as { affectedRows: number }).affectedRows;

        return { removedJournals, removedLines, updatedEntries };
      }, `b2cQuarterUnconfirm:${input.periodYear}Q${input.periodQuarter}`);

      return {
        success: true,
        ...result,
        message: `${input.periodYear}Q${input.periodQuarter} 확정 해제: 분개 ${result.removedJournals}건 + 라인 ${result.removedLines}줄 + 항목 ${result.updatedEntries}건 복구`,
      };
    }),
});
