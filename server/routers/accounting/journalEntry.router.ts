/**
 * 전표(분개) 직접 입력 라우터 — ERP 핵심 기능
 *
 * 수기 전표 입력: 차변/대변 복수 행 지원
 * 자동 생성된 전표(매입/매출/비용 등)도 조회 가능
 */
import { z } from "zod";
import { router, tenantRequiredProcedure, adminProcedure } from "../../_core/trpc";
import { getDb, withTransaction } from "../../db";
import { insertJournalLine } from "../../db/accounting/journalHelper";
import { sql, eq, and, desc, gte, lte, like } from "drizzle-orm";

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
  /**
   * 전표 목록 조회 (전체: 수기 + 자동)
   */
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
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");
      const tenantId = ctx.tenantId;
      const page = input?.page || 1;
      const limit = input?.limit || 50;
      const offset = (page - 1) * limit;

      let whereClause = `WHERE e.tenant_id = ?`;
      const params: any[] = [tenantId];

      if (input?.startDate) {
        whereClause += ` AND e.entry_date >= ?`;
        params.push(input.startDate);
      }
      if (input?.endDate) {
        whereClause += ` AND e.entry_date <= ?`;
        params.push(input.endDate);
      }
      if (input?.search) {
        whereClause += ` AND e.description LIKE ?`;
        params.push(`%${input.search}%`);
      }
      if (input?.manualOnly) {
        whereClause += ` AND e.voucher_id IS NULL`;
      }

      // 총 건수
      const [countResult]: any = await db.execute(sql.raw(
        `SELECT COUNT(*) as cnt FROM expense_journal_entries e ${whereClause}`,
      ).append(sql``));
      // raw query로 직접 실행
      const pool = (await import("../../db/pool")).getPool();
      const [countRows]: any = await pool.execute(
        `SELECT COUNT(*) as cnt FROM expense_journal_entries e ${whereClause}`,
        params,
      );
      const total = Number(countRows[0]?.cnt || 0);

      // 목록 조회
      const [rows]: any = await pool.execute(
        `SELECT e.id, e.entry_date, e.description, e.total_debit, e.total_credit,
                e.voucher_id, e.posted_by, e.posted_at, e.created_at,
                u.name as posted_by_name
         FROM expense_journal_entries e
         LEFT JOIN users u ON e.posted_by = u.id
         ${whereClause}
         ORDER BY e.entry_date DESC, e.id DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      );

      return {
        items: (rows as any[]).map((r: any) => ({
          id: r.id,
          entryDate: r.entry_date,
          description: r.description,
          totalDebit: Number(r.total_debit || 0),
          totalCredit: Number(r.total_credit || 0),
          voucherId: r.voucher_id,
          isManual: !r.voucher_id,
          postedByName: r.posted_by_name || "",
          createdAt: r.created_at,
        })),
        total,
        page,
        limit,
      };
    }),

  /**
   * 전표 상세 조회 (헤더 + 분개행)
   */
  getById: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const pool = (await import("../../db/pool")).getPool();
      const tenantId = ctx.tenantId;

      const [headerRows]: any = await pool.execute(
        `SELECT e.*, u.name as posted_by_name
         FROM expense_journal_entries e
         LEFT JOIN users u ON e.posted_by = u.id
         WHERE e.id = ? AND e.tenant_id = ?`,
        [input.id, tenantId],
      );
      if (!headerRows[0]) throw new Error("전표를 찾을 수 없습니다.");

      const [lineRows]: any = await pool.execute(
        `SELECT * FROM expense_journal_lines
         WHERE journal_entry_id = ? AND tenant_id = ?
         ORDER BY sort_order ASC`,
        [input.id, tenantId],
      );

      const header = headerRows[0];
      return {
        id: header.id,
        entryDate: header.entry_date,
        description: header.description,
        totalDebit: Number(header.total_debit || 0),
        totalCredit: Number(header.total_credit || 0),
        voucherId: header.voucher_id,
        isManual: !header.voucher_id,
        postedByName: header.posted_by_name,
        createdAt: header.created_at,
        lines: (lineRows as any[]).map((l: any) => ({
          id: l.id,
          accountId: l.account_id,
          accountCode: l.account_code,
          accountName: l.account_name,
          debitAmount: Number(l.debit_amount || 0),
          creditAmount: Number(l.credit_amount || 0),
          description: l.description,
          partnerId: l.partner_id,
        })),
      };
    }),

  /**
   * 수기 전표 생성 (복수 행 차변/대변)
   */
  create: adminProcedure
    .input(z.object({
      entryDate: z.string(),
      description: z.string().min(1, "적요 필수"),
      lines: z.array(journalLineSchema).min(2, "최소 2행 필요"),
    }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId;

      // 차대 균형 검증
      const totalDebit = input.lines.reduce((s, l) => s + l.debitAmount, 0);
      const totalCredit = input.lines.reduce((s, l) => s + l.creditAmount, 0);
      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        throw new Error(`차변(${totalDebit.toLocaleString()})과 대변(${totalCredit.toLocaleString()})이 일치하지 않습니다.`);
      }

      // 각 행에 차변 또는 대변이 있는지 검증
      for (const line of input.lines) {
        if (line.debitAmount === 0 && line.creditAmount === 0) {
          throw new Error(`${line.accountName}: 차변 또는 대변 금액을 입력하세요.`);
        }
        if (line.debitAmount > 0 && line.creditAmount > 0) {
          throw new Error(`${line.accountName}: 차변과 대변을 동시에 입력할 수 없습니다.`);
        }
      }

      return await withTransaction(async (conn) => {
        // 헤더 생성
        const [result]: any = await conn.execute(
          `INSERT INTO expense_journal_entries
             (tenant_id, voucher_id, entry_date, description, total_debit, total_credit, posted_by, posted_at)
           VALUES (?, NULL, ?, ?, ?, ?, ?, NOW())`,
          [tenantId, input.entryDate, `[수기전표] ${input.description}`, totalDebit, totalCredit, ctx.user.id],
        );
        const journalEntryId = Number(result.insertId);

        // 분개행 생성
        let sortOrder = 0;
        for (const line of input.lines) {
          await insertJournalLine(conn, {
            tenantId,
            journalEntryId,
            accountId: line.accountId,
            accountCode: line.accountCode,
            accountName: line.accountName,
            debitAmount: line.debitAmount,
            creditAmount: line.creditAmount,
            description: line.description || input.description,
            sortOrder: sortOrder++,
            partnerId: line.partnerId || null,
          });
        }

        return { id: journalEntryId, message: "전표가 등록되었습니다." };
      }, `journalEntry.create`);
    }),

  /**
   * 수기 전표 삭제 (자동 생성 전표는 삭제 불가)
   */
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      return await withTransaction(async (conn) => {
        const [rows]: any = await conn.execute(
          `SELECT voucher_id FROM expense_journal_entries WHERE id = ? AND tenant_id = ? FOR UPDATE`,
          [input.id, ctx.tenantId],
        );
        if (!rows[0]) throw new Error("전표를 찾을 수 없습니다.");
        if (rows[0].voucher_id) {
          throw new Error("자동 생성된 전표는 직접 삭제할 수 없습니다. 원본 거래를 취소하세요.");
        }

        await conn.execute(
          `DELETE FROM expense_journal_lines WHERE journal_entry_id = ? AND tenant_id = ?`,
          [input.id, ctx.tenantId],
        );
        await conn.execute(
          `DELETE FROM expense_journal_entries WHERE id = ? AND tenant_id = ?`,
          [input.id, ctx.tenantId],
        );

        return { message: "전표가 삭제되었습니다." };
      }, `journalEntry.delete:${input.id}`);
    }),
});
