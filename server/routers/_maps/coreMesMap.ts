/**
 * core-mes (Layer 2) 라우터 통합 맵
 *
 * ============================================================================
 * Phase Y-2-0-b 시작점 — appRouter 에 단일 import 라인으로 등록.
 *
 * 등록된 라우터:
 *   - coreMesChangeControl: 변경관리 (Y-2-0-b)
 *
 * 후속 (별도 PR):
 *   - coreMesNonconformity: 부적합 (Y-2-1)
 *   - coreMesCapa: CAPA (Y-2-2)
 *   - coreMesAudit: 감사 (Y-2-3)
 *
 * 의존성 (.dependency-cruiser.cjs):
 *   - 본 맵은 server/routers/coreMes/* 의 라우터만 import
 *   - industry/* 무참조 (ADR-002)
 * ============================================================================
 */
import { coreMesChangeControlRouter } from "../coreMes";

export const coreMesRouterMap = {
  coreMesChangeControl: coreMesChangeControlRouter,
};
