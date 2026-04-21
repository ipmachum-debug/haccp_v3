/**
 * core-erp/accounting/journal — 분개(Journal) 공통 엔진
 *
 * 이 파일은 core-erp 레이어의 **canonical** 분개 모듈.
 * 기존 `server/db/accounting/journalHelper.ts` 는 하위 호환 façade 로 유지.
 *
 * Strangler Fig 이주 가이드:
 *   신규 코드: `import { ... } from "../../core-erp/accounting/journal"` 사용
 *   레거시 코드: 다음 PR 라운드에 점진 이주
 *
 * 배경:
 *   docs/architecture/00-layers.md
 *   docs/architecture/02-naming-conventions.md
 *   ADR-001-shared-kernel.md
 */

export {
  SYSTEM_ACCOUNTS,
  type SystemAccountCode,
} from "../../../drizzle/schema/accountingAccounts";

export {
  resolveSystemAccount,
  insertJournalLine,
  getPaymentSystemAccount,
  ensureSystemAccounts,
  postExpenseVoucher,
  cancelExpenseJournal,
  postBankTransactionJournal,
  cancelBankTransactionJournal,
} from "../../db/accounting/journalHelper";
