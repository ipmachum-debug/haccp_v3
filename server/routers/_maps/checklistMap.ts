/**
 * 체크리스트 도메인 라우터 매핑 — _root.ts 분해 (2026-04-19)
 */
import {
  checklistRouter,
  checklistStatsRouter,
  checklistTemplateRouter,
  equipmentRouter,
  checklistDashboardRouter,
  waterQualityTestRouter,
  airCompressorRouter,
  validityEvaluationRouter,
  personalHygieneCheckRouter,
  waterUsageCheckRouter,
  equipmentCleaningRecordRouter,
  foreignMaterialRecordRouter,
  refrigerationCheckRouter,
  packagingStorageRecordRouter,
  qualityIssueRecordRouter,
  capaRecordRouter,
  genericChecklistRouter,
  calibrationRouter,
  checklistInstanceRouter,
  checklistScheduleRouter,
  healthCertificateRouter,
  hygieneRouter,
  pestControlRouter,
  qualityChecklistRouter,
  scanChecklistRouter,
} from "../checklist";

export const checklistRouterMap = {
  checklist: checklistRouter,
  checklistTemplate: checklistTemplateRouter,
  checklistStats: checklistStatsRouter,
  checklistDashboard: checklistDashboardRouter,
  checklistSchedule: checklistScheduleRouter,
  checklistInstance: checklistInstanceRouter,
  equipment: equipmentRouter,
  qualityChecklist: qualityChecklistRouter,
  scanChecklist: scanChecklistRouter,
  // ⚠️ 레거시 HACCP 체크리스트 검교정 라우터.
  //   최상위 키를 'checklistCalibration' 로 분리 — coreMes.calibration(Y-4) 가
  //   _root.ts 에서 마지막에 spread 되어 'calibration' 키를 덮어쓰므로
  //   (checklist 의 listEquipments/createRecord 등이 런타임에서 사라졌던 문제).
  //   프론트: client/src/pages(components)/checklist/Calibration* → trpc.checklistCalibration.*
  checklistCalibration: calibrationRouter,
  healthCertificate: healthCertificateRouter,
  hygiene: hygieneRouter,
  pestControl: pestControlRouter,
  waterQualityTest: waterQualityTestRouter,
  airCompressor: airCompressorRouter,
  validityEvaluation: validityEvaluationRouter,
  personalHygieneCheck: personalHygieneCheckRouter,
  waterUsageCheck: waterUsageCheckRouter,
  equipmentCleaningRecord: equipmentCleaningRecordRouter,
  foreignMaterialRecord: foreignMaterialRecordRouter,
  refrigerationCheck: refrigerationCheckRouter,
  packagingStorageRecord: packagingStorageRecordRouter,
  qualityIssueRecord: qualityIssueRecordRouter,
  capaRecord: capaRecordRouter,
  genericChecklist: genericChecklistRouter,
} as const;
