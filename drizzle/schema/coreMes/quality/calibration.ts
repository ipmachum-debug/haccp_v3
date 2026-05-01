/**
 * Drizzle 스키마: h_calibrations — 검교정/설비 자격 (Phase Y-4)
 *
 * 인덱스:
 *   - PRIMARY KEY (id)
 *   - UNIQUE (tenant_id, code)
 *   - INDEX (tenant_id, industry, status)
 *   - INDEX (tenant_id, next_due_date) — 마감일 임박 (가장 자주 조회)
 *   - INDEX (tenant_id, equipment_serial, status) — 설비별 이력
 *   - INDEX (tenant_id, type, outcome) — 통계
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

export const CALIBRATION_TYPE_VALUES = ["iq", "oq", "pq", "routine"] as const;
export const CALIBRATION_OUTCOME_VALUES = [
  "pass", "conditional_pass", "fail", "pending",
] as const;
export const CALIBRATION_STATUS_VALUES = [
  "planned", "scheduled", "in_progress", "completed", "archived", "cancelled",
] as const;
export const CALIBRATION_VENDOR_TYPE_VALUES = ["internal", "external"] as const;

export const INDUSTRY_VALUES = [
  "food", "cosmetic", "pharmaceutical",
  "health-functional", "medical-device", "general-manufacturing",
] as const;

export const hCalibrations = mysqlTable(
  "h_calibrations",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull(),

    industry: mysqlEnum("industry", INDUSTRY_VALUES).notNull(),

    code: varchar("code", { length: 50 }).notNull(),
    type: mysqlEnum("type", CALIBRATION_TYPE_VALUES).notNull(),

    equipmentName: varchar("equipment_name", { length: 255 }).notNull(),
    equipmentSerial: varchar("equipment_serial", { length: 100 }).notNull(),

    vendor: varchar("vendor", { length: 255 }).notNull(),
    vendorType: mysqlEnum("vendor_type", CALIBRATION_VENDOR_TYPE_VALUES).notNull(),

    scheduledDate: date("scheduled_date").notNull(),
    actualDate: date("actual_date"),

    intervalMonths: int("interval_months").notNull().default(12),
    nextDueDate: date("next_due_date"),

    measurements: json("measurements").notNull().default([]),

    outcome: mysqlEnum("outcome", CALIBRATION_OUTCOME_VALUES)
      .notNull()
      .default("pending"),

    certificateUrl: varchar("certificate_url", { length: 500 }),
    conclusion: text("conclusion"),

    approvedBy: int("approved_by"),
    approvedAt: timestamp("approved_at"),
    closedAt: timestamp("closed_at"),

    status: mysqlEnum("status", CALIBRATION_STATUS_VALUES)
      .notNull()
      .default("planned"),

    industryMetadata: json("industry_metadata"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    uniqTenantCode: uniqueIndex("uniq_calibration_tenant_code").on(
      table.tenantId,
      table.code,
    ),
    idxTenantIndustryStatus: index("idx_calibration_tenant_industry_status").on(
      table.tenantId,
      table.industry,
      table.status,
    ),
    idxTenantNextDueDate: index("idx_calibration_tenant_next_due_date").on(
      table.tenantId,
      table.nextDueDate,
    ),
    idxTenantEquipment: index("idx_calibration_tenant_equipment").on(
      table.tenantId,
      table.equipmentSerial,
      table.status,
    ),
    idxTenantTypeOutcome: index("idx_calibration_tenant_type_outcome").on(
      table.tenantId,
      table.type,
      table.outcome,
    ),
  }),
);

export type DbCalibrationRow = typeof hCalibrations.$inferSelect;
export type DbCalibrationInsert = typeof hCalibrations.$inferInsert;
