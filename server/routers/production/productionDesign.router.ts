/**
 * 생산 설계 — 설계 현황 · 우리 공장 지도 · 제품 배합 목록 · 변경·적용 이력 (2026-10-19 설계 18 §13 1단계)
 *
 * 기준을 정하고 바꾸는 사람(관리자·공장장)용 — 현장 작업 메뉴(생산관리)와 분리.
 * 쓰기는 2a 의 '원료 들어가는 곳' 분류 하나뿐 (원료 차감·CCP 계산에 영향 없음). 나머지는 읽기 전용.
 * 수정은 아직 기존 화면(품목제조보고·CCP 설비·공정)에서 하고, 이 화면은 '무엇이 준비 안 됐고 무엇이 바뀌었나' 를 보여 준다.
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
    const groups = await loadDesignGroups(await conn(), ctx.tenantId);
    return groups.map((g) => ({ ...g, issues: groupIssues(g) }));
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

  /**
   * 원료 들어가는 곳 저장 (생산 설계 2a) — 공정이 없는 원료 줄의 '성형에 바로 · 나중에 넣음 · 아직 모름' 만.
   *   분류 정보라 원료 차감·CCP 계산은 바뀌지 않는다. 바뀐 것은 변경·적용 이력에 남긴다.
   */
  setEntryStages: adminProcedure
    .input(z.object({
      reportId: z.number().int().positive(),
      versionId: z.number().int().positive(),
      items: z.array(z.object({ ingredientId: z.number().int().positive(), stage: z.enum(["direct", "late"]).nullable() })).min(1).max(300),
    }))
    .mutation(async ({ ctx, input }) => {
      const { saveEntryStages } = await import("../../lib/production/designOverview");
      const c = await conn();
      let changed: Array<{ name: string; before: string; after: string }>;
      try {
        changed = await saveEntryStages(c, ctx.tenantId, input.reportId, input.versionId, input.items);
      } catch (e: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: e?.message ?? "저장하지 못했습니다." });
      }
      if (changed.length) {
        const [[p]]: any = await c.execute(
          `SELECT COALESCE(m.item_name, CONCAT('보고서 #', r.id)) AS n, v.version_no, v.approval_status
             FROM h_mf_reports r JOIN h_mf_report_versions v ON v.mf_report_id = r.id AND v.id = ?
             LEFT JOIN item_master m ON m.id = r.product_id AND m.tenant_id = r.tenant_id WHERE r.id = ? AND r.tenant_id = ?`,
          [input.versionId, input.reportId, ctx.tenantId],
        );
        const { createAuditLog } = await import("../../db/system/auditApprovalSupplier");
        await createAuditLog({
          action: "mf_report.entry_stage", entityType: "mf_report", entityId: input.reportId,
          userId: ctx.user.id, userEmail: ctx.user.email, userRole: ctx.user.role,
          // 어느 버전의 어느 원료 줄을 정했는지 (#600 검토 A4) — 버전 id·번호를 함께 남긴다
          changes: { versionId: input.versionId, versionNo: p?.version_no ?? null, diff: changed.map((x) => ({ field: `${x.name} 들어가는 곳`, before: x.before, after: x.after })) },
          description: `${p?.n ?? `보고서 #${input.reportId}`} v${p?.version_no ?? "?"}${p?.approval_status === "APPROVED" ? "(승인)" : "(초안)"} 원료 분류 — ${changed.length}건`,
        }, ctx.tenantId);
      }
      return { changed: changed.length };
    }),

  /** 변경·적용 이력 */
  history: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(500).default(100) }).optional())
    .query(async ({ ctx, input }) => {
      const { loadHistory } = await import("../../lib/production/designOverview");
      return loadHistory(await conn(), ctx.tenantId, input?.limit ?? 100);
    }),
});
