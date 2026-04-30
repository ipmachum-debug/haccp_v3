/**
 * 식품 HACCP Deviation 트렌드 — Layer 4 industry/food (CP-4 이주 1단계)
 *
 * 점진 이주 (Strangler Fig) — re-export 만. 실제 코드 이전은 후속 PR.
 *   기존 위치: server/routers/haccp/f3Trends.router.ts
 *   신규 노출: industry.food.trends
 */

export { f3TrendsRouter as foodTrendsRouter } from "../../haccp/f3Trends.router";
