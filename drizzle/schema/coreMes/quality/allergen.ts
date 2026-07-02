/**
 * Drizzle 스키마: h_allergen_assessments — 알레르겐 관리 (Phase Y-11)
 *
 * 식약처 알레르기 유발물질 표시기준 / FSSC 22000 / Codex CXC 80-2020.
 *
 * 인덱스:
 *   - PRIMARY KEY (id)
 *   - UNIQUE (tenant_id, code)
 *   - INDEX (tenant_id, industry, status)
 *   - INDEX (tenant_id, subject_type) — 제품/원료별 조회
 */
import {
  bigint,
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

export const SUBJECT_TYPE_VALUES = ["product", "material"] as const;

export const ALLERGEN_STATUS_VALUES = [
  "draft", "under_review", "approved", "archived",
] as const;

export const INDUSTRY_VALUES = [
  "food", "cosmetic", "pharmaceutical",
  "health-functional", "medical-device", "general-manufacturing",
] as const;

export const hAllergenAssessments = mysqlTable(
  "h_allergen_assessments",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull(),

    industry: mysqlEnum("industry", INDUSTRY_VALUES).notNull(),

    code: varchar("code", { length: 50 }).notNull(),

    title: varchar("title", { length: 255 }).notNull(),
    subjectType: mysqlEnum("subject_type", SUBJECT_TYPE_VALUES).notNull(),
    subjectName: varchar("subject_name", { length: 255 }).notNull(),

    /** 의도적 함유 알레르겐 코드 배열 */
    presentAllergens: json("present_allergens").notNull().default([]),
    /** 교차오염 가능 알레르겐 코드 배열 (may contain) */
    crossContactAllergens: json("cross_contact_allergens").notNull().default([]),

    /** 교차오염 통제수단 */
    controlMeasures: json("control_measures").notNull().default([]),

    /** 표시(라벨) 문구 */
    labelingStatement: text("labeling_statement"),

    assessedBy: int("assessed_by"),
    approvedBy: int("approved_by"),
    approvedAt: timestamp("approved_at"),

    closedAt: timestamp("closed_at"),

    status: mysqlEnum("status", ALLERGEN_STATUS_VALUES)
      .notNull()
      .default("draft"),

    industryMetadata: json("industry_metadata"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    uniqTenantCode: uniqueIndex("uniq_allergen_tenant_code").on(
      table.tenantId,
      table.code,
    ),
    idxTenantIndustryStatus: index("idx_allergen_tenant_industry_status").on(
      table.tenantId,
      table.industry,
      table.status,
    ),
    idxTenantSubjectType: index("idx_allergen_tenant_subject_type").on(
      table.tenantId,
      table.subjectType,
    ),
  }),
);

export type DbAllergenRow = typeof hAllergenAssessments.$inferSelect;
export type DbAllergenInsert = typeof hAllergenAssessments.$inferInsert;
