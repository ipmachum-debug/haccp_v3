/**
 * Drizzle 스키마: h_food_safety_culture_assessments — 식품안전문화 진단 (Phase Y-9)
 *
 * FSSC 22000 v6 §2.5.1 Food Safety and Quality Culture / GFSI.
 *
 * 인덱스:
 *   - PRIMARY KEY (id)
 *   - UNIQUE (tenant_id, code)
 *   - INDEX (tenant_id, industry, status)
 *   - INDEX (tenant_id, overall_score) — 성숙도 추이 조회
 */
import {
  bigint,
  int,
  decimal,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  uniqueIndex,
  index,
} from "drizzle-orm/mysql-core";

export const ASSESSMENT_METHOD_VALUES = [
  "survey", "interview", "observation", "mixed",
] as const;

export const CULTURE_STATUS_VALUES = [
  "draft", "under_review", "approved", "archived",
] as const;

export const INDUSTRY_VALUES = [
  "food", "cosmetic", "pharmaceutical",
  "health-functional", "medical-device", "general-manufacturing",
] as const;

export const hFoodSafetyCultureAssessments = mysqlTable(
  "h_food_safety_culture_assessments",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull(),

    industry: mysqlEnum("industry", INDUSTRY_VALUES).notNull(),

    code: varchar("code", { length: 50 }).notNull(),

    title: varchar("title", { length: 255 }).notNull(),
    assessmentPeriod: varchar("assessment_period", { length: 100 }).notNull(),
    method: mysqlEnum("method", ASSESSMENT_METHOD_VALUES).notNull(),
    participantCount: int("participant_count").notNull().default(0),

    /** 6개 차원 점수 { leadership, communication, awareness, accountability, resources, continuousImprovement } */
    dimensionScores: json("dimension_scores").notNull(),

    /** 종합 점수 (평균 1.0~5.0) */
    overallScore: decimal("overall_score", { precision: 2, scale: 1 }).notNull(),

    improvementActions: json("improvement_actions").notNull().default([]),

    summary: text("summary"),

    assessedBy: int("assessed_by"),
    approvedBy: int("approved_by"),
    approvedAt: timestamp("approved_at"),

    closedAt: timestamp("closed_at"),

    status: mysqlEnum("status", CULTURE_STATUS_VALUES)
      .notNull()
      .default("draft"),

    industryMetadata: json("industry_metadata"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    uniqTenantCode: uniqueIndex("uniq_food_safety_culture_tenant_code").on(
      table.tenantId,
      table.code,
    ),
    idxTenantIndustryStatus: index("idx_food_safety_culture_tenant_industry_status").on(
      table.tenantId,
      table.industry,
      table.status,
    ),
    idxTenantOverallScore: index("idx_food_safety_culture_tenant_overall_score").on(
      table.tenantId,
      table.overallScore,
    ),
  }),
);

export type DbFoodSafetyCultureRow = typeof hFoodSafetyCultureAssessments.$inferSelect;
export type DbFoodSafetyCultureInsert = typeof hFoodSafetyCultureAssessments.$inferInsert;
