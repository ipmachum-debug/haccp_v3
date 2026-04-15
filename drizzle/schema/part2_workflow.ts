/**
 * part2 분할: 승인/워크플로우 + 문서/매뉴얼
 */
import {
  bigint, boolean, date, decimal, int, json,
  mysqlEnum, mysqlTable, text, timestamp, tinyint, varchar
} from "drizzle-orm/mysql-core";
import { tenants } from "./schema_main_core";

// 승인/워크플로우 테이블 (6개)
// ============================================================================

/**
 * h_approval_requests - 승인 요청
 */
export const hApprovalRequests = mysqlTable("h_approval_requests", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  requestType: varchar("request_type", { length: 50 }).notNull(),
  referenceType: varchar("reference_type", { length: 50 }),
  referenceId: bigint("reference_id", { mode: "number" }),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["pending_review", "pending_approval", "pending", "approved", "rejected", "cancelled"]).default("pending_review"),
  priority: mysqlEnum("priority", ["low", "medium", "high", "urgent"]).default("medium"),
  requestedBy: bigint("requested_by", { mode: "number" }).notNull(),
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  reviewedBy: bigint("reviewed_by", { mode: "number" }),
  reviewedAt: timestamp("reviewed_at"),
  reviewComments: text("review_comments"),
  approvedBy: bigint("approved_by", { mode: "number" }),
  approvedAt: timestamp("approved_at"),
  rejectedBy: bigint("rejected_by", { mode: "number" }),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_approval_workflows - 승인 워크플로우
 */
export const hApprovalWorkflows = mysqlTable("h_approval_workflows", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  workflowName: varchar("workflow_name", { length: 100 }).notNull(),
  workflowType: varchar("workflow_type", { length: 50 }).notNull(),
  description: text("description"),
  isActive: tinyint("is_active").default(1),
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * h_approval_workflow_steps - 승인 워크플로우 단계
 */
export const hApprovalWorkflowSteps = mysqlTable("h_approval_workflow_steps", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  workflowId: bigint("workflow_id", { mode: "number" }).notNull(),
  stepOrder: int("step_order").notNull(),
  stepName: varchar("step_name", { length: 100 }).notNull(),
  approverRoleId: bigint("approver_role_id", { mode: "number" }),
  approverUserId: bigint("approver_user_id", { mode: "number" }),
  isRequired: tinyint("is_required").default(1),
  timeoutHours: int("timeout_hours"),
});

/**
 * h_approval_history - 승인 이력
 */
export const hApprovalHistory = mysqlTable("h_approval_history", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  requestId: bigint("request_id", { mode: "number" }).notNull(),
  stepId: bigint("step_id", { mode: "number" }),
  action: mysqlEnum("action", ["submitted", "approved", "rejected", "cancelled", "delegated"]).notNull(),
  actionBy: bigint("action_by", { mode: "number" }).notNull(),
  actionAt: timestamp("action_at").defaultNow().notNull(),
  comments: text("comments"),
  attachments: text("attachments"),
});

/**
 * h_delegation_records - 위임 기록
 */
export const hDelegationRecords = mysqlTable("h_delegation_records", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  delegatorId: bigint("delegator_id", { mode: "number" }).notNull(),
  delegateeId: bigint("delegatee_id", { mode: "number" }).notNull(),
  delegationType: varchar("delegation_type", { length: 50 }),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  reason: text("reason"),
  isActive: tinyint("is_active").default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_signature_records - 서명 기록
 */
export const hSignatureRecords = mysqlTable("h_signature_records", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  referenceType: varchar("reference_type", { length: 50 }).notNull(),
  referenceId: bigint("reference_id", { mode: "number" }).notNull(),
  signatureType: varchar("signature_type", { length: 50 }),
  signatureData: text("signature_data"),
  signedBy: bigint("signed_by", { mode: "number" }).notNull(),
  signedAt: timestamp("signed_at").defaultNow().notNull(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
});

// ============================================================================
// 문서/매뉴얼 테이블 (8개)
// ============================================================================

/**
 * h_documents - 문서
 */
export const hDocuments = mysqlTable("h_documents", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }),
  documentCode: varchar("document_code", { length: 50 }).unique(),
  documentTitle: varchar("document_title", { length: 200 }).notNull(),
  documentType: varchar("document_type", { length: 50 }),
  category: varchar("category", { length: 100 }),
  version: varchar("version", { length: 20 }),
  status: mysqlEnum("status", ["draft", "review", "approved", "obsolete"]).default("draft"),
  effectiveDate: date("effective_date"),
  expiryDate: date("expiry_date"),
  description: text("description"),
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * h_document_versions - 문서 버전
 */
