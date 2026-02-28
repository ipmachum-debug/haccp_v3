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
  varchar,
  index,
} from "drizzle-orm/mysql-core";
import { tenants } from '../schema_main';

/**
 * HACCP 검증 시스템 (HACCP 원칙 6)
 * - HACCP 계획 검증
 * - 내부 감사
 */

// ============================================================================
// HACCP 계획 검증 시스템
// ============================================================================

/**
 * h_haccp_plan_verification - HACCP 계획 검증 기록
 * HACCP 원칙 6: 검증 절차 수립
 * 연 1회 이상 HACCP 계획의 적절성 검증
 */
export const hHaccpPlanVerification = mysqlTable("h_haccp_plan_verification", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  
  // 검증 정보
  verificationNumber: varchar("verification_number", { length: 50 }).unique().notNull(), // 검증 번호
  verificationDate: date("verification_date").notNull(), // 검증 일자
  verificationPeriod: varchar("verification_period", { length: 100 }), // 검증 대상 기간 (예: 2026년 1월~12월)
  
  // 검증 유형
  verificationType: mysqlEnum("verification_type", [
    "annual",           // 연간 정기 검증
    "product_change",   // 제품 변경 시 검증
    "process_change",   // 공정 변경 시 검증
    "incident",         // 사고 발생 후 검증
    "regulation_change", // 법규 변경 시 검증
  ]).notNull(),
  
  // 검증 범위
  siteId: bigint("site_id", { mode: "number" }).notNull(), // 사업장
  productIds: text("product_ids"), // 검증 대상 제품 (JSON 배열)
  
  // 검증 팀
  verificationLeader: bigint("verification_leader", { mode: "number" }).notNull(), // 검증 책임자
  verificationTeam: text("verification_team"), // 검증 팀원 (JSON 배열)
  
  // 검증 내용
  verificationScope: text("verification_scope"), // 검증 범위 설명
  verificationMethod: text("verification_method"), // 검증 방법
  
  // 검증 결과
  hazardAnalysisAdequate: tinyint("hazard_analysis_adequate"), // 위험 분석 적절성 (1: 적절, 0: 부적절)
  ccpDeterminationAdequate: tinyint("ccp_determination_adequate"), // CCP 결정 적절성
  criticalLimitsAdequate: tinyint("critical_limits_adequate"), // 한계기준 적절성
  monitoringProceduresAdequate: tinyint("monitoring_procedures_adequate"), // 모니터링 절차 적절성
  correctiveActionsAdequate: tinyint("corrective_actions_adequate"), // 시정 조치 적절성
  recordKeepingAdequate: tinyint("record_keeping_adequate"), // 기록 유지 적절성
  
  overallResult: mysqlEnum("overall_result", [
    "adequate",        // 적절
    "needs_improvement", // 개선 필요
    "inadequate",      // 부적절
  ]).notNull(),
  
  // 발견 사항
  findings: text("findings"), // 발견 사항 (JSON 배열)
  recommendations: text("recommendations"), // 권고 사항
  
  // 개선 조치
  improvementActions: text("improvement_actions"), // 개선 조치 계획
  actionDueDate: date("action_due_date"), // 조치 완료 예정일
  actionCompletedDate: date("action_completed_date"), // 조치 완료 일자
  actionCompletedBy: bigint("action_completed_by", { mode: "number" }), // 조치 완료자
  
  // 승인
  approvedBy: bigint("approved_by", { mode: "number" }), // 승인자
  approvedDate: date("approved_date"), // 승인 일자
  
  // 다음 검증 예정일
  nextVerificationDate: date("next_verification_date"),
  
  // 첨부 파일
  attachments: text("attachments"), // 첨부 파일 (JSON 배열)
  
  notes: text("notes"), // 비고
  
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  verificationDateIdx: index("idx_verification_date").on(table.verificationDate),
  siteIdx: index("idx_site").on(table.siteId),
  typeIdx: index("idx_type").on(table.verificationType),
  resultIdx: index("idx_result").on(table.overallResult),
}));

/**
 * h_haccp_plan_verification_checklist - HACCP 계획 검증 체크리스트
 */
export const hHaccpPlanVerificationChecklist = mysqlTable("h_haccp_plan_verification_checklist", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  verificationId: bigint("verification_id", { mode: "number" }).notNull(),
  
  category: varchar("category", { length: 100 }).notNull(), // 검증 카테고리
  checkItem: text("check_item").notNull(), // 점검 항목
  checkResult: mysqlEnum("check_result", [
    "pass",      // 적합
    "fail",      // 부적합
    "na",        // 해당 없음
  ]).notNull(),
  
  evidence: text("evidence"), // 근거 자료
  remarks: text("remarks"), // 비고
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  verificationIdx: index("idx_verification").on(table.verificationId),
}));

// ============================================================================
// 내부 감사 시스템
// ============================================================================

/**
 * h_internal_audit_plans - 내부 감사 계획
 */
