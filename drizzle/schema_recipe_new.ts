import {mysqlTable, bigint, varchar, decimal, text, timestamp, int, date, tinyint, json} from "drizzle-orm/mysql-core";

import { tenants } from './schema_main';

// ==================== 혼합재제(중간재) 테이블 ====================

/**
 * 혼합재제 구성 테이블
 * - 혼합재제(팥앙금, 크림치즈 등)의 하부 원재료 구성을 정의
 * - 표시/신고 참고용으로만 사용 (기본적으로 차감하지 않음)
 */
export const hMixedMaterialComponents = mysqlTable("h_mixed_material_components", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  intermediateMaterialId: bigint("intermediate_material_id", { mode: "number" }).notNull(), // MIXED 재료 ID
  componentMaterialId: bigint("component_material_id", { mode: "number" }).notNull(), // RAW 또는 MIXED 재료 ID
  ratioPercent: decimal("ratio_percent", { precision: 5, scale: 2 }), // % 기준
  gramsPerKg: decimal("grams_per_kg", { precision: 10, scale: 2 }), // 1kg 기준 g값
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ==================== 품목제조보고(MF Report) 테이블 ====================

/**
 * 품목제조보고 마스터 테이블
 * - 제품별 품목제조보고 기본 정보
 */
export const hMfReports = mysqlTable("h_mf_reports", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  productId: bigint("product_id", { mode: "number" }).notNull(),
  reportNo: varchar("report_no", { length: 50 }).notNull(),
  reportDate: date("report_date").notNull(),
  status: varchar("status", { length: 20 }).default("ACTIVE").notNull(), // ACTIVE, ARCHIVED
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  tenantId: int("tenant_id").notNull().default(1).references(() => tenants.id),
});

/**
 * 품목제조보고 버전 테이블
 * - 품목제조보고의 버전 관리 (변경 이력, 소급 방지)
 */
export const hMfReportVersions = mysqlTable("h_mf_report_versions", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  mfReportId: bigint("mf_report_id", { mode: "number" }).notNull(),
  versionNo: int("version_no").notNull(),
  effectiveFrom: date("effective_from").notNull(), // 소급 방지 핵심
  changeReason: text("change_reason"),
  approvalStatus: varchar("approval_status", { length: 20 }).default("DRAFT").notNull(), // DRAFT, APPROVED, REJECTED
  compositionTotalRule: varchar("composition_total_rule", { length: 50 }).default("100%").notNull(),
  yieldBasis: varchar("yield_basis", { length: 20 }).default("PER_BATCH_KG"), // PER_UNIT_G 또는 PER_BATCH_KG
  unitWeightG: decimal("unit_weight_g", { precision: 10, scale: 2 }), // 1개당 중량(g)
  batchTargetKg: decimal("batch_target_kg", { precision: 10, scale: 2 }), // 배치 목표 생산량(kg)
  createdBy: bigint("created_by", { mode: "number" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  approvedBy: bigint("approved_by", { mode: "number" }),
  approvedAt: timestamp("approved_at"),
  rejectedBy: bigint("rejected_by", { mode: "number" }),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),
  tenantId: int("tenant_id").notNull().default(1).references(() => tenants.id),
});

/**
 * 맛(Flavor) 테이블
 * - 품목제조보고 버전별 맛 구분 (BASE, STRAWBERRY, CHOCO 등)
 */
