/**
 * schema_main 분할: 배치/생산
 */
import {
  bigint, boolean, date, decimal, int, json,
  mysqlEnum, mysqlTable, text, timestamp, tinyint, varchar
} from "drizzle-orm/mysql-core";
import { tenants } from "./schema_main_core";

export const hBatches = mysqlTable("h_batches", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  batchCode: varchar("batch_code", { length: 100 }).notNull().unique(),
  dayBatchGroup: varchar("day_batch_group", { length: 100 }),
  batchOrder: int("batch_order"),
  productId: bigint("product_id", { mode: "number" }).notNull(),
  recipeId: bigint("recipe_id", { mode: "number" }),
  plannedQuantity: decimal("planned_quantity", { precision: 10, scale: 2 }).notNull(),
  actualQuantity: decimal("actual_quantity", { precision: 10, scale: 2 }),
  actualYield: decimal("actual_yield", { precision: 10, scale: 2 }), // 실제 수율
  lossQuantity: decimal("loss_quantity", { precision: 10, scale: 2 }), // 손실 수량
  materialCost: decimal("material_cost", { precision: 15, scale: 2 }), // 재료비
  laborCost: decimal("labor_cost", { precision: 15, scale: 2 }), // 노무비
  overheadCost: decimal("overhead_cost", { precision: 15, scale: 2 }), // 경비
  totalCost: decimal("total_cost", { precision: 15, scale: 2 }), // 총 원가
  unitCost: decimal("unit_cost", { precision: 15, scale: 2 }), // 단위 원가
  plannedDate: date("planned_date").notNull(),
  startTime: timestamp("start_time"),
  endTime: timestamp("end_time"),
  status: mysqlEnum("status", [
    "planned",
    "in_progress",
    "paused",
    "completed",
    "failed",
    "cancelled",
    "shipped",
    "archived",
  ]).default("planned").notNull(),
  mode: mysqlEnum("mode", ["auto", "manual"]).default("auto"),
  manualStartTime: timestamp("manual_start_time"),
  manualEndTime: timestamp("manual_end_time"),
  lotNumber: varchar("lot_number", { length: 100 }),
  expiryDate: date("expiry_date"),
  revenue: decimal("revenue", { precision: 15, scale: 2 }),
  plannedCost: decimal("planned_cost", { precision: 15, scale: 2 }),
  actualCost: decimal("actual_cost", { precision: 15, scale: 2 }),
  costFinalizedAt: timestamp("cost_finalized_at"),
  notes: text("notes"),
  completionIdempotencyKey: varchar("completion_idempotency_key", { length: 255 }).unique(),
  completedAt: timestamp("completed_at"),
  completionReportUrl: text("completion_report_url"),
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const hBatchProductions = mysqlTable("h_batch_productions", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  batchId: bigint("batch_id", { mode: "number" }).notNull(),
  productionDate: date("production_date").notNull(),
  shift: varchar("shift", { length: 20 }),
  lineNumber: varchar("line_number", { length: 50 }),
  operatorId: bigint("operator_id", { mode: "number" }),
  startTime: timestamp("start_time"),
  endTime: timestamp("end_time"),
  yieldRate: decimal("yield_rate", { precision: 5, scale: 2 }),
  status: mysqlEnum("status", ["planned", "in_progress", "completed", "failed", "paused"]).default("planned").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const hBatchInputs = mysqlTable("h_batch_inputs", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  batchId: bigint("batch_id", { mode: "number" }).notNull(),
  materialId: bigint("material_id", { mode: "number" }).notNull(),
  lotId: bigint("lot_id", { mode: "number" }),
  plannedQuantity: decimal("planned_quantity", { precision: 10, scale: 3 }).notNull(),
  actualQuantity: decimal("actual_quantity", { precision: 10, scale: 3 }),
  unit: varchar("unit", { length: 20 }).notNull(),
  inputTime: timestamp("input_time"),
  inputBy: bigint("input_by", { mode: "number" }),
  notes: text("notes"),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }),
  totalPrice: decimal("total_price", { precision: 10, scale: 2 }),
  inventoryDeducted: tinyint("inventory_deducted").default(0).notNull(),
  processGroupId: int("process_group_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const hBatchCompletionRetries = mysqlTable("h_batch_completion_retries", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  batchId: bigint("batch_id", { mode: "number" }).notNull(),
  taskType: varchar("task_type", { length: 50 }).notNull(),
  errorMessage: text("error_message"),
  retryCount: int("retry_count").default(0).notNull(),
  maxRetries: int("max_retries").default(3).notNull(),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  lastRetryAt: timestamp("last_retry_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const hProductionPerformance = mysqlTable("h_production_performance", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  batchId: bigint("batch_id", { mode: "number" }).notNull(),
  plannedQuantity: decimal("planned_quantity", { precision: 10, scale: 2 }),
  actualQuantity: decimal("actual_quantity", { precision: 10, scale: 2 }),
  yieldRate: decimal("yield_rate", { precision: 5, scale: 2 }),
  defectRate: decimal("defect_rate", { precision: 5, scale: 2 }),
  productionTime: int("production_time"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const hProductionAlerts = mysqlTable("h_production_alerts", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  batchId: bigint("batch_id", { mode: "number" }),
  alertType: varchar("alert_type", { length: 100 }),
  severity: mysqlEnum("severity", ["low", "medium", "high", "critical"]),
  message: text("message"),
  isResolved: tinyint("is_resolved").default(0).notNull(),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const hBatchUploads = mysqlTable("h_batch_uploads", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  fileName: varchar("file_name", { length: 255 }),
  filePath: varchar("file_path", { length: 255 }),
  batchCount: int("batch_count"),
  status: mysqlEnum("status", ["pending", "processing", "completed", "failed"]).default("pending").notNull(),
  errorMessage: text("error_message"),
  uploadedBy: bigint("uploaded_by", { mode: "number" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const hBatchChecklistTemplates = mysqlTable("h_batch_checklist_templates", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  templateName: varchar("template_name", { length: 100 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const hBatchChecklistTemplateItems = mysqlTable("h_batch_checklist_template_items", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  templateId: bigint("template_id", { mode: "number" }).notNull(),
  itemName: varchar("item_name", { length: 100 }).notNull(),
  itemOrder: int("item_order"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const hProductionStart = mysqlTable("h_production_start", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  batchId: bigint("batch_id", { mode: "number" }).notNull(),
  startTime: timestamp("start_time").notNull(),
  operatorId: bigint("operator_id", { mode: "number" }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// CCP 관리 테이블 (8개)
// ============================================================================

export const hBatchMaterials = mysqlTable("h_batch_materials", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  batchId: bigint("batch_id", { mode: "number" }).notNull(),
  lotId: bigint("lot_id", { mode: "number" }).notNull(),
  materialId: bigint("material_id", { mode: "number" }).notNull(),
  quantityUsed: decimal("quantity_used", { precision: 10, scale: 2 }).notNull(),
  uom: varchar("uom", { length: 20 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * 배치에서 생산된 완제품 LOT 정보
 */

export const hBatchProducts = mysqlTable("h_batch_products", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  batchId: bigint("batch_id", { mode: "number" }).notNull(),
  productId: bigint("product_id", { mode: "number" }).notNull(),
  lotNumber: varchar("lot_number", { length: 100 }).notNull(),
  quantityProduced: decimal("quantity_produced", { precision: 10, scale: 2 }).notNull(),
  uom: varchar("uom", { length: 20 }).notNull(),
  manufactureDate: date("manufacture_date").notNull(),
  expiryDate: date("expiry_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// hNotifications는 schema/part2.ts에 정의되어 있음

// ============================================================================
// 타입 정의
// ============================================================================

// Export all tables from schema_part2.ts
export * from './part2';

export type Batch = typeof hBatches.$inferSelect;
export type InsertBatch = typeof hBatches.$inferInsert;

export type BatchMaterial = typeof hBatchMaterials.$inferSelect;
export type InsertBatchMaterial = typeof hBatchMaterials.$inferInsert;

export type BatchProduct = typeof hBatchProducts.$inferSelect;
export type InsertBatchProduct = typeof hBatchProducts.$inferInsert;

// ============================================================================
// 미구현 HACCP 체크리스트 테이블 (11개)
// ============================================================================

/**
 * 1. 수질 검사 기록
 */

// Type exports
