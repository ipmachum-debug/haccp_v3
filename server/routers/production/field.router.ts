/**
 * 현장 확인 — 하루 생산 흐름 (2026-10-19). 개인 계정으로 확인·수정·통과 시작/종료, 이력은 추가만.
 * 기기·세션은 화면이 보내는 머리글(x-device-id, x-session-id)과 접속 주소·브라우저를 이력에 남긴다.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, workerProcedure } from "../../_core/trpc";
import { getRawConnection } from "../../db";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function metaOf(ctx: any) {
  const h = (k: string) => {
    const v = ctx?.req?.headers?.[k];
    return Array.isArray(v) ? String(v[0]) : v != null ? String(v) : null;
  };
  return { deviceId: h("x-device-id"), sessionId: h("x-session-id"), ip: h("x-forwarded-for")?.split(",")[0]?.trim() ?? ctx?.req?.socket?.remoteAddress ?? null, userAgent: h("user-agent") };
}

async function run<T>(fn: () => Promise<T>): Promise<T> {
  const { FieldConflictError, FieldRejectedError } = await import("../../services/fieldWork");
  try {
    return await fn();
  } catch (e: any) {
    if (e instanceof FieldConflictError) throw new TRPCError({ code: "CONFLICT", message: e.message });
    if (e instanceof FieldRejectedError) throw new TRPCError({ code: "PRECONDITION_FAILED", message: e.message });
    if (e?.name === "VoidedRecordError") throw new TRPCError({ code: "PRECONDITION_FAILED", message: e.message });
    // 원료 출고(첫 확인) 실패 등 — 확인은 저장되지 않았다
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: e?.message ?? "저장하지 못했습니다." });
  }
}

export const fieldRouter = router({
  /** 고를 수 있는 설비(가열 공정 설비 + 금속검출기)와 내가 고른 설비 */
  equipments: workerProcedure.query(async ({ ctx }) => {
    const conn = await getRawConnection();
    const [rows]: any = await conn.execute(
      `SELECT e.id, e.name, e.ccp_type FROM equipments e WHERE e.tenant_id = ? AND e.status = 'active'
          AND (e.ccp_type = 'CCP-4P' OR EXISTS (SELECT 1 FROM ccp_process_group_equipments ge WHERE ge.tenant_id = e.tenant_id AND ge.equipment_id = e.id))
        ORDER BY e.ccp_type = 'CCP-4P', e.name`,
      [ctx.tenantId],
    );
    const { getMyEquipments } = await import("../../services/fieldWork");
    return { all: (rows as any[]).map((r) => ({ id: Number(r.id), name: String(r.name), metal: r.ccp_type === "CCP-4P" })), mine: await getMyEquipments(ctx.tenantId, ctx.user.id) };
  }),

  setMyEquipments: workerProcedure
    .input(z.object({ equipmentIds: z.array(z.number()).max(50) }))
    .mutation(async ({ input, ctx }) => run(async () => {
      const { setMyEquipments } = await import("../../services/fieldWork");
      return { mine: await setMyEquipments(ctx.tenantId, ctx.user.id, input.equipmentIds) };
    })),

  /** 오늘 일 — 내 설비(고른 것이 없으면 전부) */
  work: workerProcedure
    .input(z.object({ workDate: DATE }))
    .query(async ({ input, ctx }) => {
      const { listFieldWork, getMyEquipments } = await import("../../services/fieldWork");
      const mine = await getMyEquipments(ctx.tenantId, ctx.user.id);
      return listFieldWork(ctx.tenantId, input.workDate, mine.length ? mine : null);
    }),

  /** 확인 / 고치기 / 통과 시작 / 통과 종료 — 같은 요청 키는 한 번만 */
  write: workerProcedure
    .input(z.object({
      rowId: z.number(),
      action: z.enum(["confirm", "edit", "pass_start", "pass_end"]),
      expectedRowVersion: z.number().int().min(0),
      values: z.record(z.string(), z.union([z.string().max(500), z.number(), z.null()])).optional(),
      requestId: z.string().min(8).max(64),
    }))
    .mutation(async ({ input, ctx }) => run(async () => {
      const { writeFieldRow } = await import("../../services/fieldWork");
      return writeFieldRow({ ...input, values: input.values as any, tenantId: ctx.tenantId, userId: ctx.user.id, meta: metaOf(ctx) });
    })),

  /** 감도점검 한 번 더 (2시간 점검 등) */
  addSensitivity: workerProcedure
    .input(z.object({ formRecordId: z.number(), productName: z.string().min(1).max(200), label: z.string().min(1).max(100), requestId: z.string().min(8).max(64) }))
    .mutation(async ({ input, ctx }) => run(async () => {
      const { addSensitivityRow } = await import("../../services/fieldWork");
      return addSensitivityRow({ ...input, tenantId: ctx.tenantId, userId: ctx.user.id, meta: metaOf(ctx) });
    })),

  /** 이 행의 확인·수정 이력 (추가만) */
  rowHistory: workerProcedure
    .input(z.object({ rowId: z.number() }))
    .query(async ({ input, ctx }) => {
      const conn = await getRawConnection();
      const [rows]: any = await conn.execute(
        `SELECT e.event, e.at, e.row_version, e.before_json, e.after_json, e.device_id, u.name AS user_name
           FROM h_ccp_row_events e LEFT JOIN users u ON u.id = e.user_id
          WHERE e.tenant_id = ? AND e.form_row_id = ? ORDER BY e.id`,
        [ctx.tenantId, input.rowId],
      );
      const j = (v: any) => (v == null ? null : typeof v === "string" ? JSON.parse(v) : v);
      return (rows as any[]).map((r) => ({ event: String(r.event), at: r.at, rowVersion: r.row_version, before: j(r.before_json), after: j(r.after_json), deviceId: r.device_id ?? null, userName: r.user_name ?? null }));
    }),
});