export const hMfFlavors = mysqlTable("h_mf_flavors", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  mfReportVersionId: bigint("mf_report_version_id", { mode: "number" }).notNull(),
  flavorCode: varchar("flavor_code", { length: 50 }).notNull(), // BASE, STRAWBERRY, CHOCO
  flavorName: varchar("flavor_name", { length: 100 }).notNull(),
  appliesToSku: varchar("applies_to_sku", { length: 100 }), // SKU별 연결 (선택)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * 품목제조보고 원재료 구성 테이블 (핵심)
 * - 맛별 원재료 구성 정의
 * - isDeductible 플래그로 차감 대상 여부 제어
 */
export const hMfIngredients = mysqlTable("h_mf_ingredients", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  mfReportVersionId: bigint("mf_report_version_id", { mode: "number" }).notNull(),
  lineNo: int("line_no").notNull(),
  materialId: bigint("material_id", { mode: "number" }), // 원재료 (RAW)
  intermediateId: bigint("intermediate_id", { mode: "number" }), // 혼합재제 (MIXED)
  quantity: varchar("quantity", { length: 20 }).notNull(), // 수량 (비율 %) - 법적 배합비
  correctedQuantity: varchar("corrected_quantity", { length: 20 }), // 보정 배합비 (정제수 제외 재계산)
  unit: varchar("unit", { length: 10 }).notNull(), // 단위
  isDeductible: tinyint("is_deductible").default(1).notNull(), // 차감 대상 여부 (핵심 플래그)
  materialType: varchar("material_type", { length: 20 }).default("RAW").notNull(), // RAW: 원재료, MIXED: 중간재, FLAVOR_SPECIFIC: 부재료
  flavorName: varchar("flavor_name", { length: 100 }),
  processGroupId: int("process_group_id"),
  adjustedWeightKg: decimal("adjusted_weight_kg", { precision: 10, scale: 3 }),
  isAdditional: tinyint("is_additional").default(0).notNull(), // 추가 원재료 여부 (정제수 등 배합비 100%에 미포함)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ==================== TypeScript 타입 ====================

export type MixedMaterialComponent = typeof hMixedMaterialComponents.$inferSelect;
export type InsertMixedMaterialComponent = typeof hMixedMaterialComponents.$inferInsert;

export type MfReport = typeof hMfReports.$inferSelect;
export type InsertMfReport = typeof hMfReports.$inferInsert;

export type MfReportVersion = typeof hMfReportVersions.$inferSelect;
export type InsertMfReportVersion = typeof hMfReportVersions.$inferInsert;

export type MfFlavor = typeof hMfFlavors.$inferSelect;
export type InsertMfFlavor = typeof hMfFlavors.$inferInsert;

export type MfIngredient = typeof hMfIngredients.$inferSelect;
export type InsertMfIngredient = typeof hMfIngredients.$inferInsert;

/**
 * 품목제조보고 승인 이력 테이블
 * - 품목제조보고 버전의 승인/반려 이력 추적
 */
export const hMfReportApprovals = mysqlTable("h_mf_report_approvals", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  mfReportVersionId: bigint("mf_report_version_id", { mode: "number" }).notNull(),
  action: varchar("action", { length: 20 }).notNull(), // REQUESTED, APPROVED, REJECTED
  actionBy: bigint("action_by", { mode: "number" }).notNull(), // 작업자 ID
  actionAt: timestamp("action_at").defaultNow().notNull(),
  comment: text("comment"), // 승인/반려 사유
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * 품목제조보고 템플릿 테이블
 * - 자주 사용하는 보고서 형식을 템플릿으로 저장
 */
export const hMfReportTemplates = mysqlTable("h_mf_report_templates", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  templateName: varchar("template_name", { length: 100 }).notNull(),
  description: text("description"),
  templateData: json("template_data").notNull(), // 템플릿 데이터 (원재료 구성 등)
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

// TypeScript 타입 추가
export type MfReportApproval = typeof hMfReportApprovals.$inferSelect;
export type InsertMfReportApproval = typeof hMfReportApprovals.$inferInsert;

export type MfReportTemplate = typeof hMfReportTemplates.$inferSelect;
export type InsertMfReportTemplate = typeof hMfReportTemplates.$inferInsert;

/**
 * 생산 이력 로그 테이블
 * - 품목제조보고 기반 생산 이력 추적
 */
export const hProductionLog = mysqlTable("h_production_log", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  mfReportVersionId: bigint("mf_report_version_id", { mode: "number" }).notNull(),
  productionDate: date("production_date").notNull(),
  batchSizeKg: decimal("batch_size_kg", { precision: 10, scale: 2 }).notNull(),
  producedQuantity: int("produced_quantity").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: bigint("created_by", { mode: "number" }),
});

/**
 * 재고 차감 이력 로그 테이블
 * - 생산에 따른 재고 차감 이력 추적
 */
export const hInventoryDeductionLog = mysqlTable("h_inventory_deduction_log", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  productionLogId: bigint("production_log_id", { mode: "number" }).notNull(),
  materialId: bigint("material_id", { mode: "number" }),
  intermediateId: bigint("intermediate_id", { mode: "number" }),
  materialType: varchar("material_type", { length: 20 }).notNull(), // RAW, MIXED, FLAVOR_SPECIFIC
  deductedQuantity: decimal("deducted_quantity", { precision: 10, scale: 3 }).notNull(),
  unit: varchar("unit", { length: 10 }).notNull(),
  deductionDate: timestamp("deduction_date").defaultNow().notNull(),
});

// TypeScript 타입 추가
export type ProductionLog = typeof hProductionLog.$inferSelect;
export type InsertProductionLog = typeof hProductionLog.$inferInsert;

export type InventoryDeductionLog = typeof hInventoryDeductionLog.$inferSelect;
export type InsertInventoryDeductionLog = typeof hInventoryDeductionLog.$inferInsert;
