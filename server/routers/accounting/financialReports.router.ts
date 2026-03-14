// financialReports 라우터
// P3: 시산표, 재무상태표, 손익계산서
// P4-3: Excel 내보내기
import { tenantRequiredProcedure, router } from "../../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

function getEffectiveTenantId(ctx: any): number {
  const tenantId = ctx.tenantId;
  if (!tenantId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "테넌트 정보가 필요합니다." });
  }
  return tenantId;
}

export const financialReportsRouter = router({
  // 시산표 (Trial Balance)
  trialBalance: tenantRequiredProcedure
    .input(
      z.object({
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
    )
    .query(async ({ input, ctx }) => {
      const tenantId = getEffectiveTenantId(ctx);
      const { generateTrialBalance } = await import("../../db/financialReports");
      return await generateTrialBalance(tenantId, input.startDate, input.endDate);
    }),

  // 재무상태표 (Balance Sheet)
  balanceSheet: tenantRequiredProcedure
    .input(
      z.object({
        asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
    )
    .query(async ({ input, ctx }) => {
      const tenantId = getEffectiveTenantId(ctx);
      const { generateBalanceSheet } = await import("../../db/financialReports");
      return await generateBalanceSheet(tenantId, input.asOfDate);
    }),

  // 손익계산서 (Income Statement)
  incomeStatement: tenantRequiredProcedure
    .input(
      z.object({
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
    )
    .query(async ({ input, ctx }) => {
      const tenantId = getEffectiveTenantId(ctx);
      const { generateIncomeStatement } = await import("../../db/financialReports");
      return await generateIncomeStatement(tenantId, input.startDate, input.endDate);
    }),

  // 대시보드 요약 (P5-3: 이번 달 수입/지출/순이익)
  dashboardSummary: tenantRequiredProcedure.query(async ({ ctx }) => {
    const tenantId = getEffectiveTenantId(ctx);
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const startDate = `${year}-${month}-01`;
    
    // 이번 달 마지막 날
    const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
    const endDate = `${year}-${month}-${String(lastDay).padStart(2, "0")}`;

    try {
      const { generateIncomeStatement } = await import("../../db/financialReports");
      const income = await generateIncomeStatement(tenantId, startDate, endDate);
      
      return {
        period: `${year}년 ${parseInt(month)}월`,
        startDate,
        endDate,
        totalRevenue: income.totals.totalRevenue || 0,
        totalExpenses: income.totals.totalExpenses || 0,
        netIncome: income.totals.netIncome || 0,
        revenueItems: income.revenue?.length || 0,
        expenseItems: income.expenses?.length || 0,
      };
    } catch (error: any) {
      // 데이터가 없으면 기본값 반환
      return {
        period: `${year}년 ${parseInt(month)}월`,
        startDate,
        endDate,
        totalRevenue: 0,
        totalExpenses: 0,
        netIncome: 0,
        revenueItems: 0,
        expenseItems: 0,
      };
    }
  }),

  // ============================================
  // Excel 내보내기 (P4-3)
  // ============================================

  // 시산표 Excel
  exportTrialBalance: tenantRequiredProcedure
    .input(
      z.object({
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = getEffectiveTenantId(ctx);
      const { generateTrialBalance } = await import("../../db/financialReports");
      const { exportTrialBalanceToExcel } = await import("../../db/financialReportsExcel");
      const data = await generateTrialBalance(tenantId, input.startDate, input.endDate);
      const buffer = await exportTrialBalanceToExcel(data);
      return {
        filename: `시산표_${input.startDate}_${input.endDate}.xlsx`,
        data: buffer.toString("base64"),
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      };
    }),

  // 재무상태표 Excel
  exportBalanceSheet: tenantRequiredProcedure
    .input(
      z.object({
        asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = getEffectiveTenantId(ctx);
      const { generateBalanceSheet } = await import("../../db/financialReports");
      const { exportBalanceSheetToExcel } = await import("../../db/financialReportsExcel");
      const data = await generateBalanceSheet(tenantId, input.asOfDate);
      const buffer = await exportBalanceSheetToExcel(data);
      return {
        filename: `재무상태표_${input.asOfDate}.xlsx`,
        data: buffer.toString("base64"),
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      };
    }),

  // 손익계산서 Excel
  exportIncomeStatement: tenantRequiredProcedure
    .input(
      z.object({
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = getEffectiveTenantId(ctx);
      const { generateIncomeStatement } = await import("../../db/financialReports");
      const { exportIncomeStatementToExcel } = await import("../../db/financialReportsExcel");
      const data = await generateIncomeStatement(tenantId, input.startDate, input.endDate);
      const buffer = await exportIncomeStatementToExcel(data);
      return {
        filename: `손익계산서_${input.startDate}_${input.endDate}.xlsx`,
        data: buffer.toString("base64"),
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      };
    }),

  // ============================================
  // 기초 잔액 (Opening Balance / 전기이월) (P4-4)
  // ============================================

  // 기초 잔액 조회
  getOpeningBalances: tenantRequiredProcedure
    .input(z.object({ fiscalYear: z.number().min(2020).max(2100) }))
    .query(async ({ input, ctx }) => {
      const tenantId = getEffectiveTenantId(ctx);
      const { getOpeningBalances } = await import("../../db/openingBalances");
      return await getOpeningBalances(tenantId, input.fiscalYear);
    }),

  // 기초 잔액 저장
  saveOpeningBalances: tenantRequiredProcedure
    .input(
      z.object({
        fiscalYear: z.number().min(2020).max(2100),
        items: z.array(
          z.object({
            accountId: z.number(),
            accountCode: z.string(),
            accountName: z.string(),
            debitAmount: z.number().min(0),
            creditAmount: z.number().min(0),
          })
        ),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = getEffectiveTenantId(ctx);
      const userId = ctx.user?.id || 0;
      const { saveOpeningBalances } = await import("../../db/openingBalances");
      return await saveOpeningBalances(tenantId, input.fiscalYear, input.items, userId);
    }),

  // 기초 잔액 삭제
  deleteOpeningBalances: tenantRequiredProcedure
    .input(z.object({ fiscalYear: z.number().min(2020).max(2100) }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = getEffectiveTenantId(ctx);
      const { deleteOpeningBalances } = await import("../../db/openingBalances");
      await deleteOpeningBalances(tenantId, input.fiscalYear);
      return { success: true, message: `${input.fiscalYear}년 기초 잔액이 삭제되었습니다.` };
    }),
});
