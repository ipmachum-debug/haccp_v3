/**
 * 식품 CCP 스케줄 라우터 — Layer 4 industry/food (CP-4 2단계)
 *
 * 점진 이주 (Strangler Fig) — re-export 만.
 *   기존 위치: server/routers/haccp/ccpSchedule.router.ts
 *   신규 노출: industry.food.ccpSchedule
 */

export { ccpScheduleRouter as foodCcpScheduleRouter } from "../../haccp/ccpSchedule.router";
