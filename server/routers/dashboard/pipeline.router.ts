// pipeline 라우터 - routers.ts에서 분리됨
import { tenantRequiredProcedure, router } from "../../_core/trpc";
import { z } from "zod";
import { or, sql } from "drizzle-orm";
import { getDb } from "../../db";
import { getPipelineStatus, checkMaterialAvailability, runDailyClosing } from "../../services/pipelineDashboard";

export const pipelineRouter = router({
    // 파이프라인 상태 대시보드
    getStatus: tenantRequiredProcedure
      .input(z.object({ siteId: z.number(), workDate: z.string().optional() }))
      .query(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("데이터베이스 연결 실패");
        return await getPipelineStatus(db, input.siteId, input.workDate, ctx.tenantId ?? undefined);
      }),
    
    // 원료 재고 사전 체크
    checkMaterial: tenantRequiredProcedure
      .input(z.object({ batchId: z.number(), siteId: z.number() }))
      .query(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("데이터베이스 연결 실패");
        return await checkMaterialAvailability(db, input.batchId, input.siteId, ctx.tenantId ?? undefined);
      }),
    
    // 일일 마감 (기존 - siteId 기반)
    runDailyClosing: tenantRequiredProcedure
      .input(z.object({ siteId: z.number(), workDate: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("데이터베이스 연결 실패");
        return await runDailyClosing(db, input.siteId, input.workDate, ctx.tenantId ?? undefined);
      }),
    
    // 수동 일일 마감 실행 (전체 활성 테넌트 대상 - 관리자 전용)
    runManualClosing: tenantRequiredProcedure
      .mutation(async ({ ctx }) => {
        const { runDailyClosingProcess } = await import("../../services/dailyClosingScheduler");
        const summaries = await runDailyClosingProcess();
        return { success: true, summaries };
      }),
    
    // 일일 마감 보고서 조회
    getDailyClosingReport: tenantRequiredProcedure
      .input(z.object({ 
        tenantId: z.number().optional(), 
        reportDate: z.string().optional(),
        limit: z.number().optional()
      }))
      .query(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("데이터베이스 연결 실패");
        // ★ 테넌트 격리: 반드시 ctx.tenantId 사용 (input.tenantId 무시)
        const safeTenantId = ctx.tenantId;
        
        if (input.reportDate) {
          // 특정 날짜 보고서 조회
          const resultRaw = await db.execute(sql`
            SELECT id, site_id, report_date, report_type, summary, generated_at, tenant_id
            FROM h_daily_reports
            WHERE tenant_id = ${safeTenantId}
              AND report_date = ${input.reportDate}
              AND report_type = 'daily_closing'
            ORDER BY generated_at DESC
            LIMIT 1
          `);
          const result = Array.isArray(resultRaw) && Array.isArray(resultRaw[0]) ? resultRaw[0] : resultRaw;
          const row = (result as any[])[0];
          if (!row) return null;
          return {
            ...row,
            summary: typeof row.summary === 'string' ? JSON.parse(row.summary) : row.summary
          };
        } else {
          // 최근 보고서 목록 조회
          const limit = input.limit || 30;
          const resultRaw2 = await db.execute(sql`
            SELECT id, site_id, report_date, report_type, summary, generated_at, tenant_id
            FROM h_daily_reports
            WHERE tenant_id = ${safeTenantId}
              AND report_type = 'daily_closing'
            ORDER BY report_date DESC
            LIMIT ${limit}
          `);
          const result2 = Array.isArray(resultRaw2) && Array.isArray(resultRaw2[0]) ? resultRaw2[0] : resultRaw2;
          return (result2 as any[]).map((row: any) => ({
            ...row,
            summary: typeof row.summary === 'string' ? JSON.parse(row.summary) : row.summary
          }));
        }
      }),
    
    // 마감 알림 목록 조회 (일일마감 관련 알림만)
    getClosingNotifications: tenantRequiredProcedure
      .input(z.object({ 
        tenantId: z.number().optional(),
        limit: z.number().optional()
      }))
      .query(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("데이터베이스 연결 실패");
        // ★ 테넌트 격리: 반드시 ctx.tenantId 사용 (input.tenantId 무시)
        const safeTenantId = ctx.tenantId;
        const limit = input.limit || 50;
        const resultRaw3 = await db.execute(sql`
          SELECT id, user_id, notification_type, title, message, reference_type, reference_id, 
                 priority, is_read, action_url, is_resolved, created_at
          FROM h_notifications
          WHERE tenant_id = ${safeTenantId}
            AND notification_type IN (
              'batch_incomplete_warning', 'pending_approval_summary', 
              'low_stock_critical', 'low_stock_warning', 'daily_closing_report'
            )
          ORDER BY created_at DESC
          LIMIT ${limit}
        `);
        const result3 = Array.isArray(resultRaw3) && Array.isArray(resultRaw3[0]) ? resultRaw3[0] : resultRaw3;
        return result3 as any[];
      }),
});
