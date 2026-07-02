/**
 * Drizzle 스키마: h_environmental_monitoring — 환경 모니터링 EMP (Phase Y-12)
 *
 * FSSC 22000 / Codex — Zone 기반 병원균/지표균/ATP 모니터링.
 *
 * 인덱스:
 *   - PRIMARY KEY (id)
 *   - UNIQUE (tenant_id, code)
 *   - INDEX (tenant_id, industry, status)
 *   - INDEX (tenant_id, zone, result) — 구역별 부적합 조회
 *   - INDEX (tenant_id, sampling_date) — 추이 조회
 */
import {
  bigint,
  int,
  date,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  uniqueIndex,
  index,
} from "drizzle-orm/mysql-core";

export const ZONE_VALUES = ["zone1", "zone2", "zone3", "zone4"] as const;
export const TARGET_VALUES = [
  "listeria", "salmonella", "e_coli", "coliform",
  "apc", "yeast_mold", "atp", "other",
] as const;
export const METHOD_VALUES = ["swab", "contact_plate", "air_settle", "water", "atp"] as const;
export const RESULT_VALUES = ["pass", "fail", "pending"] as const;
export const EM_STATUS_VALUES = ["draft", "under_review", "approved", "archived"] as const;

export const INDUSTRY_VALUES = [
  "food", "cosmetic", "pharmaceutical",
  "health-functional", "medical-device", "general-manufacturing",
] as const;

export const hEnvironmentalMonitoring = mysqlTable(
  "h_environmental_monitoring",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull(),

    industry: mysqlEnum("industry", INDUSTRY_VALUES).notNull(),

    code: varchar("code", { length: 50 }).notNull(),

    samplingDate: date("sampling_date").notNull(),
    zone: mysqlEnum("zone", ZONE_VALUES).notNull(),
    location: varchar("location", { length: 255 }).notNull(),
    target: mysqlEnum("target", TARGET_VALUES).notNull(),
    method: mysqlEnum("method", METHOD_VALUES).notNull(),

    result: mysqlEnum("result", RESULT_VALUES).notNull().default("pending"),
    resultValue: varchar("result_value", { length: 255 }),
    limitCriteria: varchar("limit_criteria", { length: 255 }),

    correctiveAction: text("corrective_action"),
    correctiveActionId: int("corrective_action_id"),

    notes: text("notes"),

    assessedBy: int("assessed_by"),
    approvedBy: int("approved_by"),
    approvedAt: timestamp("approved_at"),

    closedAt: timestamp("closed_at"),

    status: mysqlEnum("status", EM_STATUS_VALUES).notNull().default("draft"),

    industryMetadata: json("industry_metadata"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    uniqTenantCode: uniqueIndex("uniq_env_monitoring_tenant_code").on(
      table.tenantId,
      table.code,
    ),
    idxTenantIndustryStatus: index("idx_env_monitoring_tenant_industry_status").on(
      table.tenantId,
      table.industry,
      table.status,
    ),
    idxTenantZoneResult: index("idx_env_monitoring_tenant_zone_result").on(
      table.tenantId,
      table.zone,
      table.result,
    ),
    idxTenantSamplingDate: index("idx_env_monitoring_tenant_sampling_date").on(
      table.tenantId,
      table.samplingDate,
    ),
  }),
);

export type DbEnvironmentalMonitoringRow = typeof hEnvironmentalMonitoring.$inferSelect;
export type DbEnvironmentalMonitoringInsert = typeof hEnvironmentalMonitoring.$inferInsert;
