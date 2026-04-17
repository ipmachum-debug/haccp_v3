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
