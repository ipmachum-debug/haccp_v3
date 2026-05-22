import {mysqlTable, varchar, timestamp, text, mysqlEnum,  bigint, int} from "drizzle-orm/mysql-core";
import { tenants } from './schema_main';

/**
 * 종사자(직원) 테이블
 */
export const employees = mysqlTable("employees", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  
  // 기본 정보
  name: varchar("name", { length: 100 }).notNull(),
  department: varchar("department", { length: 100 }),
  position: varchar("position", { length: 100 }),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 255 }),
  
  // 입사/퇴사 정보
  hireDate: timestamp("hire_date").notNull(),
  resignationDate: timestamp("resignation_date"),
  status: mysqlEnum("status", ["active", "resigned"]).notNull().default("active"),
  
  // 메모
  notes: text("notes"),
  
  // 시스템 필드
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  createdBy: bigint("created_by", { mode: "number" }),
});

/**
 * 건강진단서(보건증) 테이블
 */
export const healthCertificates = mysqlTable("health_certificates", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  
  // 종사자 정보
  employeeId: bigint("employee_id", { mode: "number" }).notNull(),
  employeeName: varchar("employee_name", { length: 100 }).notNull(),
  
  // 건강진단서 정보
  issueDate: timestamp("issue_date").notNull(),
  expiryDate: timestamp("expiry_date").notNull(),
  
  // 파일 정보
  // ★ 2026-05-22: length 500 → 2048 — presigned S3 URL 이 500자 초과해서 INSERT 실패.
  //   라우터에서 query string 을 제거하지만, 만약 통과해도 들어갈 수 있게 여유 확보.
  fileUrl: varchar("file_url", { length: 2048 }),
  fileKey: varchar("file_key", { length: 2048 }),
  fileName: varchar("file_name", { length: 255 }),
  
  // 상태 (자동 계산)
  status: mysqlEnum("status", ["valid", "expiring_soon", "expired"]).notNull().default("valid"),
  
  // 알림 발송 기록
  reminderSent30Days: int("reminder_sent_30_days").default(0), // 0: 미발송, 1: 발송완료
  reminderSent7Days: int("reminder_sent_7_days").default(0),
  reminderSentExpiry: int("reminder_sent_expiry").default(0),
  
  // 메모
  notes: text("notes"),
  
  // 시스템 필드
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  createdBy: bigint("created_by", { mode: "number" }),
});
