// materialLedger 라우터 - routers.ts에서 분리됨
// P1 FIX: publicProcedure → tenantRequiredProcedure, 하드코딩 tenantId 제거
import { tenantRequiredProcedure, router } from "../../_core/trpc";
import { z } from "zod";
import { requireTenantId } from "../../helpers/tenantGuards";

export const materialLedgerRouter = router({
    // 일별 원료수불 조회
    getDaily: tenantRequiredProcedure
      .input(z.object({ date: z.string() }))
      .query(async ({ input, ctx }) => {
        const tenantId = requireTenantId(ctx);
        const { getDailyLedger } = await import("../../db/accounting/materialLedger");
        return getDailyLedger(input.date, tenantId);
      }),
    
    // 일별 수불 데이터 upsert
    upsertDaily: tenantRequiredProcedure
      .input(z.object({
        materialId: z.number(),
        ledgerDate: z.string(),
        receivingQty: z.number().optional(),
        usageQty: z.number().optional(),
        adjustmentQty: z.number().optional(),
        notes: z.string().optional(),
        source: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = requireTenantId(ctx);
        const { upsertDailyLedger } = await import("../../db/accounting/materialLedger");
        return upsertDailyLedger(input, tenantId);
      }),
    
    // 일별 수불 삭제
    deleteDaily: tenantRequiredProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = requireTenantId(ctx);
        const { deleteDailyLedger } = await import("../../db/accounting/materialLedger");
        return deleteDailyLedger(input.id, tenantId);
      }),
    
    // 월별 원료수불부 조회
    getMonthly: tenantRequiredProcedure
      .input(z.object({ yearMonth: z.string() }))
      .query(async ({ input, ctx }) => {
        const tenantId = requireTenantId(ctx);
        const { getMonthlyLedger } = await import("../../db/accounting/materialLedger");
        return getMonthlyLedger(input.yearMonth, tenantId);
      }),
    
    // 월별 집계 실행
    aggregateMonthly: tenantRequiredProcedure
      .input(z.object({ yearMonth: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = requireTenantId(ctx);
        const { aggregateMonthlyLedger } = await import("../../db/accounting/materialLedger");
        return aggregateMonthlyLedger(input.yearMonth, tenantId);
      }),
    
    // 월마감 승인 상태 조회
    getApproval: tenantRequiredProcedure
      .input(z.object({ yearMonth: z.string() }))
      .query(async ({ input, ctx }) => {
        const tenantId = requireTenantId(ctx);
        const { getApprovalStatus } = await import("../../db/accounting/materialLedger");
        return getApprovalStatus(input.yearMonth, tenantId);
      }),
    
    // 월마감 제출
    submitApproval: tenantRequiredProcedure
      .input(z.object({ yearMonth: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = requireTenantId(ctx);
        const { submitForApproval } = await import("../../db/accounting/materialLedger");
        return submitForApproval(input.yearMonth, ctx.user.id, tenantId);
      }),
    
    // 월마감 승인
    approve: tenantRequiredProcedure
      .input(z.object({ yearMonth: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = requireTenantId(ctx);
        const { approveMonthlyClose } = await import("../../db/accounting/materialLedger");
        return approveMonthlyClose(input.yearMonth, ctx.user.id, tenantId);
      }),
    
    // 월마감 반려
    reject: tenantRequiredProcedure
      .input(z.object({ yearMonth: z.string(), reason: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = requireTenantId(ctx);
        const { rejectMonthlyClose } = await import("../../db/accounting/materialLedger");
        return rejectMonthlyClose(input.yearMonth, ctx.user.id, input.reason, tenantId);
      }),
    
    // 일일 마감 후 자동 업데이트
    autoUpdate: tenantRequiredProcedure
      .input(z.object({ closeDate: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = requireTenantId(ctx);
        const { autoUpdateFromDailyClose } = await import("../../db/accounting/materialLedger");
        return autoUpdateFromDailyClose(input.closeDate, tenantId);
      }),

    downloadExcel: tenantRequiredProcedure
      .input(z.object({ yearMonth: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = requireTenantId(ctx);
        const { generateMonthlyExcel } = await import("../../db/accounting/materialLedgerExcel");
        const buffer = await generateMonthlyExcel(input.yearMonth, tenantId);
        return { base64: buffer.toString("base64"), filename: `원료수불부_${input.yearMonth}.xlsx` };
      }),

    // 기간별 원재료 사용 보고서 (주간/월간/커스텀) - 인쇄용 구조화 데이터
    getUsageReport: tenantRequiredProcedure
      .input(z.object({
        start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        type: z.enum(["week", "month", "custom"]).optional().default("custom"),
      }))
      .query(async ({ input, ctx }) => {
        const tenantId = requireTenantId(ctx);
        const { getMaterialUsageReport } = await import("../../db/accounting/materialUsageReport");
        return getMaterialUsageReport(input.start, input.end, tenantId, input.type);
      }),

    // ── 보고서 저장/관리 (material_usage_reports 테이블) ──
    listReports: tenantRequiredProcedure
      .input(z.object({
        reportType: z.enum(["week", "month", "custom"]).optional(),
        status: z.string().optional(),
        startFrom: z.string().optional(),
        startTo: z.string().optional(),
        limit: z.number().min(1).max(500).optional().default(100),
      }).optional())
      .query(async ({ input, ctx }) => {
        const tenantId = requireTenantId(ctx);
        const { listMaterialUsageReports } = await import("../../db/accounting/materialUsageReport");
        return listMaterialUsageReports({ tenantId, ...(input || {}) });
      }),

    getReportById: tenantRequiredProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const tenantId = requireTenantId(ctx);
        const { getSavedMaterialUsageReport } = await import("../../db/accounting/materialUsageReport");
        return getSavedMaterialUsageReport(input.id, tenantId);
      }),

    createReport: tenantRequiredProcedure
      .input(z.object({
        type: z.enum(["week", "month", "custom"]),
        start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        title: z.string().optional(),
        notes: z.string().optional(),
        autoSubmit: z.boolean().optional().default(false),
        siteId: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = requireTenantId(ctx);
        const { createMaterialUsageReport } = await import("../../db/accounting/materialUsageReport");
        return createMaterialUsageReport({
          tenantId,
          userId: ctx.user.id,
          ...input,
        });
      }),

    submitReportForReview: tenantRequiredProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = requireTenantId(ctx);
        const { submitReportForReview } = await import("../../db/accounting/materialUsageReport");
        return submitReportForReview(input.id, ctx.user.id, tenantId);
      }),

    reviewReport: tenantRequiredProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = requireTenantId(ctx);
        const { reviewReport } = await import("../../db/accounting/materialUsageReport");
        return reviewReport(input.id, ctx.user.id, tenantId);
      }),

    approveReport: tenantRequiredProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = requireTenantId(ctx);
        const { approveReport } = await import("../../db/accounting/materialUsageReport");
        return approveReport(input.id, ctx.user.id, tenantId);
      }),

    rejectReport: tenantRequiredProcedure
      .input(z.object({ id: z.number(), reason: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = requireTenantId(ctx);
        const { rejectReport } = await import("../../db/accounting/materialUsageReport");
        return rejectReport(input.id, ctx.user.id, input.reason, tenantId);
      }),

    markReportPrinted: tenantRequiredProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = requireTenantId(ctx);
        const { markReportPrinted } = await import("../../db/accounting/materialUsageReport");
        return markReportPrinted(input.id, ctx.user.id, tenantId);
      }),

    deleteReport: tenantRequiredProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = requireTenantId(ctx);
        const { deleteReport } = await import("../../db/accounting/materialUsageReport");
        return deleteReport(input.id, tenantId);
      }),

    autoGenerateLastWeek: tenantRequiredProcedure
      .mutation(async ({ ctx }) => {
        const tenantId = requireTenantId(ctx);
        const { autoGenerateLastWeekReport } = await import("../../db/accounting/materialUsageReport");
        return autoGenerateLastWeekReport(tenantId, ctx.user.id);
      }),
    // 대시보드 요약 통계 (yearMonth 지정 가능)
    getDashboard: tenantRequiredProcedure
      .input(z.object({ yearMonth: z.string().optional() }).optional())
      .query(async ({ input, ctx }) => {
        const tenantId = requireTenantId(ctx);
        const { getDashboardSummary } = await import("../../db/accounting/materialLedger");
        return getDashboardSummary(tenantId, input?.yearMonth);
      }),
    // 체크리스트 연동 - 해당 일자의 원재료 입고/사용 요약
    getChecklistData: tenantRequiredProcedure
      .input(z.object({ date: z.string() }))
      .query(async ({ input, ctx }) => {
        const tenantId = requireTenantId(ctx);
        const { getMaterialChecklistData } = await import("../../db/accounting/materialLedger");
        return getMaterialChecklistData(input.date, tenantId);
      }),
    // 회계 연동 - 원재료 거래를 회계에 동기화
    syncAccounting: tenantRequiredProcedure
      .input(z.object({
        type: z.enum(['purchase', 'usage']),
        date: z.string(),
        materialName: z.string(),
        quantity: z.number(),
        unitPrice: z.number()
      }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = requireTenantId(ctx);
        const { syncToAccounting } = await import("../../db/accounting/materialLedger");
        return syncToAccounting(
          tenantId, input.type, input.date,
          input.materialName, input.quantity, input.unitPrice, ctx.user.id
        );
      }),
});
