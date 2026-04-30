/**
 * 식품 CCP 라우터 (Critical Control Point) — Layer 4 industry/food (CP-4 2단계)
 *
 * 점진 이주 (Strangler Fig) — re-export 만. 실제 코드 이전은 후속 PR.
 *   기존 위치: server/routers/haccp/ccp.router.ts
 *   신규 노출: industry.food.ccp
 */

export { ccpRouter as foodCcpRouter } from "../../haccp/ccp.router";
