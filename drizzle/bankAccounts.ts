import {mysqlTable, bigint, varchar, text, timestamp, mysqlEnum, index, int, decimal} from "drizzle-orm/mysql-core";
import { tenants } from '../schema_main';

/**
 * 은행 계좌 관리 테이블
 * 회사의 은행 계좌 정보 관리
 */
export const bankAccounts = mysqlTable("bank_accounts", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  
  // 기본 정보
  bankName: varchar("bank_name", { length: 100 }).notNull(), // 은행명 (예: 신한은행, 국민은행)
  accountNo: varchar("account_no", { length: 100 }).notNull(), // 계좌번호
  accountName: varchar("account_name", { length: 200 }), // 예금주명
  
  // 추가 정보
  accountType: mysqlEnum("account_type", ["checking", "savings", "investment", "other"]).default("checking").notNull(), // 계좌 유형
  currency: varchar("currency", { length: 3 }).default("KRW").notNull(), // 통화 (KRW, USD, etc.)
  
  // 회계 연동
  defaultAccountingAccountId: bigint("default_accounting_account_id", { mode: "number" }), // 기본 계정 과목 (자동 매칭 시 사용, accounting_accounts.id 참조)
  
  // 상태 관리
  isActive: mysqlEnum("is_active", ["Y", "N"]).default("Y").notNull(), // 활성화 여부
  
  // 메모
  notes: text("notes"), // 계좌 관련 메모
  
  // 생성 정보
  createdBy: bigint("created_by", { mode: "number" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  
  // 수정 정보
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  // 인덱스
  tenantIdIdx: index("idx_ba_tenant_id").on(table.tenantId),
  isActiveIdx: index("idx_ba_is_active").on(table.isActive),
}));

/**
 * 은행 거래 내역 테이블
 * 은행 계좌의 입출금 거래 내역 관리
 */
export const bankTransactions = mysqlTable("bank_transactions", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  bankAccountId: bigint("bank_account_id", { mode: "number" }).notNull().references(() => bankAccounts.id),
  
  // 거래 정보
  transactionDate: timestamp("tx_date").notNull(), // 거래일시 (DB 컬럼: tx_date)
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(), // 거래금액
  balance: decimal("balance", { precision: 15, scale: 2 }), // 거래 후 잔액
  description: varchar("description", { length: 400 }), // 거래 적요/메모
  memo: varchar("notes", { length: 255 }), // 추가 메모 (DB 컬럼: notes)
  
  // 거래 유형
  transactionType: mysqlEnum("transaction_type", ["deposit", "withdrawal"]).notNull(), // 입금/출금
  
  // 상대방 정보
  counterpartyText: varchar("counterparty_text", { length: 255 }), // 거래 상대방 이름

  // 회계 연동 (계정 과목 매칭)
  accountingAccountId: bigint("accounting_account_id", { mode: "number" }), // 매칭된 계정 과목
  matchingStatus: mysqlEnum("match_status", ["unmatched", "partial", "matched"]).default("unmatched").notNull(), // 매칭 상태
  matchedBy: bigint("matched_by", { mode: "number" }), // 매칭 작업자 ID
  matchedAt: timestamp("matched_at"), // 매칭 일시
  matchedPartnerId: bigint("matched_partner_id", { mode: "number" }), // 매칭된 거래처 ID
  matchedLedgerType: varchar("matched_ledger_type", { length: 50 }), // 'ap', 'ar', 'manual'
  matchedLedgerId: bigint("matched_ledger_id", { mode: "number" }), // apLedger.id, arLedger.id, etc.
  
  // 고액 거래 플래그
  isLargeAmount: mysqlEnum("is_high_amount", ["Y", "N"]).default("N").notNull(), // 고액 거래 여부 (5,000,000원 이상)
  
  // 승인 워크플로우
  approvalStatus: mysqlEnum("approval_status", ["pending", "approved", "rejected"]).default("pending").notNull(), // 승인 상태
  approvedBy: bigint("approved_by", { mode: "number" }), // 승인자 ID
  approvedAt: timestamp("approved_at"), // 승인 일시
  rejectionReason: text("rejection_reason"), // 반려 사유
  
  // 생성 정보
  createdBy: bigint("created_by", { mode: "number" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  
  // 수정 정보
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  // 인덱스 최적화
  tenantIdIdx: index("idx_bt_tenant_id").on(table.tenantId),
  bankAccountIdIdx: index("idx_bt_bank_account_id").on(table.bankAccountId),
  txDateIdx: index("idx_bt_tx_date").on(table.transactionDate),
  matchStatusIdx: index("idx_bt_match_status").on(table.matchingStatus),
  approvalStatusIdx: index("idx_bt_approval_status").on(table.approvalStatus),
  isHighAmountIdx: index("idx_bt_is_high_amount").on(table.isLargeAmount),
  // 복합 인덱스 (필터링 + 정렬 최적화)
  bankAccountTxDateIdx: index("idx_bt_account_txdate").on(table.bankAccountId, table.transactionDate),
}));

/**
 * 은행 거래 자동 매칭 규칙 테이블
 * 키워드, 금액, 패턴 기반 자동 매칭 규칙 관리 및 학습
 */
export const bankTransactionMatchingRules = mysqlTable("bank_transaction_matching_rules", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  
  // 규칙 정보
  ruleName: varchar("rule_name", { length: 255 }).notNull(), // 규칙 이름 (예: "급여 자동 매칭")
  ruleType: mysqlEnum("rule_type", ["keyword", "amount", "pattern", "combined"]).notNull(), // 규칙 유형
  
  // 조건 (JSON 형태)
  conditionJson: text("condition_json").notNull(), 
  // 예: { "keyword": "급여", "amountMin": 1000000, "amountMax": 5000000, "transactionType": "withdrawal" }
  
  // 매칭 대상
  accountingAccountId: bigint("accounting_account_id", { mode: "number" }).notNull(), // 매칭할 계정 과목 (accounting_accounts.id 참조)
  
  // 우선순위
  priority: int("priority").default(0).notNull(), // 높을수록 우선 (동일 조건 시 우선순위 높은 규칙 적용)
  
  // 통계 (학습 데이터)
  matchCount: int("match_count").default(0).notNull(), // 매칭 성공 횟수
  lastMatchedAt: timestamp("last_matched_at"), // 마지막 매칭 일시
  
  // 상태
  isActive: mysqlEnum("is_active", ["Y", "N"]).default("Y").notNull(), // 활성화 여부
  
  // 생성 정보
  createdBy: bigint("created_by", { mode: "number" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  
  // 수정 정보
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  // 인덱스
  tenantIdIdx: index("idx_btmr_tenant_id").on(table.tenantId),
  isActiveIdx: index("idx_btmr_is_active").on(table.isActive),
  priorityIdx: index("idx_btmr_priority").on(table.priority),
}));

export type BankAccount = typeof bankAccounts.$inferSelect;
export type NewBankAccount = typeof bankAccounts.$inferInsert;

export type BankTransaction = typeof bankTransactions.$inferSelect;
export type NewBankTransaction = typeof bankTransactions.$inferInsert;

export type BankTransactionMatchingRule = typeof bankTransactionMatchingRules.$inferSelect;
export type NewBankTransactionMatchingRule = typeof bankTransactionMatchingRules.$inferInsert;
