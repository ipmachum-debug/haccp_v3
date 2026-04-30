/**
 * core-mes (Layer 2) 라우터 통합 맵 — Phase Y-2 진입점
 *
 * 작성: 2026-04-30 — Phase Y-2-0-b (Change Control 첫 라우터).
 *
 * 정책 (ADR-002 + ADR-003):
 *   - core-mes 라우터는 industry 무관 단일 entity (h_change_controls 등)
 *   - 모든 endpoint 가 industry 컨텍스트 (z.enum) 명시 — view filter 강제
 *   - 신규 industry 진입 시 라우터 변경 0 (테이블 ENUM 만 ALTER)
 *
 * 향후 확장 (Y-2-1 ~ Y-2-3):
 *   - nonconforming  : 부적합 제품 (industry/food 잔재 → core-mes 추출)
 *   - capa           : 시정조치 (CAPA — Corrective Action / Preventive Action)
 *   - audit          : 내부감사 / 공급업체감사
 */
import { changeControlRouter } from "../coreMes/quality/changeControl.router";

export const coreMesRouterMap = {
  /**
   * Change Control (변경관리) — Phase Y-2-0-b
   *
   * 단일 테이블 h_change_controls + industry view filter.
   * 적용: 식품 HACCP / 화장품 GMP / 의약품 KGMP / 의료기기 등 cross-industry.
   */
  changeControl: changeControlRouter,
} as const;