export const hInternalAuditPlans = mysqlTable("h_internal_audit_plans", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  
  // 계획 정보
  planYear: int("plan_year").notNull(), // 계획 연도
  planNumber: varchar("plan_number", { length: 50 }).unique().notNull(), // 계획 번호
  planName: varchar("plan_name", { length: 200 }).notNull(), // 계획명
  
  // 감사 범위
  auditScope: text("audit_scope"), // 감사 범위 설명
  auditFrequency: varchar("audit_frequency", { length: 100 }), // 감사 빈도 (예: 분기별, 반기별)
  
  // 계획 상태
  status: mysqlEnum("status", [
    "draft",      // 초안
    "approved",   // 승인
    "in_progress", // 진행 중
    "completed",  // 완료
  ]).default("draft"),
  
  approvedBy: bigint("approved_by", { mode: "number" }),
  approvedDate: date("approved_date"),
  
  notes: text("notes"),
  
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  yearIdx: index("idx_year").on(table.planYear),
  statusIdx: index("idx_status").on(table.status),
}));

/**
 * h_internal_audits - 내부 감사 실시 기록
 */
export const hInternalAudits = mysqlTable("h_internal_audits", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  planId: bigint("plan_id", { mode: "number" }), // 감사 계획 ID (null 가능 - 임시 감사)
  
  // 감사 정보
  auditNumber: varchar("audit_number", { length: 50 }).unique().notNull(), // 감사 번호
  auditName: varchar("audit_name", { length: 200 }).notNull(), // 감사명
  
  auditType: mysqlEnum("audit_type", [
    "scheduled",   // 정기 감사
    "special",     // 특별 감사
    "follow_up",   // 후속 감사
  ]).notNull(),
  
  // 감사 일정
  scheduledDate: date("scheduled_date").notNull(), // 감사 예정일
  actualStartDate: date("actual_start_date"), // 실제 시작일
  actualEndDate: date("actual_end_date"), // 실제 종료일
  
  // 감사 대상
  siteId: bigint("site_id", { mode: "number" }).notNull(), // 사업장
  auditScope: text("audit_scope"), // 감사 범위
  auditAreas: text("audit_areas"), // 감사 영역 (JSON 배열)
  
  // 감사 팀
  leadAuditor: bigint("lead_auditor", { mode: "number" }).notNull(), // 주 감사자
  auditTeam: text("audit_team"), // 감사 팀원 (JSON 배열)
  
  // 감사 결과
  overallRating: mysqlEnum("overall_rating", [
    "excellent",   // 우수
    "good",        // 양호
    "acceptable",  // 보통
    "needs_improvement", // 개선 필요
    "unacceptable", // 부적합
  ]),
  
  totalCheckItems: int("total_check_items").default(0), // 총 점검 항목 수
  passedItems: int("passed_items").default(0), // 적합 항목 수
  failedItems: int("failed_items").default(0), // 부적합 항목 수
  naItems: int("na_items").default(0), // 해당 없음 항목 수
  
  complianceRate: decimal("compliance_rate", { precision: 5, scale: 2 }), // 준수율 (%)
  
  // 요약
  executiveSummary: text("executive_summary"), // 요약
  strengths: text("strengths"), // 강점
  weaknesses: text("weaknesses"), // 약점
  recommendations: text("recommendations"), // 권고 사항
  
  // 상태
  status: mysqlEnum("status", [
    "scheduled",   // 예정
    "in_progress", // 진행 중
    "completed",   // 완료
    "cancelled",   // 취소
  ]).default("scheduled"),
  
  // 보고서
  reportIssued: tinyint("report_issued").default(0), // 보고서 발행 여부
  reportIssuedDate: date("report_issued_date"), // 보고서 발행일
  reportUrl: varchar("report_url", { length: 500 }), // 보고서 URL
  
  notes: text("notes"),
  
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  planIdx: index("idx_plan").on(table.planId),
  dateIdx: index("idx_date").on(table.scheduledDate),
  siteIdx: index("idx_site").on(table.siteId),
  statusIdx: index("idx_status").on(table.status),
  typeIdx: index("idx_type").on(table.auditType),
}));

/**
 * h_internal_audit_checklist - 내부 감사 체크리스트
 */
export const hInternalAuditChecklist = mysqlTable("h_internal_audit_checklist", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  auditId: bigint("audit_id", { mode: "number" }).notNull(),
  
  // 점검 항목
  category: varchar("category", { length: 100 }).notNull(), // 카테고리 (예: 위생관리, CCP 모니터링)
  subCategory: varchar("sub_category", { length: 100 }), // 하위 카테고리
  checkItem: text("check_item").notNull(), // 점검 항목
  checkCriteria: text("check_criteria"), // 점검 기준
  
  // 점검 결과
  checkResult: mysqlEnum("check_result", [
    "pass",      // 적합
    "fail",      // 부적합
    "na",        // 해당 없음
  ]),
  
  // 부적합 사항
  nonConformityLevel: mysqlEnum("non_conformity_level", [
    "critical",  // 심각
    "major",     // 중대
    "minor",     // 경미
  ]),
  
  findings: text("findings"), // 발견 사항
  evidence: text("evidence"), // 근거 자료
  
  // 시정 조치
  correctiveActionRequired: tinyint("corrective_action_required").default(0), // 시정 조치 필요 여부
  correctiveActionId: bigint("corrective_action_id", { mode: "number" }), // 시정 조치 요청 ID (연결)
  
  remarks: text("remarks"), // 비고
  
  checkedBy: bigint("checked_by", { mode: "number" }), // 점검자
  checkedAt: timestamp("checked_at"), // 점검 시각
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  auditIdx: index("idx_audit").on(table.auditId),
  categoryIdx: index("idx_category").on(table.category),
  resultIdx: index("idx_result").on(table.checkResult),
}));

