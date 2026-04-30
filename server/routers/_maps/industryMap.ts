/**
 * Industry (Layer 4) 라우터 통합 맵
 *
 * 작성: 2026-04-28 — PR #114 진단 보고서의 Phase E-1 (cosmetic 골격) 시작점
 *
 * 점진 이주 (Strangler Fig):
 *   - cosmetic: 본 맵에서 시작 (이번 PR)
 *   - food: 현재 server/routers/_maps/haccpMap.ts 에 별도 등록 (점진 이주 후 본 맵으로 통합)
 *   - 기타 업종: 시장 진입 시점에 추가
 *
 * 의존성 (.dependency-cruiser.cjs 가 강제):
 *   - 본 맵은 industry/* 의 라우터만 import
 *   - 각 industry 모듈은 다른 industry 의 라우터 직접 참조 금지
 */
import {
  cosmeticBmrRouter,
  cosmeticBmrIpcRouter,
  cosmeticFormulaRouter,
  cosmeticBmrIngredientRouter,
  cosmeticLabelRouter,
  cosmeticReleaseRouter,
  cosmeticStabilityRouter,
} from "../industry/cosmetic";

export const industryRouterMap = {
  cosmetic: {
    bmr: cosmeticBmrRouter,
    bmrIpc: cosmeticBmrIpcRouter,
    bmrIngredient: cosmeticBmrIngredientRouter,
    formula: cosmeticFormulaRouter,
    label: cosmeticLabelRouter,
    release: cosmeticReleaseRouter,
    stability: cosmeticStabilityRouter,
  },
} as const;
