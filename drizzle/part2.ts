import {bigint,
  date,
  decimal,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  tinyint,
  varchar} from "drizzle-orm/mysql-core";
import { tenants } from '../schema_main';

/**
 * Part 2: 나머지 130개 테이블 스키마
 * 카테고리:
 * - 재고 관리 (8개)
 * - 위생 관리 (10개)
 * - 승인/워크플로우 (6개)
 * - 문서/매뉴얼 (8개)
 * - 체크리스트 (6개)
 * - 교육/훈련 (4개)
 * - 검증/검사 (8개)
 * - 부적합/시정 (4개)
 * - 알림/설정 (8개)
 * - 유통/출하 (4개)
 * - 기타 (64개)
 */

// ============================================================================
// 재고 관리 테이블 (8개)
// ============================================================================

/**
 * h_inventory - 재고 마스터
 */
export const hInventory = mysqlTable("h_inventory", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }),
  materialId: bigint("material_id", { mode: "number" }),
  productId: bigint("product_id", { mode: "number" }),
  itemName: varchar("item_name", { length: 255 }), // 품목명 (조회 편의성)
  totalQuantity: decimal("total_quantity", { precision: 10, scale: 3 }).notNull(),
  availableQuantity: decimal("available_quantity", { precision: 10, scale: 3 }).notNull(),
  reservedQuantity: decimal("reserved_quantity", { precision: 10, scale: 3 }).default("0.000"),
  unit: varchar("unit", { length: 20 }).notNull(),
  location: varchar("location", { length: 100 }),
  minStockLevel: decimal("min_stock_level", { precision: 10, scale: 3 }),
  maxStockLevel: decimal("max_stock_level", { precision: 10, scale: 3 }),
  reorderPoint: decimal("reorder_point", { precision: 10, scale: 3 }),
  lastUpdated: timestamp("last_updated").defaultNow(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * h_inventory_lots - 재고 LOT
 */
export const hInventoryLots = mysqlTable("h_inventory_lots", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  inventoryId: bigint("inventory_id", { mode: "number" }),
  lotNumber: varchar("lot_number", { length: 100 }).unique().notNull(),
  batchId: bigint("batch_id", { mode: "number" }),
  materialId: bigint("material_id", { mode: "number" }),
  productId: bigint("product_id", { mode: "number" }),
  quantity: decimal("quantity", { precision: 10, scale: 3 }).notNull(),
  availableQuantity: decimal("available_quantity", { precision: 10, scale: 3 }).notNull(),
  unit: varchar("unit", { length: 20 }).notNull(),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }),
  productionDate: date("production_date"),
  receiptDate: date("receipt_date"),
  expiryDate: date("expiry_date"),
  supplierName: varchar("supplier_name", { length: 200 }),
  manufacturerName: varchar("manufacturer_name", { length: 200 }),
  location: varchar("location", { length: 100 }),
  status: mysqlEnum("status", ["available", "reserved", "used", "expired", "disposed"]).default("available"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * h_inventory_transactions - 재고 거래 내역
 */
export const hInventoryTransactions = mysqlTable("h_inventory_transactions", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  lotId: bigint("lot_id", { mode: "number" }).notNull(),
  inventoryId: bigint("inventory_id", { mode: "number" }), // 재고 마스터 ID
  transactionType: mysqlEnum("transaction_type", [
    "receipt",
    "usage",
    "adjustment",
    "transfer",
    "disposal",
    "return",
    "inbound",
    "outbound",
  ]).notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 3 }).notNull(),
  unit: varchar("unit", { length: 20 }).notNull(),
  unitCost: decimal("unit_cost", { precision: 10, scale: 2 }), // 단가
  amount: decimal("amount", { precision: 15, scale: 2 }), // 금액 (quantity * unitCost)
  transactionDate: date("transaction_date"), // 거래 일자
  referenceType: varchar("reference_type", { length: 50 }),
  referenceId: bigint("reference_id", { mode: "number" }),
  sourceId: bigint("source_id", { mode: "number" }), // 원천 문서 ID
  sourceLineId: bigint("source_line_id", { mode: "number" }), // 원천 문서 라인 ID
  actionType: varchar("action_type", { length: 50 }), // 액션 타입 (posted, canceled 등)
  sourceType: varchar("source_type", { length: 50 }), // 원천 문서 타입
  purpose: varchar("purpose", { length: 100 }), // 거래 목적
  performedBy: bigint("performed_by", { mode: "number" }), // 수행자
  notes: text("notes"),
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

/**
 * h_inventory_adjustments - 재고 조정
 */
export const hInventoryAdjustments = mysqlTable("h_inventory_adjustments", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  adjustmentDate: date("adjustment_date").notNull(),
  lotId: bigint("lot_id", { mode: "number" }),
  adjustmentType: mysqlEnum("adjustment_type", ["increase", "decrease", "correction"]).notNull(),
  quantityBefore: decimal("quantity_before", { precision: 10, scale: 3 }).notNull(),
  quantityAfter: decimal("quantity_after", { precision: 10, scale: 3 }).notNull(),
  reason: text("reason"),
  approvedBy: bigint("approved_by", { mode: "number" }),
  approvedAt: timestamp("approved_at"),
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  tenantId: int("tenant_id").notNull().default(1),
});

/**
 * h_inventory_counts - 재고 실사
 */
export const hInventoryCounts = mysqlTable("h_inventory_counts", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  countDate: date("count_date").notNull(),
  countType: mysqlEnum("count_type", ["full", "partial", "cycle"]).notNull(),
  status: mysqlEnum("status", ["planned", "in_progress", "completed", "cancelled"]).default("planned"),
  notes: text("notes"),
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

/**
 * h_inventory_count_items - 재고 실사 항목
 */
export const hInventoryCountItems = mysqlTable("h_inventory_count_items", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  countId: bigint("count_id", { mode: "number" }).notNull(),
  lotId: bigint("lot_id", { mode: "number" }).notNull(),
  systemQuantity: decimal("system_quantity", { precision: 10, scale: 3 }).notNull(),
  actualQuantity: decimal("actual_quantity", { precision: 10, scale: 3 }),
  variance: decimal("variance", { precision: 10, scale: 3 }),
  notes: text("notes"),
  countedBy: bigint("counted_by", { mode: "number" }),
  countedAt: timestamp("counted_at"),
});

