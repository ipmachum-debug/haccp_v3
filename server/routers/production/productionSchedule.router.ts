// productionSchedule 라우터 - routers.ts에서 분리됨
import { tenantRequiredProcedure, router } from "../../_core/trpc";
import { z } from "zod";

export const productionScheduleRouter = router({
    // 기간별 배치 일정 조회 (캘린더용)
    getBatchSchedule: tenantRequiredProcedure
      .input(
        z.object({
          startDate: z.string(),
          endDate: z.string(),
          siteId: z.number().optional(),
          status: z.string().optional()
        })
      )
      .query(async ({ input, ctx }) => {
        const { getBatchSchedule } = await import("../../db");
        return await getBatchSchedule({ ...input, tenantId: ctx.user.tenantId });
      }),

    // 배치별 원재료 소요량 계산
    calculateMaterialRequirements: tenantRequiredProcedure
      .input(z.object({ batchId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { calculateMaterialRequirements } = await import("../../db");
        return await calculateMaterialRequirements(input.batchId, ctx.user.tenantId);
      }),

    // 생산 능력 분석 (일별/주별)
    analyzeProductionCapacity: tenantRequiredProcedure
      .input(
        z.object({
          startDate: z.string(),
          endDate: z.string(),
          siteId: z.number().optional(),
          groupBy: z.enum(["day", "week"]).optional()
        })
      )
      .query(async ({ input, ctx }) => {
        const { analyzeProductionCapacity } = await import("../../db");
        return await analyzeProductionCapacity({ ...input, tenantId: ctx.user.tenantId });
      }),

    // 제품별 생산 능력 분석
    analyzeProductionCapacityByProduct: tenantRequiredProcedure
      .input(
        z.object({
          startDate: z.string(),
          endDate: z.string(),
          siteId: z.number().optional()
        })
      )
      .query(async ({ input, ctx }) => {
        const { analyzeProductionCapacityByProduct } = await import("../../db");
        return await analyzeProductionCapacityByProduct({ ...input, tenantId: ctx.user.tenantId });
      }),
    
    // 생산 일정 최적화 제안 조회
    optimizeSchedule: tenantRequiredProcedure
      .input(z.object({
        startDate: z.string(),
        endDate: z.string()
      }))
      .query(async ({ input, ctx }) => {
        const { optimizeProductionSchedule } = await import("../../db");
        return await optimizeProductionSchedule({ ...input, tenantId: ctx.user.tenantId });
      }),
    
    // 최적화 제안 적용 (배치 일정 변경)
    applyOptimization: tenantRequiredProcedure
      .input(z.object({
        batchId: z.number(),
        newPlannedDate: z.string()
      }))
      .mutation(async ({ input, ctx }) => {
        const { applyScheduleOptimization } = await import("../../db");
        return await applyScheduleOptimization({ ...input, tenantId: ctx.user.tenantId });
      }),
    
    // 배치별 원가 분석
    getCostAnalysis: tenantRequiredProcedure
      .input(
        z.object({
          startDate: z.string(),
          endDate: z.string()
        })
      )
      .query(async ({ input, ctx }) => {
        const { getBatchCostAnalysis } = await import("../../db");
        return await getBatchCostAnalysis({ ...input, tenantId: ctx.user.tenantId });
      }),
    
    // 생산 시간 추이 분석
    getProductionTimeAnalysis: tenantRequiredProcedure
      .input(
        z.object({
          startDate: z.string(),
          endDate: z.string()
        })
      )
      .query(async ({ input, ctx }) => {
        const { getProductionTimeAnalysis } = await import("../../db");
        return await getProductionTimeAnalysis({ ...input, tenantId: ctx.user.tenantId });
      }),
    
    // 불량률 분석
    getDefectRateAnalysis: tenantRequiredProcedure
      .input(
        z.object({
          startDate: z.string(),
          endDate: z.string()
        })
      )
      .query(async ({ input, ctx }) => {
        const { getDefectRateAnalysis } = await import("../../db");
        return await getDefectRateAnalysis({ ...input, tenantId: ctx.user.tenantId });
      })
});
