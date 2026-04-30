/**
 * 화장품 GMP (Cosmetic GMP) 모듈 — 라우터 통합 export
 *
 * Layer 4 (industry) — Phase 2 (화장품 GMP) 시작점.
 * 자세한 사항은 bmr.router.ts 의 docstring 참조.
 */
export { cosmeticBmrRouter } from "./bmr.router";
export { cosmeticBmrIpcRouter } from "./bmrIpc.router";
export { cosmeticFormulaRouter } from "./formula.router";
export { cosmeticBmrIngredientRouter } from "./bmrIngredient.router";
export { cosmeticLabelRouter } from "./label.router";
export { cosmeticReleaseRouter } from "./release.router";
export { cosmeticStabilityRouter } from "./stability.router";
export { cosmeticKfdaReportRouter } from "./kfdaReport.router";
export { cosmeticDashboardRouter } from "./dashboard.router";