/**
 * h_internal_audit_findings - 내부 감사 발견 사항 (부적합 사항)
 */
export const hInternalAuditFindings = mysqlTable("h_internal_audit_findings", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  auditId: bigint("audit_id", { mode: "number" }).notNull(),
  checklistItemId: bigint("checklist_item_id", { mode: "number" }), // 체크리스트 항목 ID
  
  // 발견 사항 정보
  findingNumber: varchar("finding_number", { length: 50 }).unique().notNull(), // 발견 사항 번호
  findingType: mysqlEnum("finding_type", [
    "non_conformity",  // 부적합
    "observation",     // 관찰 사항
    "opportunity",     // 개선 기회
  ]).notNull(),
  
  severity: mysqlEnum("severity", [
    "critical",  // 심각
    "major",     // 중대
    "minor",     // 경미
  ]).notNull(),
  
  // 발견 사항 내용
  category: varchar("category", { length: 100 }).notNull(), // 카테고리
  description: text("description").notNull(), // 발견 사항 설명
  requirement: text("requirement"), // 요구 사항
  evidence: text("evidence"), // 근거
  
  // 책임
  responsiblePerson: bigint("responsible_person", { mode: "number" }), // 책임자
  responsibleDepartment: varchar("responsible_department", { length: 100 }), // 책임 부서
  
  // 시정 조치
  correctiveActionRequired: tinyint("corrective_action_required").default(1), // 시정 조치 필요
  correctiveActionId: bigint("corrective_action_id", { mode: "number" }), // 시정 조치 요청 ID
  correctiveActionDueDate: date("corrective_action_due_date"), // 시정 조치 완료 예정일
  
  // 상태
  status: mysqlEnum("status", [
    "open",       // 미해결
    "in_progress", // 진행 중
    "resolved",   // 해결
    "verified",   // 검증 완료
    "closed",     // 종결
  ]).default("open"),
  
  resolvedDate: date("resolved_date"), // 해결 일자
  verifiedBy: bigint("verified_by", { mode: "number" }), // 검증자
  verifiedDate: date("verified_date"), // 검증 일자
  
  notes: text("notes"),
  
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  auditIdx: index("idx_audit").on(table.auditId),
  statusIdx: index("idx_status").on(table.status),
  severityIdx: index("idx_severity").on(table.severity),
  typeIdx: index("idx_type").on(table.findingType),
}));

/**
 * h_internal_audit_attachments - 내부 감사 첨부 파일
 */
export const hInternalAuditAttachments = mysqlTable("h_internal_audit_attachments", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  auditId: bigint("audit_id", { mode: "number" }).notNull(),
  
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileUrl: varchar("file_url", { length: 500 }).notNull(),
  fileType: varchar("file_type", { length: 50 }),
  fileSize: bigint("file_size", { mode: "number" }),
  description: text("description"),
  
  uploadedBy: bigint("uploaded_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  auditIdx: index("idx_audit").on(table.auditId),
}));

// Export types
export type HaccpPlanVerification = typeof hHaccpPlanVerification.$inferSelect;
export type NewHaccpPlanVerification = typeof hHaccpPlanVerification.$inferInsert;

export type HaccpPlanVerificationChecklist = typeof hHaccpPlanVerificationChecklist.$inferSelect;
export type NewHaccpPlanVerificationChecklist = typeof hHaccpPlanVerificationChecklist.$inferInsert;

export type InternalAuditPlan = typeof hInternalAuditPlans.$inferSelect;
export type NewInternalAuditPlan = typeof hInternalAuditPlans.$inferInsert;

export type InternalAudit = typeof hInternalAudits.$inferSelect;
export type NewInternalAudit = typeof hInternalAudits.$inferInsert;

export type InternalAuditChecklist = typeof hInternalAuditChecklist.$inferSelect;
export type NewInternalAuditChecklist = typeof hInternalAuditChecklist.$inferInsert;

export type InternalAuditFinding = typeof hInternalAuditFindings.$inferSelect;
export type NewInternalAuditFinding = typeof hInternalAuditFindings.$inferInsert;

export type InternalAuditAttachment = typeof hInternalAuditAttachments.$inferSelect;
export type NewInternalAuditAttachment = typeof hInternalAuditAttachments.$inferInsert;
