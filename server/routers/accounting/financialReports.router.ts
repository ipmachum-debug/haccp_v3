// financialReports 라우터
// P3: 시산표, 재무상태표, 손익계산서
// P4-3: Excel 내보내기
import { tenantRequiredProcedure, router, requireCapability } from "../../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

// Capability 기반 procedure — ERP_ACCOUNTING:READ 필요 (admin/super_admin 은 bypass)
const accountingReadProcedure = requireCapability("ERP_ACCOUNTING", "READ");

function getEffectiveTenantId(ctx: any): number {
  const tenantId = ctx.tenantId;
  if (!tenantId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "테넌트 정보가 필요합니다." });
  }
  return tenantId;
}

export const financialReportsRouter = router({
  // 시산표 (Trial Balance) — capability-gated
  trialBalance: accountingReadProcedure
    .input(
      z.object({
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
    )
    .query(async ({ input, ctx }) => {
      const tenantId = getEffectiveTenantId(ctx);
      const { generateTrialBalance } = await import("../../db/accounting/financialReports");
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
      const { generateBalanceSheet } = await import("../../db/accounting/financialReports");
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
      const { generateIncomeStatement } = await import("../../db/accounting/financialReports");
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
      const { generateIncomeStatement } = await import("../../db/accounting/financialReports");
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
      const { generateTrialBalance } = await import("../../db/accounting/financialReports");
      const { exportTrialBalanceToExcel } = await import("../../db/accounting/financialReportsExcel");
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
      const { generateBalanceSheet } = await import("../../db/accounting/financialReports");
      const { exportBalanceSheetToExcel } = await import("../../db/accounting/financialReportsExcel");
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
      const { generateIncomeStatement } = await import("../../db/accounting/financialReports");
      const { exportIncomeStatementToExcel } = await import("../../db/accounting/financialReportsExcel");
      const data = await generateIncomeStatement(tenantId, input.startDate, input.endDate);
      const buffer = await exportIncomeStatementToExcel(data);
      return {
        filename: `손익계산서_${input.startDate}_${input.endDate}.xlsx`,
        data: buffer.toString("base64"),
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      };
    }),

  // ============================================
  // PDF 내보내기 (P6)
  // ============================================

  // 시산표 PDF
  exportTrialBalancePdf: tenantRequiredProcedure
    .input(
      z.object({
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = getEffectiveTenantId(ctx);
      const { generateTrialBalance } = await import("../../db/accounting/financialReports");
      const { exportTrialBalanceToPdf } = await import("../../db/accounting/financialReportsPdf");
      const data = await generateTrialBalance(tenantId, input.startDate, input.endDate);
      const buffer = await exportTrialBalanceToPdf(data);
      return {
        filename: `시산표_${input.startDate}_${input.endDate}.pdf`,
        data: buffer.toString("base64"),
        mimeType: "application/pdf",
      };
    }),

  // 재무상태표 PDF
  exportBalanceSheetPdf: tenantRequiredProcedure
    .input(
      z.object({
        asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = getEffectiveTenantId(ctx);
      const { generateBalanceSheet } = await import("../../db/accounting/financialReports");
      const { exportBalanceSheetToPdf } = await import("../../db/accounting/financialReportsPdf");
      const data = await generateBalanceSheet(tenantId, input.asOfDate);
      const buffer = await exportBalanceSheetToPdf(data);
      return {
        filename: `재무상태표_${input.asOfDate}.pdf`,
        data: buffer.toString("base64"),
        mimeType: "application/pdf",
      };
    }),

  // 손익계산서 PDF
  exportIncomeStatementPdf: tenantRequiredProcedure
    .input(
      z.object({
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = getEffectiveTenantId(ctx);
      const { generateIncomeStatement } = await import("../../db/accounting/financialReports");
      const { exportIncomeStatementToPdf } = await import("../../db/accounting/financialReportsPdf");
      const data = await generateIncomeStatement(tenantId, input.startDate, input.endDate);
      const buffer = await exportIncomeStatementToPdf(data);
      return {
        filename: `손익계산서_${input.startDate}_${input.endDate}.pdf`,
        data: buffer.toString("base64"),
        mimeType: "application/pdf",
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
      const { getOpeningBalances } = await import("../../db/accounting/openingBalances");
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
      const { saveOpeningBalances } = await import("../../db/accounting/openingBalances");
      return await saveOpeningBalances(tenantId, input.fiscalYear, input.items, userId);
    }),

  // 기초 잔액 삭제
  deleteOpeningBalances: tenantRequiredProcedure
    .input(z.object({ fiscalYear: z.number().min(2020).max(2100) }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = getEffectiveTenantId(ctx);
      const { deleteOpeningBalances } = await import("../../db/accounting/openingBalances");
      await deleteOpeningBalances(tenantId, input.fiscalYear);
      return { success: true, message: `${input.fiscalYear}년 기초 잔액이 삭제되었습니다.` };
    }),

  // ============================================
  // Phase A-1: AI 재무 내러티브 연동
  // ============================================

  // AI 재무 분석 보고서 생성
  aiFinancialNarrative: tenantRequiredProcedure
    .input(z.object({
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      type: z.enum(["monthly", "quarterly"]).default("monthly"),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = getEffectiveTenantId(ctx);
      const { generateFinancialNarrative } = await import("../../db/ai/aiReportNarrative");
      return await generateFinancialNarrative(
        tenantId,
        { startDate: input.startDate, endDate: input.endDate },
        input.type
      );
    }),

  // Phase A-2: AI 재무 트렌드 예측 (financial_trend)
  aiFinancialPredictions: tenantRequiredProcedure
    .query(async ({ ctx }) => {
      const tenantId = getEffectiveTenantId(ctx);
      const { generatePredictions } = await import("../../db/ai/aiPrediction");
      const result = await generatePredictions(tenantId);
      // 재무 관련 예측만 필터링
      return {
        ...result,
        predictions: result.predictions.filter(
          (p) => p.type === "financial_trend" || p.type === "inventory_stockout"
        ),
      };
    }),

  // Phase A-3: AP/AR 리스크 분석 (공급업체 리스크 + 연체 분석)
  aiApArRiskAnalysis: tenantRequiredProcedure
    .query(async ({ ctx }) => {
      const tenantId = getEffectiveTenantId(ctx);
      const conn = (await import("../../db")).getRawConnection();
      const connection = await conn;

      // AP 연체 분석
      const [apAging] = await connection.execute(
        `SELECT
           p.name as partnerName,
           COUNT(*) as invoiceCount,
           SUM(apl.amount) as totalAmount,
           SUM(CASE WHEN apl.due_date < CURDATE() AND apl.status != 'paid' THEN apl.amount ELSE 0 END) as overdueAmount,
           MIN(CASE WHEN apl.due_date < CURDATE() AND apl.status != 'paid' THEN DATEDIFF(CURDATE(), apl.due_date) ELSE NULL END) as minOverdueDays,
           MAX(CASE WHEN apl.due_date < CURDATE() AND apl.status != 'paid' THEN DATEDIFF(CURDATE(), apl.due_date) ELSE NULL END) as maxOverdueDays
         FROM ap_ledger apl
         LEFT JOIN partners p ON p.id = apl.partner_id
         WHERE apl.tenant_id = ? AND apl.status != 'paid'
         GROUP BY apl.partner_id, p.name
         HAVING overdueAmount > 0
         ORDER BY overdueAmount DESC
         LIMIT 20`,
        [tenantId]
      );

      // AR 연체 분석
      const [arAging] = await connection.execute(
        `SELECT
           p.name as partnerName,
           COUNT(*) as invoiceCount,
           SUM(arl.amount) as totalAmount,
           SUM(CASE WHEN arl.due_date < CURDATE() AND arl.status != 'collected' THEN arl.amount ELSE 0 END) as overdueAmount,
           MAX(CASE WHEN arl.due_date < CURDATE() AND arl.status != 'collected' THEN DATEDIFF(CURDATE(), arl.due_date) ELSE NULL END) as maxOverdueDays
         FROM ar_ledger arl
         LEFT JOIN partners p ON p.id = arl.partner_id
         WHERE arl.tenant_id = ? AND arl.status != 'collected'
         GROUP BY arl.partner_id, p.name
         HAVING overdueAmount > 0
         ORDER BY overdueAmount DESC
         LIMIT 20`,
        [tenantId]
      );

      // 공급업체 리스크 스코어 (있으면)
      let supplierRisk: any[] = [];
      try {
        const { analyzeSupplierRisk } = await import("../../db/ai/aiSupplierRisk");
        const risk = await analyzeSupplierRisk(tenantId);
        supplierRisk = (risk as any)?.suppliers || [];
      } catch { /* 무시 */ }

      return {
        ap: {
          overduePartners: (apAging as any[]).map((r: any) => ({
            partnerName: r.partnerName,
            invoiceCount: Number(r.invoiceCount),
            totalAmount: Number(r.totalAmount),
            overdueAmount: Number(r.overdueAmount),
            maxOverdueDays: Number(r.maxOverdueDays || 0),
          })),
          totalOverdue: (apAging as any[]).reduce((sum: number, r: any) => sum + Number(r.overdueAmount), 0),
        },
        ar: {
          overduePartners: (arAging as any[]).map((r: any) => ({
            partnerName: r.partnerName,
            invoiceCount: Number(r.invoiceCount),
            totalAmount: Number(r.totalAmount),
            overdueAmount: Number(r.overdueAmount),
            maxOverdueDays: Number(r.maxOverdueDays || 0),
          })),
          totalOverdue: (arAging as any[]).reduce((sum: number, r: any) => sum + Number(r.overdueAmount), 0),
        },
        supplierRisk: supplierRisk.slice(0, 10),
      };
    }),
});
