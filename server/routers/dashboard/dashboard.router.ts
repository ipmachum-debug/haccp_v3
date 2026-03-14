// dashboard 라우터 - routers.ts에서 분리됨
import { tenantRequiredProcedure, router } from "../../_core/trpc";
import { requireTenantId } from "../../helpers/tenantGuards";
import { z } from "zod";
import { lt, or } from "drizzle-orm";
import { getDashboardStats } from "../../db/dashboard";

export const dashboardRouter = router({
    // 대시보드 통계 조회
    getStats: tenantRequiredProcedure
      .query(async ({ ctx }) => {
        const { getDashboardStats } = await import("../../db");
        return await getDashboardStats(ctx.tenantId ?? undefined);
      }),
    
    // 회계 요약 데이터 조회
    getAccountingSummary: tenantRequiredProcedure
      .query(async () => {
        const { getMonthlyAccountingSummary } = await import("../../db/accountingSummary");
        return await getMonthlyAccountingSummary();
      }),
    
    // 계정 과목별 지출 집계
    getExpensesByCategory: tenantRequiredProcedure
      .query(async () => {
        const { getExpensesByCategory } = await import("../../db/accountingSummary");
        return await getExpensesByCategory();
      }),
    
    // 오늘 점검 예정 CCP 일정 조회
    getTodaySchedules: tenantRequiredProcedure
      .query(async () => {
        const { getTodayCcpSchedules } = await import("../../db");
        return await getTodayCcpSchedules();
      }),
    
    // 검사 통계
    inspectionStats: router({
    // 기존 검사 통계 API
    getStatisticsOld: tenantRequiredProcedure
      .input(
        z
          .object({
            startDate: z.string().optional(),
            endDate: z.string().optional()
          })
          .optional()
      )
      .query(async ({ input, ctx }) => {
        const { getInspectionStatistics } = await import("../../db");
        return await getInspectionStatistics(input);
      }),
    
    // 검사 통계 대시보드
    getStatistics: tenantRequiredProcedure
      .input(
        z.object({
          type: z.enum(["material", "hygiene", "shipping"]),
          range: z.enum(["week", "month", "quarter"])
        })
      )
      .query(async ({ input, ctx }) => {
        const { getInspectionDashboardStatistics } = await import("../../db");
        return await getInspectionDashboardStatistics(input);
      })
  }),
    // 배치 진행 현황
    batchProgress: tenantRequiredProcedure.query(async () => {
      const { getBatchProgress } = await import("../../db");
      return await getBatchProgress();
    }),
    // CCP 이탈 알림
    ccpDeviations: tenantRequiredProcedure
      .input(
        z
          .object({
            startDate: z.string().optional(),
            endDate: z.string().optional(),
            limit: z.number().optional()
          })
          .optional()
      )
      .query(async ({ input, ctx }) => {
        const { getCcpDeviations } = await import("../../db");
        return await getCcpDeviations(input);
      }),
    // 최근 활동
    recentActivities: tenantRequiredProcedure
      .input(
        z
          .object({
            limit: z.number().optional()
          })
          .optional()
      )
      .query(async ({ input, ctx }) => {
        const { getRecentActivities } = await import("../../db");
        return await getRecentActivities(input?.limit);
      }),
    
    // CCP 이탈 추이 (최근 7일)
    getCcpDeviationTrend: tenantRequiredProcedure.query(async () => {
      const { getCcpDeviationTrend } = await import("../../db");
      return await getCcpDeviationTrend();
    }),

    // 재고 부족 경고
    getLowStockWarnings: tenantRequiredProcedure.query(async () => {
      const { getLowStockWarnings } = await import("../../db");
      return await getLowStockWarnings();
    }),

    // 유통기한 임박 원재료
    getExpiringMaterials: tenantRequiredProcedure.query(async ({ ctx }) => {
      const tenantId = requireTenantId(ctx);
      const { getExpiringMaterials } = await import("../../db");
      return await getExpiringMaterials(tenantId);
    }),

    // 배치 생산 추이 (기간 선택 가능)
    getProductionTrend: tenantRequiredProcedure
      .input(z.object({ days: z.number().optional().default(7) }).optional())
      .query(async ({ input, ctx }) => {
        const tenantId = requireTenantId(ctx);
        const { getProductionTrend } = await import("../../db");
        return await getProductionTrend(input?.days || 7);
      }),

    // 원재료 소비 통계
    getMaterialConsumption: tenantRequiredProcedure.query(async ({ ctx }) => {
      const tenantId = requireTenantId(ctx);
      const { getMaterialConsumption } = await import("../../db");
      return await getMaterialConsumption();
    }),

    // 월별 CCP 이탈 비율 (기간 선택 가능)
    getMonthlyCcpDeviationRate: tenantRequiredProcedure
      .input(z.object({ days: z.number().optional().default(30) }).optional())
      .query(async ({ input, ctx }) => {
        const tenantId = requireTenantId(ctx);
        const { getMonthlyCcpDeviationRate } = await import("../../db");
        return await getMonthlyCcpDeviationRate(input?.days || 30);
      }),
    
    // 위젯 설정 조회
    getWidgetSettings: tenantRequiredProcedure
      .query(async ({ ctx }) => {
        const { getUserWidgetSettings } = await import("../../db/widgetSettings");
        return await getUserWidgetSettings(ctx.user.id, ctx.tenantId ?? undefined);
      }),
    
    // 위젯 표시/숨김 업데이트
    updateWidgetVisibility: tenantRequiredProcedure
      .input(z.object({
        widgetId: z.string(),
        isVisible: z.number()
      }))
      .mutation(async ({ input, ctx }) => {
        const { updateWidgetVisibility } = await import("../../db/widgetSettings");
        return await updateWidgetVisibility({
          userId: ctx.user.id,
          widgetId: input.widgetId,
          isVisible: input.isVisible
        });
      }),

    // ============================================================
    // 통합 대시보드 탭별 API (Phase 134)
    // ============================================================

    // 생산 효율성 탭 통합 데이터 조회
    getProductionEfficiencyData: tenantRequiredProcedure
      .input(
        z.object({
          siteId: z.number().optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          productId: z.number().optional()
        })
      )
      .query(async ({ input, ctx }) => {
        const { getProductionEfficiencyData } = await import("../../db");
        const siteId = input.siteId || ctx.user.siteId;
        if (!siteId) throw new Error("사이트 ID가 필요합니다");
        return await getProductionEfficiencyData({ ...input, siteId, tenantId: ctx.tenantId! });
      }),

    // 재고 추이 탭 통합 데이터 조회
    getInventoryTrendData: tenantRequiredProcedure
      .input(
        z.object({
          siteId: z.number().optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          materialId: z.number().optional()
        })
      )
      .query(async ({ input, ctx }) => {
        const { getInventoryTrendData } = await import("../../db");
        const siteId = input.siteId || ctx.user.siteId;
        if (!siteId) throw new Error("사이트 ID가 필요합니다");
        return await getInventoryTrendData({ ...input, siteId, tenantId: ctx.tenantId! });
      })
});
