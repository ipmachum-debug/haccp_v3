/**
 * 부가세 관리 라우터 — ERP 강화 Phase 1-2
 *
 * 매입세액/매출세액 자동 집계 + 부가세 신고서 미리보기
 */
import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../_core/trpc";
import { getPool } from "../../db/pool";

export const vatManagementRouter = router({
  /**
   * 부가세 요약 (기간별)
   * 매입세액, 매출세액, 납부세액, 월별 추이
   */
  summary: tenantRequiredProcedure
    .input(z.object({
      startDate: z.string(),
      endDate: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const pool = getPool();
      const tenantId = ctx.tenantId;
      try {

      // 매입세액 (accounting_purchases)
      const [inputRows]: any = await pool.execute(
        `SELECT
           COALESCE(SUM(CAST(tax_amount AS DECIMAL(15,2))), 0) as totalTax,
           COALESCE(SUM(CAST(total_amount AS DECIMAL(15,2)) - CAST(tax_amount AS DECIMAL(15,2))), 0) as totalSupply,
           COUNT(*) as cnt
         FROM accounting_purchases
         WHERE tenant_id = ? AND status != 'cancelled'
           AND transaction_date >= ? AND transaction_date <= ?`,
        [tenantId, input.startDate, input.endDate],
      );

      // 매출세액 (accounting_sales)
      const [outputRows]: any = await pool.execute(
        `SELECT
           COALESCE(SUM(CAST(tax_amount AS DECIMAL(15,2))), 0) as totalTax,
           COALESCE(SUM(CAST(total_amount AS DECIMAL(15,2)) - CAST(tax_amount AS DECIMAL(15,2))), 0) as totalSupply,
           COUNT(*) as cnt
         FROM accounting_sales
         WHERE tenant_id = ? AND status != 'cancelled'
           AND transaction_date >= ? AND transaction_date <= ?`,
        [tenantId, input.startDate, input.endDate],
      );

      const inputTax = Number(inputRows[0]?.totalTax || 0);
      const outputTax = Number(outputRows[0]?.totalTax || 0);

      return {
        input: {
          taxAmount: inputTax,
          supplyAmount: Number(inputRows[0]?.totalSupply || 0),
          count: Number(inputRows[0]?.cnt || 0),
        },
        output: {
          taxAmount: outputTax,
          supplyAmount: Number(outputRows[0]?.totalSupply || 0),
          count: Number(outputRows[0]?.cnt || 0),
        },
        netPayable: outputTax - inputTax,
        isRefund: outputTax < inputTax,
      };
      } catch (err: any) {
        console.warn("[vat.summary]", err.message?.substring(0, 100));
        return { input: { taxAmount: 0, supplyAmount: 0, count: 0 }, output: { taxAmount: 0, supplyAmount: 0, count: 0 }, netPayable: 0, isRefund: false };
      }
    }),

  /**
   * 월별 부가세 추이
   */
  monthlyTrend: tenantRequiredProcedure
    .input(z.object({ year: z.number() }))
    .query(async ({ ctx, input }) => {
      try {
      const pool = getPool();
      const tenantId = ctx.tenantId;
      const year = input.year;

      // 매입세액 월별
      const [inputMonthly]: any = await pool.execute(
        `SELECT
           MONTH(transaction_date) as month,
           COALESCE(SUM(CAST(tax_amount AS DECIMAL(15,2))), 0) as tax,
           COALESCE(SUM(CAST(total_amount AS DECIMAL(15,2)) - CAST(tax_amount AS DECIMAL(15,2))), 0) as supply
         FROM accounting_purchases
         WHERE tenant_id = ? AND status != 'cancelled'
           AND YEAR(transaction_date) = ?
         GROUP BY MONTH(transaction_date)
         ORDER BY month`,
        [tenantId, year],
      );

      // 매출세액 월별
      const [outputMonthly]: any = await pool.execute(
        `SELECT
           MONTH(transaction_date) as month,
           COALESCE(SUM(CAST(tax_amount AS DECIMAL(15,2))), 0) as tax,
           COALESCE(SUM(CAST(total_amount AS DECIMAL(15,2)) - CAST(tax_amount AS DECIMAL(15,2))), 0) as supply
         FROM accounting_sales
         WHERE tenant_id = ? AND status != 'cancelled'
           AND YEAR(transaction_date) = ?
         GROUP BY MONTH(transaction_date)
         ORDER BY month`,
        [tenantId, year],
      );

      const inputMap = new Map((inputMonthly as any[]).map((r: any) => [r.month, r]));
      const outputMap = new Map((outputMonthly as any[]).map((r: any) => [r.month, r]));

      return Array.from({ length: 12 }, (_, i) => {
        const m = i + 1;
        const inp = inputMap.get(m);
        const out = outputMap.get(m);
        const inputTax = Number(inp?.tax || 0);
        const outputTax = Number(out?.tax || 0);
        return {
          month: m,
          inputTax,
          inputSupply: Number(inp?.supply || 0),
          outputTax,
          outputSupply: Number(out?.supply || 0),
          netPayable: outputTax - inputTax,
        };
      });
      } catch (err: any) {
        console.warn("[vat.monthlyTrend]", err.message?.substring(0, 100));
        return Array.from({ length: 12 }, (_, i) => ({ month: i+1, inputTax: 0, inputSupply: 0, outputTax: 0, outputSupply: 0, netPayable: 0 }));
      }
    }),

  reportPreview: tenantRequiredProcedure
    .input(z.object({
      year: z.number(),
      period: z.enum(["H1", "H2"]), // H1: 1기(1~6월), H2: 2기(7~12월)
    }))
    .query(async ({ ctx, input }) => {
      try {
      const pool = getPool();
      const tenantId = ctx.tenantId;
      const startMonth = input.period === "H1" ? 1 : 7;
      const endMonth = input.period === "H1" ? 6 : 12;
      const startDate = `${input.year}-${String(startMonth).padStart(2, "0")}-01`;
      const endDate = `${input.year}-${String(endMonth).padStart(2, "0")}-31`;

      // 매출 세금계산서 집계
      const [salesTi]: any = await pool.execute(
        `SELECT
           COALESCE(SUM(CAST(supply_amount AS DECIMAL(15,2))), 0) as supply,
           COALESCE(SUM(CAST(tax_amount AS DECIMAL(15,2))), 0) as tax,
           COUNT(*) as cnt
         FROM tax_invoices
         WHERE tenant_id = ? AND invoice_type = 'sales'
           AND status NOT IN ('draft', 'cancelled')
           AND issue_date >= ? AND issue_date <= ?`,
        [tenantId, startDate, endDate],
      );

      // 매입 세금계산서 집계
      const [purchaseTi]: any = await pool.execute(
        `SELECT
           COALESCE(SUM(CAST(supply_amount AS DECIMAL(15,2))), 0) as supply,
           COALESCE(SUM(CAST(tax_amount AS DECIMAL(15,2))), 0) as tax,
           COUNT(*) as cnt
         FROM tax_invoices
         WHERE tenant_id = ? AND invoice_type = 'purchase'
           AND status NOT IN ('draft', 'cancelled')
           AND issue_date >= ? AND issue_date <= ?`,
        [tenantId, startDate, endDate],
      );

      // 매입/매출 전표 기반 집계 (세금계산서 미발행분 포함)
      const [purchaseTotal]: any = await pool.execute(
        `SELECT
           COALESCE(SUM(CAST(total_amount AS DECIMAL(15,2)) - CAST(tax_amount AS DECIMAL(15,2))), 0) as supply,
           COALESCE(SUM(CAST(tax_amount AS DECIMAL(15,2))), 0) as tax,
           COUNT(*) as cnt
         FROM accounting_purchases
         WHERE tenant_id = ? AND status != 'cancelled'
           AND transaction_date >= ? AND transaction_date <= ?`,
        [tenantId, startDate, endDate],
      );

      const [salesTotal]: any = await pool.execute(
        `SELECT
           COALESCE(SUM(CAST(total_amount AS DECIMAL(15,2)) - CAST(tax_amount AS DECIMAL(15,2))), 0) as supply,
           COALESCE(SUM(CAST(tax_amount AS DECIMAL(15,2))), 0) as tax,
           COUNT(*) as cnt
         FROM accounting_sales
         WHERE tenant_id = ? AND status != 'cancelled'
           AND transaction_date >= ? AND transaction_date <= ?`,
        [tenantId, startDate, endDate],
      );

      const outputTax = Number(salesTotal[0]?.tax || 0);
      const inputTax = Number(purchaseTotal[0]?.tax || 0);
      const netPayable = outputTax - inputTax;

      return {
        period: `${input.year}년 ${input.period === "H1" ? "1기" : "2기"} (${startMonth}~${endMonth}월)`,
        year: input.year,
        halfYear: input.period,
        // 매출 쪽
        sales: {
          taxInvoice: { supply: Number(salesTi[0]?.supply || 0), tax: Number(salesTi[0]?.tax || 0), count: Number(salesTi[0]?.cnt || 0) },
          total: { supply: Number(salesTotal[0]?.supply || 0), tax: Number(salesTotal[0]?.tax || 0), count: Number(salesTotal[0]?.cnt || 0) },
        },
        // 매입 쪽
        purchases: {
          taxInvoice: { supply: Number(purchaseTi[0]?.supply || 0), tax: Number(purchaseTi[0]?.tax || 0), count: Number(purchaseTi[0]?.cnt || 0) },
          total: { supply: Number(purchaseTotal[0]?.supply || 0), tax: Number(purchaseTotal[0]?.tax || 0), count: Number(purchaseTotal[0]?.cnt || 0) },
        },
        // 납부세액
        outputTax,
        inputTax,
        netPayable,
        isRefund: netPayable < 0,
      };
      } catch (err: any) {
        console.warn("[vat.reportPreview]", err.message?.substring(0, 100));
        const z = { supply: 0, tax: 0, count: 0 };
        return {
          period: `${input.year}년 ${input.period === "H1" ? "1기" : "2기"}`,
          year: input.year, halfYear: input.period,
          sales: { taxInvoice: z, total: z },
          purchases: { taxInvoice: z, total: z },
          outputTax: 0, inputTax: 0, netPayable: 0, isRefund: false,
        };
      }
    }),
});
