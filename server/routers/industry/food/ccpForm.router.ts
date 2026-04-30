/**
 * 식품 CCP 양식 라우터 — Layer 4 industry/food (CP-4 2단계)
 *
 * 점진 이주 (Strangler Fig) — re-export 만.
 *   기존 위치: server/routers/haccp/ccpForm.router.ts
 *   신규 노출: industry.food.ccpForm
 */

export { ccpFormRouter as foodCcpFormRouter } from "../../haccp/ccpForm.router";