export const hDocumentVersions = mysqlTable("h_document_versions", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  documentId: bigint("document_id", { mode: "number" }).notNull(),
  versionNumber: varchar("version_number", { length: 20 }).notNull(),
  changeDescription: text("change_description"),
  fileUrl: varchar("file_url", { length: 500 }),
  fileSize: bigint("file_size", { mode: "number" }),
  uploadedBy: bigint("uploaded_by", { mode: "number" }),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

/**
 * h_document_approvals - 문서 승인
 */
export const hDocumentApprovals = mysqlTable("h_document_approvals", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  documentId: bigint("document_id", { mode: "number" }).notNull(),
  versionId: bigint("version_id", { mode: "number" }),
  approverRole: varchar("approver_role", { length: 50 }),
  reviewedBy: bigint("reviewed_by", { mode: "number" }),
  reviewedAt: timestamp("reviewed_at"),
  reviewComments: text("review_comments"),
  approvedBy: bigint("approved_by", { mode: "number" }),
  approvedAt: timestamp("approved_at"),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending"),
  comments: text("comments"),
});

/**
 * h_document_attachments - 문서 첨부파일
 */
export const hDocumentAttachments = mysqlTable("h_document_attachments", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  documentId: bigint("document_id", { mode: "number" }).notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileUrl: varchar("file_url", { length: 500 }).notNull(),
  fileSize: bigint("file_size", { mode: "number" }),
  mimeType: varchar("mime_type", { length: 100 }),
  uploadedBy: bigint("uploaded_by", { mode: "number" }),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

/**
 * h_document_access_logs - 문서 접근 로그
 */
export const hDocumentAccessLogs = mysqlTable("h_document_access_logs", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  documentId: bigint("document_id", { mode: "number" }).notNull(),
  accessType: varchar("access_type", { length: 20 }),
  accessedBy: bigint("accessed_by", { mode: "number" }).notNull(),
  accessedAt: timestamp("accessed_at").defaultNow().notNull(),
  ipAddress: varchar("ip_address", { length: 45 }),
});

/**
 * h_sop_manuals - SOP 매뉴얼
 */
export const hSopManuals = mysqlTable("h_sop_manuals", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }),
  sopCode: varchar("sop_code", { length: 50 }).unique(),
  sopTitle: varchar("sop_title", { length: 200 }).notNull(),
  category: varchar("category", { length: 100 }),
  version: varchar("version", { length: 20 }),
  effectiveDate: date("effective_date"),
  reviewDate: date("review_date"),
  content: text("content"),
  status: mysqlEnum("status", ["active", "under_review", "obsolete"]).default("active"),
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * h_training_materials - 교육 자료
 */
export const hTrainingMaterials = mysqlTable("h_training_materials", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  materialTitle: varchar("material_title", { length: 200 }).notNull(),
  materialType: varchar("material_type", { length: 50 }),
  category: varchar("category", { length: 100 }),
  description: text("description"),
  fileUrl: varchar("file_url", { length: 500 }),
  duration: int("duration"),
  isActive: tinyint("is_active").default(1),
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_document_categories - 문서 카테고리
 */
export const hDocumentCategories = mysqlTable("h_document_categories", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  categoryName: varchar("category_name", { length: 100 }).notNull(),
  parentCategoryId: bigint("parent_category_id", { mode: "number" }),
  description: text("description"),
  sortOrder: int("sort_order").default(0),
  isActive: tinyint("is_active").default(1),
});

// ============================================================================
