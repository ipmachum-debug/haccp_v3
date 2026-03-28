import { router, tenantRequiredProcedure, workerProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb, getRawConnection } from "../db";
import {
  expenseVouchers,
  expenseItems,
  expenseJournalEntries,
  expenseJournalLines,
  expenseAttachments,
  accountingAccounts,
} from "../../drizzle/schema";
import { eq, and, desc, asc, sql, like, or, gte, lte, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { resolveSystemAccount, getPaymentSystemAccount, insertJournalLine, postExpenseVoucher, cancelExpenseJournal } from "../db/journalHelper";
import { SYSTEM_ACCOUNTS } from "../../drizzle/schema/accountingAccounts";

import { formatLocalDate } from "../utils/timezone";

function getEffectiveTenantId(ctx: any): number {
  const tenantId = ctx.tenantId;
  if (!tenantId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "테넌트 정보가 필요합니다." });
  }
  return tenantId;
}

export const expenseRouter = router({

  // ═══════════════════════════════════
  // 비용전표 목록 조회 (필터/검색)
  // ═══════════════════════════════════
  list: tenantRequiredProcedure
    .input(
      z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        accountId: z.number().optional(),
        partnerId: z.number().optional(),
        paymentMethod: z.enum(["cash", "bank", "card", "unpaid"]).optional(),
        proofType: z.enum(["tax_invoice", "card", "cash_receipt", "simple", "none"]).optional(),
        status: z.enum(["draft", "posted", "canceled"]).optional(),
        search: z.string().optional(),
        page: z.number().default(1),
        limit: z.number().default(30),
      }).optional()
    )
    .query(async ({ input, ctx }) => {
      const tenantId = getEffectiveTenantId(ctx);
      const db = await getDb();
      const p = input || {} as any;
      const page = p.page || 1;
      const limit = p.limit || 30;

      // Raw SQL for flexible filters + joins
      const conn = await getRawConnection();

      let where = "v.tenant_id = ?";
      const params: any[] = [tenantId];

      if (p.startDate) { where += " AND v.expense_date >= ?"; params.push(p.startDate); }
      if (p.endDate) { where += " AND v.expense_date <= ?"; params.push(p.endDate); }
      if (p.paymentMethod) { where += " AND v.payment_method = ?"; params.push(p.paymentMethod); }
      if (p.proofType) { where += " AND v.proof_type = ?"; params.push(p.proofType); }
      if (p.status) { where += " AND v.status = ?"; params.push(p.status); }
      if (p.search) {
        where += " AND (v.voucher_no LIKE ? OR v.partner_name LIKE ? OR v.memo LIKE ?)";
        const s = `%${p.search}%`;
        params.push(s, s, s);
      }
      if (p.accountId) {
        where += " AND v.id IN (SELECT voucher_id FROM expense_items WHERE account_id = ? AND tenant_id = ?)";
        params.push(p.accountId, tenantId);
      }

      // Count
      const [cntRows] = await conn.execute(
        `SELECT COUNT(*) as cnt FROM expense_vouchers v WHERE ${where}`,
        params,
      );
      const total = Number((cntRows as any[])[0]?.cnt || 0);

      // Data
      const offset = (page - 1) * limit;
      const [rows] = await conn.execute(
        `SELECT v.*, u.name as created_by_name
         FROM expense_vouchers v
         LEFT JOIN users u ON v.created_by = u.id
         WHERE ${where}
         ORDER BY v.expense_date DESC, v.id DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      );

      return { items: rows as any[], total, page, limit };
    }),

  // ═══════════════════════════════════
  // 비용전표 상세 조회
  // ═══════════════════════════════════
  getById: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const tenantId = getEffectiveTenantId(ctx);
      const conn = await getRawConnection();

      const [vRows] = await conn.execute(
        `SELECT v.*, u.name as created_by_name, u2.name as posted_by_name
         FROM expense_vouchers v
         LEFT JOIN users u ON v.created_by = u.id
         LEFT JOIN users u2 ON v.posted_by = u2.id
         WHERE v.id = ? AND v.tenant_id = ?`,
        [input.id, tenantId],
      );
      const voucher = (vRows as any[])[0];
      if (!voucher) return null;

      // Items
      const [items] = await conn.execute(
        `SELECT * FROM expense_items WHERE voucher_id = ? AND tenant_id = ? ORDER BY sort_order`,
        [input.id, tenantId],
      );

      // Attachments
      const [attachments] = await conn.execute(
        `SELECT * FROM expense_attachments WHERE voucher_id = ? AND tenant_id = ? ORDER BY id`,
        [input.id, tenantId],
      );

      // Journal entries
      const [journalEntries] = await conn.execute(
        `SELECT * FROM expense_journal_entries WHERE voucher_id = ? AND tenant_id = ?`,
        [input.id, tenantId],
      );
      let journalLines: any[] = [];
      if ((journalEntries as any[]).length > 0) {
        const entryId = (journalEntries as any[])[0].id;
        const [lines] = await conn.execute(
          `SELECT * FROM expense_journal_lines WHERE journal_entry_id = ? AND tenant_id = ? ORDER BY sort_order`,
          [entryId, tenantId],
        );
        journalLines = lines as any[];
      }

      return {
        ...voucher,
        items: items as any[],
        attachments: attachments as any[],
        journalEntries: journalEntries as any[],
        journalLines,
      };
    }),

  // ═══════════════════════════════════
  // 비용전표 생성
  // ═══════════════════════════════════
  create: tenantRequiredProcedure
    .input(
      z.object({
        expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        partnerId: z.number().optional(),
        partnerName: z.string().optional(),
        supplyAmount: z.number(),
        vatAmount: z.number(),
        totalAmount: z.number(),
        paymentMethod: z.enum(["cash", "bank", "card", "unpaid"]).default("cash"),
        bankAccountId: z.number().optional(),
        proofType: z.enum(["tax_invoice", "card", "cash_receipt", "simple", "none"]).default("none"),
        memo: z.string().optional(),
        items: z.array(
          z.object({
            accountId: z.number(),
            accountCode: z.string().optional(),
            accountName: z.string().optional(),
            supplyAmount: z.number(),
            vatAmount: z.number(),
            totalAmount: z.number(),
            description: z.string().optional(),
          })
        ).min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = getEffectiveTenantId(ctx);
      const conn = await getRawConnection();

      // 1. 전표번호 자동 생성 (EXP-YYYYMMDD-NNN)
      const dateStr = input.expenseDate.replace(/-/g, "");
      const [cntRows] = await conn.execute(
        `SELECT COUNT(*) as cnt FROM expense_vouchers WHERE tenant_id = ? AND voucher_no LIKE ?`,
        [tenantId, `EXP-${dateStr}-%`],
      );
      const seq = Number((cntRows as any[])[0]?.cnt || 0) + 1;
      const voucherNo = `EXP-${dateStr}-${String(seq).padStart(3, "0")}`;

      // 서버 검증: 합계 정합성
      const itemsTotal = input.items.reduce((s, i) => s + i.totalAmount, 0);
      if (Math.abs(itemsTotal - input.totalAmount) > 1) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `항목 합계(${itemsTotal})와 전표 합계(${input.totalAmount})가 일치하지 않습니다.`,
        });
      }

      // 2. 전표 생성
      const [insResult] = await conn.execute(
        `INSERT INTO expense_vouchers
           (tenant_id, voucher_no, expense_date, partner_id, partner_name,
            supply_amount, vat_amount, total_amount,
            payment_method, bank_account_id, proof_type, status, memo, created_by)
         VALUES (?,?,?,?,?, ?,?,?, ?,?,?,?,?,?)`,
        [
          tenantId, voucherNo, input.expenseDate,
          input.partnerId || null, input.partnerName || null,
          input.supplyAmount, input.vatAmount, input.totalAmount,
          input.paymentMethod, input.bankAccountId || null,
          input.proofType, "draft", input.memo || null, ctx.user.id,
        ],
      );
      const voucherId = Number((insResult as any).insertId);

      // 3. 항목 생성
      for (let i = 0; i < input.items.length; i++) {
        const item = input.items[i];
        await conn.execute(
          `INSERT INTO expense_items
             (tenant_id, voucher_id, account_id, account_code, account_name,
              supply_amount, vat_amount, total_amount, description, sort_order)
           VALUES (?,?,?,?,?, ?,?,?,?,?)`,
          [
            tenantId, voucherId, item.accountId,
            item.accountCode || null, item.accountName || null,
            item.supplyAmount, item.vatAmount, item.totalAmount,
            item.description || null, i,
          ],
        );
      }

      return { success: true, id: voucherId, voucherNo };
    }),

  // ═══════════════════════════════════
  // 비용전표 수정 (draft만 수정 가능)
  // ═══════════════════════════════════
  update: tenantRequiredProcedure
    .input(
      z.object({
        id: z.number(),
        expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        partnerId: z.number().optional(),
        partnerName: z.string().optional(),
        supplyAmount: z.number(),
        vatAmount: z.number(),
        totalAmount: z.number(),
        paymentMethod: z.enum(["cash", "bank", "card", "unpaid"]).default("cash"),
        bankAccountId: z.number().optional(),
        proofType: z.enum(["tax_invoice", "card", "cash_receipt", "simple", "none"]).default("none"),
        memo: z.string().optional(),
        items: z.array(
          z.object({
            accountId: z.number(),
            accountCode: z.string().optional(),
            accountName: z.string().optional(),
            supplyAmount: z.number(),
            vatAmount: z.number(),
            totalAmount: z.number(),
            description: z.string().optional(),
          })
        ).min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = getEffectiveTenantId(ctx);
      const conn = await getRawConnection();

      // 상태 확인
      const [existing] = await conn.execute(
        `SELECT status FROM expense_vouchers WHERE id = ? AND tenant_id = ?`,
        [input.id, tenantId],
      );
      const voucher = (existing as any[])[0];
      if (!voucher) throw new TRPCError({ code: "NOT_FOUND", message: "전표를 찾을 수 없습니다." });
      if (voucher.status !== "draft") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "임시저장 상태의 전표만 수정할 수 있습니다." });
      }

      // 합계 검증
      const itemsTotal = input.items.reduce((s, i) => s + i.totalAmount, 0);
      if (Math.abs(itemsTotal - input.totalAmount) > 1) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "항목 합계와 전표 합계가 일치하지 않습니다." });
      }

      // 전표 수정
      await conn.execute(
        `UPDATE expense_vouchers SET
           expense_date=?, partner_id=?, partner_name=?,
           supply_amount=?, vat_amount=?, total_amount=?,
           payment_method=?, bank_account_id=?, proof_type=?, memo=?
         WHERE id=? AND tenant_id=?`,
        [
          input.expenseDate, input.partnerId || null, input.partnerName || null,
          input.supplyAmount, input.vatAmount, input.totalAmount,
          input.paymentMethod, input.bankAccountId || null,
          input.proofType, input.memo || null,
          input.id, tenantId,
        ],
      );

      // 항목 삭제 후 재생성
      await conn.execute(
        `DELETE FROM expense_items WHERE voucher_id = ? AND tenant_id = ?`,
        [input.id, tenantId],
      );
      for (let i = 0; i < input.items.length; i++) {
        const item = input.items[i];
        await conn.execute(
          `INSERT INTO expense_items
             (tenant_id, voucher_id, account_id, account_code, account_name,
              supply_amount, vat_amount, total_amount, description, sort_order)
           VALUES (?,?,?,?,?, ?,?,?,?,?)`,
          [
            tenantId, input.id, item.accountId,
            item.accountCode || null, item.accountName || null,
            item.supplyAmount, item.vatAmount, item.totalAmount,
            item.description || null, i,
          ],
        );
      }

      return { success: true };
    }),

  // ═══════════════════════════════════
  // 비용전표 확정 (Posting) - 분개 자동 생성
  // [P2-3] journalHelper.postExpenseVoucher()로 공통화
  // ═══════════════════════════════════
  post: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = getEffectiveTenantId(ctx);
      const conn = await getRawConnection();

      // 1. 전표 조회
      const [vRows] = await conn.execute(
        `SELECT * FROM expense_vouchers WHERE id = ? AND tenant_id = ?`,
        [input.id, tenantId],
      );
      const voucher = (vRows as any[])[0];
      if (!voucher) throw new TRPCError({ code: "NOT_FOUND", message: "전표를 찾을 수 없습니다." });
      if (voucher.status !== "draft") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "임시저장 상태의 전표만 확정할 수 있습니다." });
      }

      // 2. 전표 항목 조회
      const [itemRows] = await conn.execute(
        `SELECT * FROM expense_items WHERE voucher_id = ? AND tenant_id = ? ORDER BY sort_order`,
        [input.id, tenantId],
      );
      const items = itemRows as any[];
      if (items.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "비용 항목이 없습니다." });
      }

      // 3. 공통 분개 헬퍼 호출
      const result = await postExpenseVoucher(conn, {
        tenantId,
        voucherId: input.id,
        voucher,
        items,
        postedBy: ctx.user.id,
      });

      // 4. ERP AI: 대형 비용 트리거 (비동기, 실패해도 무시)
      try {
        const { onLargeExpenseCreated } = await import("../db/accountingEventTriggers");
        onLargeExpenseCreated({
          tenantId,
          voucherId: input.id,
          amount: Number(voucher.total_amount),
          partnerName: voucher.partner_name,
          description: voucher.description,
          userId: ctx.user.id,
        }).catch(() => {});
      } catch { /* 무시 */ }

      return { success: true, journalEntryId: result.journalEntryId };
    }),

  // ═══════════════════════════════════
  // 비용전표 취소 (Posted → Canceled)
  // ═══════════════════════════════════
  cancel: tenantRequiredProcedure
    .input(z.object({ id: z.number(), reason: z.string().min(1, "취소 사유를 입력해주세요") }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = getEffectiveTenantId(ctx);
      const conn = await getRawConnection();

      const [vRows] = await conn.execute(
        `SELECT status FROM expense_vouchers WHERE id = ? AND tenant_id = ?`,
        [input.id, tenantId],
      );
      const voucher = (vRows as any[])[0];
      if (!voucher) throw new TRPCError({ code: "NOT_FOUND", message: "전표를 찾을 수 없습니다." });
      if (voucher.status === "canceled") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "이미 취소된 전표입니다." });
      }

      // 분개 삭제 (posted 상태에서 취소 시) - [P2-3] 공통 헬퍼 사용
      if (voucher.status === "posted") {
        await cancelExpenseJournal(conn, { tenantId, voucherId: input.id });
      }

      await conn.execute(
        `UPDATE expense_vouchers SET status = 'canceled', canceled_by = ?, canceled_at = NOW(), cancel_reason = ?
         WHERE id = ? AND tenant_id = ?`,
        [ctx.user.id, input.reason, input.id, tenantId],
      );

      return { success: true };
    }),

  // ═══════════════════════════════════
  // 비용전표 삭제 (draft만)
  // ═══════════════════════════════════
  delete: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = getEffectiveTenantId(ctx);
      const conn = await getRawConnection();

      const [vRows] = await conn.execute(
        `SELECT status FROM expense_vouchers WHERE id = ? AND tenant_id = ?`,
        [input.id, tenantId],
      );
      const voucher = (vRows as any[])[0];
      if (!voucher) throw new TRPCError({ code: "NOT_FOUND", message: "전표를 찾을 수 없습니다." });
      if (voucher.status !== "draft") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "임시저장 상태의 전표만 삭제할 수 있습니다." });
      }

      await conn.execute(`DELETE FROM expense_attachments WHERE voucher_id = ? AND tenant_id = ?`, [input.id, tenantId]);
      await conn.execute(`DELETE FROM expense_items WHERE voucher_id = ? AND tenant_id = ?`, [input.id, tenantId]);
      await conn.execute(`DELETE FROM expense_vouchers WHERE id = ? AND tenant_id = ?`, [input.id, tenantId]);

      return { success: true };
    }),

  // ═══════════════════════════════════
  // 비용 계정과목 목록 (비용 분류만)
  // ═══════════════════════════════════
  getExpenseAccounts: tenantRequiredProcedure.query(async ({ ctx }) => {
    const tenantId = getEffectiveTenantId(ctx);
    const db = await getDb();
    const accounts = await db
      .select()
      .from(accountingAccounts)
      .where(
        and(
          eq(accountingAccounts.tenantId, tenantId),
          eq(accountingAccounts.category, "expenses"),
          eq(accountingAccounts.isActive, "Y"),
        )
      )
      .orderBy(accountingAccounts.code);
    return accounts;
  }),

  // ═══════════════════════════════════
  // 비용 통계 요약 (대시보드용)
  // ═══════════════════════════════════
  getSummary: tenantRequiredProcedure
    .input(
      z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }).optional()
    )
    .query(async ({ input, ctx }) => {
      const tenantId = getEffectiveTenantId(ctx);
      const conn = await getRawConnection();

      const p = input || {};
      // 이번달 기본
      const now = new Date();
      const startDate = p.startDate || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const endDate = p.endDate || formatLocalDate(now);

      const [rows] = await conn.execute(
        `SELECT
           COUNT(*) as total_count,
           SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draft_count,
           SUM(CASE WHEN status = 'posted' THEN 1 ELSE 0 END) as posted_count,
           SUM(CASE WHEN status = 'canceled' THEN 1 ELSE 0 END) as canceled_count,
           SUM(CASE WHEN status != 'canceled' THEN total_amount ELSE 0 END) as total_amount,
           SUM(CASE WHEN status = 'posted' THEN total_amount ELSE 0 END) as posted_amount,
           SUM(CASE WHEN status != 'canceled' THEN vat_amount ELSE 0 END) as total_vat
         FROM expense_vouchers
         WHERE tenant_id = ? AND expense_date >= ? AND expense_date <= ?`,
        [tenantId, startDate, endDate],
      );

      // 계정과목별 Top 5
      const [topAccounts] = await conn.execute(
        `SELECT ei.account_name, SUM(ei.total_amount) as amount
         FROM expense_items ei
         JOIN expense_vouchers v ON ei.voucher_id = v.id AND v.tenant_id = ei.tenant_id
         WHERE ei.tenant_id = ? AND v.expense_date >= ? AND v.expense_date <= ? AND v.status != 'canceled'
         GROUP BY ei.account_id, ei.account_name
         ORDER BY amount DESC LIMIT 5`,
        [tenantId, startDate, endDate],
      );

      return {
        ...(rows as any[])[0],
        topAccounts: topAccounts as any[],
      };
    }),

  // ═══════════════════════════════════
  // 다음 전표번호 조회
  // ═══════════════════════════════════
  getNextVoucherNo: tenantRequiredProcedure
    .input(z.object({ date: z.string() }))
    .query(async ({ input, ctx }) => {
      const tenantId = getEffectiveTenantId(ctx);
      const conn = await getRawConnection();
      const dateStr = input.date.replace(/-/g, "");
      const [rows] = await conn.execute(
        `SELECT COUNT(*) as cnt FROM expense_vouchers WHERE tenant_id = ? AND voucher_no LIKE ?`,
        [tenantId, `EXP-${dateStr}-%`],
      );
      const seq = Number((rows as any[])[0]?.cnt || 0) + 1;
      return { voucherNo: `EXP-${dateStr}-${String(seq).padStart(3, "0")}` };
    }),

  // ═══════════════════════════════════════════
  // 2차-A: 정기비용 템플릿 CRUD
  // ═══════════════════════════════════════════
  recurringList: tenantRequiredProcedure.query(async ({ ctx }) => {
    const tenantId = getEffectiveTenantId(ctx);
    const conn = await getRawConnection();
    const [rows] = await conn.execute(
      `SELECT t.*, u.name as created_by_name
       FROM expense_recurring_templates t
       LEFT JOIN users u ON t.created_by = u.id
       WHERE t.tenant_id = ?
       ORDER BY t.is_active DESC, t.template_name`,
      [tenantId],
    );
    return rows as any[];
  }),

  recurringCreate: tenantRequiredProcedure
    .input(z.object({
      templateName: z.string().min(1),
      partnerId: z.number().optional(),
      partnerName: z.string().optional(),
      accountId: z.number(),
      accountCode: z.string().optional(),
      accountName: z.string().optional(),
      supplyAmount: z.number(),
      vatAmount: z.number(),
      totalAmount: z.number(),
      paymentMethod: z.enum(["cash", "bank", "card", "unpaid"]).default("bank"),
      bankAccountId: z.number().optional(),
      proofType: z.enum(["tax_invoice", "card", "cash_receipt", "simple", "none"]).default("none"),
      recurrenceType: z.enum(["monthly", "quarterly", "yearly"]).default("monthly"),
      recurrenceDay: z.number().min(1).max(28).default(1),
      memo: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = getEffectiveTenantId(ctx);
      const conn = await getRawConnection();
      const [result] = await conn.execute(
        `INSERT INTO expense_recurring_templates
           (tenant_id, template_name, partner_id, partner_name,
            account_id, account_code, account_name,
            supply_amount, vat_amount, total_amount,
            payment_method, bank_account_id, proof_type,
            recurrence_type, recurrence_day, memo, created_by)
         VALUES (?,?,?,?, ?,?,?, ?,?,?, ?,?,?, ?,?,?,?)`,
        [
          tenantId, input.templateName,
          input.partnerId || null, input.partnerName || null,
          input.accountId, input.accountCode || null, input.accountName || null,
          input.supplyAmount, input.vatAmount, input.totalAmount,
          input.paymentMethod, input.bankAccountId || null, input.proofType,
          input.recurrenceType, input.recurrenceDay, input.memo || null, ctx.user.id,
        ],
      );
      return { success: true, id: Number((result as any).insertId) };
    }),

  recurringUpdate: tenantRequiredProcedure
    .input(z.object({
      id: z.number(),
      templateName: z.string().min(1),
      partnerId: z.number().optional(),
      partnerName: z.string().optional(),
      accountId: z.number(),
      accountCode: z.string().optional(),
      accountName: z.string().optional(),
      supplyAmount: z.number(),
      vatAmount: z.number(),
      totalAmount: z.number(),
      paymentMethod: z.enum(["cash", "bank", "card", "unpaid"]).default("bank"),
      bankAccountId: z.number().optional(),
      proofType: z.enum(["tax_invoice", "card", "cash_receipt", "simple", "none"]).default("none"),
      recurrenceType: z.enum(["monthly", "quarterly", "yearly"]).default("monthly"),
      recurrenceDay: z.number().min(1).max(28).default(1),
      memo: z.string().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = getEffectiveTenantId(ctx);
      const conn = await getRawConnection();
      await conn.execute(
        `UPDATE expense_recurring_templates SET
           template_name=?, partner_id=?, partner_name=?,
           account_id=?, account_code=?, account_name=?,
           supply_amount=?, vat_amount=?, total_amount=?,
           payment_method=?, bank_account_id=?, proof_type=?,
           recurrence_type=?, recurrence_day=?, memo=?,
           is_active=?
         WHERE id=? AND tenant_id=?`,
        [
          input.templateName,
          input.partnerId || null, input.partnerName || null,
          input.accountId, input.accountCode || null, input.accountName || null,
          input.supplyAmount, input.vatAmount, input.totalAmount,
          input.paymentMethod, input.bankAccountId || null, input.proofType,
          input.recurrenceType, input.recurrenceDay, input.memo || null,
          input.isActive !== undefined ? (input.isActive ? 1 : 0) : 1,
          input.id, tenantId,
        ],
      );
      return { success: true };
    }),

  recurringDelete: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = getEffectiveTenantId(ctx);
      const conn = await getRawConnection();
      await conn.execute(
        `DELETE FROM expense_recurring_templates WHERE id = ? AND tenant_id = ?`,
        [input.id, tenantId],
      );
      return { success: true };
    }),

  // 정기비용 템플릿에서 전표 수동 생성
  recurringGenerate: tenantRequiredProcedure
    .input(z.object({
      templateId: z.number(),
      expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = getEffectiveTenantId(ctx);
      const conn = await getRawConnection();

      // 템플릿 조회
      const [tRows] = await conn.execute(
        `SELECT * FROM expense_recurring_templates WHERE id = ? AND tenant_id = ?`,
        [input.templateId, tenantId],
      );
      const tpl = (tRows as any[])[0];
      if (!tpl) throw new TRPCError({ code: "NOT_FOUND", message: "템플릿을 찾을 수 없습니다." });

      // 전표번호 생성
      const dateStr = input.expenseDate.replace(/-/g, "");
      const [cntRows] = await conn.execute(
        `SELECT COUNT(*) as cnt FROM expense_vouchers WHERE tenant_id = ? AND voucher_no LIKE ?`,
        [tenantId, `EXP-${dateStr}-%`],
      );
      const seq = Number((cntRows as any[])[0]?.cnt || 0) + 1;
      const voucherNo = `EXP-${dateStr}-${String(seq).padStart(3, "0")}`;

      // 전표 생성
      const unpaidBalance = tpl.payment_method === "unpaid" ? Number(tpl.total_amount) : 0;
      const [insResult] = await conn.execute(
        `INSERT INTO expense_vouchers
           (tenant_id, voucher_no, expense_date, partner_id, partner_name,
            supply_amount, vat_amount, total_amount,
            payment_method, bank_account_id, proof_type, status, memo, created_by,
            unpaid_balance, is_fully_paid)
         VALUES (?,?,?,?,?, ?,?,?, ?,?,?,?,?,?, ?,?)`,
        [
          tenantId, voucherNo, input.expenseDate,
          tpl.partner_id, tpl.partner_name,
          tpl.supply_amount, tpl.vat_amount, tpl.total_amount,
          tpl.payment_method, tpl.bank_account_id, tpl.proof_type,
          "draft", tpl.memo ? `[정기] ${tpl.template_name} - ${tpl.memo}` : `[정기] ${tpl.template_name}`,
          ctx.user.id, unpaidBalance, 0,
        ],
      );
      const voucherId = Number((insResult as any).insertId);

      // 항목 생성
      await conn.execute(
        `INSERT INTO expense_items
           (tenant_id, voucher_id, account_id, account_code, account_name,
            supply_amount, vat_amount, total_amount, description, sort_order)
         VALUES (?,?,?,?,?, ?,?,?,?,?)`,
        [
          tenantId, voucherId, tpl.account_id, tpl.account_code, tpl.account_name,
          tpl.supply_amount, tpl.vat_amount, tpl.total_amount,
          tpl.template_name, 0,
        ],
      );

      // 마지막 생성일 업데이트
      await conn.execute(
        `UPDATE expense_recurring_templates SET last_generated_date = ? WHERE id = ? AND tenant_id = ?`,
        [input.expenseDate, input.templateId, tenantId],
      );

      return { success: true, id: voucherId, voucherNo };
    }),

  // ═══════════════════════════════════════════
  // 2차-B: 미지급금 잔액 관리 + 지급처리
  // ═══════════════════════════════════════════
  unpaidList: tenantRequiredProcedure
    .input(z.object({
      onlyUnpaid: z.boolean().default(true),
      page: z.number().default(1),
      limit: z.number().default(30),
    }).optional())
    .query(async ({ input, ctx }) => {
      const tenantId = getEffectiveTenantId(ctx);
      const conn = await getRawConnection();
      const p = input || { onlyUnpaid: true, page: 1, limit: 30 };

      let where = "v.tenant_id = ? AND v.payment_method = 'unpaid' AND v.status = 'posted'";
      const params: any[] = [tenantId];
      if (p.onlyUnpaid) {
        where += " AND v.is_fully_paid = 0";
      }

      const [cntRows] = await conn.execute(
        `SELECT COUNT(*) as cnt FROM expense_vouchers v WHERE ${where}`, params,
      );
      const total = Number((cntRows as any[])[0]?.cnt || 0);

      const offset = ((p.page || 1) - 1) * (p.limit || 30);
      const [rows] = await conn.execute(
        `SELECT v.*, u.name as created_by_name
         FROM expense_vouchers v
         LEFT JOIN users u ON v.created_by = u.id
         WHERE ${where}
         ORDER BY v.expense_date DESC
         LIMIT ? OFFSET ?`,
        [...params, p.limit || 30, offset],
      );

      return { items: rows as any[], total };
    }),

  unpaidPaymentHistory: tenantRequiredProcedure
    .input(z.object({ voucherId: z.number() }))
    .query(async ({ input, ctx }) => {
      const tenantId = getEffectiveTenantId(ctx);
      const conn = await getRawConnection();
      const [rows] = await conn.execute(
        `SELECT p.*, u.name as paid_by_name
         FROM expense_unpaid_payments p
         LEFT JOIN users u ON p.paid_by = u.id
         WHERE p.voucher_id = ? AND p.tenant_id = ?
         ORDER BY p.payment_date DESC`,
        [input.voucherId, tenantId],
      );
      return rows as any[];
    }),

  unpaidPay: tenantRequiredProcedure
    .input(z.object({
      voucherId: z.number(),
      paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      paymentAmount: z.number().min(1),
      paymentMethod: z.enum(["cash", "bank", "card"]).default("bank"),
      bankAccountId: z.number().optional(),
      memo: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = getEffectiveTenantId(ctx);
      const conn = await getRawConnection();

      // 전표 조회
      const [vRows] = await conn.execute(
        `SELECT * FROM expense_vouchers WHERE id = ? AND tenant_id = ?`,
        [input.voucherId, tenantId],
      );
      const voucher = (vRows as any[])[0];
      if (!voucher) throw new TRPCError({ code: "NOT_FOUND", message: "전표를 찾을 수 없습니다." });
      if (voucher.payment_method !== "unpaid") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "미지급 전표만 지급처리 할 수 있습니다." });
      }
      if (voucher.is_fully_paid) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "이미 완납된 전표입니다." });
      }

      const currentBalance = Number(voucher.unpaid_balance) || Number(voucher.total_amount);
      if (input.paymentAmount > currentBalance + 1) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `지급 금액(${input.paymentAmount})이 잔액(${currentBalance})을 초과합니다.` });
      }

      // 지급 기록 생성
      await conn.execute(
        `INSERT INTO expense_unpaid_payments
           (tenant_id, voucher_id, payment_date, payment_amount, payment_method, bank_account_id, memo, paid_by)
         VALUES (?,?,?,?,?,?,?,?)`,
        [tenantId, input.voucherId, input.paymentDate, input.paymentAmount,
         input.paymentMethod, input.bankAccountId || null, input.memo || null, ctx.user.id],
      );

      // 잔액 업데이트
      const newBalance = Math.max(0, currentBalance - input.paymentAmount);
      const isFullyPaid = newBalance < 1 ? 1 : 0;
      await conn.execute(
        `UPDATE expense_vouchers SET unpaid_balance = ?, is_fully_paid = ? WHERE id = ? AND tenant_id = ?`,
        [newBalance, isFullyPaid, input.voucherId, tenantId],
      );

      return { success: true, newBalance, isFullyPaid: isFullyPaid === 1 };
    }),

  // ═══════════════════════════════════════════
  // 2차-C: 부가세(매입세액) 기간별 집계
  // ═══════════════════════════════════════════
  vatSummary: tenantRequiredProcedure
    .input(z.object({
      startDate: z.string(),
      endDate: z.string(),
    }))
    .query(async ({ input, ctx }) => {
      const tenantId = getEffectiveTenantId(ctx);
      const conn = await getRawConnection();

      // 전체 부가세 집계
      const [totalRows] = await conn.execute(
        `SELECT
           COUNT(*) as voucher_count,
           SUM(supply_amount) as total_supply,
           SUM(vat_amount) as total_vat,
           SUM(total_amount) as total_amount
         FROM expense_vouchers
         WHERE tenant_id = ? AND expense_date >= ? AND expense_date <= ?
           AND status = 'posted'`,
        [tenantId, input.startDate, input.endDate],
      );

      // 증빙유형별 부가세 집계
      const [byProofRows] = await conn.execute(
        `SELECT
           proof_type,
           COUNT(*) as cnt,
           SUM(supply_amount) as supply_sum,
           SUM(vat_amount) as vat_sum,
           SUM(total_amount) as total_sum
         FROM expense_vouchers
         WHERE tenant_id = ? AND expense_date >= ? AND expense_date <= ?
           AND status = 'posted'
         GROUP BY proof_type
         ORDER BY vat_sum DESC`,
        [tenantId, input.startDate, input.endDate],
      );

      // 월별 부가세 추이
      const [monthlyRows] = await conn.execute(
        `SELECT
           DATE_FORMAT(expense_date, '%Y-%m') as month,
           SUM(supply_amount) as supply_sum,
           SUM(vat_amount) as vat_sum,
           SUM(total_amount) as total_sum,
           COUNT(*) as cnt
         FROM expense_vouchers
         WHERE tenant_id = ? AND expense_date >= ? AND expense_date <= ?
           AND status = 'posted'
         GROUP BY DATE_FORMAT(expense_date, '%Y-%m')
         ORDER BY month`,
        [tenantId, input.startDate, input.endDate],
      );

      // 세금계산서/카드 증빙 = 매입세액 공제 가능
      const [deductibleRows] = await conn.execute(
        `SELECT
           SUM(vat_amount) as deductible_vat
         FROM expense_vouchers
         WHERE tenant_id = ? AND expense_date >= ? AND expense_date <= ?
           AND status = 'posted'
           AND proof_type IN ('tax_invoice', 'card')`,
        [tenantId, input.startDate, input.endDate],
      );

      return {
        total: (totalRows as any[])[0],
        byProofType: byProofRows as any[],
        monthly: monthlyRows as any[],
        deductibleVat: Number((deductibleRows as any[])[0]?.deductible_vat || 0),
      };
    }),

  // ═══════════════════════════════════
  // 거래처 검색 (통합 partners 테이블)
  // ═══════════════════════════════════
  searchPartners: tenantRequiredProcedure
    .input(z.object({
      search: z.string().optional(),
      partnerType: z.enum(["supplier", "customer", "subcontractor"]).optional(),
      limit: z.number().default(20),
    }))
    .query(async ({ input, ctx }) => {
      const tenantId = getEffectiveTenantId(ctx);
      const conn = await getRawConnection();
      let where = "tenant_id = ? AND is_active = 1";
      const params: any[] = [tenantId];
      if (input.partnerType) {
        where += " AND partner_type = ?";
        params.push(input.partnerType);
      }
      if (input.search) {
        where += " AND (company_name LIKE ? OR biz_no LIKE ? OR contact_person LIKE ?)";
        const s = `%${input.search}%`;
        params.push(s, s, s);
      }
      const limitVal = Math.max(1, Math.min(input.limit, 50));
      const [rows] = await conn.query(
        `SELECT id, company_name, partner_type, biz_no, supplier_code, contact_person, phone, email
         FROM partners WHERE ${where} ORDER BY company_name LIMIT ${limitVal}`,
        params,
      );
      return rows as any[];
    }),
});
