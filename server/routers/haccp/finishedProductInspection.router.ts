// finishedProductInspection 라우터 - routers.ts에서 분리됨
import { tenantRequiredProcedure, router } from "../../_core/trpc";
import { z } from "zod";
import { lt, or } from "drizzle-orm";
import { getDb, getRawConnection } from "../../db";

export const finishedProductInspectionRouter = router({
    getOrCreateMonthly: tenantRequiredProcedure
      .input(z.object({ year: z.number(), month: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import("../../db");
        const db = await getDb();
        if (!db) throw new Error("DB 연결 실패");
        const { getOrCreateFinishedProductLog } = await import("../../db/visualInspection");
        return await getOrCreateFinishedProductLog(db, ctx.tenantId ?? undefined, ctx.user.siteId || ctx.tenantId, input.year, input.month, ctx.user.id);
      }),

    getById: tenantRequiredProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getDb } = await import("../../db");
        const db = await getDb();
        if (!db) return null;
        try {
          const { getFinishedProductLog } = await import("../../db/visualInspection");
          return await getFinishedProductLog(db, ctx.tenantId ?? undefined, input.id);
        } catch (err) {
          console.error('[finishedProductInspection.getById]', err);
          return null;
        }
      }),

    saveItems: tenantRequiredProcedure
      .input(z.object({
        logId: z.number(),
        items: z.array(z.object({
          shipDate: z.string().default(''),
          productName: z.string().default(''),
          lotNumber: z.string().default(''),
          quantity: z.string().default(''),
          packagingStatus: z.string().default('○'),
          labelStatus: z.string().default('○'),
          temperature: z.string().default(''),
          result: z.string().default('적합'),
          correctiveAction: z.string().default(''),
          note: z.string().default(''),
          batchId: z.number().nullable().optional(),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import("../../db");
        const db = await getDb();
        if (!db) throw new Error("DB 연결 실패");
        const { saveFinishedProductItems } = await import("../../db/visualInspection");
        return await saveFinishedProductItems(db, ctx.tenantId ?? undefined, input.logId, input.items);
      }),

    delete: tenantRequiredProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import("../../db");
        const db = await getDb();
        if (!db) throw new Error("DB 연결 실패");
        const { deleteFinishedProductLog } = await import("../../db/visualInspection");
        return await deleteFinishedProductLog(db, ctx.tenantId ?? undefined, input.id);
      }),

    submitForApproval: tenantRequiredProcedure
      .input(z.object({ logId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb, getRawConnection } = await import("../../db");
        const db = await getDb();
        if (!db) throw new Error("DB 연결 실패");
        const pool = await getRawConnection();
        const { submitFinishedProductApproval } = await import("../../db/visualInspection");
        return await submitFinishedProductApproval(db, pool, ctx.tenantId ?? undefined, ctx.user.siteId || ctx.tenantId, input.logId, ctx.user.id);
      }),

    fetchBatches: tenantRequiredProcedure
      .input(z.object({ year: z.number(), month: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getDb } = await import("../../db");
        const db = await getDb();
        if (!db) return [];
        try {
          const { fetchCompletedBatchesForMonth } = await import("../../db/visualInspection");
          return await fetchCompletedBatchesForMonth(db, ctx.tenantId ?? undefined, input.year, input.month);
        } catch (err) {
          console.error('[finishedProductInspection.fetchBatches]', err);
          return [];
        }
      }),

    // 이전 입력 데이터 기반 자동완성 (제품명별 최신 값)
    fetchPreviousDefaults: tenantRequiredProcedure
      .input(z.object({ year: z.number(), month: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getDb } = await import("../../db");
        const db = await getDb();
        if (!db) return {};
        try {
          const { fetchPreviousFinishedProductDefaults } = await import("../../db/visualInspection");
          return await fetchPreviousFinishedProductDefaults(db, ctx.tenantId ?? undefined, input.year, input.month);
        } catch (err) {
          console.error('[finishedProductInspection.fetchPreviousDefaults]', err);
          return {};
        }
      }),
});
