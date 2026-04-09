// _root.ts - appRouter 조립 전용 (비즈니스 로직 없음)
// 모든 라우터를 import하고 appRouter로 조립만 수행

import { router, tenantRequiredProcedure } from "../_core/trpc";
import { z } from "zod";

// ── 도메인별 라우터 (인라인에서 분리됨) ──
import { accountingRouter, accountingDailyRouter, accountingDocumentsRouter, accountingMonthlyRouter, apLedgerRouter, arLedgerRouter, communicationLogsRouter, matchingRulesRouter, financialReportsRouter } from "./accounting";
import { authRouter } from "./auth";
import { checklistRouter, checklistStatsRouter, checklistTemplateRouter, equipmentRouter } from "./checklist";
import { dashboardRouter, pipelineRouter } from "./dashboard";
import { ccpRouter, ccpFormRouter, ccpScheduleRouter, ccpTemplateRouter, finishedProductInspectionRouter, haccpIntegrationRouter, inspectionRouter, lotManagementRouter, visualInspectionRouter } from "./haccp";
import { inventoryRouter, materialLedgerRouter, stockAlertsRouter } from "./inventory";
import { categoriesRouter, groupRouter, materialRouter, partnersRouter, supplierRouter, supplierEvaluationRouter, templateSettingsRouter } from "./master";
import { batchRouter, batchApprovalRouter, batchCostRouter, batchScheduleRouter, costAnalysisRouter, costSavingAIRouter, dailyReportRouter, intermediateRouter, mfReportRouter, productRouter, productionRouter, productionDashboardRouter, productionPredictionRouter, productionScheduleRouter, recipeRouter, recipeApprovalRouter, recipeManagementRouter, scheduleOptimizationRouter, aiProductionParserRouter } from "./production";
import { superadminRouter } from "./superadmin";
import { approvalRouter, auditLogRouter, excelRouter, excelImportRouter, favoritesRouter, notificationRouter, notificationSettingsRouter, reportRouter, schedulerRouter, tenantRouter, uploadHistoryRouter, userRouter, supportRouter, subscriptionRouter, delegationRouter, workflowRouter, simplifiedImportRouter } from "./system";

// ── 기존 개별 라우터 파일 ──
import { accountCategoriesRouter } from "./accountCategoriesRouter";
import { accountingAccountsRouter } from "./accountingAccounts";
import { adminRouter } from "./admin";
import { adminEmployeeRouter } from "./adminEmployee";
import { aiRouter } from "../routers-ai";
import { auditLogsRouter } from "./auditLogs";
import { boardRouter } from "./board.router";
import { bankAccountRouter } from "./bankAccount";
import { bankTransactionRouter } from "./bankTransaction";
import { bankTransactionBulkRouter } from "./bankTransactionBulk";
import { bannerRouter } from "./banner_router";
import { calibrationRouter } from "./calibration";
import { ccpMonitoringRouter } from "./ccpMonitoring";
import { checklistInstanceRouter } from "./checklistInstance";
import { checklistScheduleRouter } from "./checklistSchedule";
import { correctiveActionRouter } from "./correctiveAction";
import { dailyLogRouter } from "./dailyLogRouter";
import { documentApprovalRouter } from "./documentApproval";
import { documentPrintRouter } from "./documentPrint";
import { employeeRouter } from "./employee";
import { expenseRouter } from "./expense";
import { haccpPlanVerificationRouter } from "./haccpPlanVerification";
import { hazardAnalysisRouter } from "./hazardAnalysis";
import { healthCertificateRouter } from "./healthCertificate";
import { hygieneRouter } from "./hygiene";
import { internalAuditRouter } from "./internalAudit";
import { inventoryAccountingRouter } from "./inventoryAccounting";
import { itemMasterRouter, productSkuRouter } from "./itemMasterRouter";
import { metalDetectionRouter } from "./metalDetection";
import { monthlyLogsRouter } from "./monthlyLogs";
import { nonconformingProductRouter } from "./nonconformingProduct";
import { opscoreSyncRouter } from "../routers-opscore-sync";
import { organizationRouter } from "./organization";
import { pestControlRouter } from "./pestControl";
import { qualityChecklistRouter } from "./qualityChecklist";
import { recallSimulationRouter } from "./recall";
import { reportsRouter } from "./reports";
import { subscriptionRouter } from "./subscription";
import { superadminApprovalRouter } from "./superadminApproval";
import { superadminDashboardRouter } from "./superadminDashboard";
import { supplierAuditRouter } from "./supplierAudit";
import { systemRouter } from "../_core/systemRouter";
import { tenantsRouter } from "./tenants";
import { tenantsPublicRouter } from "./tenantsPublic";
import { traceabilityRouter } from "./traceability";
import { trainingRouter } from "./training";
import { dailyTrainingRouter } from "./dailyTraining";
import { serverMonitorRouter } from "./serverMonitor.router";
import { scanChecklistRouter } from "./scanChecklist.router";
import { auditReportRouter } from "./auditReport.router";
import { weeklyLogsRouter } from "./weeklyLogs";
import { yearlyLogsRouter } from "./yearlyLogs";
import {
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
  genericChecklistRouter
} from "./checklists";

