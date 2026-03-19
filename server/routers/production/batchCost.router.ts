/**
 * batchCost.router.ts - 배치 원가/수익성 분석 서브 라우터
 * ✅ P2 리팩토링: batch.router.ts에서 분리
 */
import { tenantRequiredProcedure, router, workerProcedure } from "../../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

export const batchCostRouter = router({
  // 여러 배치 비용 요약 조회
  getCostSummary: tenantRequiredProcedure
    .input(z.object({ batchIds: z.array(z.number()) }))
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      const { getBatchCostSummary } = await import("../../db");
      return await getBatchCostSummary(input.batchIds, tenantId ?? undefined);
    }),

  // 배치 수익성 조회
  getProfitability: tenantRequiredProcedure
    .input(z.object({ batchId: z.number() }))
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      const { getBatchProfitability } = await import("../../db");
      return await getBatchProfitability(input.batchId, tenantId ?? undefined);
    }),

  // 제품별 수익성 통계 조회
  getProfitabilityByProduct: tenantRequiredProcedure
    .input(z.object({ startDate: z.date().optional(), endDate: z.date().optional() }))
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      const { getProfitabilityByProduct } = await import("../../db");
      return await getProfitabilityByProduct(input, tenantId ?? undefined);
    }),

  // 배치 매출액 업데이트
  updateRevenue: workerProcedure
    .input(z.object({ batchId: z.number(), revenue: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      const { updateBatchRevenue } = await import("../../db");
      return await updateBatchRevenue(input.batchId, input.revenue, tenantId ?? undefined);
    }),

  // 월별 수익률 추이
  getProfitabilityTrendByMonth: tenantRequiredProcedure
    .input(z.object({ startDate: z.date().optional(), endDate: z.date().optional() }))
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      const { getProfitabilityTrendByMonth } = await import("../../db");
      return await getProfitabilityTrendByMonth(input.startDate, input.endDate, tenantId ?? undefined);
    }),

  // 분기별 수익률 추이
  getProfitabilityTrendByQuarter: tenantRequiredProcedure
    .input(z.object({ startDate: z.date().optional(), endDate: z.date().optional() }))
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      const { getProfitabilityTrendByQuarter } = await import("../../db");
      return await getProfitabilityTrendByQuarter(input.startDate, input.endDate, tenantId ?? undefined);
    }),

  // 배치 수익성 예측
  getProfitabilityForecast: tenantRequiredProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenantId;
    const { getProfitabilityForecast } = await import("../../db");
    return await getProfitabilityForecast(tenantId ?? undefined);
  }),

  // 예측값 저장
  saveForecast: tenantRequiredProcedure
    .input(z.object({ targetMonth: z.string(), predictedRevenue: z.number(), predictedCost: z.number(), predictedProfitMargin: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      const { saveProfitabilityForecast } = await import("../../db");
      return await saveProfitabilityForecast(input, tenantId ?? undefined);
    }),

  // 과거 예측값 조회
  getForecastHistory: tenantRequiredProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenantId;
    const { getProfitabilityForecastHistory } = await import("../../db");
    return await getProfitabilityForecastHistory(tenantId ?? undefined);
  }),

  // 실제값 업데이트
  updateActualProfitability: tenantRequiredProcedure
    .input(z.object({ targetMonth: z.string(), actualRevenue: z.number(), actualCost: z.number(), actualProfitMargin: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      const { updateActualProfitability } = await import("../../db");
      return await updateActualProfitability(input, tenantId ?? undefined);
    }),

  // 원재료별 원가 비중 집계
  getMaterialCostBreakdown: tenantRequiredProcedure
    .input(z.object({ startDate: z.string().optional(), endDate: z.string().optional(), productId: z.number().optional(), status: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const { getMaterialCostBreakdown } = await import("../../db");
      if (!ctx.user.siteId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "siteId가 없습니다." });
      }
      return await getMaterialCostBreakdown({
        siteId: ctx.user.siteId,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
        productId: input.productId,
        status: input.status,
      });
    }),

  // 배치 비용 분석
  getCostAnalysis: tenantRequiredProcedure
    .input(z.object({ startDate: z.string().optional(), endDate: z.string().optional(), limit: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const { getBatchCostAnalysis } = await import("../../db/batchCostAnalysis");
      return await getBatchCostAnalysis({ startDate: input.startDate ? new Date(input.startDate) : undefined, endDate: input.endDate ? new Date(input.endDate) : undefined, limit: input.limit }, ctx.tenantId ?? undefined);
    }),

  // 특정 배치의 원재료별 비용 분석
  getMaterialCostBreakdownByBatch: tenantRequiredProcedure
    .input(z.object({ batchId: z.number() }))
    .query(async ({ input, ctx }) => {
      const { getBatchMaterialCostBreakdown } = await import("../../db/batchCostAnalysis");
      return await getBatchMaterialCostBreakdown(input.batchId, ctx.tenantId ?? undefined);
    }),

  // 기간별 비용 분석 집계
  getCostAnalysisPeriodSummary: tenantRequiredProcedure
    .input(z.object({ startDate: z.string(), endDate: z.string(), groupBy: z.enum(["month", "week", "day"]) }))
    .query(async ({ input, ctx }) => {
      const { getCostAnalysisPeriodSummary } = await import("../../db/batchCostAnalysis");
      return await getCostAnalysisPeriodSummary({ startDate: new Date(input.startDate), endDate: new Date(input.endDate), groupBy: input.groupBy }, ctx.tenantId ?? undefined);
    }),

  // 원재료별 비용 분석
  getMaterialCostAnalysis: tenantRequiredProcedure
    .input(z.object({ startDate: z.string().optional(), endDate: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const { getMaterialCostAnalysis } = await import("../../db/batchCostAnalysis");
      return await getMaterialCostAnalysis({ startDate: input.startDate ? new Date(input.startDate) : undefined, endDate: input.endDate ? new Date(input.endDate) : undefined }, ctx.tenantId ?? undefined);
    }),

  // 배치 원가율 계산
  getCostRate: workerProcedure
    .input(z.object({ batchId: z.number() }))
    .query(async ({ input, ctx }) => {
      const { calculateBatchCost } = await import("../../db/batchCostCalculation");
      return await calculateBatchCost(input.batchId, ctx.tenantId!);
    }),
});
