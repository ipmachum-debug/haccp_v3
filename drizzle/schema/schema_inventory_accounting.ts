import { tenants } from './schema_main';
import {mysqlTable, bigint, varchar, decimal, text, timestamp, mysqlEnum, index, unique, int} from "drizzle-orm/mysql-core";

/**
 * 회계 원장 테이블 (accounting_transactions)
 * 복식부기 라인 원장 - 단일 진실(SoT)
 */
export const accountingTransactions = mysqlTable("accounting_transactions", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  
  // 전표 정보
  transactionDate: varchar("transaction_date", { length: 10 }).notNull(),
  accountCode: varchar("account_code", { length: 20 }).notNull(),
  accountName: varchar("account_name", { length: 100 }),
  
  // 차변/대변
  debitAmount: decimal("debit_amount", { precision: 15, scale: 2 }).default("0.00"),
  creditAmount: decimal("credit_amount", { precision: 15, scale: 2 }).default("0.00"),
  
  // 적요
  description: text("description"),
  
  // 연동 정보 (멱등성 키)
  sourceType: varchar("source_type", { length: 32 }).notNull(),
  sourceId: varchar("source_id", { length: 64 }).notNull(),
  sourceLineId: varchar("source_line_id", { length: 64 }),
  actionType: mysqlEnum("action_type", ["POST", "REVERSAL", "RETURN"]).notNull(),
  
  // 역거래 정보
  reversalOfId: bigint("reversal_of_id", { mode: "number" }),
  
  // 감사 정보
  postedAt: timestamp("posted_at").defaultNow().notNull(),
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  idempotencyKey: unique("idempotency_key").on(table.sourceType, table.sourceId, table.sourceLineId, table.actionType, table.accountCode),
  transactionDateIdx: index("idx_transaction_date").on(table.transactionDate),
  accountCodeIdx: index("idx_account_code").on(table.accountCode),
  sourceIdx: index("idx_source").on(table.sourceType, table.sourceId),
}));

/**
 * 문서 라인별 LOT 할당 저장 테이블 (doc_line_lots)
 */
export const docLineLots = mysqlTable("doc_line_lots", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  docType: mysqlEnum("doc_type", ["PURCHASE", "SALE", "MATERIAL_ISSUE", "BATCH", "OTHER"]).notNull(),
  docId: varchar("doc_id", { length: 64 }).notNull(),
  docLineId: varchar("doc_line_id", { length: 64 }).notNull(),
  lotId: bigint("lot_id", { mode: "number" }).notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 3 }).notNull(),
  unit: varchar("unit", { length: 20 }).notNull(),
  unitCost: decimal("unit_cost", { precision: 15, scale: 2 }),
  amount: decimal("amount", { precision: 15, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
}, (table) => ({
  docIdx: index("idx_doc").on(table.docType, table.docId),
  lotIdIdx: index("idx_lot_id").on(table.lotId),
}));

/**
 * 계정 과목 마스터 테이블 (accounting_accounts)
 */
export const accountingAccounts = mysqlTable("accounting_accounts", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  accountCode: varchar("account_code", { length: 20 }).notNull().unique(),
  accountName: varchar("account_name", { length: 100 }).notNull(),
  accountType: mysqlEnum("account_type", ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"]).notNull(),
  parentCode: varchar("parent_code", { length: 20 }),
  isActive: bigint("is_active", { mode: "number" }).default(1),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  accountTypeIdx: index("idx_account_type").on(table.accountType),
}));
