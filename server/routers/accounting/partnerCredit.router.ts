/**
 * 거래처 신용관리 라우터 — ERP 강화 Phase 2-3
 *
 * 신용한도 설정 + 연체 현황 + 거래처별 AP/AR 잔액
 */
import { z } from "zod";
import { router, tenantRequiredProcedure, adminProcedure } from "../../_core/trpc";
import { getPool } from "../../db/pool";

export const partnerCreditRouter = router({
  /**
   * 거래처 신용 현황 (AP/AR + 한도 + 연체)
   */
  list: tenantRequiredProcedure
    .input(z.object({
      type: z.enum(["all", "customer", "supplier"]).optional(),
      search: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const pool = getPool();
      const tenantId = ctx.tenantId;

      // 거래처 + 신용한도 조회
      let where = `WHERE p.tenant_id = ?`;
      const params: any[] = [tenantId];

      if (input?.type === "customer") { where += ` AND p.partner_type IN ('customer', 'both')`; }
      else if (input?.type === "supplier") { where += ` AND p.partner_type IN ('supplier', 'both')`; }
      if (input?.search) { where += ` AND (p.company_name LIKE ? OR p.biz_no LIKE ?)`; params.push(`%${input.search}%`, `%${input.search}%`); }

      const [partners]: any = await pool.execute(
        `SELECT p.id, p.company_name, p.biz_no, p.partner_type,
                p.credit_limit, p.payment_terms_days
         FROM partners p
         ${where}
         ORDER BY p.company_name`,
        params,
      );

      // AP 잔액 (미결제 매입)
      const [apRows]: any = await pool.execute(
        `SELECT partner_id,
                SUM(CAST(total_amount AS DECIMAL(15,2))) as total,
                COUNT(*) as cnt,
                MIN(transaction_date) as oldest_date
         FROM accounting_purchases
         WHERE tenant_id = ? AND status IN ('pending', 'approved')
         GROUP BY partner_id`,
        [tenantId],
      );
      const apMap = new Map((apRows as any[]).map((r: any) => [r.partner_id, r]));

      // AR 잔액 (미결제 매출)
      const [arRows]: any = await pool.execute(
        `SELECT partner_id,
                SUM(CAST(total_amount AS DECIMAL(15,2))) as total,
                COUNT(*) as cnt,
                MIN(transaction_date) as oldest_date
         FROM accounting_sales
         WHERE tenant_id = ? AND status IN ('pending', 'approved')
         GROUP BY partner_id`,
        [tenantId],
      );
      const arMap = new Map((arRows as any[]).map((r: any) => [r.partner_id, r]));

      const today = new Date();

      return (partners as any[]).map((p: any) => {
        const ap = apMap.get(p.id);
        const ar = arMap.get(p.id);
        const creditLimit = Number(p.credit_limit || 0);
        const apBalance = Number(ap?.total || 0);
        const arBalance = Number(ar?.total || 0);
        const outstandingBalance = apBalance + arBalance;

        // 연체일 계산
        let overdueDays = 0;
        const paymentTerms = p.payment_terms_days || 30;
        const oldestDate = ap?.oldest_date || ar?.oldest_date;
        if (oldestDate) {
          const oldest = new Date(oldestDate);
          const dueDate = new Date(oldest);
          dueDate.setDate(dueDate.getDate() + paymentTerms);
          if (today > dueDate) {
            overdueDays = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
          }
        }

        // 신용등급
        let creditGrade = "A";
        if (overdueDays > 60) creditGrade = "D";
        else if (overdueDays > 30) creditGrade = "C";
        else if (overdueDays > 7) creditGrade = "B";
        if (creditLimit > 0 && outstandingBalance > creditLimit) creditGrade = "D";

        return {
          id: p.id,
          companyName: p.company_name,
          bizNo: p.biz_no,
          partnerType: p.partner_type,
          creditLimit,
          paymentTermsDays: paymentTerms,
          apBalance,
          apCount: Number(ap?.cnt || 0),
          arBalance,
          arCount: Number(ar?.cnt || 0),
          outstandingBalance,
          overdueDays,
          creditGrade,
          isOverLimit: creditLimit > 0 && outstandingBalance > creditLimit,
          isOverdue: overdueDays > 0,
        };
      });
    }),

  /**
   * 신용한도 설정
   */
  setCreditLimit: adminProcedure
    .input(z.object({
      partnerId: z.number(),
      creditLimit: z.number().nonnegative(),
      paymentTermsDays: z.number().int().positive().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const pool = getPool();

      // credit_limit, payment_terms_days 컬럼 ensure
      try { await pool.execute(`ALTER TABLE partners ADD COLUMN credit_limit DECIMAL(15,2) DEFAULT 0`); } catch (_) {}
      try { await pool.execute(`ALTER TABLE partners ADD COLUMN payment_terms_days INT DEFAULT 30`); } catch (_) {}

      let sql = `UPDATE partners SET credit_limit = ?`;
      const params: any[] = [input.creditLimit];
      if (input.paymentTermsDays) {
        sql += `, payment_terms_days = ?`;
        params.push(input.paymentTermsDays);
      }
      sql += ` WHERE id = ? AND tenant_id = ?`;
      params.push(input.partnerId, ctx.tenantId);

      await pool.execute(sql, params);
      return { message: "신용한도가 설정되었습니다." };
    }),

  /**
   * 신용 요약 통계
   */
  /**
   * 미수금/미지급금 연령분석 (30/60/90/90+ 구간)
   */
  agingAnalysis: tenantRequiredProcedure.query(async ({ ctx }) => {
    const pool = getPool();
    const tenantId = ctx.tenantId;

    const aging = (rows: any[]) => {
      const buckets = { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0, total: 0 };
      const now = Date.now();
      for (const r of rows) {
        const amt = Number(r.total_amount || 0);
        const txDate = new Date(r.transaction_date);
        const days = Math.floor((now - txDate.getTime()) / (1000 * 60 * 60 * 24));
        buckets.total += amt;
        if (days <= 30) buckets.current += amt;
        else if (days <= 60) buckets.d30 += amt;
        else if (days <= 90) buckets.d60 += amt;
        else buckets.d90plus += amt;
      }
      return buckets;
    };

    let apBuckets = { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0, total: 0 };
    let arBuckets = { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0, total: 0 };

    try {
      const [apRows]: any = await pool.execute(
        `SELECT total_amount, transaction_date FROM accounting_purchases
         WHERE tenant_id = ? AND status IN ('pending', 'approved')`, [tenantId]);
      apBuckets = aging(apRows as any[]);
    } catch (_) {}

    try {
      const [arRows]: any = await pool.execute(
        `SELECT total_amount, transaction_date FROM accounting_sales
         WHERE tenant_id = ? AND status IN ('pending', 'approved')`, [tenantId]);
      arBuckets = aging(arRows as any[]);
    } catch (_) {}

    return { ap: apBuckets, ar: arBuckets };
  }),

  summary: tenantRequiredProcedure.query(async ({ ctx }) => {
    const pool = getPool();
    const tenantId = ctx.tenantId;

    const [apTotal]: any = await pool.execute(
      `SELECT COALESCE(SUM(CAST(total_amount AS DECIMAL(15,2))), 0) as total, COUNT(*) as cnt
       FROM accounting_purchases WHERE tenant_id = ? AND status IN ('pending', 'approved')`,
      [tenantId],
    );
    const [arTotal]: any = await pool.execute(
      `SELECT COALESCE(SUM(CAST(total_amount AS DECIMAL(15,2))), 0) as total, COUNT(*) as cnt
       FROM accounting_sales WHERE tenant_id = ? AND status IN ('pending', 'approved')`,
      [tenantId],
    );
    const [partnerCount]: any = await pool.execute(
      `SELECT COUNT(*) as cnt FROM partners WHERE tenant_id = ?`,
      [tenantId],
    );

    return {
      totalAP: Number(apTotal[0]?.total || 0),
      apCount: Number(apTotal[0]?.cnt || 0),
      totalAR: Number(arTotal[0]?.total || 0),
      arCount: Number(arTotal[0]?.cnt || 0),
      partnerCount: Number(partnerCount[0]?.cnt || 0),
    };
  }),
});
