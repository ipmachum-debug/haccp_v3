// productionPrediction 라우터 - routers.ts에서 분리됨
import { tenantRequiredProcedure, router } from "../../_core/trpc";
import { z } from "zod";

export const productionPredictionRouter = router({
    getPredictionData: tenantRequiredProcedure
      .input(z.object({ productId: z.number().optional() }).optional())
      .query(async ({ input, ctx }) => {
        const { getProductionPredictionData } = await import("../../db/productionPrediction");
        return await getProductionPredictionData(input?.productId, ctx.user.tenantId);
      })
});
