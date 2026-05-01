/**
 * Drizzle 스키마: h_trainings — 교육/훈련 (Phase Y-3)
 *
 * Cross-cutting 도메인 — 모든 industry 공통.
 * attendees / materials 는 JSON array (단순화 — 향후 정규화 가능).
 *
 * 인덱스:
 *   - PRIMARY KEY (id)
 *   - UNIQUE (tenant_id, code)
 *   - INDEX (tenant_id, industry, status)
 *   - INDEX (tenant_id, scheduled_date) — 일정 임박 조회
 *   - INDEX (tenant_id, type, status)
 *   - INDEX (tenant_id, trainer_user_id, status) — 강사별 조회
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

export const TRAINING_TYPE_VALUES = [
  "internal", "external", "on_the_job", "regulatory",
] as const;

export const TRAINING_STATUS_VALUES = [
  "planned", "scheduled", "in_progress", "completed", "archived", "cancelled",
] as const;

export const TRAINER_TYPE_VALUES = ["internal", "external"] as const;

export const INDUSTRY_VALUES = [
  "food", "cosmetic", "pharmaceutical",
  "health-functional", "medical-device", "general-manufacturing",
] as const;

export const hTrainings = mysqlTable(
  "h_trainings",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull(),

    industry: mysqlEnum("industry", INDUSTRY_VALUES).notNull(),

    code: varchar("code", { length: 50 }).notNull(),

    type: mysqlEnum("type", TRAINING_TYPE_VALUES).notNull(),

    title: varchar("title", { length: 255 }).notNull(),
    subject: varchar("subject", { length: 255 }).notNull(),
    description: text("description").notNull(),

    trainerName: varchar("trainer_name", { length: 100 }).notNull(),
    trainerType: mysqlEnum("trainer_type", TRAINER_TYPE_VALUES).notNull(),
    trainerUserId: int("trainer_user_id"),

    scheduledDate: date("scheduled_date").notNull(),
    actualDate: date("actual_date"),
    durationMinutes: int("duration_minutes").notNull().default(60),

    /** Attendees (JSON TrainingAttendee[]) */
    attendees: json("attendees").notNull().default([]),

    /** Materials (JSON TrainingMaterial[]) */
    materials: json("materials").notNull().default([]),

    effectivenessAssessment: text("effectiveness_assessment"),

    approvedBy: int("approved_by"),
    approvedAt: timestamp("approved_at"),
    closedAt: timestamp("closed_at"),

    status: mysqlEnum("status", TRAINING_STATUS_VALUES)
      .notNull()
      .default("planned"),

    industryMetadata: json("industry_metadata"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    uniqTenantCode: uniqueIndex("uniq_training_tenant_code").on(
      table.tenantId,
      table.code,
    ),
    idxTenantIndustryStatus: index("idx_training_tenant_industry_status").on(
      table.tenantId,
      table.industry,
      table.status,
    ),
    idxTenantScheduledDate: index("idx_training_tenant_scheduled_date").on(
      table.tenantId,
      table.scheduledDate,
    ),
    idxTenantTypeStatus: index("idx_training_tenant_type_status").on(
      table.tenantId,
      table.type,
      table.status,
    ),
    idxTenantTrainer: index("idx_training_tenant_trainer").on(
      table.tenantId,
      table.trainerUserId,
      table.status,
    ),
  }),
);

export type DbTrainingRow = typeof hTrainings.$inferSelect;
export type DbTrainingInsert = typeof hTrainings.$inferInsert;
