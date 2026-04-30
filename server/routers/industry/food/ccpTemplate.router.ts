/**
 * 식품 CCP 템플릿 라우터 — Layer 4 industry/food (CP-4 2단계)
 *
 * 점진 이주 (Strangler Fig) — re-export 만.
 *   기존 위치: server/routers/haccp/ccpTemplate.router.ts
 *   신규 노출: industry.food.ccpTemplate
 */

export { ccpTemplateRouter as foodCcpTemplateRouter } from "../../haccp/ccpTemplate.router";
