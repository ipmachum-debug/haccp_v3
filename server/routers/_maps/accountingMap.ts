/**
 * 회계 도메인 라우터 매핑 — _root.ts 분해 (Top 10 #6, 2026-04-19)
 *
 * AppRouter 분해 전략:
 *  - 기존: _root.ts 가 318개 라우터 직접 import + appRouter 안에 flat 나열 (413줄)
 *  - 이후: 도메인별 map 파일로 분리, _root.ts 에서 spread 로 합침 → 타입 트리 깊이 감소
 *
 * 주의: 클라이언트 API 경로는 유지됨 (`trpc.accounting.xxx`)
 */
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
  hrManagementRouter,
  purchaseReturnRouter,
  recurringTransactionRouter,
  changeLogRouter,
  aiErpRouter,
} from "../accounting";

export const accountingRouterMap = {
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
  accountingAccountCategories: accountCategoriesRouter, // alias
  inventoryAccounting: inventoryAccountingRouter,
  // Phase A (2026-04-14)
  purchaseOrder: purchaseOrderRouter,
  // Phase B (2026-04-14)
  partnerPrice: partnerPriceRouter,
  // Phase C (2026-04-14)
  quotation: quotationRouter,
  taxInvoice: taxInvoiceRouter,
  journalEntry: journalEntryRouter,
  vatManagement: vatManagementRouter,
  cashFlow: cashFlowRouter,
  fixedAsset: fixedAssetRouter,
  budget: budgetRouter,
  partnerCredit: partnerCreditRouter,
  payroll: payrollRouter,
  hr: hrManagementRouter,
  purchaseReturn: purchaseReturnRouter,
  recurring: recurringTransactionRouter,
  changeLog: changeLogRouter,
  aiErp: aiErpRouter,
  popbillSettings: popbillSettingsRouter,
} as const;
