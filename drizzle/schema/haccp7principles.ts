import {
  bigint,
  date,
  decimal,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  tinyint,
  varchar
} from "drizzle-orm/mysql-core";
import { tenants } from '../schema_main';

/**
 * HACCP 7원칙 관련 테이블
 * - 위험 분석 (HACCP 원칙 1)
 * - 시정 조치 관리
 * - 교육 훈련 관리
 */

// ============================================================================
// 위험 분석 시스템 (HACCP 원칙 1)
// ============================================================================

/**
 * h_hazard_analysis - 제품별 위험 분석
 * HACCP 원칙 1: 위험 요소 분석
 */
export const hHazardAnalysis = mysqlTable("h_hazard_analysis", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  productId: bigint("product_id", { mode: "number" }).notNull(),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  processStep: varchar("process_step", { length: 200 }).notNull(), // 공정 단계
  hazardType: mysqlEnum("hazard_type", [
    "biological", // 생물학적 위해 (미생물, 병원균)
    "chemical",   // 화학적 위해 (잔류 농약, 중금속)
    "physical",   // 물리적 위해 (이물질, 금속)
  ]).notNull(),
  hazardDescription: text("hazard_description").notNull(), // 위험 요소 설명
  
  // 위험도 평가
  severity: int("severity").notNull(), // 심각도 (1-5)
  likelihood: int("likelihood").notNull(), // 발생 가능성 (1-5)
  riskScore: int("risk_score").notNull(), // 위험도 점수 (severity * likelihood)
  riskLevel: mysqlEnum("risk_level", ["low", "medium", "high", "critical"]).notNull(),
  
  // CCP 결정
  isCcp: tinyint("is_ccp").default(0), // CCP 여부 (1: CCP, 0: 일반 관리점)
  ccpNumber: varchar("ccp_number", { length: 50 }), // CCP 번호 (예: CCP-1B)
  
  // 관리 방법
  controlMeasures: text("control_measures"), // 관리 방법
  monitoringProcedure: text("monitoring_procedure"), // 모니터링 절차
  criticalLimit: varchar("critical_limit", { length: 200 }), // 한계기준
  
  // 승인 및 검증
  status: mysqlEnum("status", ["draft", "submitted", "approved", "rejected"]).default("draft"),
  analyzedBy: bigint("analyzed_by", { mode: "number" }).notNull(),
  analyzedDate: date("analyzed_date").notNull(),
  approvedBy: bigint("approved_by", { mode: "number" }),
  approvedDate: date("approved_date"),
  reviewDate: date("review_date"), // 재검토 예정일
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * h_hazard_controls - 위험 요소 관리 방법
 */
export const hHazardControls = mysqlTable("h_hazard_controls", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  hazardAnalysisId: bigint("hazard_analysis_id", { mode: "number" }).notNull(),
  controlType: mysqlEnum("control_type", [
    "preventive",  // 예방적 관리
    "corrective",  // 시정적 관리
    "monitoring",  // 모니터링
  ]).notNull(),
  controlDescription: text("control_description").notNull(),
  responsibility: varchar("responsibility", { length: 100 }), // 담당자
  frequency: varchar("frequency", { length: 100 }), // 실행 빈도
  recordForm: varchar("record_form", { length: 200 }), // 기록 양식
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// 시정 조치 관리 시스템 (개선)
// ============================================================================

/**
 * h_corrective_action_requests - 시정 조치 요청
 * CCP 이탈 발생 시 자동 생성
 */
export const hCorrectiveActionRequests = mysqlTable("h_corrective_action_requests", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  requestNumber: varchar("request_number", { length: 50 }).unique().notNull(),
  
  // 발생 정보
  sourceType: mysqlEnum("source_type", [
    "ccp_deviation",      // CCP 이탈
    "inspection_failure", // 검사 부적합
    "customer_complaint", // 고객 불만
    "internal_audit",     // 내부 감사
    "other",              // 기타
  ]).notNull(),
  sourceId: bigint("source_id", { mode: "number" }), // 원인 ID (배치, 검사 등)
  
  batchId: bigint("batch_id", { mode: "number" }),
  ccpInstanceId: bigint("ccp_instance_id", { mode: "number" }),
  
  // 문제 설명
  problemDescription: text("problem_description").notNull(),
  occurredAt: timestamp("occurred_at").notNull(),
  detectedBy: bigint("detected_by", { mode: "number" }).notNull(),
  
  // 즉시 조치
  immediateAction: text("immediate_action"), // 즉시 취한 조치
  immediateActionBy: bigint("immediate_action_by", { mode: "number" }),
  immediateActionAt: timestamp("immediate_action_at"),
  
  // 근본 원인 분석
  rootCauseAnalysis: text("root_cause_analysis"),
  rootCauseCategory: mysqlEnum("root_cause_category", [
    "human_error",      // 인적 오류
    "equipment_failure", // 설비 고장
    "material_defect",   // 원재료 결함
    "process_issue",     // 공정 문제
    "environmental",     // 환경적 요인
    "other",             // 기타
  ]),
  
  // 시정 조치
  correctiveAction: text("corrective_action"),
  actionBy: bigint("action_by", { mode: "number" }),
  actionStartDate: date("action_start_date"),
  actionDueDate: date("action_due_date"),
  actionCompletedDate: date("action_completed_date"),
  
  // 효과 검증
  verificationMethod: text("verification_method"),
  verificationResult: text("verification_result"),
  verifiedBy: bigint("verified_by", { mode: "number" }),
  verifiedDate: date("verified_date"),
  isEffective: tinyint("is_effective"), // 효과 여부 (1: 효과적, 0: 비효과적)
  
  // 상태 관리
  status: mysqlEnum("status", [
    "open",          // 접수
    "investigating", // 조사 중
    "action_taken",  // 조치 완료
    "verifying",     // 검증 중
    "closed",        // 종결
    "reopened",      // 재개
  ]).default("open"),
  
  priority: mysqlEnum("priority", ["low", "medium", "high", "critical"]).default("medium"),
  
  // 예방 조치
  preventiveAction: text("preventive_action"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * h_corrective_action_attachments - 시정 조치 첨부 파일
 */
export const hCorrectiveActionAttachments = mysqlTable("h_corrective_action_attachments", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  requestId: bigint("request_id", { mode: "number" }).notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileUrl: varchar("file_url", { length: 500 }).notNull(),
  fileType: varchar("file_type", { length: 50 }),
  fileSize: bigint("file_size", { mode: "number" }),
  uploadedBy: bigint("uploaded_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// 교육 훈련 관리 시스템 (개선)
// ============================================================================

/**
 * h_training_courses - 교육 과정
 */
export const hTrainingCourses = mysqlTable("h_training_courses", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  courseCode: varchar("course_code", { length: 50 }).unique().notNull(),
  courseName: varchar("course_name", { length: 200 }).notNull(),
  
  category: mysqlEnum("category", [
    "haccp_basic",      // HACCP 기초
    "haccp_advanced",   // HACCP 심화
    "hygiene",          // 위생 관리
    "safety",           // 안전 관리
    "quality",          // 품질 관리
    "equipment",        // 설비 운영
    "regulation",       // 법규 교육
    "other",            // 기타
  ]).notNull(),
  
  description: text("description"),
  objectives: text("objectives"), // 교육 목표
  duration: int("duration").notNull(), // 교육 시간 (분)
  
  // 필수 여부
  isMandatory: tinyint("is_mandatory").default(0),
  targetRoles: varchar("target_roles", { length: 200 }), // 대상 역할 (JSON 배열)
  
  // 재교육 주기
  validityPeriod: int("validity_period"), // 유효 기간 (월)
  
  // 교육 자료
  materials: text("materials"), // 교육 자료 URL (JSON 배열)
  
  // 평가 기준
  hasAssessment: tinyint("has_assessment").default(0),
  passingScore: decimal("passing_score", { precision: 5, scale: 2 }), // 합격 점수
  
  status: mysqlEnum("status", ["active", "inactive", "archived"]).default("active"),
  
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * h_training_schedules - 교육 일정
 */
export const hTrainingSchedules = mysqlTable("h_training_schedules", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  courseId: bigint("course_id", { mode: "number" }).notNull(),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  
  scheduledDate: date("scheduled_date").notNull(),
  startTime: varchar("start_time", { length: 10 }), // HH:MM
  endTime: varchar("end_time", { length: 10 }), // HH:MM
  location: varchar("location", { length: 200 }),
  
  trainerId: bigint("trainer_id", { mode: "number" }),
  trainerName: varchar("trainer_name", { length: 100 }),
  
  maxParticipants: int("max_participants"),
  registeredCount: int("registered_count").default(0),
  
  status: mysqlEnum("status", ["scheduled", "in_progress", "completed", "cancelled"]).default("scheduled"),
  
  notes: text("notes"),
  
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * h_training_participants - 교육 참가자
 */
export const hTrainingParticipants = mysqlTable("h_training_participants", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  scheduleId: bigint("schedule_id", { mode: "number" }).notNull(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  
  registrationDate: timestamp("registration_date").defaultNow().notNull(),
  attendanceStatus: mysqlEnum("attendance_status", [
    "registered",  // 등록
    "attended",    // 참석
    "absent",      // 결석
    "excused",     // 사유 결석
  ]).default("registered"),
  
  // 평가 결과
  assessmentScore: decimal("assessment_score", { precision: 5, scale: 2 }),
  passed: tinyint("passed"),
  
  // 수료증
  certificateIssued: tinyint("certificate_issued").default(0),
  certificateNumber: varchar("certificate_number", { length: 100 }),
  certificateUrl: varchar("certificate_url", { length: 500 }),
  
  // 만료일
  expiryDate: date("expiry_date"), // 재교육 필요 일자
  
  notes: text("notes"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * h_training_reminders - 교육 만료 알림
 */
export const hTrainingReminders = mysqlTable("h_training_reminders", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  participantId: bigint("participant_id", { mode: "number" }).notNull(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  courseId: bigint("course_id", { mode: "number" }).notNull(),
  
  reminderType: mysqlEnum("reminder_type", [
    "upcoming",  // 교육 예정 알림
    "expiring",  // 만료 임박 알림
    "expired",   // 만료 알림
  ]).notNull(),
  
  reminderDate: date("reminder_date").notNull(),
  expiryDate: date("expiry_date").notNull(),
  
  sent: tinyint("sent").default(0),
  sentAt: timestamp("sent_at"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
