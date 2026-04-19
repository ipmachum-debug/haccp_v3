/**
 * part2 분할: 위생 관리
 */
import {
  bigint, boolean, date, decimal, int, json,
  mysqlEnum, mysqlTable, text, timestamp, tinyint, varchar
} from "drizzle-orm/mysql-core";
import { tenants } from "./schema_main_core";

// 위생 관리 테이블 (10개)
// ============================================================================

/**
 * h_hygiene_checklists - 위생 체크리스트
 */
export const hHygieneChecklists = mysqlTable("h_hygiene_checklists", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  checkDate: date("check_date").notNull(),
  checkType: varchar("check_type", { length: 50 }).notNull(),
  area: varchar("area", { length: 100 }).notNull(),
  status: mysqlEnum("status", ["draft", "completed", "approved"]).default("draft"),
  checkedBy: bigint("checked_by", { mode: "number" }),
  reviewedBy: bigint("reviewed_by", { mode: "number" }),
  reviewedAt: timestamp("reviewed_at"),
  reviewComments: text("review_comments"),
  approvedBy: bigint("approved_by", { mode: "number" }),
  approvedAt: timestamp("approved_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_hygiene_checklist_items - 위생 체크리스트 항목
 */
export const hHygieneChecklistItems = mysqlTable("h_hygiene_checklist_items", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  checklistId: bigint("checklist_id", { mode: "number" }).notNull(),
  itemName: varchar("item_name", { length: 200 }).notNull(),
  result: mysqlEnum("result", ["pass", "fail", "na"]),
  notes: text("notes"),
  sortOrder: int("sort_order").default(0),
});

/**
 * h_cleaning_records - 청소 기록
 */
export const hCleaningRecords = mysqlTable("h_cleaning_records", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  cleaningDate: date("cleaning_date").notNull(),
  area: varchar("area", { length: 100 }).notNull(),
  cleaningType: varchar("cleaning_type", { length: 50 }),
  cleaningMethod: text("cleaning_method"),
  detergentUsed: varchar("detergent_used", { length: 200 }),
  status: mysqlEnum("status", ["completed", "in_progress", "pending"]).default("pending"),
  cleanedBy: bigint("cleaned_by", { mode: "number" }),
  verifiedBy: bigint("verified_by", { mode: "number" }),
  verifiedAt: timestamp("verified_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_pest_control_records - 방역 기록
 */
export const hPestControlRecords = mysqlTable("h_pest_control_records", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  controlDate: date("control_date").notNull(),
  area: varchar("area", { length: 100 }).notNull(),
  pestType: varchar("pest_type", { length: 100 }),
  controlMethod: text("control_method"),
  chemicalUsed: varchar("chemical_used", { length: 200 }),
  contractor: varchar("contractor", { length: 200 }),
  result: mysqlEnum("result", ["effective", "ineffective", "monitoring"]),
  nextScheduledDate: date("next_scheduled_date"),
  notes: text("notes"),
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_personal_hygiene_checks - 개인위생 점검
 */
export const hPersonalHygieneChecks = mysqlTable("h_personal_hygiene_checks", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  checkDate: date("check_date").notNull(),
  employeeId: bigint("employee_id", { mode: "number" }).notNull(),
  uniformClean: tinyint("uniform_clean"),
  hairCovered: tinyint("hair_covered"),
  handsClean: tinyint("hands_clean"),
  noJewelry: tinyint("no_jewelry"),
  healthStatus: mysqlEnum("health_status", ["healthy", "sick", "recovered"]),
  notes: text("notes"),
  checkedBy: bigint("checked_by", { mode: "number" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_sanitation_schedules - 위생 일정
 */
export const hSanitationSchedules = mysqlTable("h_sanitation_schedules", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  area: varchar("area", { length: 100 }).notNull(),
  activityType: varchar("activity_type", { length: 50 }).notNull(),
  frequency: varchar("frequency", { length: 50 }),
  scheduledDate: date("scheduled_date"),
  assignedTo: bigint("assigned_to", { mode: "number" }),
  status: mysqlEnum("status", ["scheduled", "completed", "overdue", "cancelled"]).default("scheduled"),
  completedAt: timestamp("completed_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_water_quality_tests - 수질 검사
 */
export const hWaterQualityTests = mysqlTable("h_water_quality_tests", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  testDate: date("test_date").notNull(),
  sampleLocation: varchar("sample_location", { length: 100 }),
  ph: decimal("ph", { precision: 4, scale: 2 }),
  turbidity: decimal("turbidity", { precision: 6, scale: 2 }),
  chlorine: decimal("chlorine", { precision: 6, scale: 2 }),
  coliformBacteria: varchar("coliform_bacteria", { length: 50 }),
  result: mysqlEnum("result", ["pass", "fail"]),
  testedBy: bigint("tested_by", { mode: "number" }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_equipment_cleaning_logs - 설비 청소 로그
 */
export const hEquipmentCleaningLogs = mysqlTable("h_equipment_cleaning_logs", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  equipmentId: bigint("equipment_id", { mode: "number" }),
  equipmentName: varchar("equipment_name", { length: 200 }).notNull(),
  cleaningDate: timestamp("cleaning_date").notNull(),
  cleaningMethod: text("cleaning_method"),
  detergentUsed: varchar("detergent_used", { length: 200 }),
  cleanedBy: bigint("cleaned_by", { mode: "number" }),
  verifiedBy: bigint("verified_by", { mode: "number" }),
  verifiedAt: timestamp("verified_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_hygiene_training_records - 위생 교육 기록
 */
export const hHygieneTrainingRecords = mysqlTable("h_hygiene_training_records", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  trainingDate: date("training_date").notNull(),
  trainingTopic: varchar("training_topic", { length: 200 }).notNull(),
  employeeId: bigint("employee_id", { mode: "number" }).notNull(),
  attendanceStatus: mysqlEnum("attendance_status", ["attended", "absent", "excused"]),
  testScore: decimal("test_score", { precision: 5, scale: 2 }),
  passed: tinyint("passed"),
  trainerId: bigint("trainer_id", { mode: "number" }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_hygiene_incidents - 위생 사고
 */
export const hHygieneIncidents = mysqlTable("h_hygiene_incidents", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  incidentDate: timestamp("incident_date").notNull(),
  incidentType: varchar("incident_type", { length: 100 }),
  area: varchar("area", { length: 100 }),
  description: text("description"),
  severity: mysqlEnum("severity", ["low", "medium", "high", "critical"]),
  correctiveAction: text("corrective_action"),
  status: mysqlEnum("status", ["open", "in_progress", "resolved", "closed"]).default("open"),
  reportedBy: bigint("reported_by", { mode: "number" }),
  assignedTo: bigint("assigned_to", { mode: "number" }),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
