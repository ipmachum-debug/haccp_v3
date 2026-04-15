// recipeApproval 라우터 - routers.ts에서 분리됨
import { adminProcedure, tenantRequiredProcedure, router } from "../../_core/trpc";
import { z } from "zod";

export const recipeApprovalRouter = router({
    // 승인 대기 중인 품목제조보고 목록 조회
    getPending: tenantRequiredProcedure
      .query(async ({ ctx }) => {
        const { getPendingRecipes } = await import("../../db/production/recipeApprovalAPI");
        return await getPendingRecipes(ctx.tenantId);
      }),

    // 품목제조보고 승인
    approve: adminProcedure
      .input(z.object({ recipeId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { approveRecipe } = await import("../../db/production/recipeApprovalAPI");
        return await approveRecipe(ctx.tenantId, { recipeId: input.recipeId, userId: ctx.user.id });
      }),

    // 품목제조보고 승인 이력 조회
    getHistory: tenantRequiredProcedure
      .input(z.object({
        approvalStatus: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional()
      }).optional())
      .query(async ({ input, ctx }) => {
        const { getRecipeApprovalHistory } = await import("../../db/production/recipeApprovalAPI");
        return await getRecipeApprovalHistory(ctx.tenantId, input);
      }),

    // 품목제조보고 반려
    reject: adminProcedure
      .input(z.object({
        recipeId: z.number(),
        reason: z.string().min(1, "반려 사유는 필수입니다")
      }))
      .mutation(async ({ input, ctx }) => {
        const { rejectRecipe } = await import("../../db/production/recipeApprovalAPI");
        return await rejectRecipe(ctx.tenantId, {
          recipeId: input.recipeId,
          userId: ctx.user.id,
          reason: input.reason
        });
      }),

    // 품목제조보고 상세 조회 (승인 정보 포함)
    getDetail: tenantRequiredProcedure
      .input(z.object({ recipeId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getRecipeWithApprovalInfo } = await import("../../db/production/recipeApprovalAPI");
        return await getRecipeWithApprovalInfo(ctx.tenantId, input.recipeId);
      })
});
