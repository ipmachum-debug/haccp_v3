/**
 * schema_main 분할: 회계/거래처
 */
import {
  bigint, boolean, date, decimal, int, json,
  mysqlEnum, mysqlTable, text, timestamp, tinyint, varchar
} from "drizzle-orm/mysql-core";
import { tenants, users } from "./schema_main_core";

export const accountingCategories = mysqlTable("accounting_categories", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  name: varchar("name", { length: 100 }).notNull(),
  code: varchar("code", { length: 20 }).notNull().unique(), // 계정 코드 (예: 401, 501)
  type: mysqlEnum("type", ["income", "expense"]).notNull(),
  parentId: bigint("parent_id", { mode: "number" }), // 대분류/중분류 계층 구조
  description: text("description"),
  isActive: tinyint("is_active").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * [DEPRECATED] 구식 거래 내역 테이블 - income/expense 단식부기
 * → 신규 거래는 expense_journal_entries/expense_journal_lines + accounting_transactions 사용
 * @deprecated P4에서 데이터 마이그레이션 후 제거 예정
 */

export const accountingTransactions = mysqlTable("accounting_transactions", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  transactionDate: varchar("transaction_date", { length: 10 }).notNull(), // 거래 일자 (YYYY-MM-DD)
  type: mysqlEnum("type", ["income", "expense"]).notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(), // 금액
  categoryId: bigint("category_id", { mode: "number" }).notNull().references(() => accountingCategories.id),
  description: text("description"), // 거래 내용/메모
  referenceType: varchar("reference_type", { length: 50 }), // 연결 타입 (batch, supplier, etc.)
  referenceId: bigint("reference_id", { mode: "number" }), // 연결 ID
  createdBy: bigint("created_by", { mode: "number" }).notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * 일일 마감 테이블
 * 일별 재무 집계 (자동 생성)
 */

export const accountingDailyClose = mysqlTable("accounting_daily_close", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  closeDate: varchar("close_date", { length: 10 }).notNull().unique(), // 마감 일자 (YYYY-MM-DD)
  totalIncome: decimal("total_income", { precision: 15, scale: 2 }).default("0").notNull(), // 총 수입
  totalExpense: decimal("total_expense", { precision: 15, scale: 2 }).default("0").notNull(), // 총 지출
  netCashFlow: decimal("net_cash_flow", { precision: 15, scale: 2 }).default("0").notNull(), // 순현금흐름
  transactionCount: int("transaction_count").default(0).notNull(), // 거래 건수
  isLocked: tinyint("is_locked").default(0).notNull(), // 마감 확정 여부
  closedBy: bigint("closed_by", { mode: "number" }).references(() => users.id),
  closedAt: timestamp("closed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AccountingCategory = typeof accountingCategories.$inferSelect;
export type InsertAccountingCategory = typeof accountingCategories.$inferInsert;
export type AccountingTransaction = typeof accountingTransactions.$inferSelect;
export type InsertAccountingTransaction = typeof accountingTransactions.$inferInsert;
export type AccountingDailyClose = typeof accountingDailyClose.$inferSelect;
export type InsertAccountingDailyClose = typeof accountingDailyClose.$inferInsert;

// ============================================
// 회계 관리 v2 - 거래처 및 원장 (2026-01-30)
// ============================================

/**
 * 거래처 테이블 (공급업체, 고객사, 외주업체)
 * HACCP 기존 공급업체/고객사 데이터와 통합
 */

export const partners = mysqlTable("partners", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  partnerType: mysqlEnum("partner_type", ["supplier", "customer", "subcontractor"]).notNull(),
  bizNo: varchar("biz_no", { length: 50 }), // 사업자등록번호 (optional)
  supplierCode: varchar("supplier_code", { length: 50 }),
  supplierType: varchar("supplier_type", { length: 50 }),
  certifications: text("certifications"),
  rating: varchar("rating", { length: 20 }),
  companyName: varchar("company_name", { length: 255 }).notNull(),
  ceoName: varchar("ceo_name", { length: 100 }),
  contactPerson: varchar("contact_person", { length: 100 }),
  bizType: varchar("biz_type", { length: 255 }), // 업태
  bizItem: varchar("biz_item", { length: 255 }), // 종목
  address: varchar({ length: 500 }),
  phone: varchar({ length: 50 }),
  fax: varchar({ length: 50 }),
  email: varchar({ length: 320 }),
  bankName: varchar("bank_name", { length: 50 }), // 은행명
  bankAccount: varchar("bank_account", { length: 50 }), // 계좌번호
  // ★ 2026-04-14 Phase B: 거래처 고도화 필드
  grade: varchar("grade", { length: 20 }),                      // vip / standard / economy (자유 텍스트)
  paymentTermsDays: int("payment_terms_days"),                  // 결제 조건 일수 (예: 30, 60, 90)
  creditLimit: decimal("credit_limit", { precision: 15, scale: 2 }), // 여신 한도
  defaultDiscountRate: decimal("default_discount_rate", { precision: 5, scale: 2 }), // 기본 할인율 %
  isActive: tinyint("is_active").default(1).notNull(),
  // ★ 2026-04-22 Phase 2: B2C 플랫폼 정산 모듈 대응
  //   b2b          — 일반 B2B 거래처 (기본)
  //   b2c_platform — B2C 전자상거래 플랫폼 (옥션/지마켓/스마트스토어/쿠팡/11번가/카카오 등)
  //                  이 파트너의 매출은 분기별 플랫폼 정산 모듈에서 관리
  //   b2c_direct   — B2C 직접 판매 (자사몰·오프라인 매장 등, 향후 확장용)
  customerType: mysqlEnum("customer_type", ["b2b", "b2c_platform", "b2c_direct"]).default("b2b").notNull(),
  // ★ 2026-05-05 Partner CRM Phase 1 — 자유 custom field (JSON)
  metadata: json("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * 거래처 담당자 테이블
 */

export const partnerContacts = mysqlTable("partner_contacts", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  partnerId: bigint("partner_id", { mode: "number" }).notNull().references(() => partners.id),
  name: varchar({ length: 100 }),
  phone: varchar({ length: 50 }),
  email: varchar({ length: 320 }),
  role: varchar({ length: 100 }),
  isPrimary: tinyint("is_primary").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * 매입 원장 (Accounts Payable Ledger)
 * 공급업체로부터의 모든 매입 거래 기록
 */

export const apLedger = mysqlTable("ap_ledger", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  supplierPartnerId: bigint("supplier_partner_id", { mode: "number" }).notNull().references(() => partners.id),
  occurredAt: timestamp("occurred_at").notNull(),
  apEntryType: mysqlEnum("ap_entry_type", ["bill", "payment", "credit", "adjust"]).notNull(),
  amount: decimal({ precision: 18, scale: 2 }).notNull(),
  dueDate: date("due_date"), // Phase B (2026-04-14): 지급 만기일 (payment_terms_days 기반 자동 계산)
  refType: varchar("ref_type", { length: 50 }), // 'receiving', 'manual', etc.
  refId: bigint("ref_id", { mode: "number" }), // h_material_receivings.id, etc.
  memo: varchar({ length: 255 }),
  accountingAccountId: bigint("accounting_account_id", { mode: "number" }), // FK → accounting_accounts.id (system_code 기반 통합 테이블)
  createdBy: bigint("created_by", { mode: "number" }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * 매출 원장 (Accounts Receivable Ledger)
 * 고객사로의 모든 매출 거래 기록
 */

export const arLedger = mysqlTable("ar_ledger", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  customerPartnerId: bigint("customer_partner_id", { mode: "number" }).notNull().references(() => partners.id),
  occurredAt: timestamp("occurred_at").notNull(),
  arEntryType: mysqlEnum("ar_entry_type", ["debit", "payment", "credit", "writeoff", "adjust"]).notNull(),
  amount: decimal({ precision: 18, scale: 2 }).notNull(),
  dueDate: date("due_date"),
  refType: varchar("ref_type", { length: 50 }), // 'shipment', 'manual', etc.
  refId: bigint("ref_id", { mode: "number" }),
  memo: varchar({ length: 255 }),
  accountingAccountId: bigint("accounting_account_id", { mode: "number" }), // FK → accounting_accounts.id (system_code 기반 통합 테이블)
  createdBy: bigint("created_by", { mode: "number" }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * 은행 계좌 테이블
 */

export const bankAccounts = mysqlTable("bank_accounts", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  bankName: varchar("bank_name", { length: 100 }).notNull(),
  accountNo: varchar("account_no", { length: 100 }).notNull(),
  accountName: varchar("account_name", { length: 200 }),
  accountType: mysqlEnum("account_type", ["checking", "savings", "investment", "other"]).default("checking").notNull(),
  balance: decimal({ precision: 18, scale: 2 }).default("0").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("KRW"),
  defaultAccountingAccountId: bigint("default_accounting_account_id", { mode: "number" }),
  isActive: mysqlEnum("is_active", ["Y", "N"]).default("Y").notNull(),
  isPrimary: tinyint("is_primary").default(0).notNull(),
  notes: text("notes"),
  createdBy: bigint("created_by", { mode: "number" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * 은행 거래 내역 테이블
 * 엑셀 업로드 또는 API 연동으로 수집
 * 
 * [수정 이력] 2026-03-01: 실제 DB 스키마와 일치하도록 수정
 *   - occurred_at → tx_date
 *   - bank_direction → transaction_type (enum: deposit/withdrawal)
 *   - matched_type → match_status (enum: unmatched/partial/matched)
 *   - matched_id 제거, counterparty_text → description, hash_key 제거
 *   - accounting_account_id, matched_by, approval_status 등 추가
 */

export const bankTransactions = mysqlTable("bank_transactions", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  bankAccountId: bigint("bank_account_id", { mode: "number" }).notNull().references(() => bankAccounts.id),
  
  // 거래 정보
  transactionDate: timestamp("tx_date").notNull(), // 거래일시 (DB 컬럼: tx_date)
  amount: decimal({ precision: 15, scale: 2 }).notNull(), // 거래금액
  balance: decimal({ precision: 15, scale: 2 }), // 거래 후 잔액
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
  isLargeAmount: mysqlEnum("is_high_amount", ["Y", "N"]).default("N").notNull(), // 고액 거래 여부
  
  // 승인 워크플로우
  approvalStatus: mysqlEnum("approval_status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  approvedBy: bigint("approved_by", { mode: "number" }),
  approvedAt: timestamp("approved_at"),
  rejectionReason: text("rejection_reason"),
  
  // 생성 정보
  createdBy: bigint("created_by", { mode: "number" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * [DEPRECATED] accounting_accounts_v2 테이블은 accounting_accounts로 통합됨 (P2-2)
 * - AP/AR/은행 거래의 accounting_account_id는 이제 accounting_accounts.id를 참조
 * - system_code 기반 조회: resolveSystemAccount() 사용
 * - Drizzle 정의는 하위 호환을 위해 유지하되 신규 코드에서는 사용 금지
 * @deprecated Use accounting_accounts (drizzle/schema/accountingAccounts.ts) instead
 */

export const accountingAccountsV2 = mysqlTable("accounting_accounts_v2", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  code: varchar({ length: 50 }).notNull().unique(),
  name: varchar({ length: 100 }).notNull(),
  accountType: mysqlEnum("account_type", ["asset", "liability", "equity", "revenue", "expense"]).notNull(),
  parentId: bigint("parent_id", { mode: "number" }),
  isActive: tinyint("is_active").default(1).notNull(),
  sortOrder: int("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * 자동 매칭 규칙 테이블
 * 은행 거래 내역을 자동으로 매입/매출 원장과 매칭
 */

export const matchingRules = mysqlTable("matching_rules", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  userId: bigint("user_id", { mode: "number" }).notNull().references(() => users.id),
  ruleType: varchar("rule_type", { length: 32 }).notNull(), // 'keyword', 'amount', 'pattern'
  priority: int("priority").default(100).notNull(),
  weight: decimal({ precision: 5, scale: 2 }).default("1.00").notNull(),
  conditions: text("conditions").notNull(), // JSON
  actions: text("actions").notNull(), // JSON
  isActive: tinyint("is_active").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * 월간 마감 테이블
 * 일일 마감 데이터를 집계하여 월간 재무 현황 생성
 */

export const accountingMonthlyClose = mysqlTable("accounting_monthly_close", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  year: int("year").notNull(),
  month: int("month").notNull(), // 1-12
  status: mysqlEnum("status", ["draft", "closed"]).default("draft").notNull(),
  missingCloseDates: json("missing_close_dates"), // 미마감 날짜 배열
  summary: json("summary"), // 월간 집계 데이터
  reportPdfUrl: text("report_pdf_url"), // PDF 리포트 URL
  closedBy: bigint("closed_by", { mode: "number" }).references(() => users.id),
  closedAt: timestamp("closed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * 월간 마감 감사 로그
 * 월 마감 생성/확정/재오픈 이력 추적
 */

export const accountingMonthlyCloseAudit = mysqlTable("accounting_monthly_close_audit", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  monthlyCloseId: bigint("monthly_close_id", { mode: "number" }).notNull(),
  action: mysqlEnum("action", ["generate", "close", "reopen", "export_pdf"]).notNull(),
  actorId: bigint("actor_id", { mode: "number" }).notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Type exports
export type AccountingMonthlyClose = typeof accountingMonthlyClose.$inferSelect;
export type InsertAccountingMonthlyClose = typeof accountingMonthlyClose.$inferInsert;
export type AccountingMonthlyCloseAudit = typeof accountingMonthlyCloseAudit.$inferSelect;
export type InsertAccountingMonthlyCloseAudit = typeof accountingMonthlyCloseAudit.$inferInsert;

export type Partner = typeof partners.$inferSelect;
export type InsertPartner = typeof partners.$inferInsert;
export type PartnerContact = typeof partnerContacts.$inferSelect;
export type InsertPartnerContact = typeof partnerContacts.$inferInsert;
export type ApLedgerEntry = typeof apLedger.$inferSelect;
export type InsertApLedgerEntry = typeof apLedger.$inferInsert;
export type ArLedgerEntry = typeof arLedger.$inferSelect;
export type InsertArLedgerEntry = typeof arLedger.$inferInsert;
export type BankAccount = typeof bankAccounts.$inferSelect;
export type InsertBankAccount = typeof bankAccounts.$inferInsert;
export type BankTransaction = typeof bankTransactions.$inferSelect;
export type InsertBankTransaction = typeof bankTransactions.$inferInsert;
export type AccountingAccountV2 = typeof accountingAccountsV2.$inferSelect;
export type InsertAccountingAccountV2 = typeof accountingAccountsV2.$inferInsert;
export type MatchingRule = typeof matchingRules.$inferSelect;
export type InsertMatchingRule = typeof matchingRules.$inferInsert;


// ============================================================================
// 구독 관리 테이블
// ============================================================================

/**
 * 구독 만료 알림 테이블
 * 7일, 3일, 1일 전 알림 기록
 */

// Type exports
