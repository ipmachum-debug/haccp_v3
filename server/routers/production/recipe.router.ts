// recipe 라우터 - routers.ts에서 분리됨
import { tenantRequiredProcedure, router } from "../../_core/trpc";
import { z } from "zod";

export const recipeRouter = router({
    // 제품 ID로 레시피 조회
    getByProductId: tenantRequiredProcedure
      .input(z.object({ productId: z.number() }))
      .query(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        const { getRecipeByProductId } = await import("../../db");
        return await getRecipeByProductId(input.productId, tenantId ?? undefined);
      }),
    
    // 레시피 ID로 원재료 목록 조회
    getMaterialsByRecipeId: tenantRequiredProcedure
      .input(z.object({ recipeId: z.number() }))
      .query(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        const { getMaterialsByRecipeId } = await import("../../db");
        return await getMaterialsByRecipeId(input.recipeId, tenantId ?? undefined);
      })
});
