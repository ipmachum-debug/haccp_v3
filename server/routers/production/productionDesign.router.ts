/**
 * 생산 설계 — 설계 현황 · 우리 공장 지도 · 제품 배합 목록 · 변경·적용 이력 (2026-10-19 설계 18 §13 1단계)
 *
 * 기준을 정하고 바꾸는 사람(관리자·공장장)용 — 현장 작업 메뉴(생산관리)와 분리.
 * 고치기는 이 안에서 끝난다 (2026-10-19 입력 단순화):
 *   우리 공장 — 공정(운영 가열시간·몇 대씩·간격·연결 설비) · 설비(한 번 도는 시간·온도·시작 시각): saveProcess / saveEquipment
 *   제품 배합 — 품목제조보고 편집기를 화면 안에서 연다 (저장은 기존 mfReport.update 그대로)
 */
import { router, adminProcedure } from "../../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

async function conn() {
  const { getRawConnection } = await import("../../db");
  return (await getRawConnection()) as any;
}

export const productionDesignRouter = router({
  /** 설계 현황 — 제품별 신호등 · 승인 대기 · 공장 설정 오류/누락 · 최근 수정 */
  overview: adminProcedure.query(async ({ ctx }) => {
    const { loadOverview } = await import("../../lib/production/designOverview");
    return loadOverview(await conn(), ctx.tenantId);
  }),

  /** 우리 공장 — 공정마다 설비·운전 방식·평상값 (공장 지도) */
  factory: adminProcedure.query(async ({ ctx }) => {
    const { loadDesignGroups } = await import("../../lib/production/designOverview");
    const { groupIssues } = await import("../../../shared/production/designReadiness");
    const c = await conn();
    const groups = await loadDesignGroups(c, ctx.tenantId);
    // 공정에 연결할 수 있는 설비 (사용 중) — 연결 고르기용
    const [eRows]: any = await c.execute(`SELECT id, name, ccp_type FROM equipments WHERE tenant_id = ? AND status = 'active' ORDER BY ccp_type, name, id`, [ctx.tenantId]);
    return {
      groups: groups.map((g) => ({ ...g, issues: groupIssues(g) })),
      equipments: (eRows as any[]).map((e) => ({ id: Number(e.id), name: String(e.name), ccpType: e.ccp_type ?? null })),
    };
  }),

  /** 공정 저장 — 운영 가열시간 · 몇 대씩 · 간격 · 연결 설비 (바뀐 것만, 변경 이력) */
  saveProcess: adminProcedure
    .input(z.object({
      groupId: z.number().int().positive(),
      heatMin: z.number().int().min(1).max(600).nullable().optional(),
      mode: z.enum(["sequential", "concurrent", "grouped"]).optional(),
      batchSize: z.number().int().min(1).max(50).optional(),
      intervalMin: z.number().int().min(0).max(600).optional(),
      equipmentIds: z.array(z.number().int().positive()).max(100).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { saveProcess } = await import("../../lib/production/designFactorySave");
      let r: Awaited<ReturnType<typeof saveProcess>>;
      try { r = await saveProcess(await conn(), ctx.tenantId, input); } catch (e: any) { throw new TRPCError({ code: "BAD_REQUEST", message: e?.message ?? "저장하지 못했습니다." }); }
      const n = Object.keys(r.changes).length;
      if (n) {
        const { createAuditLog } = await import("../../db/system/auditApprovalSupplier");
        await createAuditLog({ action: "ccp_process_group.update", entityType: "ccp_process_group", entityId: input.groupId, userId: ctx.user.id, userEmail: ctx.user.email, userRole: ctx.user.role, changes: r.changes, description: `${r.name} 공정 설정 — ${n}건` }, ctx.tenantId);
      }
      return { changed: n };
    }),

  /** 설비 저장 — 한 번 도는 시간 · 평소 온도 · 작업 시작 시각 (바뀐 것만, 변경 이력) */
  saveEquipment: adminProcedure
    .input(z.object({
      equipmentId: z.number().int().positive(),
      cycleMin: z.number().int().min(1).max(1440).nullable().optional(),
      tempC: z.number().min(-50).max(400).nullable().optional(),
      workStartTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { saveEquipment } = await import("../../lib/production/designFactorySave");
      let r: Awaited<ReturnType<typeof saveEquipment>>;
      try { r = await saveEquipment(await conn(), ctx.tenantId, input); } catch (e: any) { throw new TRPCError({ code: "BAD_REQUEST", message: e?.message ?? "저장하지 못했습니다." }); }
      const n = Object.keys(r.changes).length;
      if (n) {
        const { createAuditLog } = await import("../../db/system/auditApprovalSupplier");
        await createAuditLog({ action: "equipment.update", entityType: "equipment", entityId: input.equipmentId, userId: ctx.user.id, userEmail: ctx.user.email, userRole: ctx.user.role, changes: r.changes, description: `${r.name} 설비 설정 — ${n}건` }, ctx.tenantId);
      }
      return { changed: n };
    }),

  /** 제품 배합 — 사용 중 품목제조보고마다 생산에 쓰는 버전 · 신호등 · 공정별 1배치 투입량 */
  recipes: adminProcedure.query(async ({ ctx }) => {
    const { loadRecipeStatuses } = await import("../../lib/production/designOverview");
    return loadRecipeStatuses(await conn(), ctx.tenantId);
  }),

  /** 제품 배합 상세 — 배합표 | 공정 흐름도 (생산 설계 2a) */
  recipeDetail: adminProcedure
    .input(z.object({ reportId: z.number().int().positive(), versionId: z.number().int().positive().optional() }))
    .query(async ({ ctx, input }) => {
      const { loadRecipeDetail } = await import("../../lib/production/designOverview");
      // versionId 가 있으면 그 버전 그대로 (승인 대기 목록에서 정확한 대상 버전), 없으면 생산에 쓰는 버전
      const d = await loadRecipeDetail(await conn(), ctx.tenantId, input.reportId, input.versionId);
      if (!d) throw new TRPCError({ code: "NOT_FOUND", message: "이 회사의 사용 중인 품목제조보고(버전)가 아닙니다." });
      return d;
    }),

  /** 변경·적용 이력 */
  history: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(500).default(100) }).optional())
    .query(async ({ ctx, input }) => {
      const { loadHistory } = await import("../../lib/production/designOverview");
      return loadHistory(await conn(), ctx.tenantId, input?.limit ?? 100);
    }),
});
