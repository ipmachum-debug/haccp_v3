/**
 * 배치 분석 (원가/수익성/통계/Hydration)
 */
import { monitorProcedure, tenantRequiredProcedure, router, workerProcedure } from "../../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { lt, or, sql } from "drizzle-orm";
import { getDb, getRawConnection } from "../../db";
import { toKSTDate, todayKST, formatLocalDate } from "../../utils/timezone";

export const batchAnalyticsRouter = router({
    getMaterialCostBreakdown: tenantRequiredProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        productId: z.number().optional(),
        status: z.string().optional()
      }))
      .query(async ({ ctx, input }) => {
        const { getMaterialCostBreakdown } = await import("../../db");
        
        if (!ctx.user.siteId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "siteId가 없습니다."
          });
        }
        
        const startDate = input.startDate ? new Date(input.startDate) : undefined;
        const endDate = input.endDate ? new Date(input.endDate) : undefined;
        
        const result = await getMaterialCostBreakdown({
          siteId: ctx.user.siteId,
          startDate,
          endDate,
          productId: input.productId,
          status: input.status
        });
        
        return result;
      }),

    /** 배치 비용 분석 (기간별 원가 집계) */
    getCostAnalysis: tenantRequiredProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        limit: z.number().optional()
      }))
      .query(async ({ input, ctx }) => {
        const { getBatchCostAnalysis } = await import("../../db/production/batchCostAnalysis");
        const startDate = input.startDate ? new Date(input.startDate) : undefined;
        const endDate = input.endDate ? new Date(input.endDate) : undefined;
        return await getBatchCostAnalysis({ startDate, endDate, limit: input.limit }, ctx.tenantId);
      }),

    /** 특정 배치의 원재료별 비용 분석 */
    getMaterialCostBreakdownByBatch: tenantRequiredProcedure
      .input(z.object({ batchId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getBatchMaterialCostBreakdown } = await import("../../db/production/batchCostAnalysis");
        return await getBatchMaterialCostBreakdown(input.batchId, ctx.tenantId);
      }),

    /** 기간별 비용 분석 집계 (월/주/일 단위) */
    getCostAnalysisPeriodSummary: tenantRequiredProcedure
      .input(z.object({
        startDate: z.string(),
        endDate: z.string(),
        groupBy: z.enum(["month", "week", "day"])
      }))
      .query(async ({ input, ctx }) => {
        const { getCostAnalysisPeriodSummary } = await import("../../db/production/batchCostAnalysis");
        return await getCostAnalysisPeriodSummary({
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
          groupBy: input.groupBy
        }, ctx.tenantId);
      }),

    /** 원재료별 비용 분석 (기간 내 원재료별 총 비용) */
    getMaterialCostAnalysis: tenantRequiredProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional()
      }))
      .query(async ({ input, ctx }) => {
        const { getMaterialCostAnalysis } = await import("../../db/production/batchCostAnalysis");
        const startDate = input.startDate ? new Date(input.startDate) : undefined;
        const endDate = input.endDate ? new Date(input.endDate) : undefined;
        return await getMaterialCostAnalysis({ startDate, endDate }, ctx.tenantId);
      }),
    
    /** 배치 원가율 계산 (BOM 기반 실제 원가) */
    getCostRate: workerProcedure
      .input(z.object({ batchId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { calculateBatchCost } = await import("../../db/production/batchCostCalculation");
        return await calculateBatchCost(input.batchId, ctx.tenantId);
      }),

// ═══════════════════════════════════════════════════════════════
// 생산 통계 및 차트 데이터
// ═══════════════════════════════════════════════════════════════

    /** 생산현황 서버사이드 통계 (오늘 계획/진행중/완료 + 상세 목록) */
    productionStats: tenantRequiredProcedure
      .input(z.object({
        date: z.string().optional(), // YYYY-MM-DD, default today
      }).optional())
      .query(async ({ input, ctx }) => {
        const conn = await getRawConnection();
        if (!conn) return { todayPlanned: 0, inProgress: 0, completedToday: 0, total: 0, todayBatches: [], inProgressBatches: [], completedTodayBatches: [] };

        const targetDate = input?.date || todayKST();
        const tenantId = ctx.tenantId;

        // 통계 카운트
        const [stats] = await conn.execute<any[]>(
          `SELECT
            SUM(CASE WHEN planned_date = ? THEN 1 ELSE 0 END) as today_planned,
            SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
            SUM(CASE WHEN status = 'completed' AND DATE(COALESCE(end_time, updated_at)) = ? THEN 1 ELSE 0 END) as completed_today,
            COUNT(*) as total
          FROM h_batches WHERE tenant_id = ?`,
          [targetDate, targetDate, tenantId]
        );
        const s = (stats as any[])[0] || {};

        // 오늘 계획 배치 상세
        const [todayRows] = await conn.execute<any[]>(
          `SELECT b.*, p.product_name, p.product_code
           FROM h_batches b
           LEFT JOIN h_products_v2 p ON p.id = b.product_id AND p.tenant_id = b.tenant_id
           WHERE b.tenant_id = ? AND b.planned_date = ?
           ORDER BY b.batch_code`,
          [tenantId, targetDate]
        );

        // 진행중 배치 상세
        const [ipRows] = await conn.execute<any[]>(
          `SELECT b.*, p.product_name, p.product_code
           FROM h_batches b
           LEFT JOIN h_products_v2 p ON p.id = b.product_id AND p.tenant_id = b.tenant_id
           WHERE b.tenant_id = ? AND b.status = 'in_progress'
           ORDER BY b.planned_date DESC LIMIT 100`,
          [tenantId]
        );

        // 오늘 완료 배치 상세
        const [compRows] = await conn.execute<any[]>(
          `SELECT b.*, p.product_name, p.product_code
           FROM h_batches b
           LEFT JOIN h_products_v2 p ON p.id = b.product_id AND p.tenant_id = b.tenant_id
           WHERE b.tenant_id = ? AND b.status = 'completed'
             AND DATE(COALESCE(b.end_time, b.updated_at)) = ?
           ORDER BY b.batch_code`,
          [tenantId, targetDate]
        );

        const mapRow = (r: any) => ({
          id: r.id, batchCode: r.batch_code, productId: r.product_id,
          productName: r.product_name || null, productCode: r.product_code || null,
          plannedQuantity: r.planned_quantity, actualQuantity: r.actual_quantity,
          plannedDate: r.planned_date, status: r.status,
          startTime: r.start_time, endTime: r.end_time, createdAt: r.created_at,
        });

        return {
          todayPlanned: Number(s.today_planned) || 0,
          inProgress: Number(s.in_progress) || 0,
          completedToday: Number(s.completed_today) || 0,
          total: Number(s.total) || 0,
          todayBatches: (todayRows as any[]).map(mapRow),
          inProgressBatches: (ipRows as any[]).map(mapRow),
          completedTodayBatches: (compRows as any[]).map(mapRow),
        };
      }),

    /** 생산량 추이 차트 데이터 (일간/주간/월간 집계) */
    productionChartData: tenantRequiredProcedure
      .input(z.object({
        period: z.enum(["daily", "weekly", "monthly"]).default("daily"),
      }).optional())
      .query(async ({ input, ctx }) => {
        const conn = await getRawConnection();
        if (!conn) return [];
        const tenantId = ctx.tenantId;
        const period = input?.period || "daily";

        if (period === "daily") {
          const [rows] = await conn.execute<any[]>(
            `SELECT DATE(planned_date) as date_key,
                    SUM(COALESCE(actual_quantity, planned_quantity)) as quantity,
                    COUNT(*) as count
             FROM h_batches
             WHERE tenant_id = ? AND status = 'completed'
               AND planned_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
             GROUP BY DATE(planned_date)
             ORDER BY date_key`,
            [tenantId]
          );
          return (rows as any[]).map((r: any) => ({
            date: r.date_key, quantity: Number(r.quantity) || 0, count: Number(r.count) || 0,
          }));
        } else if (period === "weekly") {
          const [rows] = await conn.execute<any[]>(
            `SELECT DATE(DATE_SUB(planned_date, INTERVAL WEEKDAY(planned_date) DAY)) as week_key,
                    SUM(COALESCE(actual_quantity, planned_quantity)) as quantity,
                    COUNT(*) as count
             FROM h_batches
             WHERE tenant_id = ? AND status = 'completed'
               AND planned_date >= DATE_SUB(CURDATE(), INTERVAL 12 WEEK)
             GROUP BY week_key
             ORDER BY week_key`,
            [tenantId]
          );
          return (rows as any[]).map((r: any) => ({
            week: r.week_key, quantity: Number(r.quantity) || 0, count: Number(r.count) || 0,
          }));
        } else {
          const [rows] = await conn.execute<any[]>(
            `SELECT DATE_FORMAT(planned_date, '%Y-%m') as month_key,
                    SUM(COALESCE(actual_quantity, planned_quantity)) as quantity,
                    COUNT(*) as count
             FROM h_batches
             WHERE tenant_id = ? AND status = 'completed'
               AND planned_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
             GROUP BY month_key
             ORDER BY month_key`,
            [tenantId]
          );
          return (rows as any[]).map((r: any) => ({
            month: r.month_key, quantity: Number(r.quantity) || 0, count: Number(r.count) || 0,
          }));
        }
      }),

// ═══════════════════════════════════════════════════════════════
// 배치 Hydration (누락 연관 데이터 자동 복구)
// ═══════════════════════════════════════════════════════════════

    /** 누락 데이터 분석 (dry-run) */
    hydrateAnalyze: workerProcedure
      .input(z.object({
        batchIds: z.array(z.number()).optional(),
      }).optional())
      .query(async ({ input, ctx }) => {
        const { findBatchesNeedingHydration } = await import("../../services/batchHydrator");
        return await findBatchesNeedingHydration(ctx.tenantId, input?.batchIds);
      }),

    /** 누락 연관 데이터 자동 생성 실행 */
    hydrateExecute: workerProcedure
      .input(z.object({
        batchIds: z.array(z.number()).optional(),
        steps: z.object({
          batchInputs: z.boolean().optional(),
          ccp: z.boolean().optional(),
          schedule: z.boolean().optional(),
          approval: z.boolean().optional(),
          dailyReport: z.boolean().optional(),
          materialLedger: z.boolean().optional(),
        }).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { hydrateBatches } = await import("../../services/batchHydrator");
        return await hydrateBatches({
          tenantId: ctx.tenantId,
          siteId: 1, // default site
          userId: ctx.user.id,
          batchIds: input.batchIds,
          steps: input.steps,
        });
      }),

});
