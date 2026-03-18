// scheduleOptimization 라우터 - routers.ts에서 분리됨
import { tenantRequiredProcedure, router } from "../../_core/trpc";
import { z } from "zod";

export const scheduleOptimizationRouter = router({
    // AI 기반 생산일정 최적화
    optimize: tenantRequiredProcedure
      .input(z.object({
        startDate: z.string(),
        endDate: z.string(),
        facilityIds: z.array(z.number()).optional()
      }))
      .query(async ({ input, ctx }) => {
        const { optimizeProductionSchedule } = await import("../../api/scheduleOptimization");
        return await optimizeProductionSchedule({ ...input, tenantId: ctx.tenantId ?? undefined });
      }),
    
    // 재고 수준 기반 생산 우선순위 계산
    getPriority: tenantRequiredProcedure
      .query(async ({ ctx }) => {
        const { calculateProductionPriority } = await import("../../api/scheduleOptimization");
        return await calculateProductionPriority(ctx.tenantId ?? undefined);
      })
});
