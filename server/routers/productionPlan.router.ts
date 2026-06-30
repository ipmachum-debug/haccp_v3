/**
 * ★ PR-PP (2026-05-28): 주간 생산계획표 tRPC 라우터
 *
 * 엔드포인트:
 *   - get(weekMonday)              주간 plan 조회 (없으면 null)
 *   - upsert(weekMonday, payload)  저장 (debounced from client)
 *   - copyPreviousWeek(weekMonday) 지난 주 SKU/거래처 복사 (수량 비움)
 *   - clear(weekMonday)            주간 plan 삭제
 *   - exportRange(from, to)        백업용 — 기간 plan 일괄 반환
 *
 * 테넌트 격리: (tenant_id, week_monday) 유니크 키.
 */
import { z } from "zod";
import { router, tenantRequiredProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { productionPlans, type ProductionPlanPayload } from "../../drizzle/schema/productionPlans";
import { eq, and, gte, lte } from "drizzle-orm";
import { getEffectiveTenantId } from "./ccpMonitoring/_helpers";
import { TRPCError } from "@trpc/server";

const planRowSchema = z.object({
  proc: z.enum(["교반", "증숙"]).default("증숙"),
  item: z.string().default(""),
  client: z.string().default(""),
  qty: z.string().default(""),
  staff: z.string().default(""),
  note: z.string().default(""),
});

const planDaySchema = z.object({
  rows: z.array(planRowSchema).default([]),
  notes: z.string().default(""),
});

const planPayloadSchema = z.object({
  days: z.array(planDaySchema).length(7),
});

const weekMondaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식의 월요일 날짜여야 합니다.");

/** 빈 일자 (7일치) — 한 행을 미리 넣어 사용자 입력 유도 */
function emptyPayload(): ProductionPlanPayload {
  return {
    days: Array.from({ length: 7 }, () => ({
      rows: [{ proc: "증숙", item: "", client: "", qty: "", staff: "", note: "" }],
      notes: "",
    })),
  };
}

export const productionPlanRouter = router({
  get: tenantRequiredProcedure
    .input(z.object({ weekMonday: weekMondaySchema }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 사용 불가" });
      const tenantId = getEffectiveTenantId(ctx);

      const rows = await db.select().from(productionPlans)
        .where(and(eq(productionPlans.tenantId, tenantId), eq(productionPlans.weekMonday, input.weekMonday)))
        .limit(1);

      if (rows.length === 0) {
        return {
          exists: false,
          weekMonday: input.weekMonday,
          payload: emptyPayload(),
          author: "",
          weeklyNotes: "",
        };
      }

      const r = rows[0];
      const payload = typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload;
      return {
        exists: true,
        weekMonday: input.weekMonday,
        payload: payload as ProductionPlanPayload,
        author: r.author || "",
        weeklyNotes: r.weeklyNotes || "",
        updatedAt: r.updatedAt,
      };
    }),

  upsert: tenantRequiredProcedure
    .input(z.object({
      weekMonday: weekMondaySchema,
      payload: planPayloadSchema,
      author: z.string().max(100).default(""),
      weeklyNotes: z.string().default(""),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 사용 불가" });
      const tenantId = getEffectiveTenantId(ctx);
      const userId = ctx.user?.id ?? null;

      const existing = await db.select().from(productionPlans)
        .where(and(eq(productionPlans.tenantId, tenantId), eq(productionPlans.weekMonday, input.weekMonday)))
        .limit(1);

      if (existing.length > 0) {
        await db.update(productionPlans)
          .set({
            payload: input.payload as any,
            author: input.author,
            weeklyNotes: input.weeklyNotes,
            updatedBy: userId,
          })
          .where(and(eq(productionPlans.tenantId, tenantId), eq(productionPlans.weekMonday, input.weekMonday)));
        return { success: true, id: existing[0].id, created: false };
      }

      const [res] = await db.insert(productionPlans).values({
        tenantId,
        weekMonday: input.weekMonday,
        payload: input.payload as any,
        author: input.author,
        weeklyNotes: input.weeklyNotes,
        updatedBy: userId,
      });
      return { success: true, id: res.insertId, created: true };
    }),

  copyPreviousWeek: tenantRequiredProcedure
    .input(z.object({ weekMonday: weekMondaySchema }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 사용 불가" });
      const tenantId = getEffectiveTenantId(ctx);

      // 지난 주 월요일 계산
      const cur = new Date(input.weekMonday + "T00:00:00");
      cur.setDate(cur.getDate() - 7);
      const prevMonday = cur.toISOString().slice(0, 10);

      const prevRows = await db.select().from(productionPlans)
        .where(and(eq(productionPlans.tenantId, tenantId), eq(productionPlans.weekMonday, prevMonday)))
        .limit(1);

      if (prevRows.length === 0) {
        return { success: false, payload: emptyPayload(), message: "지난 주 데이터가 없습니다." };
      }

      const prev = prevRows[0];
      const prevPayload = (typeof prev.payload === "string" ? JSON.parse(prev.payload) : prev.payload) as ProductionPlanPayload;
      // SKU/거래처/공정만 가져오고 수량/인력/비고/일별 메모는 비움
      const copied: ProductionPlanPayload = {
        days: prevPayload.days.map((d) => ({
          rows: (d.rows || []).map((r) => ({
            proc: r.proc, item: r.item, client: r.client,
            qty: "", staff: "", note: "",
          })),
          notes: "",
        })),
      };

      return { success: true, payload: copied };
    }),

  clear: tenantRequiredProcedure
    .input(z.object({ weekMonday: weekMondaySchema }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 사용 불가" });
      const tenantId = getEffectiveTenantId(ctx);
      await db.delete(productionPlans)
        .where(and(eq(productionPlans.tenantId, tenantId), eq(productionPlans.weekMonday, input.weekMonday)));
      return { success: true };
    }),

  exportRange: tenantRequiredProcedure
    .input(z.object({
      from: weekMondaySchema.optional(),
      to: weekMondaySchema.optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 사용 불가" });
      const tenantId = getEffectiveTenantId(ctx);

      const conditions = [eq(productionPlans.tenantId, tenantId)];
      if (input.from) conditions.push(gte(productionPlans.weekMonday, input.from));
      if (input.to) conditions.push(lte(productionPlans.weekMonday, input.to));

      const rows = await db.select().from(productionPlans).where(and(...conditions));
      return rows.map((r) => ({
        weekMonday: r.weekMonday,
        payload: typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload,
        author: r.author,
        weeklyNotes: r.weeklyNotes,
        updatedAt: r.updatedAt,
      }));
    }),
});
