/**
 * 생산 설계 — 설계 현황 · 우리 공장 지도 · 제품 배합 목록 · 변경·적용 이력 (2026-10-19 설계 18 §13 1단계)
 *
 * 읽기 전용. 기준을 정하고 바꾸는 사람(관리자·공장장)용 — 현장 작업 메뉴(생산관리)와 분리.
 * 수정은 아직 기존 화면(품목제조보고·CCP 설비·공정)에서 하고, 이 화면은 '무엇이 준비 안 됐고 무엇이 바뀌었나' 를 보여 준다.
 */
import { router, adminProcedure } from "../../_core/trpc";
import { z } from "zod";

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

  /** 변경·적용 이력 */
  history: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(500).default(100) }).optional())
    .query(async ({ ctx, input }) => {
      const { loadHistory } = await import("../../lib/production/designOverview");
      return loadHistory(await conn(), ctx.tenantId, input?.limit ?? 100);
    }),
});
