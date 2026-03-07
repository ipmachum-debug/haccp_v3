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
        const { getDailyLedger } = await import("../../db/materialLedger");
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
        const { upsertDailyLedger } = await import("../../db/materialLedger");
        return upsertDailyLedger(input, tenantId);
      }),
    
    // 일별 수불 삭제
    deleteDaily: tenantRequiredProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = requireTenantId(ctx);
        const { deleteDailyLedger } = await import("../../db/materialLedger");
        return deleteDailyLedger(input.id, tenantId);
      }),
    
    // 월별 원료수불부 조회
    getMonthly: tenantRequiredProcedure
      .input(z.object({ yearMonth: z.string() }))
      .query(async ({ input, ctx }) => {
        const tenantId = requireTenantId(ctx);
        const { getMonthlyLedger } = await import("../../db/materialLedger");
        return getMonthlyLedger(input.yearMonth, tenantId);
      }),
    
    // 월별 집계 실행
    aggregateMonthly: tenantRequiredProcedure
      .input(z.object({ yearMonth: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = requireTenantId(ctx);
        const { aggregateMonthlyLedger } = await import("../../db/materialLedger");
        return aggregateMonthlyLedger(input.yearMonth, tenantId);
      }),
    
    // 월마감 승인 상태 조회
    getApproval: tenantRequiredProcedure
      .input(z.object({ yearMonth: z.string() }))
      .query(async ({ input, ctx }) => {
        const tenantId = requireTenantId(ctx);
        const { getApprovalStatus } = await import("../../db/materialLedger");
        return getApprovalStatus(input.yearMonth, tenantId);
      }),
    
    // 월마감 제출
    submitApproval: tenantRequiredProcedure
      .input(z.object({ yearMonth: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = requireTenantId(ctx);
        const { submitForApproval } = await import("../../db/materialLedger");
        return submitForApproval(input.yearMonth, ctx.user.id, tenantId);
      }),
    
    // 월마감 승인
    approve: tenantRequiredProcedure
      .input(z.object({ yearMonth: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = requireTenantId(ctx);
        const { approveMonthlyClose } = await import("../../db/materialLedger");
        return approveMonthlyClose(input.yearMonth, ctx.user.id, tenantId);
      }),
    
    // 월마감 반려
    reject: tenantRequiredProcedure
      .input(z.object({ yearMonth: z.string(), reason: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = requireTenantId(ctx);
        const { rejectMonthlyClose } = await import("../../db/materialLedger");
        return rejectMonthlyClose(input.yearMonth, ctx.user.id, input.reason, tenantId);
      }),
    
    // 일일 마감 후 자동 업데이트
    autoUpdate: tenantRequiredProcedure
      .input(z.object({ closeDate: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = requireTenantId(ctx);
        const { autoUpdateFromDailyClose } = await import("../../db/materialLedger");
        return autoUpdateFromDailyClose(input.closeDate, tenantId);
      }),

    downloadExcel: tenantRequiredProcedure
      .input(z.object({ yearMonth: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = requireTenantId(ctx);
        const { generateMonthlyExcel } = await import("../../db/materialLedgerExcel");
        const buffer = await generateMonthlyExcel(input.yearMonth, tenantId, ctx.tenantId);
        return { base64: buffer.toString("base64"), filename: `원료수불부_${input.yearMonth}.xlsx` };
      }),
    // 대시보드 요약 통계
    getDashboard: tenantRequiredProcedure
      .query(async ({ ctx }) => {
        const tenantId = requireTenantId(ctx);
        const { getDashboardSummary } = await import("../../db/materialLedger");
        return getDashboardSummary(tenantId);
      }),
    // 체크리스트 연동 - 해당 일자의 원재료 입고/사용 요약
    getChecklistData: tenantRequiredProcedure
      .input(z.object({ date: z.string() }))
      .query(async ({ input, ctx }) => {
        const tenantId = requireTenantId(ctx);
        const { getMaterialChecklistData } = await import("../../db/materialLedger");
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
        const { syncToAccounting } = await import("../../db/materialLedger");
        return syncToAccounting(
          tenantId, input.type, input.date,
          input.materialName, input.quantity, input.unitPrice, ctx.user.id
        );
      }),
});
