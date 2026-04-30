/**
 * Industry (Layer 4) 라우터 통합 맵
 *
 * 작성: 2026-04-28 — PR #114 진단 보고서의 Phase E-1 (cosmetic 골격) 시작점
 * 갱신: 2026-04-30 — CP-4 식품 점진 이주 1단계 (food 골격 — dashboard/trends re-export)
 *
 * 점진 이주 (Strangler Fig):
 *   - cosmetic: 본 맵 안착 완료 (Phase 2 lifecycle 9단계 + dashboard)
 *   - food:     CP-4 진행 중 — dashboard/trends re-export (1단계)
 *               후속 PR: ccp / ccpForm / ccpSchedule / ccpTemplate / ccpMonitoring /
 *                        inspection / lotManagement / hazardAnalysis / metalDetection /
 *                        correctiveAction / recallSimulation / traceability
 *   - 기타 업종: 시장 진입 시점에 추가
 *
 * food 양쪽 노출 정책 (이주 기간 호환):
 *   - dashboard/trends 는 본 맵 + haccpMap 양쪽에 등록
 *   - 클라이언트가 industry.food.* 로 이동 완료 후 haccpMap 에서 제거 (CP-4 마지막 단계)
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
  cosmeticKfdaReportRouter,
  cosmeticDashboardRouter,
} from "../industry/cosmetic";
import {
  foodDashboardRouter,
  foodTrendsRouter,
  foodCcpRouter,
  foodCcpFormRouter,
  foodCcpScheduleRouter,
  foodCcpTemplateRouter,
  foodCcpMonitoringRouter,
  foodInspectionRouter,
  foodVisualInspectionRouter,
  foodFinishedProductInspectionRouter,
  foodLotManagementRouter,
  foodMetalDetectionRouter,
  foodTraceabilityRouter,
} from "../industry/food";

export const industryRouterMap = {
  cosmetic: {
    bmr: cosmeticBmrRouter,
    bmrIpc: cosmeticBmrIpcRouter,
    bmrIngredient: cosmeticBmrIngredientRouter,
    formula: cosmeticFormulaRouter,
    label: cosmeticLabelRouter,
    release: cosmeticReleaseRouter,
    stability: cosmeticStabilityRouter,
    kfdaReport: cosmeticKfdaReportRouter,
    dashboard: cosmeticDashboardRouter,
  },
  // CP-4 식품 이주 1단계 — dashboard/trends re-export (haccpMap 과 양쪽 노출)
  // CP-4 2단계 — CCP 핵심 5개 추가
  // CP-4 3단계 — 검사 / LOT / 추적 6개 추가
  food: {
    dashboard: foodDashboardRouter,
    trends: foodTrendsRouter,
    ccp: foodCcpRouter,
    ccpForm: foodCcpFormRouter,
    ccpSchedule: foodCcpScheduleRouter,
    ccpTemplate: foodCcpTemplateRouter,
    ccpMonitoring: foodCcpMonitoringRouter,
    inspection: foodInspectionRouter,
    visualInspection: foodVisualInspectionRouter,
    finishedProductInspection: foodFinishedProductInspectionRouter,
    lotManagement: foodLotManagementRouter,
    metalDetection: foodMetalDetectionRouter,
    traceability: foodTraceabilityRouter,
  },
} as const;
