/**
 * schema_main 분할: 제품/원재료 마스터
 */
import {
  bigint, boolean, date, decimal, int, json,
  mysqlEnum, mysqlTable, text, timestamp, tinyint, varchar
} from "drizzle-orm/mysql-core";
import { tenants } from "./schema_main_core";

export const hProducts = mysqlTable("h_products", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  productCode: varchar("product_code", { length: 50 }).notNull().unique(),
  productName: varchar("product_name", { length: 100 }).notNull(),
  category: varchar("category", { length: 100 }),
  unit: varchar("unit", { length: 20 }),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }),
  shelfLifeDays: int("shelf_life_days"),
  description: text("description"),
  defaultCcpTypes: json("default_ccp_types").$type<string[]>(), // 제품별 기본 CCP 타입 (JSON 배열)
  isActive: tinyint("is_active").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});


export const hMaterials = mysqlTable("h_materials", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  materialCode: varchar("material_code", { length: 50 }).notNull().unique(),
  materialName: varchar("material_name", { length: 100 }).notNull(),
  kind: varchar("kind", { length: 20 }).default("RAW").notNull(), // RAW, MIXED
  category: varchar("category", { length: 100 }), // 레거시 필드 (문자열 카테고리)
  categoryId: bigint("category_id", { mode: "number" }), // categories 테이블 FK
  unit: varchar("unit", { length: 20 }), // 재고단위 (기본 단위)
  supplierId: bigint("supplier_id", { mode: "number" }),
  shelfLifeDays: int("shelf_life_days"),
  expiryWarningDays: int("expiry_warning_days").default(7),
  safetyStockLevel: decimal("safety_stock_level", { precision: 10, scale: 3 }).default("0.000"),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).default("0.00"),
  // 단위 환산 관리
  purchaseUnit: varchar("purchase_unit", { length: 20 }), // 구매단위 (예: 박스, 포대)
  conversionRate: decimal("conversion_rate", { precision: 10, scale: 4 }).default("1.0000"), // 구매단위 → 재고단위 환산비율
  defaultPackagingSize: decimal("default_packaging_size", { precision: 15, scale: 2 }), // 기본 포장 규격 (예: 5kg의 5)
  description: text("description"),
  isActive: tinyint("is_active").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * 원재료 단가 이력 테이블
 * 원재료 단가 변경 이력을 추적하여 비용 분석 정확성 향상
 */

export const hMaterialPriceHistory = mysqlTable("h_material_price_history", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  materialId: bigint("material_id", { mode: "number" }).notNull(),
  oldPrice: decimal("old_price", { precision: 10, scale: 2 }),
  newPrice: decimal("new_price", { precision: 10, scale: 2 }).notNull(),
  changedBy: bigint("changed_by", { mode: "number" }),
  changedAt: timestamp("changed_at").defaultNow().notNull(),
  reason: text("reason"),
});

/**
 * 재고 회전율 임계값 설정 테이블
 * 원재료별 회전율 임계값을 설정하여 자동 알림 생성
 */

export const hInventoryTurnoverSettings = mysqlTable("h_inventory_turnover_settings", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  materialId: bigint("material_id", { mode: "number" }).notNull().unique(),
  thresholdRate: decimal("threshold_rate", { precision: 5, scale: 2 }).notNull(),
  alertEnabled: tinyint("alert_enabled").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});


export const hProductsV2 = mysqlTable("h_products_v2", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  productCode: varchar("product_code", { length: 50 }).notNull().unique(),
  productName: varchar("product_name", { length: 100 }).notNull(),
  version: int("version").default(1).notNull(),
  category: varchar("category", { length: 100 }),
  unit: varchar("unit", { length: 20 }),
  shelfLifeDays: int("shelf_life_days"),
  description: text("description"),
  isActive: tinyint("is_active").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});


export const hProductVersions = mysqlTable("h_product_versions", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  productId: bigint("product_id", { mode: "number" }).notNull(),
  version: int("version"),
  changeLog: text("change_log"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});


export const hMaterialMaster = mysqlTable("h_material_master", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  materialCode: varchar("material_code", { length: 50 }).notNull().unique(),
  materialName: varchar("material_name", { length: 100 }).notNull(),
  category: varchar("category", { length: 100 }),
  unit: varchar("unit", { length: 20 }),
  supplierId: bigint("supplier_id", { mode: "number" }),
  shelfLifeDays: int("shelf_life_days"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});


export const hMaterialReceivings = mysqlTable("h_material_receivings", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  materialId: bigint("material_id", { mode: "number" }).notNull(),
  lotNumber: varchar("lot_number", { length: 100 }),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  unit: varchar("unit", { length: 20 }),
  expiryDate: date("expiry_date"),
  supplierId: bigint("supplier_id", { mode: "number" }),
  receivedDate: date("received_date").notNull(),
  receivedBy: bigint("received_by", { mode: "number" }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// hMaterialInspections는 part2.ts에 확장된 버전으로 정의되어 있음 (appearance, odor, color, temperature, result 포함)


export const hIntermediates = mysqlTable("h_intermediates", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  intermediateCode: varchar("intermediate_code", { length: 50 }).notNull().unique(),
  intermediateName: varchar("intermediate_name", { length: 100 }).notNull(),
  category: varchar("category", { length: 100 }),
  unit: varchar("unit", { length: 20 }),
  shelfLifeDays: int("shelf_life_days"),
  description: text("description"),
  // PR #252 (2026-05-05): 동일 entity 의 h_materials (kind='MIXED') 참조 — 재고/매입 통합용
  // 자동 이름 매칭으로 초기 연결, 사용자가 [매칭] 다이얼로그로 수정 가능.
  linkedMaterialId: bigint("linked_material_id", { mode: "number" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});


export const hIntermediateMaster = mysqlTable("h_intermediate_master", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  intermediateCode: varchar("intermediate_code", { length: 50 }).notNull().unique(),
  intermediateName: varchar("intermediate_name", { length: 100 }).notNull(),
  category: varchar("category", { length: 100 }),
  unit: varchar("unit", { length: 20 }),
  shelfLifeDays: int("shelf_life_days"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});


export const hIntermediateComponents = mysqlTable("h_intermediate_components", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  intermediateId: bigint("intermediate_id", { mode: "number" }).notNull(),
  materialId: bigint("material_id", { mode: "number" }),
  intermediateSourceId: bigint("intermediate_source_id", { mode: "number" }),
  quantity: decimal("quantity", { precision: 10, scale: 3 }).notNull(),
  unit: varchar("unit", { length: 20 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// 레시피 테이블 (8개) - 배치보다 먼저 정의 (FK 참조)
// ============================================================================


// Type exports
export type Product = typeof hProducts.$inferSelect;
export type InsertProduct = typeof hProducts.$inferInsert;
export type Material = typeof hMaterials.$inferSelect;
export type InsertMaterial = typeof hMaterials.$inferInsert;
