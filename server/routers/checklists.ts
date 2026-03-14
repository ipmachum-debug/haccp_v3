/**
 * HACCP 체크리스트 라우터 - Barrel file
 * 개별 라우터 파일들은 server/routers/checklist/ 디렉토리에 위치
 */

// 13 sub-routers from checklist/ directory
export { checklistDashboardRouter } from "./checklist/checklistDashboard.router";
export { waterQualityTestRouter } from "./checklist/waterQualityTest.router";
export { airCompressorRouter } from "./checklist/airCompressor.router";
export { validityEvaluationRouter } from "./checklist/validityEvaluation.router";
export { personalHygieneCheckRouter } from "./checklist/personalHygieneCheck.router";
export { waterUsageCheckRouter } from "./checklist/waterUsageCheck.router";
export { equipmentCleaningRecordRouter } from "./checklist/equipmentCleaningRecord.router";
export { foreignMaterialRecordRouter } from "./checklist/foreignMaterialRecord.router";
export { refrigerationCheckRouter } from "./checklist/refrigerationCheck.router";
export { packagingStorageRecordRouter } from "./checklist/packagingStorageRecord.router";
export { qualityIssueRecordRouter } from "./checklist/qualityIssueRecord.router";
export { capaRecordRouter } from "./checklist/capaRecord.router";
export { genericChecklistRouter } from "./checklist/genericChecklist.router";

// Existing routers from checklist/ directory
export { checklistRouter } from "./checklist/checklist.router";
export { checklistStatsRouter } from "./checklist/checklistStats.router";
export { checklistTemplateRouter } from "./checklist/checklistTemplate.router";
export { equipmentRouter } from "./checklist/equipment.router";
