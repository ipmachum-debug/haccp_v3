/**
 * part2_misc 분할: compliance
 */
/**
 * part2 분할: 기타 (코드, 로그, 통계, HACCP 확장)
 */
import {
  bigint, boolean, date, decimal, int, json,
  mysqlEnum, mysqlTable, text, timestamp, tinyint, varchar
} from "drizzle-orm/mysql-core";
import { tenants } from "./schema_main_core";

// 기타 테이블 (64개 - 코드, 로그, 통계 등)
// ============================================================================

/**
 * h_code_groups - 코드 그룹
 */

export const hIncidents = mysqlTable("h_incidents", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  incidentDate: timestamp("incident_date").notNull(),
  incidentType: varchar("incident_type", { length: 50 }),
  severity: mysqlEnum("severity", ["minor", "moderate", "major", "critical"]),
  location: varchar("location", { length: 100 }),
  description: text("description"),
  immediateCause: text("immediate_cause"),
  rootCause: text("root_cause"),
  correctiveAction: text("corrective_action"),
  status: mysqlEnum("status", ["open", "investigating", "resolved", "closed"]).default("open"),
  reportedBy: bigint("reported_by", { mode: "number" }),
  assignedTo: bigint("assigned_to", { mode: "number" }),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_risk_assessments - 위험 평가
 */
export const hRiskAssessments = mysqlTable("h_risk_assessments", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  assessmentDate: date("assessment_date").notNull(),
  area: varchar("area", { length: 100 }),
  hazardDescription: text("hazard_description"),
  riskLevel: mysqlEnum("risk_level", ["low", "medium", "high", "critical"]),
  likelihood: int("likelihood"),
  severity: int("severity"),
  riskScore: int("risk_score"),
  controlMeasures: text("control_measures"),
  residualRisk: varchar("residual_risk", { length: 50 }),
  reviewDate: date("review_date"),
  assessedBy: bigint("assessed_by", { mode: "number" }),
  reviewedBy: bigint("reviewed_by", { mode: "number" }),
  reviewedAt: timestamp("reviewed_at"),
  reviewComments: text("review_comments"),
  approvedBy: bigint("approved_by", { mode: "number" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_emergency_contacts - 비상 연락처
 */
export const hEmergencyContacts = mysqlTable("h_emergency_contacts", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }),
  contactType: varchar("contact_type", { length: 50 }),
  contactName: varchar("contact_name", { length: 100 }).notNull(),
  organization: varchar("organization", { length: 200 }),
  phone: varchar("phone", { length: 20 }).notNull(),
  email: varchar("email", { length: 320 }),
  address: text("address"),
  isActive: tinyint("is_active").default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_emergency_drills - 비상 훈련
 */
export const hEmergencyDrills = mysqlTable("h_emergency_drills", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  drillDate: date("drill_date").notNull(),
  drillType: varchar("drill_type", { length: 50 }),
  scenario: text("scenario"),
  participants: int("participants"),
  duration: int("duration"),
  observations: text("observations"),
  improvementAreas: text("improvement_areas"),
  conductedBy: bigint("conducted_by", { mode: "number" }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_complaints - 불만 사항
 */
export const hComplaints = mysqlTable("h_complaints", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }),
  complaintDate: date("complaint_date").notNull(),
  complaintType: varchar("complaint_type", { length: 50 }),
  source: varchar("source", { length: 100 }),
  customerName: varchar("customer_name", { length: 200 }),
  productId: bigint("product_id", { mode: "number" }),
  batchId: bigint("batch_id", { mode: "number" }),
  description: text("description"),
  severity: mysqlEnum("severity", ["low", "medium", "high", "critical"]),
  status: mysqlEnum("status", ["open", "investigating", "resolved", "closed"]).default("open"),
  assignedTo: bigint("assigned_to", { mode: "number" }),
  resolution: text("resolution"),
  resolvedAt: timestamp("resolved_at"),
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_customer_feedback - 고객 피드백
 */
export const hQualityObjectives = mysqlTable("h_quality_objectives", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }),
  objectiveYear: int("objective_year").notNull(),
  objectiveName: varchar("objective_name", { length: 200 }).notNull(),
  targetValue: decimal("target_value", { precision: 12, scale: 3 }),
  unit: varchar("unit", { length: 50 }),
  currentValue: decimal("current_value", { precision: 12, scale: 3 }),
  status: mysqlEnum("status", ["on_track", "at_risk", "achieved", "not_achieved"]),
  reviewDate: date("review_date"),
  notes: text("notes"),
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_continuous_improvement - 지속적 개선
 */
export const hContinuousImprovement = mysqlTable("h_continuous_improvement", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  improvementDate: date("improvement_date").notNull(),
  area: varchar("area", { length: 100 }),
  currentState: text("current_state"),
  proposedImprovement: text("proposed_improvement"),
  expectedBenefit: text("expected_benefit"),
  implementationPlan: text("implementation_plan"),
  status: mysqlEnum("status", ["proposed", "approved", "in_progress", "completed", "rejected"]).default("proposed"),
  priority: mysqlEnum("priority", ["low", "medium", "high"]),
  proposedBy: bigint("proposed_by", { mode: "number" }),
  reviewedBy: bigint("reviewed_by", { mode: "number" }),
  reviewedAt: timestamp("reviewed_at"),
  reviewComments: text("review_comments"),
  approvedBy: bigint("approved_by", { mode: "number" }),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 배치 승인 테이블
