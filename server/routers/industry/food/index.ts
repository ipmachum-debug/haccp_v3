/**
 * 식품 HACCP 어댑터 모듈 — Layer 4 industry / food
 *
 * 식품 전용 스키마 (ccp_limits, h_haccp_*) 를 업종 무관 코어 entity
 * (ControlPoint, CriticalLimit) 로 변환하는 어댑터 모음.
 *
 * 향후 확장:
 *   - inspection.adapter.ts (검사)
 *   - hygiene.adapter.ts (위생점검)
 *   - lot.adapter.ts (LOT 부여 규칙 — 원재료-입고일-순번)
 *   - account.adapter.ts (식품업 회계 계정 매핑)
 *
 * 트리거: PR #119 ControlPoint 추상화 설계 / PR #122 CP-1 entity
 * 진행 단계: CP-2 (식품 어댑터)
 */

export {
  listFoodControlPoints,
  mapCcpLimitToControlPoint,
  mapCcpLimitsToCriticalLimits,
} from "./ccp.adapter";

// CP-4 점진 이주: industry/food 라우터 export (Strangler Fig 1단계 — re-export)
export { foodDashboardRouter } from "./dashboard.router";
export { foodTrendsRouter } from "./trends.router";

// CP-4 2단계 — CCP 핵심 5개 (re-export)
export { foodCcpRouter } from "./ccp.router";
export { foodCcpFormRouter } from "./ccpForm.router";
export { foodCcpScheduleRouter } from "./ccpSchedule.router";
export { foodCcpTemplateRouter } from "./ccpTemplate.router";
export { foodCcpMonitoringRouter } from "./ccpMonitoring.router";

// CP-4 3단계 — 검사 / LOT / 추적 6개 (re-export)
export { foodInspectionRouter } from "./inspection.router";
export { foodVisualInspectionRouter } from "./visualInspection.router";
export { foodFinishedProductInspectionRouter } from "./finishedProductInspection.router";
export { foodLotManagementRouter } from "./lotManagement.router";
export { foodMetalDetectionRouter } from "./metalDetection.router";
export { foodTraceabilityRouter } from "./traceability.router";

// CP-4 4단계 — 위해분석 / 검증 / 감사 4개 (re-export)
export { foodHazardAnalysisRouter } from "./hazardAnalysis.router";
export { foodHaccpPlanVerificationRouter } from "./haccpPlanVerification.router";
export { foodInternalAuditRouter } from "./internalAudit.router";
export { foodSupplierAuditRouter } from "./supplierAudit.router";

// CP-4 5단계 — 부적합 / 시정 / 회수 3개 (re-export)
export { foodNonconformingProductRouter } from "./nonconformingProduct.router";
export { foodCorrectiveActionRouter } from "./correctiveAction.router";
export { foodRecallSimulationRouter } from "./recallSimulation.router";

// CP-4 6단계 — haccpIntegration (re-export, 회계 의존은 동적 import 라 정적 ADR-002 위반 없음)
export { foodHaccpIntegrationRouter } from "./haccpIntegration.router";
