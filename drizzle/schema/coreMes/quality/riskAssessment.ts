/**
 * Drizzle 스키마: h_quality_risk_assessments — 품질 위험 평가 (Phase Y-6)
 *
 * 인덱스:
 *   - PRIMARY KEY (id)
 *   - UNIQUE (tenant_id, code)
 *   - INDEX (tenant_id, industry, status)
 *   - INDEX (tenant_id, category, status) — 카테고리별 통계
 *   - INDEX (tenant_id, residual_score) — 고위험 우선 조회
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

export const RISK_CATEGORY_VALUES = [
  "biological", "chemical", "physical",
  "operational", "regulatory", "supplier", "other",
] as const;

export const RISK_STATUS_VALUES = [
  "draft", "under_review", "mitigated", "accepted", "archived",
] as const;

export const INDUSTRY_VALUES = [
  "food", "cosmetic", "pharmaceutical",
  "health-functional", "medical-device", "general-manufacturing",
] as const;

export const hRiskAssessments = mysqlTable(
  "h_quality_risk_assessments",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull(),

    industry: mysqlEnum("industry", INDUSTRY_VALUES).notNull(),

    code: varchar("code", { length: 50 }).notNull(),

    title: varchar("title", { length: 255 }).notNull(),
    description: text("description").notNull(),
    category: mysqlEnum("category", RISK_CATEGORY_VALUES).notNull(),
    scope: varchar("scope", { length: 255 }).notNull(),

    probability: int("probability").notNull(),
    severity: int("severity").notNull(),

    mitigations: json("mitigations").notNull().default([]),

    residualScore: int("residual_score"),

    justification: text("justification"),

    assessedBy: int("assessed_by"),
    approvedBy: int("approved_by"),
    approvedAt: timestamp("approved_at"),

    closedAt: timestamp("closed_at"),

    status: mysqlEnum("status", RISK_STATUS_VALUES)
      .notNull()
      .default("draft"),

    industryMetadata: json("industry_metadata"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    uniqTenantCode: uniqueIndex("uniq_quality_risk_assessment_tenant_code").on(
      table.tenantId,
      table.code,
    ),
    idxTenantIndustryStatus: index("idx_quality_risk_assessment_tenant_industry_status").on(
      table.tenantId,
      table.industry,
      table.status,
    ),
    idxTenantCategoryStatus: index("idx_quality_risk_assessment_tenant_category_status").on(
      table.tenantId,
      table.category,
      table.status,
    ),
    idxTenantResidualScore: index("idx_quality_risk_assessment_tenant_residual_score").on(
      table.tenantId,
      table.residualScore,
    ),
  }),
);

export type DbRiskAssessmentRow = typeof hRiskAssessments.$inferSelect;
export type DbRiskAssessmentInsert = typeof hRiskAssessments.$inferInsert;
