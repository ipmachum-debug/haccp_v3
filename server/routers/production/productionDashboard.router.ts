// productionDashboard 라우터 - routers.ts에서 분리됨
import { tenantRequiredProcedure, router } from "../../_core/trpc";

export const productionDashboardRouter = router({
    // 진행 중인 배치 목록 조회
    getActiveBatches: tenantRequiredProcedure
      .query(async () => {
        const { getActiveBatches } = await import("../../db/productionDashboard");
        return await getActiveBatches();
      }),
    // 배치 상태별 통계 조회
    getBatchStats: tenantRequiredProcedure
      .query(async () => {
        const { getBatchStats } = await import("../../db/productionDashboard");
        return await getBatchStats(ctx.user.tenantId);
      })
});
