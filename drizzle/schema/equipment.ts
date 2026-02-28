import {mysqlTable,  varchar, text, timestamp, decimal, boolean, int} from "drizzle-orm/mysql-core";
import { tenants } from '../schema_main';
import { relations } from "drizzle-orm";
// 설비 마스터 (간소화)
export const equipments = mysqlTable("equipments", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  code: varchar("code", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 100 }).notNull(), // 증숙기, 냉각기, 금속검출기, 오븐 등
  ccpType: varchar("ccp_type", { length: 50 }), // CCP-1B, CCP-2B, CCP-3B, CCP-4P
  
  // 기본 운전값 (설비별 기본값) - 가열/증숙/굽기/볶음 공정용
  defaultTemperature: decimal("default_temperature", { precision: 5, scale: 2 }),
  edgeTemperature: decimal("edge_temperature", { precision: 10, scale: 2 }),
  centerTemperature: decimal("center_temperature", { precision: 10, scale: 2 }),
  defaultPressure: decimal("default_pressure", { precision: 5, scale: 2 }),
  defaultTime: int("default_time"), // 분 단위
  batchOperationTime: int("batch_operation_time"), // 1배치당 운영시간 (분)
  
  // 금속검출(CCP-4P) 전용 필드
  feSensitivity: decimal("fe_sensitivity", { precision: 5, scale: 2 }), // Fe 감도 (mm)
  stsSensitivity: decimal("sts_sensitivity", { precision: 5, scale: 2 }), // STS 감도 (mm)
  detectionSpeed: decimal("detection_speed", { precision: 5, scale: 2 }), // 검출 속도 (m/분)
  batchLinkMode: varchar("batch_link_mode", { length: 20 }).default("linked"), // 배치 연동 모드: linked/manual
  dailyProductCount: int("daily_product_count"), // 하루 작업 제품 수
  workStartTime: varchar("work_start_time", { length: 10 }).default("09:00"), // 작업 시작 시간
  workEndTime: varchar("work_end_time", { length: 10 }).default("16:30"), // 작업 종료 시간
  lunchStartTime: varchar("lunch_start_time", { length: 10 }).default("12:00"), // 점심 시작
  lunchEndTime: varchar("lunch_end_time", { length: 10 }).default("13:00"), // 점심 종료
  
  // 기록 주기
  monitoringInterval: int("monitoring_interval").default(10), // 분 단위
  rowsPerBatch: int("rows_per_batch").default(4), // 배치당 자동 생성할 CCP 행 수
  
  status: varchar("status", { length: 50 }).notNull().default("active"), // active, inactive
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
// Relations
export const equipmentsRelations = relations(equipments, ({ many }) => ({
  // CCP 모니터링 기록과 연결
}));
