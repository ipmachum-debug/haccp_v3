// accounting 도메인 라우터 모음
export { accountingRouter } from "./accounting.router";
export { accountingDailyRouter } from "./accountingDaily.router";
export { accountingDocumentsRouter } from "./accountingDocuments.router";
export { accountingMonthlyRouter } from "./accountingMonthly.router";
export { apLedgerRouter } from "./apLedger.router";
export { arLedgerRouter } from "./arLedger.router";
export { communicationLogsRouter } from "./communicationLogs.router";
export { matchingRulesRouter } from "./matchingRules.router";
export { financialReportsRouter } from "./financialReports.router";

// v2-rebuild: 개별 파일에서 이동
export { expenseRouter } from "./expense.router";
export { default as expenseUploadRouter } from "./expenseUpload.router";
export { bankAccountRouter } from "./bankAccount.router";
export { bankTransactionRouter } from "./bankTransaction.router";
export { bankTransactionBulkRouter } from "./bankTransactionBulk.router";
export { accountingAccountsRouter } from "./accountingAccounts.router";
export { accountCategoriesRouter } from "./accountCategories.router";
export { inventoryAccountingRouter } from "./inventoryAccounting.router";
// Phase A (2026-04-14): 발주/구매 관리
export { purchaseOrderRouter } from "./purchaseOrder.router";
