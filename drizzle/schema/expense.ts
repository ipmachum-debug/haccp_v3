import { mysqlTable, bigint, varchar, text, timestamp, mysqlEnum, int, decimal } from "drizzle-orm/mysql-core";
import { tenants } from "../schema_main";

/**
 * 비용전표 (Expense Vouchers)
 * 재고로 가지 않는 지출: 임대료, 전기/수도/가스, 통신비, 광고선전비 등
 */
export const expenseVouchers = mysqlTable("expense_vouchers", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  voucherNo: varchar("voucher_no", { length: 30 }).notNull(),
  expenseDate: varchar("expense_date", { length: 10 }).notNull(), // YYYY-MM-DD
  partnerId: bigint("partner_id", { mode: "number" }),
  partnerName: varchar("partner_name", { length: 200 }),
  supplyAmount: decimal("supply_amount", { precision: 15, scale: 2 }).notNull().default("0.00"),
  vatAmount: decimal("vat_amount", { precision: 15, scale: 2 }).notNull().default("0.00"),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).notNull().default("0.00"),
  paymentMethod: mysqlEnum("payment_method", ["cash", "bank", "card", "unpaid"]).notNull().default("cash"),
  bankAccountId: bigint("bank_account_id", { mode: "number" }),
  proofType: mysqlEnum("proof_type", ["tax_invoice", "card", "cash_receipt", "simple", "none"]).notNull().default("none"),
  status: mysqlEnum("status", ["draft", "posted", "canceled"]).notNull().default("draft"),
  memo: text("memo"),
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  postedBy: bigint("posted_by", { mode: "number" }),
  postedAt: timestamp("posted_at"),
  canceledBy: bigint("canceled_by", { mode: "number" }),
  canceledAt: timestamp("canceled_at"),
  cancelReason: text("cancel_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * 비용전표 항목 (Expense Items)
 * 하나의 전표에 여러 계정과목 지정 가능
 */
export const expenseItems = mysqlTable("expense_items", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  voucherId: bigint("voucher_id", { mode: "number" }).notNull(),
  accountId: bigint("account_id", { mode: "number" }).notNull(),
  accountCode: varchar("account_code", { length: 20 }),
  accountName: varchar("account_name", { length: 100 }),
  supplyAmount: decimal("supply_amount", { precision: 15, scale: 2 }).notNull().default("0.00"),
  vatAmount: decimal("vat_amount", { precision: 15, scale: 2 }).notNull().default("0.00"),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).notNull().default("0.00"),
  description: text("description"),
  sortOrder: int("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * 비용 분개 (Expense Journal Entries)
 * 비용전표 확정 시 자동 생성
 */
export const expenseJournalEntries = mysqlTable("expense_journal_entries", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  voucherId: bigint("voucher_id", { mode: "number" }).notNull(),
  entryDate: varchar("entry_date", { length: 10 }).notNull(),
  description: varchar("description", { length: 500 }),
  totalDebit: decimal("total_debit", { precision: 15, scale: 2 }).notNull().default("0.00"),
  totalCredit: decimal("total_credit", { precision: 15, scale: 2 }).notNull().default("0.00"),
  postedBy: bigint("posted_by", { mode: "number" }).notNull(),
  postedAt: timestamp("posted_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * 분개 행 (Journal Lines)
 * 차변/대변 상세
 */
export const expenseJournalLines = mysqlTable("expense_journal_lines", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  journalEntryId: bigint("journal_entry_id", { mode: "number" }).notNull(),
  accountId: bigint("account_id", { mode: "number" }).notNull(),
  accountCode: varchar("account_code", { length: 20 }),
  accountName: varchar("account_name", { length: 100 }),
  debitAmount: decimal("debit_amount", { precision: 15, scale: 2 }).notNull().default("0.00"),
  creditAmount: decimal("credit_amount", { precision: 15, scale: 2 }).notNull().default("0.00"),
  bankAccountId: bigint("bank_account_id", { mode: "number" }),
  partnerId: bigint("partner_id", { mode: "number" }),
  description: varchar("description", { length: 500 }),
  sortOrder: int("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * 비용 첨부파일 (Expense Attachments)
 */
export const expenseAttachments = mysqlTable("expense_attachments", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  voucherId: bigint("voucher_id", { mode: "number" }).notNull(),
  fileKey: varchar("file_key", { length: 500 }).notNull(),
  fileUrl: varchar("file_url", { length: 1000 }).notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileSize: bigint("file_size", { mode: "number" }),
  mimeType: varchar("mime_type", { length: 100 }),
  uploadedBy: bigint("uploaded_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
