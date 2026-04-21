/**
 * part2_misc 분할: production_ext
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

export const hBatchApprovals = mysqlTable("h_batch_approvals", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
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
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
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
export const hProfitabilityForecasts = mysqlTable("h_profitability_forecasts", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
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
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
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
export const hCcpMonitoring = mysqlTable("h_ccp_monitoring", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
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
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
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
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
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
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  productId: bigint("product_id", { mode: "number" }).notNull(), // 제품 ID
  quantity: varchar("quantity", { length: 50 }).notNull(), // 총 수량
  availableQuantity: varchar("available_quantity", { length: 50 }).notNull(), // 가용 수량
  unit: varchar("unit", { length: 20 }).notNull(), // 단위
  location: varchar("location", { length: 100 }), // 보관 위치
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});


