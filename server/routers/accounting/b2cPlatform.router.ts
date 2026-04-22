/**
 * B2C 플랫폼 정산 라우터 (Phase 2, 2026-04-22)
 *
 * 기능:
 *   1. 셀러 CRUD (플랫폼 × 셀러 계정 관리)
 *   2. 매출 항목 입력 (플랫폼 × 셀러 × 결제수단 × 월)
 *   3. 분기/월별 조회 + 집계
 *   4. 분기 확정 → 자동 분개 생성 (향후)
 */

import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../_core/trpc";
import { getRawConnection } from "../../db";

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
});
