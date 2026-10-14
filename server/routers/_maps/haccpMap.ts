/**
 * HACCP 도메인 라우터 매핑 — _root.ts 분해 (2026-04-19)
 */
import {
  ccpRouter,
  ccpFormRouter,
  ccpScheduleRouter,
  ccpTemplateRouter,
  finishedProductInspectionRouter,
  haccpIntegrationRouter,
  inspectionRouter,
  lotManagementRouter,
  visualInspectionRouter,
  correctiveActionRouter,
  haccpPlanVerificationRouter,
  hazardAnalysisRouter,
  internalAuditRouter,
  nonconformingProductRouter,
  recallSimulationRouter,
  supplierAuditRouter,
  traceabilityRouter,
  metalDetectionRouter,
  ccpMonitoringRouter,
  f3DashboardRouter,
  f3TrendsRouter,
} from "../haccp";

export const haccpRouterMap = {
  ccp: ccpRouter,
  ccpForm: ccpFormRouter,
  ccpSchedule: ccpScheduleRouter,
  ccpTemplate: ccpTemplateRouter,
  ccpMonitoring: ccpMonitoringRouter,
  inspection: inspectionRouter,
  visualInspection: visualInspectionRouter,
  finishedProductInspection: finishedProductInspectionRouter,
  haccpIntegration: haccpIntegrationRouter,
  lotManagement: lotManagementRouter,
  hazardAnalysis: hazardAnalysisRouter,
  haccpPlanVerification: haccpPlanVerificationRouter,
  internalAudit: internalAuditRouter,
  nonconformingProduct: nonconformingProductRouter,
  recallSimulation: recallSimulationRouter,
  supplierAudit: supplierAuditRouter,
  // ⚠️ 'correctiveAction' 키는 _root 에서 뒤에 펼치는 coreMesMap(공통 CAPA h_corrective_actions) 이 덮어쓴다 — 이 줄은 런타임에 쓰이지 않는다.
  //    식품 CAR(h_corrective_action_requests, CCP 이탈 연동) 화면은 trpc.food.correctiveAction 으로 연결 (2-c, 2026-10-14)
  correctiveAction: correctiveActionRouter,
  traceability: traceabilityRouter,
  metalDetection: metalDetectionRouter,
  f3Dashboard: f3DashboardRouter,
  f3Trends: f3TrendsRouter,
} as const;
