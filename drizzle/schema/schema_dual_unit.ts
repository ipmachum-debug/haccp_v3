import { tenants } from '../schema_main';
import {
  mysqlTable, bigint, varchar, decimal, text, timestamp, date,
  mysqlEnum, index, unique, int, tinyint
} from "drizzle-orm/mysql-core";

/**
 * item_master - 통합 품목 마스터
 * 원재료(raw_material), 자사제품(own_product), 외부제품(external_product) 통합 관리
 */
export const itemMaster = mysqlTable("item_master", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  itemCode: varchar("item_code", { length: 50 }).notNull(),
  itemName: varchar("item_name", { length: 200 }).notNull(),
  itemType: mysqlEnum("item_type", ["raw_material", "own_product", "external_product", "subsidiary"]).notNull(),
  category: varchar("category", { length: 100 }),
  baseUnit: varchar("base_unit", { length: 20 }).notNull().default("kg"),

  // 원재료 전용 필드
  supplierId: bigint("supplier_id", { mode: "number" }),
  purchaseUnit: varchar("purchase_unit", { length: 20 }),
  purchaseConversionRate: decimal("purchase_conversion_rate", { precision: 10, scale: 4 }).default("1.0000"),

  // 제품 전용 필드
  productReportNo: varchar("product_report_no", { length: 50 }),
  shelfLifeDays: int("shelf_life_days"),

  // 외부제품 전용 필드
  oemSupplierId: bigint("oem_supplier_id", { mode: "number" }),

  // 가격 정보
  defaultUnitPrice: decimal("default_unit_price", { precision: 15, scale: 2 }).default("0.00"),

  // 원본 참조 (하위 호환성)
  legacyProductId: bigint("legacy_product_id", { mode: "number" }),
  legacyMaterialId: bigint("legacy_material_id", { mode: "number" }),

  // 상태
  isActive: tinyint("is_active").notNull().default(1),
  description: text("description"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  uqItemCodeTenant: unique("uq_item_code_tenant").on(table.itemCode, table.tenantId),
  tenantIdIdx: index("idx_im_tenant_id").on(table.tenantId),
  itemTypeIdx: index("idx_item_type").on(table.itemType),
  legacyProductIdx: index("idx_legacy_product").on(table.legacyProductId),
  legacyMaterialIdx: index("idx_legacy_material").on(table.legacyMaterialId),
}));

/**
 * product_skus - SKU 포장 단위 관리
 * 하나의 제품에 여러 SKU (포장 규격)를 등록
 */
export const productSkus = mysqlTable("product_skus", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  itemId: bigint("item_id", { mode: "number" }).notNull(),

  skuCode: varchar("sku_code", { length: 50 }).notNull(),
  skuName: varchar("sku_name", { length: 200 }).notNull(),

  // 포장 규격
  netWeightG: decimal("net_weight_g", { precision: 10, scale: 2 }),
  piecesPerPack: int("pieces_per_pack").default(1),
  packsPerBox: int("packs_per_box").default(1),

  // 단위 환산
  salesUnit: varchar("sales_unit", { length: 20 }).notNull().default("box"),
  kgPerSalesUnit: decimal("kg_per_sales_unit", { precision: 10, scale: 4 }).notNull(),

  // 가격
  unitPrice: decimal("unit_price", { precision: 15, scale: 2 }).default("0.00"),

  // 바코드
  barcode: varchar("barcode", { length: 50 }),

  isActive: tinyint("is_active").notNull().default(1),
  isDefault: tinyint("is_default").notNull().default(0),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  uqSkuCodeTenant: unique("uq_sku_code_tenant").on(table.skuCode, table.tenantId),
  itemIdIdx: index("idx_sku_item_id").on(table.itemId),
  tenantIdIdx: index("idx_sku_tenant_id").on(table.tenantId),
}));

/**
 * production_verification - 생산 검증
 * 배치 완료 시 실제 SKU 단위 생산량 입력 및 검증
 */
export const productionVerification = mysqlTable("production_verification", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  batchId: bigint("batch_id", { mode: "number" }).notNull(),

  // SKU별 생산 실적
  skuId: bigint("sku_id", { mode: "number" }),

  // 계획
  plannedKg: decimal("planned_kg", { precision: 10, scale: 3 }),
  plannedSkuQty: int("planned_sku_qty"),

  // 실적
  actualSkuQty: int("actual_sku_qty"),
  actualTotalKg: decimal("actual_total_kg", { precision: 10, scale: 3 }),

  // 손실/폐기
  wasteKg: decimal("waste_kg", { precision: 10, scale: 3 }).default("0.000"),
  wasteReason: text("waste_reason"),

  // 검증 결과
  yieldRate: decimal("yield_rate", { precision: 5, scale: 2 }),
  varianceKg: decimal("variance_kg", { precision: 10, scale: 3 }),
  variancePct: decimal("variance_pct", { precision: 5, scale: 2 }),

  // 검증 상태
  status: mysqlEnum("status", ["draft", "verified", "approved", "rejected"]).default("draft"),
  verifiedBy: bigint("verified_by", { mode: "number" }),
  verifiedAt: timestamp("verified_at"),
  notes: text("notes"),

  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  batchIdIdx: index("idx_pv_batch_id").on(table.batchId),
  skuIdIdx: index("idx_pv_sku_id").on(table.skuId),
  tenantIdIdx: index("idx_pv_tenant_id").on(table.tenantId),
  statusIdx: index("idx_pv_status").on(table.status),
}));

/**
 * production_sku_output - 배치별 SKU 생산 실적 상세
 */
export const productionSkuOutput = mysqlTable("production_sku_output", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  batchId: bigint("batch_id", { mode: "number" }).notNull(),
  skuId: bigint("sku_id", { mode: "number" }).notNull(),

  quantity: int("quantity").notNull().default(0),
  defectiveQty: int("defective_qty").default(0),

  // 자동 계산
  totalKg: decimal("total_kg", { precision: 10, scale: 3 }),

  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  batchIdIdx: index("idx_pso_batch_id").on(table.batchId),
  skuIdIdx: index("idx_pso_sku_id").on(table.skuId),
  tenantIdIdx: index("idx_pso_tenant_id").on(table.tenantId),
}));

/**
 * cross_validation_reports - 교차 검증 보고서
 */
export const crossValidationReports = mysqlTable("cross_validation_reports", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  batchId: bigint("batch_id", { mode: "number" }).notNull(),
  reportDate: date("report_date").notNull(),

  // 수율 검증
  plannedOutputKg: decimal("planned_output_kg", { precision: 10, scale: 3 }),
  actualOutputKg: decimal("actual_output_kg", { precision: 10, scale: 3 }),
  yieldVariancePct: decimal("yield_variance_pct", { precision: 5, scale: 2 }),

  // 원재료 사용 검증
  theoreticalMaterialKg: decimal("theoretical_material_kg", { precision: 10, scale: 3 }),
  actualMaterialKg: decimal("actual_material_kg", { precision: 10, scale: 3 }),
  materialVariancePct: decimal("material_variance_pct", { precision: 5, scale: 2 }),

  // 종합 판정
  overallStatus: mysqlEnum("overall_status", ["pass", "warning", "fail"]).default("pass"),
  findings: text("findings"),

  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  batchIdIdx: index("idx_cvr_batch_id").on(table.batchId),
  tenantIdIdx: index("idx_cvr_tenant_id").on(table.tenantId),
  reportDateIdx: index("idx_cvr_report_date").on(table.reportDate),
}));
