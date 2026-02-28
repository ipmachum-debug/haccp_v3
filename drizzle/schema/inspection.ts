import {mysqlTable,  varchar, date, text, mysqlEnum, timestamp, decimal, int} from "drizzle-orm/mysql-core";
import { tenants } from '../schema_main';

/**
 * 원재료 검사 기록
 */
export const materialInspectionRecords = mysqlTable("material_inspection_records", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  materialId: int("material_id").notNull(), // 원재료 ID
  materialCode: varchar("material_code", { length: 100 }).notNull(), // 원재료 코드
  materialName: varchar("material_name", { length: 200 }).notNull(), // 원재료명
  lotNumber: varchar("lot_number", { length: 100 }).notNull(), // LOT 번호
  inspectionDate: date("inspection_date", { mode: 'string' }).notNull(), // 검사일자
  inspectorId: int("inspector_id").notNull(), // 검사자 ID
  inspectorName: varchar("inspector_name", { length: 100 }).notNull(), // 검사자명
  supplierName: varchar("supplier_name", { length: 200 }), // 공급업체명
  appearance: varchar("appearance", { length: 200 }), // 외관
  odor: varchar("odor", { length: 200 }), // 냄새
  color: varchar("color", { length: 100 }), // 색상
  temperature: decimal("temperature", { precision: 5, scale: 2 }), // 온도
  result: mysqlEnum("result", ['pass', 'fail', 'conditional']), // 검사 결과
  inspectionResult: mysqlEnum("inspection_result", ['pass', 'fail', 'conditional']).default('pass').notNull(), // 검사결과
  status: mysqlEnum("status", ['pending', 'completed', 'rejected']).default('pending').notNull(), // 상태
  notes: text("notes"), // 비고
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});

/**
 * 원재료 검사 항목
 */
export const materialInspectionItems = mysqlTable("material_inspection_items", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  recordId: int("record_id").notNull(), // 검사 기록 ID
  itemName: varchar("item_name", { length: 200 }).notNull(), // 검사항목명
  standard: varchar("standard", { length: 500 }), // 기준
  result: varchar("result", { length: 500 }), // 결과
  passed: mysqlEnum("passed", ['pass', 'fail', 'na']).default('pass').notNull(), // 합격여부
  sortOrder: int("sort_order").default(0).notNull(), // 정렬순서
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
});

/**
 * 출하 검사 기록
 */
export const shippingInspectionRecords = mysqlTable("shipping_inspection_records", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  batchId: int("batch_id").notNull(), // 배치 ID
  batchCode: varchar("batch_code", { length: 100 }).notNull(), // 배치 코드
  productCode: varchar("product_code", { length: 100 }).notNull(), // 제품 코드
  productName: varchar("product_name", { length: 200 }).notNull(), // 제품명
  inspectionDate: date("inspection_date", { mode: 'string' }).notNull(), // 검사일자
  inspectorId: int("inspector_id").notNull(), // 검사자 ID
  inspectorName: varchar("inspector_name", { length: 100 }).notNull(), // 검사자명
  quantity: varchar("quantity", { length: 50 }), // 검사수량
  inspectionResult: mysqlEnum("inspection_result", ['pass', 'fail', 'hold']).default('pass').notNull(), // 검사결과
  status: mysqlEnum("status", ['pending', 'completed', 'rejected']).default('pending').notNull(), // 상태
  notes: text("notes"), // 비고
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});

/**
 * 출하 검사 항목
 */
export const shippingInspectionItems = mysqlTable("shipping_inspection_items", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  recordId: int("record_id").notNull(), // 검사 기록 ID
  itemName: varchar("item_name", { length: 200 }).notNull(), // 검사항목명
  standard: varchar("standard", { length: 500 }), // 기준
  result: varchar("result", { length: 500 }), // 결과
  passed: mysqlEnum("passed", ['pass', 'fail', 'na']).default('pass').notNull(), // 합격여부
  sortOrder: int("sort_order").default(0).notNull(), // 정렬순서
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
});

/**
 * 위생 검사 기록
 */
export const hygieneInspectionRecords = mysqlTable("hygiene_inspection_records", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  inspectionDate: date("inspection_date", { mode: 'string' }).notNull(), // 점검일자
  inspectionArea: varchar("inspection_area", { length: 200 }).notNull(), // 점검구역
  inspectorId: int("inspector_id").notNull(), // 점검자 ID
  inspectorName: varchar("inspector_name", { length: 100 }).notNull(), // 점검자명
  result: mysqlEnum("result", ['good', 'fair', 'poor']).default('good').notNull(), // 점검결과
  status: mysqlEnum("status", ['pending', 'completed', 'action_required']).default('pending').notNull(), // 상태
  notes: text("notes"), // 비고
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});

/**
 * 위생 검사 항목
 */
export const hygieneInspectionItems = mysqlTable("hygiene_inspection_items", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  recordId: int("record_id").notNull(), // 검사 기록 ID
  itemName: varchar("item_name", { length: 200 }).notNull(), // 점검항목명
  standard: varchar("standard", { length: 500 }), // 기준
  result: varchar("result", { length: 500 }), // 결과
  passed: mysqlEnum("passed", ['pass', 'fail', 'na']).default('pass').notNull(), // 합격여부
  sortOrder: int("sort_order").default(0).notNull(), // 정렬순서
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
});
