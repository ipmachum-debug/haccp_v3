// checklistStats 라우터 - routers.ts에서 분리됨
import { tenantRequiredProcedure, router } from "../../_core/trpc";
import { z } from "zod";

export const checklistStatsRouter = router({
    // 카테고리별 상태 조회
    getByCategory: tenantRequiredProcedure
      .input(z.object({ category: z.string() }))
      .query(async ({ input, ctx }) => {
        const { getChecklistStatsByCategory } = await import("../../db/checklistStats");
        return await getChecklistStatsByCategory(input.category, ctx.tenantId ?? undefined);
      }),

    // 오늘 전체 상태 조회
    getToday: tenantRequiredProcedure.query(async ({ ctx }) => {
      const { getTodayChecklistStats } = await import("../../db/checklistStats");
      return await getTodayChecklistStats(ctx.tenantId ?? undefined);
    })
});
