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
        const { getOrCreateFinishedProductLog } = await import("../../db/haccp/visualInspection");
        return await getOrCreateFinishedProductLog(db, ctx.tenantId, ctx.user.siteId || ctx.tenantId, input.year, input.month, ctx.user.id);
      }),

    getById: tenantRequiredProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getDb } = await import("../../db");
        const db = await getDb();
        if (!db) return null;
        try {
          const { getFinishedProductLog } = await import("../../db/haccp/visualInspection");
          const { sql } = await import("drizzle-orm");

          // ★ 2026-04-14: 기존 로그 created_by 가 NULL 이면 현재 사용자로 백필
          await db.execute(sql`
            UPDATE h_finished_product_inspection_logs
            SET created_by = ${ctx.user.id}
            WHERE id = ${input.id}
              AND tenant_id = ${ctx.tenantId}
              AND (created_by IS NULL OR created_by = 0)
          `);

          const result = await getFinishedProductLog(db, ctx.tenantId, input.id);

          // ★ 최종 폴백: 작성자 이름이 여전히 비어있으면 현재 로그인 유저
          if (result && !result.requesterName) {
            (result as any).requesterName = ctx.user.name || "미지정";
          }

          return result;
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
          shipMethod: z.string().default('택배(아이스박스)'),
          temperature: z.string().default(''),
          iceBoxStatus: z.string().default('○'),
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
        const { saveFinishedProductItems } = await import("../../db/haccp/visualInspection");
        return await saveFinishedProductItems(db, ctx.tenantId, input.logId, input.items);
      }),

    delete: tenantRequiredProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import("../../db");
        const db = await getDb();
        if (!db) throw new Error("DB 연결 실패");
        const { deleteFinishedProductLog } = await import("../../db/haccp/visualInspection");
        return await deleteFinishedProductLog(db, ctx.tenantId, input.id);
      }),

    submitForApproval: tenantRequiredProcedure
      .input(z.object({ logId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb, getRawConnection } = await import("../../db");
        const db = await getDb();
        if (!db) throw new Error("DB 연결 실패");
        const pool = await getRawConnection();
        const { submitFinishedProductApproval } = await import("../../db/haccp/visualInspection");
        return await submitFinishedProductApproval(db, pool, ctx.tenantId, ctx.user.siteId || ctx.tenantId, input.logId, ctx.user.id);
      }),

    fetchBatches: tenantRequiredProcedure
      .input(z.object({ year: z.number(), month: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getDb } = await import("../../db");
        const db = await getDb();
        if (!db) return [];
        try {
          const { fetchCompletedBatchesForMonth } = await import("../../db/haccp/visualInspection");
          return await fetchCompletedBatchesForMonth(db, ctx.tenantId, input.year, input.month);
        } catch (err) {
          console.error('[finishedProductInspection.fetchBatches]', err);
          return [];
        }
      }),

    // 관리자용: 출고 데이터 → 검사 항목 자동 동기화
    syncOutbounds: tenantRequiredProcedure
      .input(z.object({ logId: z.number(), year: z.number(), month: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import("../../db");
        const db = await getDb();
        if (!db) throw new Error("DB 연결 실패");
        const { syncOutboundsToFinishedProductLog } = await import("../../db/haccp/visualInspection");
        return await syncOutboundsToFinishedProductLog(db, ctx.tenantId, input.logId, input.year, input.month);
      }),

    // 이전 입력 데이터 기반 자동완성 (제품명별 최신 값)
    fetchPreviousDefaults: tenantRequiredProcedure
      .input(z.object({ year: z.number(), month: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getDb } = await import("../../db");
        const db = await getDb();
        if (!db) return {};
        try {
          const { fetchPreviousFinishedProductDefaults } = await import("../../db/haccp/visualInspection");
          return await fetchPreviousFinishedProductDefaults(db, ctx.tenantId, input.year, input.month);
        } catch (err) {
          console.error('[finishedProductInspection.fetchPreviousDefaults]', err);
          return {};
        }
      }),
});
