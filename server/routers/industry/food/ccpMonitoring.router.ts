/**
 * 식품 CCP 모니터링 라우터 (mergeRouters) — Layer 4 industry/food (CP-4 2단계)
 *
 * 점진 이주 (Strangler Fig) — re-export 만.
 *   기존 위치: server/routers/haccp/ccpMonitoringMerge.router.ts
 *   신규 노출: industry.food.ccpMonitoring
 */

export { ccpMonitoringRouter as foodCcpMonitoringRouter } from "../../haccp/ccpMonitoringMerge.router";
