/**
 * part2 분할: 재고 관리
 */
import {
  bigint, boolean, date, decimal, int, json,
  mysqlEnum, mysqlTable, text, timestamp, tinyint, varchar
} from "drizzle-orm/mysql-core";
import { tenants } from "./schema_main_core";

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
  skuId: bigint("sku_id", { mode: "number" }),
  skuName: varchar("sku_name", { length: 200 }),
  quantity: decimal("quantity", { precision: 10, scale: 3 }).notNull(),
  currentQuantity: decimal("current_quantity", { precision: 10, scale: 3 }), // 현재 재고 수량
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
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  adjustmentDate: date("adjustment_date").notNull(),
  lotId: bigint("lot_id", { mode: "number" }),
  adjustmentType: mysqlEnum("adjustment_type", ["increase", "decrease", "correction"]).notNull(),
  quantityBefore: decimal("quantity_before", { precision: 10, scale: 3 }).notNull(),
  quantityAfter: decimal("quantity_after", { precision: 10, scale: 3 }).notNull(),
  reason: text("reason"),
  reviewedBy: bigint("reviewed_by", { mode: "number" }),
  reviewedAt: timestamp("reviewed_at"),
  reviewComments: text("review_comments"),
  approvedBy: bigint("approved_by", { mode: "number" }),
  approvedAt: timestamp("approved_at"),
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_inventory_counts - 재고 실사
 */
export const hInventoryCounts = mysqlTable("h_inventory_counts", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
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
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
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
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
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
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
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
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
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
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
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
