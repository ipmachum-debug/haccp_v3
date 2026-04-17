/**
 * AI ERP 고급 기능 라우터
 * 발주추천 + 재고예측 + 원가이상탐지
 */
import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../_core/trpc";

export const aiErpRouter = router({
  /** 발주 추천 */
  purchaseRecommendations: tenantRequiredProcedure.query(async ({ ctx }) => {
    try {
      const { generatePurchaseRecommendations } = await import("../../services/ai/aiErpAdvanced.service");
      return await generatePurchaseRecommendations(ctx.tenantId);
    } catch (err: any) {
      console.warn("[aiErp.purchaseRecommendations]", err.message?.substring(0, 80));
      return [];
    }
  }),

  /** 재고 부족 예측 */
  shortagePredicitions: tenantRequiredProcedure
    .input(z.object({ horizonDays: z.number().default(30) }).optional())
    .query(async ({ ctx, input }) => {
      try {
        const { predictInventoryShortages } = await import("../../services/ai/aiErpAdvanced.service");
        return await predictInventoryShortages(ctx.tenantId, input?.horizonDays || 30);
      } catch (err: any) {
        console.warn("[aiErp.shortagePredicitions]", err.message?.substring(0, 80));
        return [];
      }
    }),

  /** 대표용 AI 월간 리포트 */
  executiveReport: tenantRequiredProcedure
    .input(z.object({ year: z.number(), month: z.number() }))
    .query(async ({ ctx, input }) => {
      try {
        const { generateExecutiveReport } = await import("../../services/ai/aiExecutiveReport.service");
        return await generateExecutiveReport(ctx.tenantId, input.year, input.month);
      } catch (err: any) {
        return { period: `${input.year}년 ${input.month}월`, summary: "리포트 생성 실패", metrics: { revenue: 0, cost: 0, grossProfit: 0, grossMargin: 0, expenses: 0, netProfit: 0, prevRevenue: 0, prevNetProfit: 0, revenueGrowth: 0, profitGrowth: 0 }, highlights: [], risks: [], actions: [], aiNarrative: "" };
      }
    }),

  /** 원가 이상 탐지 */
  costAnomalies: tenantRequiredProcedure.query(async ({ ctx }) => {
    try {
      const { detectCostAnomalies } = await import("../../services/ai/aiErpAdvanced.service");
      return await detectCostAnomalies(ctx.tenantId);
    } catch (err: any) {
      console.warn("[aiErp.costAnomalies]", err.message?.substring(0, 80));
      return [];
    }
  }),
});
