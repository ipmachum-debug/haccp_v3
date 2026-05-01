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

export const coreMesRouterMap = {
  /**
   * Change Control (변경관리) — Phase Y-2-0-b
   *
   * 단일 테이블 h_change_controls + industry view filter.
   * 적용: 식품 HACCP / 화장품 GMP / 의약품 KGMP / 의료기기 등 cross-industry.
   */
  changeControl: changeControlRouter,

  /**
   * Nonconforming (부적합) — Phase Y-2-1-b
   *
   * 단일 테이블 h_nonconformings + industry view filter.
   * 기존 h_nonconforming_products (식품 위주) 와 별개 — Strangler Fig.
   * 적용: 식품 / 화장품 / 의약품 / 의료기기 모두 동일 entity.
   * Y-2-2 (CAPA) 머지 후 corrective_action_id 활성.
   */
  nonconforming: nonconformingRouter,
} as const;

