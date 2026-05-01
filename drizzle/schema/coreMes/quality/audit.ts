/**
 * Drizzle 스키마: h_audits — 감사 (Audit) 단일 테이블
 *
 * Phase Y-2-3 — Layer 2 core-mes/quality cross-cutting 도메인.
 * findings 는 JSON array (단순화) — 향후 정규화 시 별도 테이블 추출 가능.
 *
 * 인덱스:
 *   - PRIMARY KEY (id)
 *   - UNIQUE (tenant_id, code)
 *   - INDEX (tenant_id, industry, status)
 *   - INDEX (tenant_id, planned_date) — 일정 임박 조회
 *   - INDEX (tenant_id, lead_auditor, status) — 감사원별
 *   - INDEX (tenant_id, type, outcome) — 종합 평가 통계
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

export const AUDIT_TYPE_VALUES = ["internal", "supplier", "external"] as const;
export const AUDIT_STATUS_VALUES = [
  "planned", "scheduled", "in_progress", "reporting", "closed", "cancelled",
] as const;
export const AUDIT_OUTCOME_VALUES = [
  "pass", "conditional_pass", "fail", "pending",
] as const;
export const INDUSTRY_VALUES = [
  "food", "cosmetic", "pharmaceutical",
  "health-functional", "medical-device", "general-manufacturing",
] as const;

export const hAudits = mysqlTable(
  "h_audits",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull(),

    industry: mysqlEnum("industry", INDUSTRY_VALUES).notNull(),

    code: varchar("code", { length: 50 }).notNull(),
    type: mysqlEnum("type", AUDIT_TYPE_VALUES).notNull(),

    title: varchar("title", { length: 255 }).notNull(),
    scope: text("scope").notNull(),
    criteria: varchar("criteria", { length: 255 }).notNull(),
    auditee: varchar("auditee", { length: 255 }).notNull(),

    plannedDate: date("planned_date").notNull(),
    actualDate: date("actual_date"),

    leadAuditor: int("lead_auditor").notNull(),

    /** 보조 감사원 user_id 목록 (JSON int[]) */
    auditors: json("auditors").$type<number[]>().notNull().default([]),

    /** 발견사항 (JSON AuditFinding[]) */
    findings: json("findings").notNull().default([]),

    outcome: mysqlEnum("outcome", AUDIT_OUTCOME_VALUES)
      .notNull()
      .default("pending"),

    conclusion: text("conclusion"),

    approvedBy: int("approved_by"),
    approvedAt: timestamp("approved_at"),
    closedAt: timestamp("closed_at"),

    status: mysqlEnum("status", AUDIT_STATUS_VALUES)
      .notNull()
      .default("planned"),

    industryMetadata: json("industry_metadata"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    uniqTenantCode: uniqueIndex("uniq_audit_tenant_code").on(
      table.tenantId,
      table.code,
    ),
    idxTenantIndustryStatus: index("idx_audit_tenant_industry_status").on(
      table.tenantId,
      table.industry,
      table.status,
    ),
    idxTenantPlannedDate: index("idx_audit_tenant_planned_date").on(
      table.tenantId,
      table.plannedDate,
    ),
    idxTenantLeadAuditor: index("idx_audit_tenant_lead_auditor").on(
      table.tenantId,
      table.leadAuditor,
      table.status,
    ),
    idxTenantTypeOutcome: index("idx_audit_tenant_type_outcome").on(
      table.tenantId,
      table.type,
      table.outcome,
    ),
  }),
);

export type DbAuditRow = typeof hAudits.$inferSelect;
export type DbAuditInsert = typeof hAudits.$inferInsert;
