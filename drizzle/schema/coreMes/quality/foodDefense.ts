/**
 * Drizzle 스키마: h_food_defense_assessments — 식품 방어 위협 평가 (TACCP, Phase Y-7)
 *
 * FSSC 22000 v6 §2.5.3 Food Defense / PAS 96 TACCP.
 *
 * 인덱스:
 *   - PRIMARY KEY (id)
 *   - UNIQUE (tenant_id, code)
 *   - INDEX (tenant_id, industry, status)
 *   - INDEX (tenant_id, category, status) — 위협유형별 통계
 *   - INDEX (tenant_id, residual_score) — 고위협 우선 조회
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

export const THREAT_CATEGORY_VALUES = [
  "tampering", "intentional_contamination", "sabotage",
  "cyber", "insider", "supply_chain", "other",
] as const;

export const FOOD_DEFENSE_STATUS_VALUES = [
  "draft", "under_review", "mitigated", "accepted", "archived",
] as const;

export const INDUSTRY_VALUES = [
  "food", "cosmetic", "pharmaceutical",
  "health-functional", "medical-device", "general-manufacturing",
] as const;

export const hFoodDefenseAssessments = mysqlTable(
  "h_food_defense_assessments",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull(),

    industry: mysqlEnum("industry", INDUSTRY_VALUES).notNull(),

    code: varchar("code", { length: 50 }).notNull(),

    title: varchar("title", { length: 255 }).notNull(),
    description: text("description").notNull(),
    category: mysqlEnum("category", THREAT_CATEGORY_VALUES).notNull(),
    targetPoint: varchar("target_point", { length: 255 }).notNull(),

    likelihood: int("likelihood").notNull(),
    impact: int("impact").notNull(),

    countermeasures: json("countermeasures").notNull().default([]),

    residualScore: int("residual_score"),

    justification: text("justification"),

    assessedBy: int("assessed_by"),
    approvedBy: int("approved_by"),
    approvedAt: timestamp("approved_at"),

    closedAt: timestamp("closed_at"),

    status: mysqlEnum("status", FOOD_DEFENSE_STATUS_VALUES)
      .notNull()
      .default("draft"),

    industryMetadata: json("industry_metadata"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    uniqTenantCode: uniqueIndex("uniq_food_defense_tenant_code").on(
      table.tenantId,
      table.code,
    ),
    idxTenantIndustryStatus: index("idx_food_defense_tenant_industry_status").on(
      table.tenantId,
      table.industry,
      table.status,
    ),
    idxTenantCategoryStatus: index("idx_food_defense_tenant_category_status").on(
      table.tenantId,
      table.category,
      table.status,
    ),
    idxTenantResidualScore: index("idx_food_defense_tenant_residual_score").on(
      table.tenantId,
      table.residualScore,
    ),
  }),
);

export type DbFoodDefenseRow = typeof hFoodDefenseAssessments.$inferSelect;
export type DbFoodDefenseInsert = typeof hFoodDefenseAssessments.$inferInsert;
