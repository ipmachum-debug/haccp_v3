// costAnalysis 라우터 - routers.ts에서 분리됨
import { tenantRequiredProcedure, router } from "../../_core/trpc";
import { z } from "zod";

export const costAnalysisRouter = router({
    // 레시피 기반 원가 계산
    calculateRecipeCost: tenantRequiredProcedure
      .input(z.object({ recipeId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { calculateRecipeCost } = await import("../../api/costAnalysis");
        return await calculateRecipeCost(input.recipeId, ctx.tenantId);
      }),
    
    // 제품별 원가 통계
    getProductCostStats: tenantRequiredProcedure
      .input(z.object({ productId: z.number().optional() }))
      .query(async ({ input, ctx }) => {
        const { calculateProductCostStats } = await import("../../api/costAnalysis");
        return await calculateProductCostStats(input.productId, ctx.tenantId);
      })
});
