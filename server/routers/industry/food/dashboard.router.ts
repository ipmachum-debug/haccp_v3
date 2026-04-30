/**
 * 식품 HACCP 운영 대시보드 — Layer 4 industry/food 진입점 (CP-4 이주 1단계)
 *
 * ============================================================================
 * 본 파일은 점진 이주 (Strangler Fig) 의 첫 단계로 추가됨.
 *
 *   기존 위치: server/routers/haccp/f3Dashboard.router.ts (레거시)
 *   신규 노출: industry.food.dashboard (본 파일 — re-export)
 *
 * 호출자가 점진적으로 industry.food.dashboard 로 이동한 후, 레거시 위치
 * (haccpRouterMap.f3Dashboard) 는 후속 PR 에서 제거.
 *
 * 의존성 (.dependency-cruiser.cjs):
 *   - industry/food → routers/haccp 는 룰 적용 외 (레거시 경로 허용)
 *   - 후속 PR 에서 본 파일을 실제 구현 이전 시 routers/haccp 의존 제거
 * ============================================================================
 */

export { f3DashboardRouter as foodDashboardRouter } from "../../haccp/f3Dashboard.router";