// ════════════════════════════════════════════
// appRouter 조립
// ════════════════════════════════════════════
export const appRouter = router({
  // ── superadmin ──
  superadmin: superadminRouter,
  system: systemRouter,
  // ── auth ──
  auth: authRouter,
  // ── production ──
  batch: batchRouter,
  batchApproval: batchApprovalRouter,
  batchCost: batchCostRouter,
  batchSchedule: batchScheduleRouter,
  product: productRouter,
  recipe: recipeRouter,
  recipeManagement: recipeManagementRouter,
  costAnalysis: costAnalysisRouter,
  // ── haccp ──
  ccp: ccpRouter,
  // ── inventory ──
  inventory: inventoryRouter,
  // ── production ──
  intermediate: intermediateRouter,
  mfReport: mfReportRouter,
  // ── dashboard ──
  dashboard: dashboardRouter,
  // ── haccp ──
  ccpSchedule: ccpScheduleRouter,
  // ── system ──
  report: reportRouter,
  notification: notificationRouter,
  user: userRouter,
  support: supportRouter,
  opscoreSync: opscoreSyncRouter,
  tenant: tenantRouter,
  // ── checklist ──
  checklistTemplate: checklistTemplateRouter,
  // ── system ──
  auditLog: auditLogRouter,
  excel: excelRouter,
  excelImport: excelImportRouter,
  simplifiedImport: simplifiedImportRouter,
  // ── master ──
  material: materialRouter,
  // ── haccp ──
  inspection: inspectionRouter,
  // ── checklist ──
  checklist: checklistRouter,
  // ── haccp ──
  ccpTemplate: ccpTemplateRouter,
  // ── master ──
  supplier: supplierRouter,
  // ── production ──
  production: productionRouter,
  // ── system ──
  approval: approvalRouter,
  subscription: subscriptionRouter,
  delegation: delegationRouter,
  workflow: workflowRouter,
  notificationSettings: notificationSettingsRouter,
  hazardAnalysis: hazardAnalysisRouter,
  haccpPlanVerification: haccpPlanVerificationRouter,
  internalAudit: internalAuditRouter,
  nonconformingProduct: nonconformingProductRouter,
  recallSimulation: recallSimulationRouter,
  supplierAudit: supplierAuditRouter,
  correctiveAction: correctiveActionRouter,
  training: trainingRouter,
  dailyTraining: dailyTrainingRouter,
  serverMonitor: serverMonitorRouter,
  scanChecklist: scanChecklistRouter,
  auditReport: auditReportRouter,
  reports: reportsRouter,
  traceability: traceabilityRouter,
  admin: adminRouter,
  tenants: tenantsRouter,
  superadminApproval: superadminApprovalRouter,
  superadminDashboard: superadminDashboardRouter,
  auditLogs: auditLogsRouter,
  adminEmployee: adminEmployeeRouter,
  tenantsPublic: tenantsPublicRouter,
  subscription: subscriptionRouter,
  banner: bannerRouter,
  scheduler: schedulerRouter,
  favorites: favoritesRouter,
  qualityChecklist: qualityChecklistRouter,
  checklistSchedule: checklistScheduleRouter,
  checklistInstance: checklistInstanceRouter,
  ccpMonitoring: ccpMonitoringRouter,
  metalDetection: metalDetectionRouter,
  // ── checklist ──
  equipment: equipmentRouter,
  checklistStats: checklistStatsRouter,
  // ── production ──
  productionSchedule: productionScheduleRouter,
  dailyReport: dailyReportRouter,
  productionDashboard: productionDashboardRouter,
  productionPrediction: productionPredictionRouter,
  costSavingAI: costSavingAIRouter,
  recipeApproval: recipeApprovalRouter,
  scheduleOptimization: scheduleOptimizationRouter,
  aiProductionParser: aiProductionParserRouter,
  employee: employeeRouter,
  healthCertificate: healthCertificateRouter,
  calibration: calibrationRouter,
  hygiene: hygieneRouter,
  pestControl: pestControlRouter,
  checklistDashboard: checklistDashboardRouter,
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
  organization: organizationRouter,
  itemMaster: itemMasterRouter,
  productSku: productSkuRouter,
  accountingAccounts: accountingAccountsRouter,
  expense: expenseRouter,
  accountCategories: accountCategoriesRouter,
  accountingAccountCategories: accountCategoriesRouter,
  bankAccount: bankAccountRouter,
  board: boardRouter,
  bankTransaction: bankTransactionRouter,
  bankTransactionBulk: bankTransactionBulkRouter,
  // ── master ──
  templateSettings: templateSettingsRouter,
  supplierEvaluation: supplierEvaluationRouter,
  // ── system ──
  uploadHistory: uploadHistoryRouter,
  // ── master ──
  group: groupRouter,
  // ── accounting ──
  accounting: accountingRouter,
  // ── master ──
  partners: partnersRouter,
  // ── accounting ──
  apLedger: apLedgerRouter,
  arLedger: arLedgerRouter,
  communicationLogs: communicationLogsRouter,
  matchingRules: matchingRulesRouter,
  accountingDaily: accountingDailyRouter,
  accountingMonthly: accountingMonthlyRouter,
  financialReports: financialReportsRouter,
  // ── haccp ──
  haccpIntegration: haccpIntegrationRouter,
  // ── accounting ──
  accountingDocuments: accountingDocumentsRouter,
  // ── master ──
  categories: categoriesRouter,
  inventoryAccounting: inventoryAccountingRouter,
  // ── inventory ──
  stockAlerts: stockAlertsRouter,
  weeklyLog: weeklyLogsRouter,
  monthlyLog: monthlyLogsRouter,
  yearlyLog: yearlyLogsRouter,
  dailyLog: dailyLogRouter,
  documentApproval: documentApprovalRouter,
  documentPrint: documentPrintRouter,
  // ── dashboard ──
  pipeline: pipelineRouter,
  // ── inventory ──
  materialLedger: materialLedgerRouter,
  // ── haccp ──
  ccpForm: ccpFormRouter,
  visualInspection: visualInspectionRouter,
  finishedProductInspection: finishedProductInspectionRouter,
  lotManagement: lotManagementRouter,
  // ── ai (실제 LLM 연동) ──
  ai: aiRouter,
  // ── company info (stub) ──
  companyInfo: router({
    get: tenantRequiredProcedure.query(async () => ({ companyName: '', businessNumber: '', representative: '', address: '', phone: '', email: '' })),
    update: tenantRequiredProcedure.input(z.any()).mutation(async () => ({ success: true })),
  }),
});

export type AppRouter = typeof appRouter;
