// costSavingAI 라우터 - routers.ts에서 분리됨
import { tenantRequiredProcedure, router } from "../../_core/trpc";
import { z } from "zod";

export const costSavingAIRouter = router({
    // 원재료 가격 변동 추이 분석
    analyzePriceTrend: tenantRequiredProcedure
      .input(
        z.object({
          materialId: z.number(),
          startDate: z.string(),
          endDate: z.string()
        })
      )
      .query(async ({ input, ctx }) => {
        const { analyzePriceTrend } = await import("../../db/costSavingAI");
        const startDate = new Date(input.startDate);
        const endDate = new Date(input.endDate);
        const tenantId = ctx.tenantId;
        return await analyzePriceTrend(input.materialId, startDate, endDate, tenantId ?? undefined);
      }),

    // 최적 구매 시점 추천
    recommendPurchaseTiming: tenantRequiredProcedure
      .input(z.object({ materialId: z.number() }))
      .query(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        const { recommendPurchaseTiming } = await import("../../db/costSavingAI");
        return await recommendPurchaseTiming(input.materialId, tenantId ?? undefined);
      }),

    // 대체 공급업체 추천
    recommendAlternativeSuppliers: tenantRequiredProcedure
      .input(z.object({ materialId: z.number() }))
      .query(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        const { recommendAlternativeSuppliers } = await import("../../db/costSavingAI");
        return await recommendAlternativeSuppliers(input.materialId, tenantId ?? undefined);
      }),

    // AI 기반 원가 절감 제안 생성
    generateProposal: tenantRequiredProcedure
      .input(z.object({ materialId: z.number() }))
      .query(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        const { generateCostSavingProposal } = await import("../../db/costSavingAI");
        return await generateCostSavingProposal(input.materialId, tenantId ?? undefined);
      })
});
