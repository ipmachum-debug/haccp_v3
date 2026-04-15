// checklist 도메인 라우터 모음

// Existing routers
export { checklistRouter } from "./checklist.router";
export { checklistStatsRouter } from "./checklistStats.router";
export { checklistTemplateRouter } from "./checklistTemplate.router";
export { equipmentRouter } from "./equipment.router";

// HACCP checklist sub-routers (extracted from checklists.ts)
export { checklistDashboardRouter } from "./checklistDashboard.router";
export { waterQualityTestRouter } from "./waterQualityTest.router";
export { airCompressorRouter } from "./airCompressor.router";
export { validityEvaluationRouter } from "./validityEvaluation.router";
export { personalHygieneCheckRouter } from "./personalHygieneCheck.router";
export { waterUsageCheckRouter } from "./waterUsageCheck.router";
export { equipmentCleaningRecordRouter } from "./equipmentCleaningRecord.router";
export { foreignMaterialRecordRouter } from "./foreignMaterialRecord.router";
export { refrigerationCheckRouter } from "./refrigerationCheck.router";
export { packagingStorageRecordRouter } from "./packagingStorageRecord.router";
export { qualityIssueRecordRouter } from "./qualityIssueRecord.router";
export { capaRecordRouter } from "./capaRecord.router";
export { genericChecklistRouter } from "./genericChecklist.router";

// v2-rebuild: 개별 파일에서 이동
export { calibrationRouter } from "./calibration.router";
export { checklistInstanceRouter } from "./checklistInstance.router";
export { checklistScheduleRouter } from "./checklistSchedule.router";
export { healthCertificateRouter } from "./healthCertificate.router";
export { hygieneRouter } from "./hygiene.router";
export { pestControlRouter } from "./pestControl.router";
export { qualityChecklistRouter } from "./qualityChecklist.router";
export { scanChecklistRouter } from "./scanChecklist.router";
