/**
 * core-mes (Layer 2) 라우터 통합 맵 — Phase Y-2 진입점
 *
 * 작성: 2026-04-30 — Phase Y-2-0-b (Change Control 첫 라우터).
 * 갱신: 2026-04-30 — Phase Y-2-1-b (Nonconforming 추가).
 *
 * 정책 (ADR-002 + ADR-003):
 *   - core-mes 라우터는 industry 무관 단일 entity (h_change_controls 등)
 *   - 모든 endpoint 가 industry 컨텍스트 (z.enum) 명시 — view filter 강제
 *   - 신규 industry 진입 시 라우터 변경 0 (테이블 ENUM 만 ALTER)
 *
 * 향후 확장 (Y-2-2 ~ Y-2-3):
 *   - capa            : 시정조치 (Y-2-2)
 *   - audit           : 내부감사 / 공급업체감사 (Y-2-3)
 */
import { changeControlRouter } from "../coreMes/quality/changeControl.router";
import { nonconformingRouter } from "../coreMes/quality/nonconforming.router";
import { auditRouter } from "../coreMes/quality/audit.router";

export const coreMesRouterMap = {
  /** Change Control (변경관리) — Phase Y-2-0-b */
  changeControl: changeControlRouter,

  /** Nonconforming (부적합) — Phase Y-2-1-b */
  nonconforming: nonconformingRouter,

  /**
   * Audit (감사) — Phase Y-2-3
   *
   * 단일 테이블 h_audits + findings JSON array + industry view filter.
   * internal / supplier / external 3종.
   * Findings 의 correctiveActionId 가 CAPA (Y-2-2) 와 연계.
   */
  audit: auditRouter,
} as const;

