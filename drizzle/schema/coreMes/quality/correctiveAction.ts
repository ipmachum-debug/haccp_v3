/**
 * Drizzle 스키마: h_corrective_actions — CAPA (Corrective + Preventive Action)
 *
 * Phase Y-2-2 — Layer 2 core-mes/quality cross-cutting 도메인.
 * 모든 industry 공통 + `industry` 컬럼 view filter.
 *
 * Nonconforming 양방향 FK:
 *   - h_corrective_actions.nonconforming_id → h_nonconformings.id
 *   - h_nonconformings.corrective_action_id → h_corrective_actions.id
 *   둘 다 nullable + 단순 정수 (DB 레벨 FK 미강제 — multi-tenant 격리 우선)
 *
 * 인덱스 정책:
 *   - PRIMARY KEY (id)
 *   - UNIQUE (tenant_id, code)
 *   - INDEX (tenant_id, industry, status) — view filter
 *   - INDEX (tenant_id, due_date) — 마감일 임박 조회
 *   - INDEX (tenant_id, assigned_to, status) — 담당자별 진행 상태
 *   - INDEX (tenant_id, nonconforming_id) — Nonconforming 역참조
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

export const CAPA_TYPE_VALUES = ["corrective", "preventive"] as const;
export const CAPA_PRIORITY_VALUES = ["critical", "high", "medium", "low"] as const;
export const CAPA_STATUS_VALUES = [
  "planned",
  "in_progress",
  "effectiveness_check",
  "closed",
  "cancelled",
] as const;

export const INDUSTRY_VALUES = [
  "food",
  "cosmetic",
  "pharmaceutical",
  "health-functional",
  "medical-device",
  "general-manufacturing",
] as const;

export const hCorrectiveActions = mysqlTable(
  "h_corrective_actions",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),

    tenantId: int("tenant_id").notNull(),

    industry: mysqlEnum("industry", INDUSTRY_VALUES).notNull(),

    /** 코드 (CAR-YYYY-NNNN) */
    code: varchar("code", { length: 50 }).notNull(),

    /** CAPA 유형 */
    type: mysqlEnum("type", CAPA_TYPE_VALUES).notNull(),

    /** 우선순위 */
    priority: mysqlEnum("priority", CAPA_PRIORITY_VALUES)
      .notNull()
      .default("medium"),

    title: varchar("title", { length: 255 }).notNull(),
    description: text("description").notNull(),

    /** 연계 Nonconforming ID (preventive 인 경우 null) */
    nonconformingId: bigint("nonconforming_id", { mode: "number" }),

    /** 담당자 user_id */
    assignedTo: int("assigned_to").notNull(),

    /** 마감일 */
    dueDate: date("due_date").notNull(),

    /** 조치 계획 */
    actionPlan: text("action_plan").notNull(),

    /** 실행 상세 (in_progress 단계) */
    executionDetails: text("execution_details"),

    /** 효과성 검증 기준 */
    effectivenessCriteria: text("effectiveness_criteria"),
    /** 효과성 검증 결과 */
    effectivenessResult: text("effectiveness_result"),

    /** 검증자 */
    verifiedBy: int("verified_by"),
    verifiedAt: timestamp("verified_at"),

    /** 종결일 (closed 시) */
    closedAt: timestamp("closed_at"),

    status: mysqlEnum("status", CAPA_STATUS_VALUES)
      .notNull()
      .default("planned"),

    industryMetadata: json("industry_metadata"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    uniqTenantCode: uniqueIndex("uniq_corrective_action_tenant_code").on(
      table.tenantId,
      table.code,
    ),
    idxTenantIndustryStatus: index(
      "idx_corrective_action_tenant_industry_status",
    ).on(table.tenantId, table.industry, table.status),
    idxTenantDueDate: index("idx_corrective_action_tenant_due_date").on(
      table.tenantId,
      table.dueDate,
    ),
    idxTenantAssignee: index("idx_corrective_action_tenant_assignee").on(
      table.tenantId,
      table.assignedTo,
      table.status,
    ),
    idxTenantNonconforming: index(
      "idx_corrective_action_tenant_nonconforming",
    ).on(table.tenantId, table.nonconformingId),
  }),
);

export type DbCorrectiveActionRow = typeof hCorrectiveActions.$inferSelect;
export type DbCorrectiveActionInsert = typeof hCorrectiveActions.$inferInsert;
