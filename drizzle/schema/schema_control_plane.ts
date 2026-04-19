/**
 * Control Plane Schema (슈퍼관리자 DB)
 * SaaS 멀티테넌트 구조의 관리 영역
 * 
 * 이 스키마는 별도의 데이터베이스에 배포됩니다.
 * Tenant DB와 물리적으로 분리되어 있습니다.
 */

import { mysqlTable, varchar, text, timestamp, int, decimal, json, boolean, uniqueIndex, index } from "drizzle-orm/mysql-core";

// ============================================
// 1. Tenants (고객사/테넌트)
// ============================================

export const tenants = mysqlTable("tenants", {
  id: varchar("id", { length: 36 }).primaryKey(), // UUID
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(), // URL-safe identifier
  status: varchar("status", { length: 20 }).notNull().default("active"), // active/suspended/closed
  timezone: varchar("timezone", { length: 50 }).notNull().default("Asia/Seoul"),
  locale: varchar("locale", { length: 10 }).notNull().default("ko-KR"),
  
  // 연락처 정보
  contactName: varchar("contact_name", { length: 100 }),
  contactEmail: varchar("contact_email", { length: 255 }),
  contactPhone: varchar("contact_phone", { length: 50 }),
  
  // 사업자 정보
  businessNumber: varchar("business_number", { length: 50 }), // 사업자등록번호
  address: text("address"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
}, (table) => ({
  slugIdx: uniqueIndex("slug_idx").on(table.slug),
  statusIdx: index("status_idx").on(table.status),
}));

export const tenantDomains = mysqlTable("tenant_domains", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  domain: varchar("domain", { length: 255 }).notNull().unique(), // subdomain.millioai.com
  isPrimary: boolean("is_primary").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  tenantIdIdx: index("tenant_id_idx").on(table.tenantId),
  domainIdx: uniqueIndex("domain_idx").on(table.domain),
}));

export const tenantEnvironments = mysqlTable("tenant_environments", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }).unique(),
  
  // 데이터베이스 모드
  mode: varchar("mode", { length: 20 }).notNull().default("shared_db"), // shared_db / dedicated_db
  
  // 전용 DB 연결 정보 (dedicated_db 모드일 때만 사용)
  dbHost: varchar("db_host", { length: 255 }),
  dbName: varchar("db_name", { length: 100 }),
  dbSchema: varchar("db_schema", { length: 100 }),
  dbConnectionSecretKey: varchar("db_connection_secret_key", { length: 255 }), // Vault/Secrets Manager 키
  
  region: varchar("region", { length: 50 }).default("ap-northeast-2"), // AWS region
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
}, (table) => ({
  tenantIdIdx: uniqueIndex("tenant_id_idx").on(table.tenantId),
}));

// ============================================
// 2. Plans / Subscription / License
// ============================================

export const plans = mysqlTable("plans", {
  id: varchar("id", { length: 36 }).primaryKey(),
  code: varchar("code", { length: 50 }).notNull().unique(), // starter/pro/enterprise
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  
  // 가격
  priceMonthly: decimal("price_monthly", { precision: 10, scale: 2 }).notNull().default("0"),
  priceYearly: decimal("price_yearly", { precision: 10, scale: 2 }).notNull().default("0"),
  currency: varchar("currency", { length: 3 }).notNull().default("KRW"),
  
  // 제한사항 (JSON)
  limitsJson: json("limits_json").$type<{
    maxUsers?: number;
    maxSites?: number; // 공장/지점 수
    maxBatchesPerMonth?: number;
    maxStorageGB?: number;
  }>(),
  
  // 기능 플래그 (JSON)
  featuresJson: json("features_json").$type<{
    haccp?: boolean;
    erp?: boolean;
    accounting?: boolean;
    inventory?: boolean;
    production?: boolean;
    quality?: boolean;
    traceability?: boolean;
    reporting?: boolean;
    api?: boolean;
  }>(),
  
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: int("sort_order").notNull().default(0),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
}, (table) => ({
  codeIdx: uniqueIndex("code_idx").on(table.code),
}));

export const subscriptions = mysqlTable("subscriptions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  planId: varchar("plan_id", { length: 36 }).notNull().references(() => plans.id),
  
  status: varchar("status", { length: 20 }).notNull().default("trial"), // trial/active/past_due/canceled
  
  // 구독 기간
  currentPeriodStart: timestamp("current_period_start").notNull(),
  currentPeriodEnd: timestamp("current_period_end").notNull(),
  trialEnd: timestamp("trial_end"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  canceledAt: timestamp("canceled_at"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
}, (table) => ({
  tenantIdIdx: index("tenant_id_idx").on(table.tenantId),
  statusIdx: index("status_idx").on(table.status),
  periodIdx: index("period_idx").on(table.currentPeriodEnd),
}));

export const licenses = mysqlTable("licenses", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  
  seatLimit: int("seat_limit").notNull().default(5), // 사용자 수 제한
  siteLimit: int("site_limit").notNull().default(1), // 공장/지점 수 제한
  
  expiresAt: timestamp("expires_at"),
  notes: text("notes"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
}, (table) => ({
  tenantIdIdx: index("tenant_id_idx").on(table.tenantId),
}));

// ============================================
// 3. Billing (결제/청구)
// ============================================

export const billingAccounts = mysqlTable("billing_accounts", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }).unique(),
  
  provider: varchar("provider", { length: 50 }).notNull().default("toss"), // toss/stripe/nice/kg
  providerCustomerId: varchar("provider_customer_id", { length: 255 }),
  
  billingEmail: varchar("billing_email", { length: 255 }).notNull(),
  taxId: varchar("tax_id", { length: 50 }), // 사업자등록번호
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
}, (table) => ({
  tenantIdIdx: uniqueIndex("tenant_id_idx").on(table.tenantId),
}));

export const invoices = mysqlTable("invoices", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  subscriptionId: varchar("subscription_id", { length: 36 }).references(() => subscriptions.id),
  
  providerInvoiceId: varchar("provider_invoice_id", { length: 255 }),
  
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("KRW"),
  
  status: varchar("status", { length: 20 }).notNull().default("draft"), // draft/issued/paid/void
  
  issuedAt: timestamp("issued_at"),
  paidAt: timestamp("paid_at"),
  dueAt: timestamp("due_at"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
}, (table) => ({
  tenantIdIdx: index("tenant_id_idx").on(table.tenantId),
  statusIdx: index("status_idx").on(table.status),
}));

export const payments = mysqlTable("payments", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  invoiceId: varchar("invoice_id", { length: 36 }).references(() => invoices.id),
  
  providerPaymentId: varchar("provider_payment_id", { length: 255 }),
  
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"), // pending/succeeded/failed/refunded
  
  paidAt: timestamp("paid_at"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
}, (table) => ({
  tenantIdIdx: index("tenant_id_idx").on(table.tenantId),
  invoiceIdIdx: index("invoice_id_idx").on(table.invoiceId),
}));
