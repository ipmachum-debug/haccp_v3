/**
 * _root.ts - appRouter 조립 전용 (비즈니스 로직 없음)
 * v2-rebuild: 도메인별 index.ts에서 일괄 import → 깔끔한 구조
 */

import { router, tenantRequiredProcedure } from "../_core/trpc";
import { z } from "zod";

// ══════════════════════════════════════════
// 도메인별 라우터 import (index.ts barrel)
// ══════════════════════════════════════════

// ── accounting ──
import {
  accountingRouter,
  accountingDailyRouter,
  accountingDocumentsRouter,
  accountingMonthlyRouter,
  apLedgerRouter,
  arLedgerRouter,
  communicationLogsRouter,
  matchingRulesRouter,
  financialReportsRouter,
  expenseRouter,
  bankAccountRouter,
  bankTransactionRouter,
  bankTransactionBulkRouter,
  accountingAccountsRouter,
  accountCategoriesRouter,
  inventoryAccountingRouter,
  purchaseOrderRouter,
  partnerPriceRouter,
  quotationRouter,
  taxInvoiceRouter,
  popbillSettingsRouter,
  journalEntryRouter,
  vatManagementRouter,
  cashFlowRouter,
  fixedAssetRouter,
  budgetRouter,
  partnerCreditRouter,
  payrollRouter,
} from "./accounting";

// ── auth ──
import { authRouter, tenantsPublicRouter } from "./auth";

// ── checklist ──
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
} from "./checklist";

// ── dashboard ──
import { dashboardRouter, pipelineRouter } from "./dashboard";

// ── haccp ──
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
} from "./haccp";

// ── inventory ──
import { inventoryRouter, materialLedgerRouter, stockAlertsRouter } from "./inventory";

// ── master ──
import {
  categoriesRouter,
  groupRouter,
  materialRouter,
  partnersRouter,
  supplierRouter,
  supplierEvaluationRouter,
  templateSettingsRouter,
  itemMasterRouter,
  productSkuRouter,
} from "./master";

// ── production ──
import {
  batchRouter,
  batchApprovalRouter,
  batchCostRouter,
  batchScheduleRouter,
  costAnalysisRouter,
  costSavingAIRouter,
  dailyReportRouter,
  intermediateRouter,
  mfReportRouter,
  productRouter,
  productionRouter,
  productionDashboardRouter,
  productionPredictionRouter,
  productionScheduleRouter,
  recipeRouter,
  recipeApprovalRouter,
  recipeManagementRouter,
  scheduleOptimizationRouter,
  aiProductionParserRouter,
  dailyLogRouter,
  weeklyLogsRouter,
  monthlyLogsRouter,
  yearlyLogsRouter,
} from "./production";

// ── superadmin ──
import {
  superadminRouter,
  superadminApprovalRouter,
  superadminDashboardRouter,
} from "./superadmin";

// ── system ──
import {
  approvalRouter,
  auditLogRouter,
  excelRouter,
  excelImportRouter,
  favoritesRouter,
  notificationRouter,
  notificationSettingsRouter,
  reportRouter,
  schedulerRouter,
  tenantRouter,
  uploadHistoryRouter,
  userRouter,
  supportRouter,
  subscriptionRouter,
  subscriptionPublicRouter,
  delegationRouter,
  workflowRouter,
  simplifiedImportRouter,
  adminRouter,
  adminEmployeeRouter,
  auditLogsRouter,
  auditReportRouter,
  bannerRouter,
  boardRouter,
  documentApprovalRouter,
  documentPrintRouter,
  employeeRouter,
  organizationRouter,
  reportsRouter,
  serverMonitorRouter,
  trainingRouter,
  dailyTrainingRouter,
  tenantsRouter,
  iotRouter,
} from "./system";

// ── 독립 라우터 (외부 파일) ──
import { aiRouter } from "../routers-ai";
import { opscoreSyncRouter } from "../routers-opscore-sync";
import { systemRouter } from "../_core/systemRouter";

