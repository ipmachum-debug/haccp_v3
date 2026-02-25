import {mysqlTable,  bigint, varchar, text, decimal, timestamp, mysqlEnum, int} from "drizzle-orm/mysql-core";
import { tenants } from '../schema_main';

/**
 * 레시피 헤더 (품목제조보고서)
 */
export const recipes = mysqlTable("recipes", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  productId: int("product_id").notNull(), // 제품 ID
  recipeName: varchar("recipe_name", { length: 255 }).notNull(), // 레시피 이름
  version: varchar("version", { length: 50 }).notNull().default("1.0"), // 버전
  description: text("description"), // 설명
  batchSize: decimal("batch_size", { precision: 10, scale: 2 }).notNull(), // 배치 크기 (kg, L 등)
  batchUnit: varchar("batch_unit", { length: 20 }).notNull().default("kg"), // 배치 단위
  yieldRate: decimal("yield_rate", { precision: 5, scale: 2 }).default("100.00"), // 수율 (%)
  preparationTime: int("preparation_time"), // 준비 시간 (분)
  cookingTime: int("cooking_time"), // 조리 시간 (분)
  totalTime: int("total_time"), // 총 소요 시간 (분)
  isActive: int("is_active").notNull().default(1), // 활성 상태 (0: 비활성, 1: 활성)
  // 승인 워크플로우
  approvalStatus: mysqlEnum("approval_status", ["DRAFT", "APPROVED", "REJECTED"]).notNull().default("DRAFT"), // 승인 상태
  approvedBy: bigint("approved_by", { mode: "number" }), // 승인자 ID
  approvedAt: timestamp("approved_at"), // 승인 시간
  rejectedBy: bigint("rejected_by", { mode: "number" }), // 반려자 ID
  rejectedAt: timestamp("rejected_at"), // 반려 시간
  rejectionReason: text("rejection_reason"), // 반려 사유
  createdBy: bigint("created_by", { mode: "number" }).notNull(), // 생성자 ID
  createdAt: timestamp("created_at").notNull().defaultNow(), // 생성 시간
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(), // 수정 시간
});

/**
 * 레시피 라인 (원재료 배합 비율)
 */
export const recipeLines = mysqlTable("recipe_lines", {
  id: int("id").primaryKey().autoincrement(),
  recipeId: int("recipe_id").notNull(), // 레시피 ID
  materialId: int("material_id").notNull(), // 원재료 ID
  quantity: decimal("quantity", { precision: 10, scale: 3 }).notNull(), // 투입량
  unit: varchar("unit", { length: 20 }).notNull(), // 단위 (kg, g, L, ml 등)
  percentage: decimal("percentage", { precision: 5, scale: 2 }), // 배합 비율 (%)
  sortOrder: int("sort_order").notNull().default(0), // 정렬 순서
  notes: text("notes"), // 비고 (특별 지시사항 등)
  createdAt: timestamp("created_at").notNull().defaultNow(), // 생성 시간
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(), // 수정 시간
});

/**
 * 레시피 버전 이력
 */
export const recipeVersions = mysqlTable("recipe_versions", {
  id: int("id").primaryKey().autoincrement(),
  recipeId: int("recipe_id").notNull(), // 레시피 ID
  version: varchar("version", { length: 50 }).notNull(), // 버전
  changeDescription: text("change_description"), // 변경 내역
  snapshotData: text("snapshot_data"), // 스냅샷 데이터 (JSON)
  createdBy: bigint("created_by", { mode: "number" }).notNull(), // 생성자 ID
  createdAt: timestamp("created_at").notNull().defaultNow(), // 생성 시간
});
