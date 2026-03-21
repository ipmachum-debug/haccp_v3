// costAnalysis 라우터 - 실질 원가분석 (입고 단가 기반)
import { tenantRequiredProcedure, router } from "../../_core/trpc";
import { z } from "zod";

export const costAnalysisRouter = router({
    // [기존 호환] 레시피 기반 원가 계산
    calculateRecipeCost: tenantRequiredProcedure
      .input(z.object({ recipeId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { calculateRecipeCost } = await import("../../api/costAnalysis");
        const tenantId = ctx.tenantId;
        return await calculateRecipeCost(input.recipeId, tenantId ?? undefined);
      }),

    // [기존 호환] 제품별 원가 통계 (레시피 기반)
    getProductCostStats: tenantRequiredProcedure
      .input(z.object({ productId: z.number().optional() }))
      .query(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        const { calculateProductCostStats } = await import("../../api/costAnalysis");
        return await calculateProductCostStats(input.productId, tenantId ?? undefined);
      }),

    // ── 실질 원가 분석 (입고 단가 기반) ──

    // 배치별 재료원가 목록
    getBatchMaterialCosts: tenantRequiredProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        productId: z.number().optional(),
        limit: z.number().optional()
      }))
      .query(async ({ input, ctx }) => {
        const { getBatchMaterialCosts } = await import("../../db/realCostAnalysis");
        return await getBatchMaterialCosts({
          tenantId: ctx.tenantId!,
          startDate: input.startDate,
          endDate: input.endDate,
          productId: input.productId,
          limit: input.limit
        });
      }),

    // 제품별 원가 요약
    getProductCostSummary: tenantRequiredProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional()
      }))
      .query(async ({ input, ctx }) => {
        const { getProductCostSummary } = await import("../../db/realCostAnalysis");
        return await getProductCostSummary({
          tenantId: ctx.tenantId!,
          startDate: input.startDate,
          endDate: input.endDate
        });
      }),

    // 원재료별 사용량/비용 순위
    getMaterialUsageRanking: tenantRequiredProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        limit: z.number().optional()
      }))
      .query(async ({ input, ctx }) => {
        const { getMaterialUsageRanking } = await import("../../db/realCostAnalysis");
        return await getMaterialUsageRanking({
          tenantId: ctx.tenantId!,
          startDate: input.startDate,
          endDate: input.endDate,
          limit: input.limit
        });
      }),

    // 월별 원가 추이
    getCostTrend: tenantRequiredProcedure
      .input(z.object({ months: z.number().optional() }))
      .query(async ({ input, ctx }) => {
        const { getCostTrend } = await import("../../db/realCostAnalysis");
        return await getCostTrend({
          tenantId: ctx.tenantId!,
          months: input.months
        });
      }),

    // 단일 배치 상세 원재료 내역
    getBatchMaterialDetail: tenantRequiredProcedure
      .input(z.object({ batchId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getBatchMaterialDetail } = await import("../../db/realCostAnalysis");
        return await getBatchMaterialDetail({
          tenantId: ctx.tenantId!,
          batchId: input.batchId
        });
      }),
});
