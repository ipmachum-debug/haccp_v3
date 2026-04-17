/**
 * 예산 관리 라우터 — ERP 강화 Phase 2-2
 *
 * 계정별 월간 예산 설정 + 실적 비교 + 초과 알림
 */
import { z } from "zod";
import { router, tenantRequiredProcedure, adminProcedure } from "../../_core/trpc";
import { getPool } from "../../db/pool";

export const budgetRouter = router({
  /**
   * 예산 목록 (연도별)
   */
  list: tenantRequiredProcedure
    .input(z.object({ year: z.number() }))
    .query(async ({ ctx, input }) => {
      const pool = getPool();
      const [rows]: any = await pool.execute(
        `SELECT b.*, aa.name as account_name, aa.code as account_code, aa.category as account_category
         FROM budgets b
         LEFT JOIN accounting_accounts aa ON b.account_id = aa.id
         WHERE b.tenant_id = ? AND b.year = ?
         ORDER BY aa.code ASC`,
        [ctx.tenantId, input.year],
      );
      return (rows as any[]).map((r: any) => ({
        id: r.id,
        accountId: r.account_id,
        accountName: r.account_name,
        accountCode: r.account_code,
        accountCategory: r.account_category,
        year: r.year,
        m1: Number(r.m1 || 0), m2: Number(r.m2 || 0), m3: Number(r.m3 || 0),
        m4: Number(r.m4 || 0), m5: Number(r.m5 || 0), m6: Number(r.m6 || 0),
        m7: Number(r.m7 || 0), m8: Number(r.m8 || 0), m9: Number(r.m9 || 0),
        m10: Number(r.m10 || 0), m11: Number(r.m11 || 0), m12: Number(r.m12 || 0),
        annual: [1,2,3,4,5,6,7,8,9,10,11,12].reduce((s, i) => s + Number(r[`m${i}`] || 0), 0),
      }));
    }),

  /**
   * 예산 vs 실적 비교
   */
  comparison: tenantRequiredProcedure
    .input(z.object({ year: z.number() }))
    .query(async ({ ctx, input }) => {
      const pool = getPool();
      const tenantId = ctx.tenantId;
      const year = input.year;

      // 예산
      const [budgetRows]: any = await pool.execute(
        `SELECT b.account_id, aa.name as account_name, aa.code as account_code,
                b.m1, b.m2, b.m3, b.m4, b.m5, b.m6,
                b.m7, b.m8, b.m9, b.m10, b.m11, b.m12
         FROM budgets b
         LEFT JOIN accounting_accounts aa ON b.account_id = aa.id
         WHERE b.tenant_id = ? AND b.year = ?
         ORDER BY aa.code`,
        [tenantId, year],
      );

      // 실적 (expense_journal_lines 기준)
      const [actualRows]: any = await pool.execute(
        `SELECT l.account_id,
                MONTH(e.entry_date) as month,
                SUM(l.debit_amount) as debit,
                SUM(l.credit_amount) as credit
         FROM expense_journal_lines l
         JOIN expense_journal_entries e ON l.journal_entry_id = e.id AND e.tenant_id = l.tenant_id
         WHERE l.tenant_id = ? AND YEAR(e.entry_date) = ?
         GROUP BY l.account_id, MONTH(e.entry_date)`,
        [tenantId, year],
      );

      // 실적 맵: accountId → { month → amount }
      const actualMap = new Map<number, Map<number, number>>();
      for (const r of actualRows as any[]) {
        if (!actualMap.has(r.account_id)) actualMap.set(r.account_id, new Map());
        // 비용은 차변, 수익은 대변
        const amount = Number(r.debit || 0) - Number(r.credit || 0);
        actualMap.get(r.account_id)!.set(r.month, Math.abs(amount));
      }

      return (budgetRows as any[]).map((b: any) => {
        const actuals = actualMap.get(b.account_id) || new Map();
        const months = Array.from({ length: 12 }, (_, i) => {
          const m = i + 1;
          const budget = Number(b[`m${m}`] || 0);
          const actual = actuals.get(m) || 0;
          return { month: m, budget, actual, diff: budget - actual, rate: budget > 0 ? Math.round((actual / budget) * 100) : 0 };
        });
        const annualBudget = months.reduce((s, m) => s + m.budget, 0);
        const annualActual = months.reduce((s, m) => s + m.actual, 0);

        return {
          accountId: b.account_id,
          accountName: b.account_name,
          accountCode: b.account_code,
          months,
          annualBudget,
          annualActual,
          annualDiff: annualBudget - annualActual,
          annualRate: annualBudget > 0 ? Math.round((annualActual / annualBudget) * 100) : 0,
        };
      });
    }),

  /**
   * 예산 설정/수정 (UPSERT)
   */
  upsert: adminProcedure
    .input(z.object({
      accountId: z.number(),
      year: z.number(),
      amounts: z.object({
        m1: z.number(), m2: z.number(), m3: z.number(), m4: z.number(),
        m5: z.number(), m6: z.number(), m7: z.number(), m8: z.number(),
        m9: z.number(), m10: z.number(), m11: z.number(), m12: z.number(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const pool = getPool();
      const a = input.amounts;
      await pool.execute(
        `INSERT INTO budgets (tenant_id, account_id, year, m1,m2,m3,m4,m5,m6,m7,m8,m9,m10,m11,m12)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE
           m1=VALUES(m1),m2=VALUES(m2),m3=VALUES(m3),m4=VALUES(m4),
           m5=VALUES(m5),m6=VALUES(m6),m7=VALUES(m7),m8=VALUES(m8),
           m9=VALUES(m9),m10=VALUES(m10),m11=VALUES(m11),m12=VALUES(m12),
           updated_at=NOW()`,
        [ctx.tenantId, input.accountId, input.year,
         a.m1,a.m2,a.m3,a.m4,a.m5,a.m6,a.m7,a.m8,a.m9,a.m10,a.m11,a.m12],
      );
      return { message: "예산이 저장되었습니다." };
    }),

  /**
   * 예산 삭제
   */
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const pool = getPool();
      await pool.execute(
        `DELETE FROM budgets WHERE id = ? AND tenant_id = ?`,
        [input.id, ctx.tenantId],
      );
      return { message: "예산이 삭제되었습니다." };
    }),
});
