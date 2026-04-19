/**
 * 전표(분개) 직접 입력 라우터 — ERP 핵심 기능
 * ★ 모든 쿼리 try/catch — 테이블 부재 시에도 안전
 */
import { z } from "zod";
import { router, tenantRequiredProcedure, adminProcedure } from "../../_core/trpc";
import { withTransaction } from "../../db";
import { insertJournalLine } from "../../db/accounting/journalHelper";
import { getPool } from "../../db/pool";

const journalLineSchema = z.object({
  accountId: z.number(),
  accountCode: z.string(),
  accountName: z.string(),
  debitAmount: z.number().nonnegative(),
  creditAmount: z.number().nonnegative(),
  description: z.string().optional(),
  partnerId: z.number().optional(),
});

export const journalEntryRouter = router({
  list: tenantRequiredProcedure
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      search: z.string().optional(),
      manualOnly: z.boolean().optional(),
      page: z.number().default(1),
      limit: z.number().default(50),
    }).optional())
    .query(async ({ ctx, input }) => {
      const pool = getPool();
      const tenantId = ctx.tenantId;
      const page = input?.page || 1;
      const limit = input?.limit || 50;
      const offset = (page - 1) * limit;

      let where = `WHERE e.tenant_id = ?`;
      const params: any[] = [tenantId];

      if (input?.startDate) { where += ` AND e.entry_date >= ?`; params.push(input.startDate); }
      if (input?.endDate) { where += ` AND e.entry_date <= ?`; params.push(input.endDate); }
      if (input?.search) { where += ` AND e.description LIKE ?`; params.push(`%${input.search}%`); }
      if (input?.manualOnly) { where += ` AND e.voucher_id IS NULL`; }

      try {
        const [countRows]: any = await pool.execute(
          `SELECT COUNT(*) as cnt FROM expense_journal_entries e ${where}`, params,
        );
        const total = Number(countRows[0]?.cnt || 0);

        const [rows]: any = await pool.execute(
          `SELECT e.id, e.entry_date, e.description, e.total_debit, e.total_credit,
                  e.voucher_id, e.posted_by, e.created_at,
                  u.name as posted_by_name
           FROM expense_journal_entries e
           LEFT JOIN users u ON e.posted_by = u.id
           ${where}
           ORDER BY e.entry_date DESC, e.id DESC
           LIMIT ? OFFSET ?`,
          [...params, limit, offset],
        );

        return {
          items: (rows as any[]).map((r: any) => ({
            id: r.id, entryDate: r.entry_date, description: r.description,
            totalDebit: Number(r.total_debit || 0), totalCredit: Number(r.total_credit || 0),
            voucherId: r.voucher_id, isManual: !r.voucher_id,
            postedByName: r.posted_by_name || "", createdAt: r.created_at,
          })),
          total, page, limit,
        };
      } catch (err: any) {
        console.error("[journalEntry.list] 쿼리 실패:", err.message);
        return { items: [], total: 0, page, limit };
      }
    }),

  getById: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const pool = getPool();
      try {
        const [headerRows]: any = await pool.execute(
          `SELECT e.*, u.name as posted_by_name FROM expense_journal_entries e
           LEFT JOIN users u ON e.posted_by = u.id WHERE e.id = ? AND e.tenant_id = ?`,
          [input.id, ctx.tenantId],
        );
        if (!headerRows[0]) throw new Error("전표를 찾을 수 없습니다.");

        const [lineRows]: any = await pool.execute(
          `SELECT * FROM expense_journal_lines WHERE journal_entry_id = ? AND tenant_id = ? ORDER BY sort_order ASC`,
          [input.id, ctx.tenantId],
        );

        const h = headerRows[0];
        return {
          id: h.id, entryDate: h.entry_date, description: h.description,
          totalDebit: Number(h.total_debit || 0), totalCredit: Number(h.total_credit || 0),
          voucherId: h.voucher_id, isManual: !h.voucher_id,
          postedByName: h.posted_by_name, createdAt: h.created_at,
          lines: (lineRows as any[]).map((l: any) => ({
            id: l.id, accountId: l.account_id, accountCode: l.account_code,
            accountName: l.account_name, debitAmount: Number(l.debit_amount || 0),
            creditAmount: Number(l.credit_amount || 0), description: l.description,
            partnerId: l.partner_id,
          })),
        };
      } catch (err: any) {
        throw new Error(`전표 조회 실패: ${err.message}`);
      }
    }),

  create: adminProcedure
    .input(z.object({
      entryDate: z.string(),
      description: z.string().min(1, "적요 필수"),
      lines: z.array(journalLineSchema).min(2, "최소 2행 필요"),
    }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId;
      const totalDebit = input.lines.reduce((s, l) => s + l.debitAmount, 0);
      const totalCredit = input.lines.reduce((s, l) => s + l.creditAmount, 0);
      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        throw new Error(`차변(${totalDebit.toLocaleString()})과 대변(${totalCredit.toLocaleString()})이 불일치`);
      }
      for (const line of input.lines) {
        if (line.debitAmount === 0 && line.creditAmount === 0) throw new Error(`${line.accountName}: 금액 입력 필요`);
        if (line.debitAmount > 0 && line.creditAmount > 0) throw new Error(`${line.accountName}: 차변/대변 동시 입력 불가`);
      }

      return await withTransaction(async (conn) => {
        const [result]: any = await conn.execute(
          `INSERT INTO expense_journal_entries
             (tenant_id, voucher_id, entry_date, description, total_debit, total_credit, posted_by, posted_at)
           VALUES (?, NULL, ?, ?, ?, ?, ?, NOW())`,
          [tenantId, input.entryDate, `[수기전표] ${input.description}`, totalDebit, totalCredit, ctx.user.id],
        );
        const journalEntryId = Number(result.insertId);

        let sortOrder = 0;
        for (const line of input.lines) {
          await insertJournalLine(conn, {
            tenantId, journalEntryId,
            accountId: line.accountId, accountCode: line.accountCode, accountName: line.accountName,
            debitAmount: line.debitAmount, creditAmount: line.creditAmount,
            description: line.description || input.description, sortOrder: sortOrder++,
            partnerId: line.partnerId || null,
          });
        }
        return { id: journalEntryId, message: "전표가 등록되었습니다." };
      }, `journalEntry.create`);
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      return await withTransaction(async (conn) => {
        const [rows]: any = await conn.execute(
          `SELECT voucher_id FROM expense_journal_entries WHERE id = ? AND tenant_id = ? FOR UPDATE`,
          [input.id, ctx.tenantId],
        );
        if (!rows[0]) throw new Error("전표를 찾을 수 없습니다.");
        if (rows[0].voucher_id) throw new Error("자동 생성 전표는 직접 삭제 불가. 원본 거래를 취소하세요.");

        await conn.execute(`DELETE FROM expense_journal_lines WHERE journal_entry_id = ? AND tenant_id = ?`, [input.id, ctx.tenantId]);
        await conn.execute(`DELETE FROM expense_journal_entries WHERE id = ? AND tenant_id = ?`, [input.id, ctx.tenantId]);
        return { message: "전표가 삭제되었습니다." };
      }, `journalEntry.delete:${input.id}`);
    }),

  /**
   * AI 전표 추천 — 거래 정보 기반 차변/대변 자동 추천
   */
  aiRecommend: tenantRequiredProcedure
    .input(z.object({
      type: z.enum(["purchase", "sale", "expense", "manual"]),
      itemName: z.string().optional(),
      partnerName: z.string().optional(),
      amount: z.number(),
      description: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const { recommendJournalEntry } = await import("../../services/ai/aiJournalRecommend.service");
        return await recommendJournalEntry(ctx.tenantId, input);
      } catch (err: any) {
        return {
          debitCode: "", debitName: "", creditCode: "", creditName: "",
          confidence: 0, reason: `추천 실패: ${err.message?.substring(0, 50)}`, source: "pattern" as const,
        };
      }
    }),
});
