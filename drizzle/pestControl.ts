import {mysqlTable,  bigint, varchar, text, date, timestamp, mysqlEnum, int} from "drizzle-orm/mysql-core";
import { tenants } from '../schema_main';
import { users } from "../schema_main";

/**
 * 방충방서 점검표
 */
export const pestControlChecklists = mysqlTable("pest_control_checklists", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  
  // 기본 정보
  checkDate: date("check_date").notNull(), // 점검 일자
  inspector: varchar("inspector", { length: 100 }).notNull(), // 점검자
  confirmer: varchar("confirmer", { length: 100 }), // 확인자
  
  // 특이사항
  specialNotes: text("special_notes"), // 특이사항
  
  // 개선조치
  correctiveAction: text("corrective_action"), // 개선조치
  
  // 결재 상태
  approvalStatus: mysqlEnum("approval_status", ["draft", "pending_review", "approved", "rejected"]).default("draft"),
  
  // 메타데이터
  createdBy: bigint("created_by", { mode: "number" }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

/**
 * 방충방서 점검 항목 (포충등/포서통 위치별 포획수)
 */
export const pestControlItems = mysqlTable("pest_control_items", {
  id: int("id").primaryKey().autoincrement(),
  
  // 체크리스트 참조
  checklistId: int("checklist_id").notNull().references(() => pestControlChecklists.id, { onDelete: "cascade" }),
  
  // 위치 정보
  location: varchar("location", { length: 200 }).notNull(), // 위치 (예: 원료창고 입구, 제조실 좌측)
  deviceType: mysqlEnum("device_type", ["trap_light", "trap_box"]).notNull(), // 장치 유형 (포충등/포서통)
  
  // 포획수
  captureCount: int("capture_count").notNull().default(0), // 포획수
  
  // 비고
  notes: text("notes"), // 비고
  
  // 메타데이터
  createdAt: timestamp("created_at").defaultNow(),
});
