/**
 * part2_misc 분할: master
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

export const hEquipment = mysqlTable("h_equipment", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
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
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
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
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
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
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
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
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
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
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
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
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
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
export const hSupplierEvaluations = mysqlTable("h_supplier_evaluations", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
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
