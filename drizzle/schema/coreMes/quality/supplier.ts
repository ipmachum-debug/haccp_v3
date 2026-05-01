/**
 * Drizzle 스키마: h_quality_suppliers — 공급업체 관리 (AVL) (Phase Y-5)
 *
 * AVL = Approved Vendor List.
 *
 * 인덱스:
 *   - PRIMARY KEY (id)
 *   - UNIQUE (tenant_id, code)
 *   - INDEX (tenant_id, industry, status)
 *   - INDEX (tenant_id, next_evaluation_date) — 재평가 임박 (자주 조회)
 *   - INDEX (tenant_id, category, status) — 카테고리별 통계
 */
import {
  bigint,
  date,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  uniqueIndex,
  index,
} from "drizzle-orm/mysql-core";

export const SUPPLIER_CATEGORY_VALUES = [
  "raw_material", "packaging", "equipment", "service", "other",
] as const;

export const SUPPLIER_STATUS_VALUES = [
  "under_evaluation", "approved", "suspended", "disqualified", "archived",
] as const;

export const INDUSTRY_VALUES = [
  "food", "cosmetic", "pharmaceutical",
  "health-functional", "medical-device", "general-manufacturing",
] as const;

export const hQualitySuppliers = mysqlTable(
  "h_quality_suppliers",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull(),

    industry: mysqlEnum("industry", INDUSTRY_VALUES).notNull(),

    code: varchar("code", { length: 50 }).notNull(),

    name: varchar("name", { length: 255 }).notNull(),
    category: mysqlEnum("category", SUPPLIER_CATEGORY_VALUES).notNull(),

    contactPerson: varchar("contact_person", { length: 100 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 50 }).notNull(),

    bizNumber: varchar("biz_number", { length: 50 }),
    address: varchar("address", { length: 500 }),

    approvedDate: date("approved_date"),
    reEvaluationIntervalMonths: int("re_evaluation_interval_months")
      .notNull()
      .default(12),
    nextEvaluationDate: date("next_evaluation_date"),

    evaluationScore: int("evaluation_score"),
    notes: text("notes"),

    closedAt: timestamp("closed_at"),

    status: mysqlEnum("status", SUPPLIER_STATUS_VALUES)
      .notNull()
      .default("under_evaluation"),

    industryMetadata: json("industry_metadata"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    uniqTenantCode: uniqueIndex("uniq_quality_supplier_tenant_code").on(
      table.tenantId,
      table.code,
    ),
    idxTenantIndustryStatus: index("idx_quality_supplier_tenant_industry_status").on(
      table.tenantId,
      table.industry,
      table.status,
    ),
    idxTenantNextEvaluation: index("idx_quality_supplier_tenant_next_evaluation").on(
      table.tenantId,
      table.nextEvaluationDate,
    ),
    idxTenantCategoryStatus: index("idx_quality_supplier_tenant_category_status").on(
      table.tenantId,
      table.category,
      table.status,
    ),
  }),
);

export type DbSupplierRow = typeof hQualitySuppliers.$inferSelect;
export type DbSupplierInsert = typeof hQualitySuppliers.$inferInsert;