// ══════════════════════════════════════════
// appRouter 조립
// ══════════════════════════════════════════
export const appRouter = router({
  // ── superadmin ──
  superadmin: superadminRouter,
  superadminApproval: superadminApprovalRouter,
  superadminDashboard: superadminDashboardRouter,
  system: systemRouter,

  // ── auth ──
  auth: authRouter,
  tenantsPublic: tenantsPublicRouter,

  // ── production ──
  batch: batchRouter,
  batchApproval: batchApprovalRouter,
  batchCost: batchCostRouter,
  batchSchedule: batchScheduleRouter,
  product: productRouter,
  recipe: recipeRouter,
  recipeManagement: recipeManagementRouter,
  recipeApproval: recipeApprovalRouter,
  costAnalysis: costAnalysisRouter,
  costSavingAI: costSavingAIRouter,
  intermediate: intermediateRouter,
  mfReport: mfReportRouter,
  production: productionRouter,
  productionSchedule: productionScheduleRouter,
  productionDashboard: productionDashboardRouter,
  productionPrediction: productionPredictionRouter,
  scheduleOptimization: scheduleOptimizationRouter,
  aiProductionParser: aiProductionParserRouter,
  dailyReport: dailyReportRouter,
  dailyLog: dailyLogRouter,
  weeklyLog: weeklyLogsRouter,
  monthlyLog: monthlyLogsRouter,
  yearlyLog: yearlyLogsRouter,

  // ── haccp ──
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
  correctiveAction: correctiveActionRouter,
  traceability: traceabilityRouter,
  metalDetection: metalDetectionRouter,

  // ── inventory ──
  inventory: inventoryRouter,
  materialLedger: materialLedgerRouter,
  stockAlerts: stockAlertsRouter,

  // ── accounting ──
  accounting: accountingRouter,
  accountingDaily: accountingDailyRouter,
  accountingMonthly: accountingMonthlyRouter,
  accountingDocuments: accountingDocumentsRouter,
  apLedger: apLedgerRouter,
  arLedger: arLedgerRouter,
  communicationLogs: communicationLogsRouter,
  matchingRules: matchingRulesRouter,
  financialReports: financialReportsRouter,
  expense: expenseRouter,
  bankAccount: bankAccountRouter,
  bankTransaction: bankTransactionRouter,
  bankTransactionBulk: bankTransactionBulkRouter,
  accountingAccounts: accountingAccountsRouter,
  accountCategories: accountCategoriesRouter,
  accountingAccountCategories: accountCategoriesRouter,
  inventoryAccounting: inventoryAccountingRouter,
  // Phase A (2026-04-14): 발주/구매 관리
  purchaseOrder: purchaseOrderRouter,
  // Phase B (2026-04-14): 거래처별 단가표
  partnerPrice: partnerPriceRouter,
  // Phase C (2026-04-14): 견적서
  quotation: quotationRouter,
  // Phase C (2026-04-14): 세금계산서 + 팝빌
  taxInvoice: taxInvoiceRouter,
  journalEntry: journalEntryRouter,
  vatManagement: vatManagementRouter,
  cashFlow: cashFlowRouter,
  fixedAsset: fixedAssetRouter,
  budget: budgetRouter,
  partnerCredit: partnerCreditRouter,
  payroll: payrollRouter,
  popbillSettings: popbillSettingsRouter,

  // ── dashboard ──
  dashboard: dashboardRouter,
  pipeline: pipelineRouter,

  // ── master ──
  material: materialRouter,
  supplier: supplierRouter,
  supplierEvaluation: supplierEvaluationRouter,
  partners: partnersRouter,
  categories: categoriesRouter,
  group: groupRouter,
  templateSettings: templateSettingsRouter,
  itemMaster: itemMasterRouter,
  productSku: productSkuRouter,

  // ── checklist ──
  checklist: checklistRouter,
  checklistTemplate: checklistTemplateRouter,
  checklistStats: checklistStatsRouter,
  checklistDashboard: checklistDashboardRouter,
  checklistSchedule: checklistScheduleRouter,
  checklistInstance: checklistInstanceRouter,
  equipment: equipmentRouter,
  qualityChecklist: qualityChecklistRouter,
  scanChecklist: scanChecklistRouter,
  calibration: calibrationRouter,
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

  // ── system ──
  admin: adminRouter,
  adminEmployee: adminEmployeeRouter,
  user: userRouter,
  tenant: tenantRouter,
  tenants: tenantsRouter,
  approval: approvalRouter,
  notification: notificationRouter,
  notificationSettings: notificationSettingsRouter,
  report: reportRouter,
  auditLog: auditLogRouter,
  auditLogs: auditLogsRouter,
  auditReport: auditReportRouter,
  excel: excelRouter,
  excelImport: excelImportRouter,
  simplifiedImport: simplifiedImportRouter,
  support: supportRouter,
  subscription: subscriptionRouter,
  subscriptionPublic: subscriptionPublicRouter,
  delegation: delegationRouter,
  workflow: workflowRouter,
  favorites: favoritesRouter,
  scheduler: schedulerRouter,
  uploadHistory: uploadHistoryRouter,
  banner: bannerRouter,
  board: boardRouter,
  documentApproval: documentApprovalRouter,
  documentPrint: documentPrintRouter,
  employee: employeeRouter,
  organization: organizationRouter,
  reports: reportsRouter,
  serverMonitor: serverMonitorRouter,
  training: trainingRouter,
  dailyTraining: dailyTrainingRouter,
  iot: iotRouter,

  // ── ai (LLM 연동) ──
  ai: aiRouter,
  opscoreSync: opscoreSyncRouter,

  // ── company info (stub) ──
  // ★ 2026-04-13: companyInfo 라우터 실제 구현 연결 (stub 제거)
  //   - 거래명세표 PDF 에서 회사명/사업자번호/주소/대표자/전화 자동 사용
  //   - 시스템관리 > 시스템 설정 탭의 회사 정보 폼과 연동
  companyInfo: router({
    get: tenantRequiredProcedure.query(async ({ ctx }) => {
      const { getCompanyInfo } = await import("../db/system/companyInfo");
      return await getCompanyInfo(ctx.tenantId);
    }),
    update: tenantRequiredProcedure
      .input(z.object({
        companyName: z.string().optional(),
        companyBusinessNumber: z.string().optional(),
        companyAddress: z.string().optional(),
        companyRepresentative: z.string().optional(),
        companyPhone: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { updateCompanyInfo } = await import("../db/system/companyInfo");
        await updateCompanyInfo(input, ctx.tenantId);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
