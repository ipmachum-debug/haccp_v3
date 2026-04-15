/**
 * part2 분할: 체크리스트 + 교육 + 검증 + 부적합
 */
import {
  bigint, boolean, date, decimal, int, json,
  mysqlEnum, mysqlTable, text, timestamp, tinyint, varchar
} from "drizzle-orm/mysql-core";
import { tenants } from "./schema_main_core";

// 체크리스트 테이블 (6개)
// ============================================================================

/**
 * h_checklist_templates - 체크리스트 템플릿
 */
export const hChecklistTemplates = mysqlTable("h_checklist_templates", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  templateName: varchar("template_name", { length: 200 }).notNull(),
  templateType: varchar("template_type", { length: 50 }),
  category: varchar("category", { length: 100 }),
  description: text("description"),
  isActive: tinyint("is_active").default(1),
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * h_checklist_template_items - 체크리스트 템플릿 항목
 */
export const hChecklistTemplateItems = mysqlTable("h_checklist_template_items", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  templateId: bigint("template_id", { mode: "number" }).notNull(),
  itemText: text("item_text").notNull(),
  itemType: varchar("item_type", { length: 50 }),
  expectedValue: varchar("expected_value", { length: 200 }),
  sortOrder: int("sort_order").default(0),
  isRequired: tinyint("is_required").default(1),
});

/**
 * h_checklist_instances - 체크리스트 인스턴스
 */
