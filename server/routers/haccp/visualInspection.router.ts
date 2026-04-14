// visualInspection 라우터 - routers.ts에서 분리됨
import { tenantRequiredProcedure, router } from "../../_core/trpc";
import { z } from "zod";
import { lt, or } from "drizzle-orm";
import { getDb, getRawConnection } from "../../db";

export const visualInspectionRouter = router({
    // 테이블 생성 (최초 1회)
    initTables: tenantRequiredProcedure
      .mutation(async ({ ctx }) => {
        const { getDb } = await import("../../db");
        const db = await getDb();
        if (!db) throw new Error("DB 연결 실패");
        const { createVisualInspectionTables } = await import("../../db/haccp/visualInspection");
        return await createVisualInspectionTables(db);
      }),

    // 월별 리스트
    list: tenantRequiredProcedure
      .input(z.object({ year: z.number(), month: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getDb } = await import("../../db");
        const db = await getDb();
        if (!db) return [];
        try {
          // 자동으로 테이블 생성 확인
          const { createVisualInspectionTables, listVisualInspectionLogs } = await import("../../db/haccp/visualInspection");
          await createVisualInspectionTables(db);
          return await listVisualInspectionLogs(db, ctx.tenantId, input.year, input.month);
        } catch (err) {
          console.error('[visualInspection.list]', err);
          return [];
        }
      }),

    // 상세 조회
    getById: tenantRequiredProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getDb } = await import("../../db");
        const db = await getDb();
        if (!db) return null;
        try {
          const { getVisualInspectionLog } = await import("../../db/haccp/visualInspection");
          return await getVisualInspectionLog(db, ctx.tenantId, input.id);
        } catch (err) {
          console.error('[visualInspection.getById]', err);
          return null;
        }
      }),

    // 생성
    create: tenantRequiredProcedure
      .input(z.object({ year: z.number(), month: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import("../../db");
        const db = await getDb();
        if (!db) throw new Error("DB 연결 실패");
        const { createVisualInspectionTables, createVisualInspectionLog } = await import("../../db/haccp/visualInspection");
        await createVisualInspectionTables(db);
        return await createVisualInspectionLog(db, ctx.tenantId, ctx.user.siteId || ctx.tenantId, input.year, input.month, ctx.user.id);
      }),

    // 항목 저장
    saveItems: tenantRequiredProcedure
      .input(z.object({
        logId: z.number(),
        items: z.array(z.object({
          receiptDate: z.string().default(''),
          productName: z.string().default(''),
          importCertOrigin: z.string().default(''),
          testReportAvail: z.string().default('—'),
          expiryDate: z.string().default(''),
          manufactureDate: z.string().default(''),
          qualityRetainDate: z.string().default(''),
          vehicleTemp: z.string().default('—'),
          vehicleCondition: z.string().default('—'),
          palletCondition: z.string().default('—'),
          normalApproved: z.string().default('—'),
          foreignMatter: z.string().default('—'),
          labelAllergen: z.string().default('—'),
          labelManager: z.string().default('—'),
          compliance: z.string().default('적합'),
          correctiveAction: z.string().default(''),
          note: z.string().default(''),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import("../../db");
        const db = await getDb();
        if (!db) throw new Error("DB 연결 실패");
        const { saveVisualInspectionItems } = await import("../../db/haccp/visualInspection");
        return await saveVisualInspectionItems(db, ctx.tenantId, input.logId, input.items);
      }),

    // 삭제
    delete: tenantRequiredProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import("../../db");
        const db = await getDb();
        if (!db) throw new Error("DB 연결 실패");
        const { deleteVisualInspectionLog } = await import("../../db/haccp/visualInspection");
        return await deleteVisualInspectionLog(db, ctx.tenantId, input.id);
      }),

    // 승인 요청
    submitForApproval: tenantRequiredProcedure
      .input(z.object({ logId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb, getRawConnection } = await import("../../db");
        const db = await getDb();
        if (!db) throw new Error("DB 연결 실패");
        const pool = await getRawConnection();
        const { submitVisualInspectionApproval } = await import("../../db/haccp/visualInspection");
        return await submitVisualInspectionApproval(
          db, pool, ctx.tenantId, ctx.user.siteId || ctx.tenantId, input.logId, ctx.user.id
        );
      }),

    // 월간 자동 생성/조회
    getOrCreateMonthly: tenantRequiredProcedure
      .input(z.object({ year: z.number(), month: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import("../../db");
        const db = await getDb();
        if (!db) throw new Error("DB 연결 실패");
        const { createVisualInspectionTables, getOrCreateMonthlyLog } = await import("../../db/haccp/visualInspection");
        await createVisualInspectionTables(db);
        return await getOrCreateMonthlyLog(db, ctx.tenantId, ctx.user.siteId || ctx.tenantId, input.year, input.month, ctx.user.id);
      }),

    // 관리자용: 원재료 입고 → 육안검사 자동 동기화 (신규 입고건만 추가)
    syncReceivings: tenantRequiredProcedure
      .input(z.object({ logId: z.number(), year: z.number(), month: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import("../../db");
        const db = await getDb();
        if (!db) throw new Error("DB 연결 실패");
        const { syncReceivingsToInspectionLog } = await import("../../db/haccp/visualInspection");
        return await syncReceivingsToInspectionLog(db, ctx.tenantId, input.logId, input.year, input.month);
      }),

    // month-mismatch 아이템 정리 (관리자용) — 2026-04-14 추가
    cleanupMismatched: tenantRequiredProcedure
      .input(z.object({ logId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import("../../db");
        const db = await getDb();
        if (!db) throw new Error("DB 연결 실패");
        const { cleanupMismatchedItems } = await import("../../db/haccp/visualInspection");
        return await cleanupMismatchedItems(db, ctx.tenantId, input.logId);
      }),

    // 원재료 입고 데이터 자동 가져오기
    fetchMaterialReceivings: tenantRequiredProcedure
      .input(z.object({ year: z.number(), month: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getDb } = await import("../../db");
        const db = await getDb();
        if (!db) return [];
        try {
          const { fetchMaterialReceivingsForMonth } = await import("../../db/haccp/visualInspection");
          return await fetchMaterialReceivingsForMonth(db, ctx.tenantId, input.year, input.month);
        } catch (err) {
          console.error('[visualInspection.fetchMaterialReceivings]', err);
          return [];
        }
      }),

    // 이전 입력 데이터 기반 자동완성 (품명별 최신 값)
    fetchPreviousDefaults: tenantRequiredProcedure
      .input(z.object({ year: z.number(), month: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getDb } = await import("../../db");
        const db = await getDb();
        if (!db) return {};
        try {
          const { fetchPreviousItemDefaults } = await import("../../db/haccp/visualInspection");
          return await fetchPreviousItemDefaults(db, ctx.tenantId, input.year, input.month);
        } catch (err) {
          console.error('[visualInspection.fetchPreviousDefaults]', err);
          return {};
        }
      }),
});
