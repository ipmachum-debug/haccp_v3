import {mysqlTable,  bigint, varchar, text, decimal, date, boolean, timestamp, mysqlEnum, index, int} from "drizzle-orm/mysql-core";
import { tenants } from '../schema_main';
import { relations } from "drizzle-orm";
import { users } from "../schema_main";

// 검교정설비 등록
export const calibrationEquipment = mysqlTable("calibration_equipment", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  code: varchar("code", { length: 50 }).notNull().unique(), // 검교정설비코드
  name: varchar("name", { length: 200 }).notNull(), // 검교정설비명
  calibrationType: mysqlEnum("calibration_type", ["certified", "internal"]).notNull(), // 검교정구분 (공인기관/사내)
  equipmentType: mysqlEnum("equipment_type", ["scale", "thermometer", "facility_thermometer", "timer"]).default("thermometer"), // 설비 유형
  
  model: varchar("model", { length: 100 }), // 모델
  manufacturer: varchar("manufacturer", { length: 100 }), // 제조회사
  purchasePrice: decimal("purchase_price", { precision: 15, scale: 2 }), // 구입가격
  purchaseDate: date("purchase_date"), // 구입일자
  
  isActive: boolean("is_active").default(true), // 사용여부
  notes: text("notes"), // 비고
  
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  codeIdx: index("idx_code").on(table.code),
  isActiveIdx: index("idx_is_active").on(table.isActive),
}));

// 검교정 기록
export const calibrationRecords = mysqlTable("calibration_records", {
  id: int("id").primaryKey().autoincrement(),
  equipmentId: int("equipment_id").notNull(), // 검교정설비 ID
  
  calibrationDate: date("calibration_date").notNull(), // 검교정일자
  nextCalibrationDate: date("next_calibration_date").notNull(), // 차기 검교정 일자
  regularCalibrationDate: date("regular_calibration_date"), // 정기 검교정 일자(설정치)
  
  notes: text("notes"), // 비고
  
  approvalStatus: mysqlEnum("approval_status", ["draft", "pending_review", "approved", "rejected"]).default("draft"),
  
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  equipmentIdx: index("idx_equipment").on(table.equipmentId),
  datesIdx: index("idx_dates").on(table.calibrationDate, table.nextCalibrationDate),
  approvalIdx: index("idx_approval").on(table.approvalStatus),
}));

// Relations
export const calibrationEquipmentRelations = relations(calibrationEquipment, ({ one, many }) => ({
  creator: one(users, {
    fields: [calibrationEquipment.createdBy],
    references: [users.id],
  }),
  records: many(calibrationRecords),
}));

export const calibrationRecordsRelations = relations(calibrationRecords, ({ one }) => ({
  equipment: one(calibrationEquipment, {
    fields: [calibrationRecords.equipmentId],
    references: [calibrationEquipment.id],
  }),
  creator: one(users, {
    fields: [calibrationRecords.createdBy],
    references: [users.id],
  }),
}));