export const hChecklistInstances = mysqlTable("h_checklist_instances", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  templateId: bigint("template_id", { mode: "number" }).notNull(),
  siteId: bigint("site_id", { mode: "number" }),
  referenceType: varchar("reference_type", { length: 50 }),
  referenceId: bigint("reference_id", { mode: "number" }),
  checkDate: date("check_date").notNull(),
  status: mysqlEnum("status", ["draft", "in_progress", "completed", "approved"]).default("draft"),
  completedBy: bigint("completed_by", { mode: "number" }),
  completedAt: timestamp("completed_at"),
  reviewedBy: bigint("reviewed_by", { mode: "number" }),
  reviewedAt: timestamp("reviewed_at"),
  reviewComments: text("review_comments"),
  approvedBy: bigint("approved_by", { mode: "number" }),
  approvedAt: timestamp("approved_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_checklist_responses - 체크리스트 응답
 */
export const hChecklistResponses = mysqlTable("h_checklist_responses", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  instanceId: bigint("instance_id", { mode: "number" }).notNull(),
  itemId: bigint("item_id", { mode: "number" }).notNull(),
  responseValue: text("response_value"),
  result: mysqlEnum("result", ["pass", "fail", "na"]),
  notes: text("notes"),
  respondedBy: bigint("responded_by", { mode: "number" }),
  respondedAt: timestamp("responded_at"),
});

/**
 * h_daily_checklists - 일일 체크리스트
 */
export const hDailyChecklists = mysqlTable("h_daily_checklists", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  checkDate: date("check_date").notNull(),
  shift: varchar("shift", { length: 20 }),
  area: varchar("area", { length: 100 }),
  status: mysqlEnum("status", ["pending", "in_progress", "completed"]).default("pending"),
  completedBy: bigint("completed_by", { mode: "number" }),
  completedAt: timestamp("completed_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_daily_checklist_items - 일일 체크리스트 항목
 */
export const hDailyChecklistItems = mysqlTable("h_daily_checklist_items", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  checklistId: bigint("checklist_id", { mode: "number" }).notNull(),
  itemName: varchar("item_name", { length: 200 }).notNull(),
  result: mysqlEnum("result", ["pass", "fail", "na"]),
  notes: text("notes"),
  sortOrder: int("sort_order").default(0),
});

// ============================================================================
// 교육/훈련 테이블 (4개)
// ============================================================================

/**
 * h_training_plans - 교육 계획
 */
export const hTrainingPlans = mysqlTable("h_training_plans", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  planYear: int("plan_year").notNull(),
  planName: varchar("plan_name", { length: 200 }).notNull(),
  trainingTopic: varchar("training_topic", { length: 200 }),
  targetAudience: varchar("target_audience", { length: 200 }),
  scheduledDate: date("scheduled_date"),
  duration: int("duration"),
  trainerId: bigint("trainer_id", { mode: "number" }),
  status: mysqlEnum("status", ["planned", "scheduled", "completed", "cancelled"]).default("planned"),
  notes: text("notes"),
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_training_records - 교육 이력
 */
export const hTrainingRecords = mysqlTable("h_training_records", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  planId: bigint("plan_id", { mode: "number" }),
  employeeId: bigint("employee_id", { mode: "number" }).notNull(),
  trainingDate: date("training_date").notNull(),
  trainingTopic: varchar("training_topic", { length: 200 }).notNull(),
  trainerId: bigint("trainer_id", { mode: "number" }),
  attendanceStatus: mysqlEnum("attendance_status", ["attended", "absent", "excused"]),
  duration: int("duration"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_training_assessments - 교육 평가
 */
export const hTrainingAssessments = mysqlTable("h_training_assessments", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  trainingRecordId: bigint("training_record_id", { mode: "number" }).notNull(),
  assessmentType: varchar("assessment_type", { length: 50 }),
  score: decimal("score", { precision: 5, scale: 2 }),
  maxScore: decimal("max_score", { precision: 5, scale: 2 }),
  passed: tinyint("passed"),
  assessedBy: bigint("assessed_by", { mode: "number" }),
  assessedAt: timestamp("assessed_at"),
  notes: text("notes"),
});

/**
 * h_employee_certifications - 직원 자격증
 */
export const hEmployeeCertifications = mysqlTable("h_employee_certifications", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  employeeId: bigint("employee_id", { mode: "number" }).notNull(),
  certificationName: varchar("certification_name", { length: 200 }).notNull(),
  certificationNumber: varchar("certification_number", { length: 100 }),
  issuingOrganization: varchar("issuing_organization", { length: 200 }),
  issueDate: date("issue_date"),
  expiryDate: date("expiry_date"),
  status: mysqlEnum("status", ["active", "expired", "suspended"]).default("active"),
  attachmentUrl: varchar("attachment_url", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// 검증/검사 테이블 (8개)
// ============================================================================

/**
 * h_inspection_plans - 검사 계획
 */
export const hInspectionPlans = mysqlTable("h_inspection_plans", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  planName: varchar("plan_name", { length: 200 }).notNull(),
  inspectionType: varchar("inspection_type", { length: 50 }),
  frequency: varchar("frequency", { length: 50 }),
  scheduledDate: date("scheduled_date"),
  assignedTo: bigint("assigned_to", { mode: "number" }),
  status: mysqlEnum("status", ["planned", "in_progress", "completed", "cancelled"]).default("planned"),
  notes: text("notes"),
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_inspection_records - 검사 기록
 */
export const hInspectionRecords = mysqlTable("h_inspection_records", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  planId: bigint("plan_id", { mode: "number" }),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  inspectionDate: date("inspection_date").notNull(),
  inspectionType: varchar("inspection_type", { length: 50 }),
  inspectorId: bigint("inspector_id", { mode: "number" }),
  result: mysqlEnum("result", ["pass", "fail", "conditional"]),
  score: decimal("score", { precision: 5, scale: 2 }),
  findings: text("findings"),
  recommendations: text("recommendations"),
  status: mysqlEnum("status", ["draft", "completed", "approved"]).default("draft"),
  reviewedBy: bigint("reviewed_by", { mode: "number" }),
  reviewedAt: timestamp("reviewed_at"),
  reviewComments: text("review_comments"),
  approvedBy: bigint("approved_by", { mode: "number" }),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_material_inspections - 원재료 검사
 * 실제 DB 구조에 맞춰 수정: receiving_id, inspection_date, inspector_id, status, result
 */
export const hMaterialInspections = mysqlTable("h_material_inspections", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  receivingId: bigint("receiving_id", { mode: "number" }).notNull(), // accounting_purchases.id
  inspectionDate: date("inspection_date").notNull(),
  inspectorId: bigint("inspector_id", { mode: "number" }),
  status: mysqlEnum("status", ["pending", "passed", "failed", "conditional"]).notNull().default("pending"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // 추가 필드 (실제 DB에 존재)
  appearance: varchar("appearance", { length: 200 }),
  odor: varchar("odor", { length: 200 }),
  color: varchar("color", { length: 100 }),
  temperature: decimal("temperature", { precision: 5, scale: 2 }),
  result: mysqlEnum("result", ["pass", "fail", "conditional"]),
});

/**
 * h_product_inspections - 제품 검사
 */
export const hProductInspections = mysqlTable("h_product_inspections", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  batchId: bigint("batch_id", { mode: "number" }),
  productId: bigint("product_id", { mode: "number" }).notNull(),
  inspectionDate: date("inspection_date").notNull(),
  inspectionType: varchar("inspection_type", { length: 50 }),
  sampleSize: int("sample_size"),
  appearance: varchar("appearance", { length: 200 }),
  weight: decimal("weight", { precision: 10, scale: 3 }),
  dimensions: varchar("dimensions", { length: 100 }),
  result: mysqlEnum("result", ["pass", "fail", "conditional"]),
  inspectedBy: bigint("inspected_by", { mode: "number" }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_lab_test_requests - 실험실 검사 요청
 */
export const hLabTestRequests = mysqlTable("h_lab_test_requests", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  requestDate: date("request_date").notNull(),
  sampleType: varchar("sample_type", { length: 50 }),
  sampleId: varchar("sample_id", { length: 100 }),
  testType: varchar("test_type", { length: 100 }),
  priority: mysqlEnum("priority", ["low", "medium", "high", "urgent"]).default("medium"),
  status: mysqlEnum("status", ["requested", "in_progress", "completed", "cancelled"]).default("requested"),
  requestedBy: bigint("requested_by", { mode: "number" }).notNull(),
  assignedTo: bigint("assigned_to", { mode: "number" }),
  dueDate: date("due_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_lab_test_results - 실험실 검사 결과
 */
export const hLabTestResults = mysqlTable("h_lab_test_results", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  requestId: bigint("request_id", { mode: "number" }).notNull(),
  testParameter: varchar("test_parameter", { length: 100 }),
  result: varchar("result", { length: 200 }),
  unit: varchar("unit", { length: 50 }),
  specification: varchar("specification", { length: 200 }),
  status: mysqlEnum("status", ["pass", "fail", "out_of_spec"]),
  testMethod: varchar("test_method", { length: 200 }),
  testedBy: bigint("tested_by", { mode: "number" }),
  testedAt: timestamp("tested_at"),
  notes: text("notes"),
});

/**
 * h_calibration_records - 교정 기록
 */
export const hCalibrationRecords = mysqlTable("h_calibration_records", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  equipmentId: bigint("equipment_id", { mode: "number" }),
  equipmentName: varchar("equipment_name", { length: 200 }).notNull(),
  calibrationDate: date("calibration_date").notNull(),
  calibrationType: varchar("calibration_type", { length: 50 }),
  calibratedBy: varchar("calibrated_by", { length: 200 }),
  result: mysqlEnum("result", ["pass", "fail"]),
  nextCalibrationDate: date("next_calibration_date"),
  certificateNumber: varchar("certificate_number", { length: 100 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_verification_records - 검증 기록
 */
export const hVerificationRecords = mysqlTable("h_verification_records", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  verificationDate: date("verification_date").notNull(),
  verificationType: varchar("verification_type", { length: 50 }),
  referenceType: varchar("reference_type", { length: 50 }),
  referenceId: bigint("reference_id", { mode: "number" }),
  verificationMethod: text("verification_method"),
  result: mysqlEnum("result", ["pass", "fail", "conditional"]),
  findings: text("findings"),
  verifiedBy: bigint("verified_by", { mode: "number" }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// 부적합/시정 테이블 (4개)
// ============================================================================

/**
 * h_nonconformances - 부적합 사항
 */
export const hNonconformances = mysqlTable("h_nonconformances", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  ncNumber: varchar("nc_number", { length: 50 }).unique(),
  ncDate: date("nc_date").notNull(),
  ncType: varchar("nc_type", { length: 50 }),
  category: varchar("category", { length: 100 }),
  severity: mysqlEnum("severity", ["minor", "major", "critical"]),
  description: text("description"),
  referenceType: varchar("reference_type", { length: 50 }),
  referenceId: bigint("reference_id", { mode: "number" }),
  status: mysqlEnum("status", ["open", "in_progress", "resolved", "closed"]).default("open"),
  reportedBy: bigint("reported_by", { mode: "number" }).notNull(),
  assignedTo: bigint("assigned_to", { mode: "number" }),
  dueDate: date("due_date"),
  closedAt: timestamp("closed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_corrective_actions - 시정 조치
 */
export const hCorrectiveActions = mysqlTable("h_corrective_actions", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  ncId: bigint("nc_id", { mode: "number" }).notNull(),
  actionType: varchar("action_type", { length: 50 }),
  actionDescription: text("action_description"),
  rootCause: text("root_cause"),
  preventiveAction: text("preventive_action"),
  implementationDate: date("implementation_date"),
  status: mysqlEnum("status", ["planned", "in_progress", "completed", "verified"]).default("planned"),
  assignedTo: bigint("assigned_to", { mode: "number" }),
  verifiedBy: bigint("verified_by", { mode: "number" }),
  verifiedAt: timestamp("verified_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_capa_records - CAPA (시정 및 예방 조치)
 */
export const hCapaRecords = mysqlTable("h_capa_records", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  capaNumber: varchar("capa_number", { length: 50 }).unique(),
  capaDate: date("capa_date").notNull(),
  capaType: mysqlEnum("capa_type", ["corrective", "preventive", "both"]),
  problemDescription: text("problem_description"),
  rootCauseAnalysis: text("root_cause_analysis"),
  correctiveAction: text("corrective_action"),
  preventiveAction: text("preventive_action"),
  status: mysqlEnum("status", ["open", "in_progress", "completed", "verified", "closed"]).default("open"),
  priority: mysqlEnum("priority", ["low", "medium", "high", "critical"]),
  assignedTo: bigint("assigned_to", { mode: "number" }),
  dueDate: date("due_date"),
  completedAt: timestamp("completed_at"),
  verifiedBy: bigint("verified_by", { mode: "number" }),
  verifiedAt: timestamp("verified_at"),
  effectiveness: mysqlEnum("effectiveness", ["effective", "ineffective", "pending"]),
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_recall_records - 회수 기록
 */
export const hRecallRecords = mysqlTable("h_recall_records", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  recallNumber: varchar("recall_number", { length: 50 }).unique(),
  recallDate: date("recall_date").notNull(),
  recallType: mysqlEnum("recall_type", ["voluntary", "mandatory"]),
  recallReason: text("recall_reason"),
  productId: bigint("product_id", { mode: "number" }),
  batchId: bigint("batch_id", { mode: "number" }),
  lotNumber: varchar("lot_number", { length: 100 }),
  quantityAffected: decimal("quantity_affected", { precision: 10, scale: 3 }),
  quantityRecovered: decimal("quantity_recovered", { precision: 10, scale: 3 }),
  status: mysqlEnum("status", ["initiated", "in_progress", "completed", "closed"]).default("initiated"),
  notificationMethod: text("notification_method"),
  effectivenessCheck: text("effectiveness_check"),
  completedAt: timestamp("completed_at"),
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
