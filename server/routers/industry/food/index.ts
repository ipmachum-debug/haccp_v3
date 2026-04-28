/**
 * 식품 HACCP 어댑터 모듈 — Layer 4 industry / food
 *
 * 식품 전용 스키마 (ccp_limits, h_haccp_*) 를 업종 무관 코어 entity
 * (ControlPoint, CriticalLimit) 로 변환하는 어댑터 모음.
 *
 * 향후 확장:
 *   - inspection.adapter.ts (검사)
 *   - hygiene.adapter.ts (위생점검)
 *   - lot.adapter.ts (LOT 부여 규칙 — 원재료-입고일-순번)
 *   - account.adapter.ts (식품업 회계 계정 매핑)
 *
 * 트리거: PR #119 ControlPoint 추상화 설계 / PR #122 CP-1 entity
 * 진행 단계: CP-2 (식품 어댑터)
 */

export {
  listFoodControlPoints,
  mapCcpLimitToControlPoint,
  mapCcpLimitsToCriticalLimits,
} from "./ccp.adapter";