/**
 * h_stock_alerts - 재고 알림
 */
export const hStockAlerts = mysqlTable("h_stock_alerts", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  inventoryId: bigint("inventory_id", { mode: "number" }), // nullable (재고 또는 LOT 단위)
  lotId: bigint("lot_id", { mode: "number" }), // LOT 단위 알람
  alertType: mysqlEnum("alert_type", ["low_stock", "expiring_soon", "expired", "overstock"]).notNull(),
  message: text("message"), // 알림 메시지
  severity: mysqlEnum("severity", ["low", "medium", "high", "critical"]).default("medium"), // 심각도
  alertDate: timestamp("alert_date").defaultNow().notNull(),
  resolved: tinyint("resolved").default(0),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: bigint("resolved_by", { mode: "number" }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(), // 생성 시간
});

/**
 * h_stock_movements - 재고 이동
 */
export const hStockMovements = mysqlTable("h_stock_movements", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  lotId: bigint("lot_id", { mode: "number" }).notNull(),
  fromLocation: varchar("from_location", { length: 100 }),
  toLocation: varchar("to_location", { length: 100 }).notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 3 }).notNull(),
  unit: varchar("unit", { length: 20 }).notNull(),
  movementDate: timestamp("movement_date").defaultNow().notNull(),
  reason: text("reason"),
  movedBy: bigint("moved_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_inbound_headers - 입고 전표 헤더
 * 입고 전표의 헤더 정보 (입고일, 공급업체, 상태 등)
 */
export const hInboundHeaders = mysqlTable("h_inbound_headers", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  inboundNumber: varchar("inbound_number", { length: 50 }).notNull().unique(), // 입고번호 (자동 생성)
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  supplierId: bigint("supplier_id", { mode: "number" }), // 공급업체 ID
  inboundDate: date("inbound_date").notNull(), // 입고일
  status: mysqlEnum("status", ["draft", "confirmed", "cancelled"]).default("draft").notNull(),
  confirmedAt: timestamp("confirmed_at"), // 확정 시간
  confirmedBy: bigint("confirmed_by", { mode: "number" }), // 확정자
  notes: text("notes"), // 비고
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * h_inbound_lines - 입고 전표 라인
 * 입고 전표의 라인 정보 (원재료, 수량, 단가, LOT 등)
 */
export const hInboundLines = mysqlTable("h_inbound_lines", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  headerId: bigint("header_id", { mode: "number" }).notNull(), // 헤더 ID (FK)
  lineNumber: int("line_number").notNull(), // 라인 번호
  materialId: bigint("material_id", { mode: "number" }).notNull(), // 원재료 ID
  purchaseQuantity: decimal("purchase_quantity", { precision: 10, scale: 3 }).notNull(), // 구매 수량 (구매단위)
  purchaseUnit: varchar("purchase_unit", { length: 20 }).notNull(), // 구매 단위
  stockQuantity: decimal("stock_quantity", { precision: 10, scale: 3 }).notNull(), // 재고 수량 (재고단위, 환산된 값)
  stockUnit: varchar("stock_unit", { length: 20 }).notNull(), // 재고 단위
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(), // 단가 (구매단위 기준)
  totalPrice: decimal("total_price", { precision: 12, scale: 2 }).notNull(), // 총 금액
  lotNumber: varchar("lot_number", { length: 100 }), // LOT 번호 (자동 생성 또는 수동 입력)
  expiryDate: date("expiry_date"), // 유통기한
  location: varchar("location", { length: 100 }), // 보관 위치
  notes: text("notes"), // 비고
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

// ============================================================================
// 위생 관리 테이블 (10개)
// ============================================================================

/**
 * h_hygiene_checklists - 위생 체크리스트
 */
export const hHygieneChecklists = mysqlTable("h_hygiene_checklists", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  checkDate: date("check_date").notNull(),
  checkType: varchar("check_type", { length: 50 }).notNull(),
  area: varchar("area", { length: 100 }).notNull(),
  status: mysqlEnum("status", ["draft", "completed", "approved"]).default("draft"),
  checkedBy: bigint("checked_by", { mode: "number" }),
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
// 승인/워크플로우 테이블 (6개)
// ============================================================================

/**
 * h_approval_requests - 승인 요청
 */
export const hApprovalRequests = mysqlTable("h_approval_requests", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
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
  documentId: bigint("document_id", { mode: "number" }).notNull(),
  versionId: bigint("version_id", { mode: "number" }),
  approverRole: varchar("approver_role", { length: 50 }),
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
  categoryName: varchar("category_name", { length: 100 }).notNull(),
  parentCategoryId: bigint("parent_category_id", { mode: "number" }),
  description: text("description"),
  sortOrder: int("sort_order").default(0),
  isActive: tinyint("is_active").default(1),
});

// ============================================================================
// 체크리스트 테이블 (6개)
// ============================================================================

/**
 * h_checklist_templates - 체크리스트 템플릿
 */
export const hChecklistTemplates = mysqlTable("h_checklist_templates", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
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
  templateId: bigint("template_id", { mode: "number" }).notNull(),
  siteId: bigint("site_id", { mode: "number" }),
  referenceType: varchar("reference_type", { length: 50 }),
  referenceId: bigint("reference_id", { mode: "number" }),
  checkDate: date("check_date").notNull(),
  status: mysqlEnum("status", ["draft", "in_progress", "completed", "approved"]).default("draft"),
  completedBy: bigint("completed_by", { mode: "number" }),
  completedAt: timestamp("completed_at"),
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
// 알림/설정 테이블 (8개)
// ============================================================================

/**
 * h_notifications - 알림
 */
export const hNotifications = mysqlTable("h_notifications", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  notificationType: varchar("notification_type", { length: 50 }),
  title: varchar("title", { length: 200 }).notNull(),
  message: text("message"),
  referenceType: varchar("reference_type", { length: 50 }),
  referenceId: bigint("reference_id", { mode: "number" }),
  priority: mysqlEnum("priority", ["low", "medium", "high", "urgent"]).default("medium"),
  isRead: tinyint("is_read").default(0),
  readAt: timestamp("read_at"),
  actionUrl: varchar("action_url", { length: 500 }), // 바로 가기 URL
  isResolved: tinyint("is_resolved").default(0), // 조치 완료 여부
  resolvedAt: timestamp("resolved_at"), // 조치 완료 시각
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_notification_settings - 알림 설정
 */
export const hNotificationSettings = mysqlTable("h_notification_settings", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  
  // 알림 유형별 수신 설정
  ccpDeviationEnabled: tinyint("ccp_deviation_enabled").default(1), // CCP 이탈
  stockLowEnabled: tinyint("stock_low_enabled").default(1), // 재고 부족
  expiryWarningEnabled: tinyint("expiry_warning_enabled").default(1), // 유통기한 임박
  batchCompletedEnabled: tinyint("batch_completed_enabled").default(1), // 배치 완료
  approvalRequestEnabled: tinyint("approval_request_enabled").default(1), // 승인 요청
  inspectionCompletedEnabled: tinyint("inspection_completed_enabled").default(1), // 검사 완료
  healthCertExpiryEnabled: tinyint("health_cert_expiry_enabled").default(1), // 건강진단서 만료 임박
  
  // 알림 채널 설정
  systemNotificationEnabled: tinyint("system_notification_enabled").default(1), // 시스템 알림
  emailEnabled: tinyint("email_enabled").default(0), // 이메일
  smsEnabled: tinyint("sms_enabled").default(0), // SMS
  
  // 알림 수신 시간 설정
  businessHoursOnly: tinyint("business_hours_only").default(0), // 업무 시간만 수신
  businessHoursStart: varchar("business_hours_start", { length: 5 }).default("09:00"), // 업무 시작 시간
  businessHoursEnd: varchar("business_hours_end", { length: 5 }).default("18:00"), // 업무 종료 시간
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * h_system_settings - 시스템 설정
 */
export const hSystemSettings = mysqlTable("h_system_settings", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  settingKey: varchar("setting_key", { length: 100 }).unique().notNull(),
  settingValue: text("setting_value"),
  settingType: varchar("setting_type", { length: 50 }),
  category: varchar("category", { length: 100 }),
  description: text("description"),
  isEditable: tinyint("is_editable").default(1),
  updatedBy: bigint("updated_by", { mode: "number" }),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * h_site_settings - 사업장 설정
 */
export const hSiteSettings = mysqlTable("h_site_settings", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  settingKey: varchar("setting_key", { length: 100 }).notNull(),
  settingValue: text("setting_value"),
  settingType: varchar("setting_type", { length: 50 }),
  description: text("description"),
  updatedBy: bigint("updated_by", { mode: "number" }),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * h_alert_rules - 알림 규칙
 */
export const hAlertRules = mysqlTable("h_alert_rules", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  ruleName: varchar("rule_name", { length: 200 }).notNull(),
  ruleType: varchar("rule_type", { length: 50 }),
  condition: text("condition"),
  triggerEvent: varchar("trigger_event", { length: 100 }),
  notificationTemplate: text("notification_template"),
  isActive: tinyint("is_active").default(1),
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * h_alert_recipients - 알림 수신자
 */
export const hAlertRecipients = mysqlTable("h_alert_recipients", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  ruleId: bigint("rule_id", { mode: "number" }).notNull(),
  userId: bigint("user_id", { mode: "number" }),
  roleId: bigint("role_id", { mode: "number" }),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 20 }),
  notificationMethod: varchar("notification_method", { length: 50 }),
});

/**
 * h_email_logs - 이메일 로그
 */
export const hEmailLogs = mysqlTable("h_email_logs", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  recipient: varchar("recipient", { length: 320 }).notNull(),
  subject: varchar("subject", { length: 500 }),
  body: text("body"),
  status: mysqlEnum("status", ["sent", "failed", "pending"]).default("pending"),
  sentAt: timestamp("sent_at"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_audit_logs - 감사 로그
 */
export const hAuditLogs = mysqlTable("h_audit_logs", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number" }),
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entity_type", { length: 50 }),
  entityId: bigint("entity_id", { mode: "number" }),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// 유통/출하 테이블 (4개)
// ============================================================================

/**
 * h_distribution_records - 유통 기록
 */
export const hDistributionRecords = mysqlTable("h_distribution_records", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  distributionDate: date("distribution_date").notNull(),
  batchId: bigint("batch_id", { mode: "number" }),
  productId: bigint("product_id", { mode: "number" }).notNull(),
  lotNumber: varchar("lot_number", { length: 100 }),
  quantity: decimal("quantity", { precision: 10, scale: 3 }).notNull(),
  unit: varchar("unit", { length: 20 }).notNull(),
  distributorId: bigint("distributor_id", { mode: "number" }),
  distributorName: varchar("distributor_name", { length: 200 }),
  destination: varchar("destination", { length: 200 }),
  vehicleNumber: varchar("vehicle_number", { length: 50 }),
  driverName: varchar("driver_name", { length: 100 }),
  temperature: decimal("temperature", { precision: 5, scale: 2 }),
  status: mysqlEnum("status", ["pending", "in_transit", "delivered", "returned"]).default("pending"),
  deliveredAt: timestamp("delivered_at"),
  notes: text("notes"),
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_distributors - 유통업체
 */
export const hDistributors = mysqlTable("h_distributors", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  distributorCode: varchar("distributor_code", { length: 50 }).unique(),
  distributorName: varchar("distributor_name", { length: 200 }).notNull(),
  businessNumber: varchar("business_number", { length: 50 }),
  contactPerson: varchar("contact_person", { length: 100 }),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 320 }),
  address: text("address"),
  isActive: tinyint("is_active").default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * h_shipping_records - 출하 기록
 */
export const hShippingRecords = mysqlTable("h_shipping_records", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  shippingDate: date("shipping_date").notNull(),
  batchId: bigint("batch_id", { mode: "number" }),
  productId: bigint("product_id", { mode: "number" }).notNull(),
  lotNumber: varchar("lot_number", { length: 100 }),
  quantity: decimal("quantity", { precision: 10, scale: 3 }).notNull(),
  unit: varchar("unit", { length: 20 }).notNull(),
  customerId: bigint("customer_id", { mode: "number" }),
  customerName: varchar("customer_name", { length: 200 }),
  shippingMethod: varchar("shipping_method", { length: 100 }),
  trackingNumber: varchar("tracking_number", { length: 100 }),
  status: mysqlEnum("status", ["prepared", "shipped", "delivered", "cancelled"]).default("prepared"),
  shippedBy: bigint("shipped_by", { mode: "number" }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_customers - 고객
 */
export const hCustomers = mysqlTable("h_customers", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  customerCode: varchar("customer_code", { length: 50 }).unique(),
  customerName: varchar("customer_name", { length: 200 }).notNull(),
  customerType: varchar("customer_type", { length: 50 }),
  businessNumber: varchar("business_number", { length: 50 }),
  contactPerson: varchar("contact_person", { length: 100 }),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 320 }),
  address: text("address"),
  isActive: tinyint("is_active").default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

// ============================================================================
// 기타 테이블 (64개 - 코드, 로그, 통계 등)
// ============================================================================

/**
 * h_code_groups - 코드 그룹
 */
export const hCodeGroups = mysqlTable("h_code_groups", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  groupCode: varchar("group_code", { length: 50 }).unique().notNull(),
  groupName: varchar("group_name", { length: 100 }).notNull(),
  description: text("description"),
  isActive: tinyint("is_active").default(1),
  sortOrder: int("sort_order").default(0),
});

/**
 * h_codes - 코드
 */
export const hCodes = mysqlTable("h_codes", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  groupCode: varchar("group_code", { length: 50 }).notNull(),
  code: varchar("code", { length: 50 }).notNull(),
  codeName: varchar("code_name", { length: 200 }).notNull(),
  codeValue: varchar("code_value", { length: 200 }),
  description: text("description"),
  isActive: tinyint("is_active").default(1),
  sortOrder: int("sort_order").default(0),
});

/**
 * h_equipment - 설비/장비
 */
export const hEquipment = mysqlTable("h_equipment", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  equipmentCode: varchar("equipment_code", { length: 50 }).unique(),
  equipmentName: varchar("equipment_name", { length: 200 }).notNull(),
  equipmentType: varchar("equipment_type", { length: 50 }),
  manufacturer: varchar("manufacturer", { length: 200 }),
  model: varchar("model", { length: 100 }),
  serialNumber: varchar("serial_number", { length: 100 }),
  purchaseDate: date("purchase_date"),
  installationDate: date("installation_date"),
  location: varchar("location", { length: 100 }),
  status: mysqlEnum("status", ["active", "inactive", "maintenance", "retired"]).default("active"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * h_equipment_maintenance - 설비 유지보수
 */
export const hEquipmentMaintenance = mysqlTable("h_equipment_maintenance", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  equipmentId: bigint("equipment_id", { mode: "number" }).notNull(),
  maintenanceDate: date("maintenance_date").notNull(),
  maintenanceType: varchar("maintenance_type", { length: 50 }),
  description: text("description"),
  performedBy: varchar("performed_by", { length: 200 }),
  cost: decimal("cost", { precision: 10, scale: 2 }),
  nextMaintenanceDate: date("next_maintenance_date"),
  status: mysqlEnum("status", ["scheduled", "completed", "cancelled"]).default("scheduled"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_suppliers - 공급업체
 */
export const hSuppliers = mysqlTable("h_suppliers", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  supplierCode: varchar("supplier_code", { length: 50 }).unique(),
  supplierName: varchar("supplier_name", { length: 200 }).notNull(),
  businessNumber: varchar("business_number", { length: 50 }),
  contactPerson: varchar("contact_person", { length: 100 }),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 320 }),
  address: text("address"),
  supplierType: varchar("supplier_type", { length: 50 }),
  certifications: text("certifications"),
  rating: varchar("rating", { length: 20 }),
  isActive: tinyint("is_active").default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * h_supplier_audits - 공급업체 감사
 */
export const hSupplierAudits = mysqlTable("h_supplier_audits", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  supplierId: bigint("supplier_id", { mode: "number" }).notNull(),
  auditDate: date("audit_date").notNull(),
  auditType: varchar("audit_type", { length: 50 }),
  auditorName: varchar("auditor_name", { length: 100 }),
  score: decimal("score", { precision: 5, scale: 2 }),
  result: mysqlEnum("result", ["pass", "fail", "conditional"]),
  findings: text("findings"),
  recommendations: text("recommendations"),
  nextAuditDate: date("next_audit_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_purchase_orders - 구매 주문
 */
export const hPurchaseOrders = mysqlTable("h_purchase_orders", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  poNumber: varchar("po_number", { length: 50 }).unique(),
  supplierId: bigint("supplier_id", { mode: "number" }).notNull(),
  orderDate: date("order_date").notNull(),
  expectedDeliveryDate: date("expected_delivery_date"),
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }),
  status: mysqlEnum("status", ["draft", "submitted", "approved", "received", "cancelled"]).default("draft"),
  notes: text("notes"),
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_purchase_order_items - 구매 주문 항목
 */
export const hPurchaseOrderItems = mysqlTable("h_purchase_order_items", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  poId: bigint("po_id", { mode: "number" }).notNull(),
  materialId: bigint("material_id", { mode: "number" }).notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 3 }).notNull(),
  unit: varchar("unit", { length: 20 }).notNull(),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }),
  totalPrice: decimal("total_price", { precision: 12, scale: 2 }),
  notes: text("notes"),
});

/**
 * h_receiving_records - 입고 기록
 */
export const hReceivingRecords = mysqlTable("h_receiving_records", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  poId: bigint("po_id", { mode: "number" }),
  receiptDate: date("receipt_date").notNull(),
  supplierId: bigint("supplier_id", { mode: "number" }),
  materialId: bigint("material_id", { mode: "number" }).notNull(),
  lotNumber: varchar("lot_number", { length: 100 }),
  quantity: decimal("quantity", { precision: 10, scale: 3 }).notNull(),
  unit: varchar("unit", { length: 20 }).notNull(),
  inspectionStatus: mysqlEnum("inspection_status", ["pending", "pass", "fail"]).default("pending"),
  receivedBy: bigint("received_by", { mode: "number" }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_production_logs - 생산 로그
 */
export const hProductionLogs = mysqlTable("h_production_logs", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  batchId: bigint("batch_id", { mode: "number" }).notNull(),
  logTime: timestamp("log_time").defaultNow().notNull(),
  eventType: varchar("event_type", { length: 50 }),
  description: text("description"),
  operatorId: bigint("operator_id", { mode: "number" }),
  notes: text("notes"),
});

/**
 * h_temperature_logs - 온도 로그
 */
export const hTemperatureLogs = mysqlTable("h_temperature_logs", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  logTime: timestamp("log_time").defaultNow().notNull(),
  location: varchar("location", { length: 100 }),
  equipmentId: bigint("equipment_id", { mode: "number" }),
  temperature: decimal("temperature", { precision: 5, scale: 2 }).notNull(),
  humidity: decimal("humidity", { precision: 5, scale: 2 }),
  status: mysqlEnum("status", ["normal", "warning", "critical"]).default("normal"),
  recordedBy: bigint("recorded_by", { mode: "number" }),
});

/**
 * h_batch_reports - 배치 보고서
 */
export const hBatchReports = mysqlTable("h_batch_reports", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  batchId: bigint("batch_id", { mode: "number" }).notNull(),
  reportDate: date("report_date").notNull(),
  reportType: varchar("report_type", { length: 50 }),
  reportContent: text("report_content"),
  pdfUrl: varchar("pdf_url", { length: 500 }),
  generatedBy: bigint("generated_by", { mode: "number" }),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
});

/**
 * h_daily_reports - 일일 보고서
 */
export const hDailyReports = mysqlTable("h_daily_reports", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  reportDate: date("report_date").notNull(),
  reportType: varchar("report_type", { length: 50 }),
  summary: text("summary"),
  pdfUrl: varchar("pdf_url", { length: 500 }),
  generatedBy: bigint("generated_by", { mode: "number" }),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
});

/**
 * h_monthly_reports - 월간 보고서
 */
export const hMonthlyReports = mysqlTable("h_monthly_reports", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  reportYear: int("report_year").notNull(),
  reportMonth: int("report_month").notNull(),
  reportType: varchar("report_type", { length: 50 }),
  summary: text("summary"),
  pdfUrl: varchar("pdf_url", { length: 500 }),
  generatedBy: bigint("generated_by", { mode: "number" }),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
});

/**
 * h_kpi_metrics - KPI 지표
 */
export const hKpiMetrics = mysqlTable("h_kpi_metrics", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  siteId: bigint("site_id", { mode: "number" }),
  metricDate: date("metric_date").notNull(),
  metricName: varchar("metric_name", { length: 100 }).notNull(),
  metricValue: decimal("metric_value", { precision: 12, scale: 3 }),
  unit: varchar("unit", { length: 50 }),
  target: decimal("target", { precision: 12, scale: 3 }),
  category: varchar("category", { length: 100 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_dashboard_widgets - 대시보드 위젯
 */
export const hDashboardWidgets = mysqlTable("h_dashboard_widgets", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number" }),
  widgetType: varchar("widget_type", { length: 50 }).notNull(),
  widgetTitle: varchar("widget_title", { length: 200 }),
  widgetConfig: text("widget_config"),
  position: int("position").default(0),
  isVisible: tinyint("is_visible").default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_file_attachments - 파일 첨부
 */
export const hFileAttachments = mysqlTable("h_file_attachments", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  referenceType: varchar("reference_type", { length: 50 }).notNull(),
  referenceId: bigint("reference_id", { mode: "number" }).notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileUrl: varchar("file_url", { length: 500 }).notNull(),
  fileSize: bigint("file_size", { mode: "number" }),
  mimeType: varchar("mime_type", { length: 100 }),
  uploadedBy: bigint("uploaded_by", { mode: "number" }),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

/**
 * h_comments - 댓글
 */
export const hComments = mysqlTable("h_comments", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  referenceType: varchar("reference_type", { length: 50 }).notNull(),
  referenceId: bigint("reference_id", { mode: "number" }).notNull(),
  commentText: text("comment_text").notNull(),
  parentCommentId: bigint("parent_comment_id", { mode: "number" }),
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * h_tags - 태그
 */
export const hTags = mysqlTable("h_tags", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tagName: varchar("tag_name", { length: 100 }).unique().notNull(),
  tagColor: varchar("tag_color", { length: 20 }),
  category: varchar("category", { length: 100 }),
  usageCount: int("usage_count").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_entity_tags - 엔티티 태그 연결
 */
export const hEntityTags = mysqlTable("h_entity_tags", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  entityId: bigint("entity_id", { mode: "number" }).notNull(),
  tagId: bigint("tag_id", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_favorites - 즐겨찾기
 */
export const hFavorites = mysqlTable("h_favorites", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  entityId: bigint("entity_id", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_bookmarks - 북마크
 */
export const hBookmarks = mysqlTable("h_bookmarks", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  bookmarkName: varchar("bookmark_name", { length: 200 }).notNull(),
  bookmarkUrl: varchar("bookmark_url", { length: 500 }).notNull(),
  category: varchar("category", { length: 100 }),
  sortOrder: int("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_user_preferences - 사용자 환경설정
 */
export const hUserPreferences = mysqlTable("h_user_preferences", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  preferenceKey: varchar("preference_key", { length: 100 }).notNull(),
  preferenceValue: text("preference_value"),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * h_sessions - 세션
 */
export const hSessions = mysqlTable("h_sessions", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  sessionToken: varchar("session_token", { length: 255 }).unique().notNull(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_login_history - 로그인 이력
 */
export const hLoginHistory = mysqlTable("h_login_history", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  loginAt: timestamp("login_at").defaultNow().notNull(),
  logoutAt: timestamp("logout_at"),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  loginStatus: mysqlEnum("login_status", ["success", "failed"]).default("success"),
});

/**
 * h_api_logs - API 로그
 */
export const hApiLogs = mysqlTable("h_api_logs", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number" }),
  endpoint: varchar("endpoint", { length: 500 }).notNull(),
  method: varchar("method", { length: 10 }),
  statusCode: int("status_code"),
  requestBody: text("request_body"),
  responseBody: text("response_body"),
  duration: int("duration"),
  ipAddress: varchar("ip_address", { length: 45 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_error_logs - 오류 로그
 */
export const hErrorLogs = mysqlTable("h_error_logs", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  errorType: varchar("error_type", { length: 100 }),
  errorMessage: text("error_message"),
  stackTrace: text("stack_trace"),
  userId: bigint("user_id", { mode: "number" }),
  endpoint: varchar("endpoint", { length: 500 }),
  ipAddress: varchar("ip_address", { length: 45 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_scheduled_tasks - 예약 작업
 */
export const hScheduledTasks = mysqlTable("h_scheduled_tasks", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  taskName: varchar("task_name", { length: 200 }).notNull(),
  taskType: varchar("task_type", { length: 50 }),
  schedule: varchar("schedule", { length: 100 }),
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  status: mysqlEnum("status", ["active", "paused", "completed", "failed"]).default("active"),
  isActive: tinyint("is_active").default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_task_history - 작업 이력
 */
export const hTaskHistory = mysqlTable("h_task_history", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  taskId: bigint("task_id", { mode: "number" }).notNull(),
  runAt: timestamp("run_at").defaultNow().notNull(),
  status: mysqlEnum("status", ["success", "failed"]).notNull(),
  duration: int("duration"),
  errorMessage: text("error_message"),
  result: text("result"),
});

/**
 * h_backup_logs - 백업 로그
 */
export const hBackupLogs = mysqlTable("h_backup_logs", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  backupDate: timestamp("backup_date").defaultNow().notNull(),
  backupType: varchar("backup_type", { length: 50 }),
  backupSize: bigint("backup_size", { mode: "number" }),
  backupLocation: varchar("backup_location", { length: 500 }),
  status: mysqlEnum("status", ["success", "failed"]).default("success"),
  errorMessage: text("error_message"),
  duration: int("duration"),
});

/**
 * h_system_health - 시스템 상태
 */
export const hSystemHealth = mysqlTable("h_system_health", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  checkTime: timestamp("check_time").defaultNow().notNull(),
  cpuUsage: decimal("cpu_usage", { precision: 5, scale: 2 }),
  memoryUsage: decimal("memory_usage", { precision: 5, scale: 2 }),
  diskUsage: decimal("disk_usage", { precision: 5, scale: 2 }),
  databaseSize: bigint("database_size", { mode: "number" }),
  activeUsers: int("active_users"),
  status: mysqlEnum("status", ["healthy", "warning", "critical"]).default("healthy"),
});

/**
 * h_change_logs - 변경 로그
 */
export const hChangeLogs = mysqlTable("h_change_logs", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  changeDate: timestamp("change_date").defaultNow().notNull(),
  changeType: varchar("change_type", { length: 50 }),
  entityType: varchar("entity_type", { length: 50 }),
  entityId: bigint("entity_id", { mode: "number" }),
  fieldName: varchar("field_name", { length: 100 }),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  changedBy: bigint("changed_by", { mode: "number" }),
});

/**
 * h_data_migrations - 데이터 마이그레이션
 */
export const hDataMigrations = mysqlTable("h_data_migrations", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  migrationName: varchar("migration_name", { length: 200 }).notNull(),
  migrationVersion: varchar("migration_version", { length: 50 }),
  status: mysqlEnum("status", ["pending", "in_progress", "completed", "failed"]).default("pending"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_integrations - 외부 연동
 */
export const hIntegrations = mysqlTable("h_integrations", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  integrationName: varchar("integration_name", { length: 200 }).notNull(),
  integrationType: varchar("integration_type", { length: 50 }),
  apiEndpoint: varchar("api_endpoint", { length: 500 }),
  apiKey: varchar("api_key", { length: 500 }),
  isActive: tinyint("is_active").default(1),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * h_sync_logs - 동기화 로그
 */
export const hSyncLogs = mysqlTable("h_sync_logs", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  integrationId: bigint("integration_id", { mode: "number" }).notNull(),
  syncAt: timestamp("sync_at").defaultNow().notNull(),
  syncType: varchar("sync_type", { length: 50 }),
  recordsProcessed: int("records_processed"),
  recordsSuccess: int("records_success"),
  recordsFailed: int("records_failed"),
  status: mysqlEnum("status", ["success", "partial", "failed"]).default("success"),
  errorMessage: text("error_message"),
  duration: int("duration"),
});

/**
 * h_webhooks - 웹훅
 */
export const hWebhooks = mysqlTable("h_webhooks", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  webhookName: varchar("webhook_name", { length: 200 }).notNull(),
  webhookUrl: varchar("webhook_url", { length: 500 }).notNull(),
  eventType: varchar("event_type", { length: 100 }),
  isActive: tinyint("is_active").default(1),
  secret: varchar("secret", { length: 255 }),
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_webhook_logs - 웹훅 로그
 */
export const hWebhookLogs = mysqlTable("h_webhook_logs", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  webhookId: bigint("webhook_id", { mode: "number" }).notNull(),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
  payload: text("payload"),
  responseStatus: int("response_status"),
  responseBody: text("response_body"),
  status: mysqlEnum("status", ["success", "failed"]).default("success"),
  errorMessage: text("error_message"),
  duration: int("duration"),
});

/**
 * h_custom_fields - 사용자 정의 필드
 */
export const hCustomFields = mysqlTable("h_custom_fields", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  fieldName: varchar("field_name", { length: 100 }).notNull(),
  fieldType: varchar("field_type", { length: 50 }),
  fieldOptions: text("field_options"),
  isRequired: tinyint("is_required").default(0),
  sortOrder: int("sort_order").default(0),
  isActive: tinyint("is_active").default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_custom_field_values - 사용자 정의 필드 값
 */
export const hCustomFieldValues = mysqlTable("h_custom_field_values", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  fieldId: bigint("field_id", { mode: "number" }).notNull(),
  entityId: bigint("entity_id", { mode: "number" }).notNull(),
  fieldValue: text("field_value"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * h_reports_templates - 보고서 템플릿
 */
export const hReportsTemplates = mysqlTable("h_reports_templates", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  templateName: varchar("template_name", { length: 200 }).notNull(),
  reportType: varchar("report_type", { length: 50 }),
  templateContent: text("template_content"),
  isActive: tinyint("is_active").default(1),
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * h_report_schedules - 보고서 예약
 */
export const hReportSchedules = mysqlTable("h_report_schedules", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  templateId: bigint("template_id", { mode: "number" }).notNull(),
  scheduleName: varchar("schedule_name", { length: 200 }).notNull(),
  frequency: varchar("frequency", { length: 50 }),
  recipients: text("recipients"),
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  isActive: tinyint("is_active").default(1),
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_holidays - 휴일
 */
export const hHolidays = mysqlTable("h_holidays", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  holidayDate: date("holiday_date").notNull(),
  holidayName: varchar("holiday_name", { length: 200 }).notNull(),
  holidayType: varchar("holiday_type", { length: 50 }),
  isRecurring: tinyint("is_recurring").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_work_shifts - 근무 교대
 */
export const hWorkShifts = mysqlTable("h_work_shifts", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  shiftName: varchar("shift_name", { length: 100 }).notNull(),
  startTime: varchar("start_time", { length: 10 }),
  endTime: varchar("end_time", { length: 10 }),
  isActive: tinyint("is_active").default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_employee_shifts - 직원 교대 배정
 */
export const hEmployeeShifts = mysqlTable("h_employee_shifts", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  employeeId: bigint("employee_id", { mode: "number" }).notNull(),
  shiftId: bigint("shift_id", { mode: "number" }).notNull(),
  workDate: date("work_date").notNull(),
  status: mysqlEnum("status", ["scheduled", "completed", "absent", "cancelled"]).default("scheduled"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_attendance_records - 출퇴근 기록
 */
export const hAttendanceRecords = mysqlTable("h_attendance_records", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  employeeId: bigint("employee_id", { mode: "number" }).notNull(),
  workDate: date("work_date").notNull(),
  checkInTime: timestamp("check_in_time"),
  checkOutTime: timestamp("check_out_time"),
  workHours: decimal("work_hours", { precision: 5, scale: 2 }),
  status: mysqlEnum("status", ["present", "absent", "late", "early_leave"]),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_leave_requests - 휴가 신청
 */
export const hLeaveRequests = mysqlTable("h_leave_requests", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  employeeId: bigint("employee_id", { mode: "number" }).notNull(),
  leaveType: varchar("leave_type", { length: 50 }),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  days: decimal("days", { precision: 5, scale: 1 }),
  reason: text("reason"),
  status: mysqlEnum("status", ["pending_review", "pending_approval", "pending", "approved", "rejected", "cancelled"]).default("pending_review"),
  approvedBy: bigint("approved_by", { mode: "number" }),
  approvedAt: timestamp("approved_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_overtime_records - 초과근무 기록
 */
export const hOvertimeRecords = mysqlTable("h_overtime_records", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  employeeId: bigint("employee_id", { mode: "number" }).notNull(),
  workDate: date("work_date").notNull(),
  overtimeHours: decimal("overtime_hours", { precision: 5, scale: 2 }).notNull(),
  reason: text("reason"),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending"),
  approvedBy: bigint("approved_by", { mode: "number" }),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_performance_reviews - 성과 평가
 */
export const hPerformanceReviews = mysqlTable("h_performance_reviews", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  employeeId: bigint("employee_id", { mode: "number" }).notNull(),
  reviewPeriodStart: date("review_period_start").notNull(),
  reviewPeriodEnd: date("review_period_end").notNull(),
  reviewerId: bigint("reviewer_id", { mode: "number" }),
  overallRating: decimal("overall_rating", { precision: 3, scale: 2 }),
  strengths: text("strengths"),
  areasForImprovement: text("areas_for_improvement"),
  goals: text("goals"),
  comments: text("comments"),
  status: mysqlEnum("status", ["draft", "completed", "acknowledged"]).default("draft"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_incidents - 사고 기록
 */
export const hIncidents = mysqlTable("h_incidents", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
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
  approvedBy: bigint("approved_by", { mode: "number" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_emergency_contacts - 비상 연락처
 */
export const hEmergencyContacts = mysqlTable("h_emergency_contacts", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
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
export const hCustomerFeedback = mysqlTable("h_customer_feedback", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  feedbackDate: date("feedback_date").notNull(),
  customerId: bigint("customer_id", { mode: "number" }),
  feedbackType: varchar("feedback_type", { length: 50 }),
  rating: int("rating"),
  comments: text("comments"),
  productId: bigint("product_id", { mode: "number" }),
  status: mysqlEnum("status", ["new", "reviewed", "actioned"]).default("new"),
  reviewedBy: bigint("reviewed_by", { mode: "number" }),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_quality_objectives - 품질 목표
 */
export const hQualityObjectives = mysqlTable("h_quality_objectives", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
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
  approvedBy: bigint("approved_by", { mode: "number" }),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 배치 승인 테이블
export const hBatchApprovals = mysqlTable("h_batch_approvals", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  batchId: bigint("batch_id", { mode: "number" }).notNull(),
  approverId: bigint("approver_id", { mode: "number" }).notNull(),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  approvalDate: timestamp("approval_date"),
  rejectionReason: text("rejection_reason"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

// CCP 점검 기록 테이블 (중복 - schema_main.ts에 정의됨)
// export const hCcpRecords = mysqlTable("h_ccp_records", {
//   id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
//   instanceId: bigint("instance_id", { mode: "number" }).notNull(),
//   recordData: text("record_data"), // JSON 형식: {measuredValue, result, inspector, notes}
//   createdAt: timestamp("created_at").defaultNow().notNull(),
// });

// CCP 이탈 기록 테이블
export const hCcpDeviations = mysqlTable("h_ccp_deviations", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  ccpInstanceId: bigint("ccp_instance_id", { mode: "number" }).notNull(),
  ccpRowId: bigint("ccp_row_id", { mode: "number" }),
  batchId: bigint("batch_id", { mode: "number" }).notNull(),
  deviationType: varchar("deviation_type", { length: 50 }).notNull(), // 'temperature', 'time', 'pressure', 'visual'
  criticalLimit: varchar("critical_limit", { length: 200 }).notNull(), // 한계기준 (예: ">=85°C")
  actualValue: varchar("actual_value", { length: 200 }).notNull(), // 실제 측정값
  deviationDate: timestamp("deviation_date").notNull(),
  severity: mysqlEnum("severity", ["low", "medium", "high", "critical"]).notNull(),
  correctiveAction: text("corrective_action"), // 시정 조치
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: bigint("resolved_by", { mode: "number" }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
});

// 거래처 평가 테이블
export const hSupplierEvaluations = mysqlTable("h_supplier_evaluations", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  supplierId: bigint("supplier_id", { mode: "number" }).notNull(),
  evaluationDate: date("evaluation_date").notNull(),
  evaluatedBy: bigint("evaluated_by", { mode: "number" }).notNull(),
  qualityScore: int("quality_score").notNull(), // 품질 점수 (1-5)
  deliveryScore: int("delivery_score").notNull(), // 납기 점수 (1-5)
  priceScore: int("price_score").notNull(), // 가격 점수 (1-5)
  serviceScore: int("service_score").notNull(), // 서비스 점수 (1-5)
  responseScore: int("response_score").notNull(), // 대응 점수 (1-5)
  overallScore: decimal("overall_score", { precision: 3, scale: 2 }).notNull(), // 전체 평균 점수
  comments: text("comments"),
  strengths: text("strengths"), // 강점
  weaknesses: text("weaknesses"), // 약점
  recommendations: text("recommendations"), // 개선 권장사항
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

// hBatchInputs는 schema_main.ts에 정의됨 (중복 제거)

// 배치 수익성 예측 기록 테이블
export const hProfitabilityForecasts = mysqlTable("h_profitability_forecasts", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  forecastDate: timestamp("forecast_date").notNull(), // 예측을 수행한 날짜
  targetMonth: varchar("target_month", { length: 7 }).notNull(), // 예측 대상 월 (YYYY-MM 형식)
  predictedRevenue: decimal("predicted_revenue", { precision: 15, scale: 2 }).notNull(), // 예측 매출액
  predictedCost: decimal("predicted_cost", { precision: 15, scale: 2 }).notNull(), // 예측 원가
  predictedProfitMargin: decimal("predicted_profit_margin", { precision: 5, scale: 2 }).notNull(), // 예측 수익률 (%)
  actualRevenue: decimal("actual_revenue", { precision: 15, scale: 2 }), // 실제 매출액 (월 마감 후 업데이트)
  actualCost: decimal("actual_cost", { precision: 15, scale: 2 }), // 실제 원가
  actualProfitMargin: decimal("actual_profit_margin", { precision: 5, scale: 2 }), // 실제 수익률 (%)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});


// CCP 점검 알림 테이블
export const hCcpInspectionAlerts = mysqlTable("h_ccp_inspection_alerts", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  instanceId: bigint("instance_id", { mode: "number" }).notNull(),
  scheduledTime: timestamp("scheduled_time").notNull(),
  status: mysqlEnum("status", ["pending", "notified", "completed", "skipped"]).default("pending"),
  notifiedAt: timestamp("notified_at"),
  completedAt: timestamp("completed_at"),
  advanceNoticeMinutes: int("advance_notice_minutes").default(30),
  advanceNotifiedAt: timestamp("advance_notified_at"),
  isAdvanceNotification: tinyint("is_advance_notification").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

// h_ccp_instances 테이블은 schema_main.ts에 정의됨 (중복 제거)


// 배치 생산 일정 캘린더 테이블
export const hBatchSchedules = mysqlTable("h_batch_schedules", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  batchId: bigint("batch_id", { mode: "number" }).notNull(),
  scheduledDate: timestamp("scheduled_date").notNull(),
  status: varchar("status", { length: 50 }).default("planned"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// ============================================================================
// HACCP 핵심 기능 테이블 (4개) - 2026-02-01 추가
// ============================================================================

/**
 * h_ccp_monitoring - CCP 모니터링 기록
 */
export const hCcpMonitoring = mysqlTable("h_ccp_monitoring", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  ccpPoint: varchar("ccp_point", { length: 255 }).notNull(), // CCP 지점 (예: 냉장고 온도)
  monitoringDate: date("monitoring_date").notNull(),
  monitoringTime: varchar("monitoring_time", { length: 10 }).notNull(), // HH:MM 형식
  measuredValue: varchar("measured_value", { length: 100 }).notNull(), // 측정값
  criticalLimit: varchar("critical_limit", { length: 100 }).notNull(), // 한계기준
  status: mysqlEnum("status", ["normal", "warning", "critical"]).notNull().default("normal"),
  monitoredBy: bigint("monitored_by", { mode: "number" }).notNull(), // 모니터링 담당자 ID
  notes: text("notes"), // 비고
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/**
 * h_production_batches - 생산 배치
 */
export const hProductionBatches = mysqlTable("h_production_batches", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  batchNumber: varchar("batch_number", { length: 50 }).notNull().unique(), // 배치 번호
  productId: bigint("product_id", { mode: "number" }).notNull(), // 제품 ID
  plannedQuantity: varchar("planned_quantity", { length: 50 }).notNull(), // 계획 수량
  actualQuantity: varchar("actual_quantity", { length: 50 }), // 실제 생산 수량
  productionDate: date("production_date").notNull(), // 생산일자
  expiryDate: date("expiry_date"), // 유통기한
  status: mysqlEnum("status", ["planned", "in_progress", "completed", "cancelled"]).notNull().default("planned"),
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/**
 * h_production_material_usage - 생산 배치별 원재료 소비
 */
export const hProductionMaterialUsage = mysqlTable("h_production_material_usage", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  batchId: bigint("batch_id", { mode: "number" }).notNull(), // 생산 배치 ID
  materialId: bigint("material_id", { mode: "number" }).notNull(), // 원재료 ID
  lotNumber: varchar("lot_number", { length: 50 }).notNull(), // LOT 번호
  plannedQuantity: varchar("planned_quantity", { length: 50 }).notNull(), // 계획 사용량
  actualQuantity: varchar("actual_quantity", { length: 50 }), // 실제 사용량
  unit: varchar("unit", { length: 20 }).notNull(), // 단위
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/**
 * h_product_inventory - 제품 재고
 */
export const hProductInventory = mysqlTable("h_product_inventory", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  productId: bigint("product_id", { mode: "number" }).notNull(), // 제품 ID
  quantity: varchar("quantity", { length: 50 }).notNull(), // 총 수량
  availableQuantity: varchar("available_quantity", { length: 50 }).notNull(), // 가용 수량
  unit: varchar("unit", { length: 20 }).notNull(), // 단위
  location: varchar("location", { length: 100 }), // 보관 위치
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
