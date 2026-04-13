/**
 * part2_misc 분할: hr
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

export const hHolidays = mysqlTable("h_holidays", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  holidayDate: date("holiday_date").notNull(),
  holidayName: varchar("holiday_name", { length: 200 }).notNull(),
  holidayType: varchar("holiday_type", { length: 50 }),
  isRecurring: tinyint("is_recurring").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_work_shifts - 근무 교대
 */
export const hWorkShifts = mysqlTable("h_work_shifts", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  shiftName: varchar("shift_name", { length: 100 }).notNull(),
  startTime: varchar("start_time", { length: 10 }),
  endTime: varchar("end_time", { length: 10 }),
  isActive: tinyint("is_active").default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_employee_shifts - 직원 교대 배정
 */
export const hEmployeeShifts = mysqlTable("h_employee_shifts", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  employeeId: bigint("employee_id", { mode: "number" }).notNull(),
  shiftId: bigint("shift_id", { mode: "number" }).notNull(),
  workDate: date("work_date").notNull(),
  status: mysqlEnum("status", ["scheduled", "completed", "absent", "cancelled"]).default("scheduled"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_attendance_records - 출퇴근 기록
 */
export const hAttendanceRecords = mysqlTable("h_attendance_records", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  employeeId: bigint("employee_id", { mode: "number" }).notNull(),
  workDate: date("work_date").notNull(),
  checkInTime: timestamp("check_in_time"),
  checkOutTime: timestamp("check_out_time"),
  workHours: decimal("work_hours", { precision: 5, scale: 2 }),
  status: mysqlEnum("status", ["present", "absent", "late", "early_leave"]),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_leave_requests - 휴가 신청
 */
export const hLeaveRequests = mysqlTable("h_leave_requests", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  employeeId: bigint("employee_id", { mode: "number" }).notNull(),
  leaveType: varchar("leave_type", { length: 50 }),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  days: decimal("days", { precision: 5, scale: 1 }),
  reason: text("reason"),
  status: mysqlEnum("status", ["pending_review", "pending_approval", "pending", "approved", "rejected", "cancelled"]).default("pending_review"),
  reviewedBy: bigint("reviewed_by", { mode: "number" }),
  reviewedAt: timestamp("reviewed_at"),
  reviewComments: text("review_comments"),
  approvedBy: bigint("approved_by", { mode: "number" }),
  approvedAt: timestamp("approved_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_overtime_records - 초과근무 기록
 */
export const hOvertimeRecords = mysqlTable("h_overtime_records", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  employeeId: bigint("employee_id", { mode: "number" }).notNull(),
  workDate: date("work_date").notNull(),
  overtimeHours: decimal("overtime_hours", { precision: 5, scale: 2 }).notNull(),
  reason: text("reason"),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending"),
  reviewedBy: bigint("reviewed_by", { mode: "number" }),
  reviewedAt: timestamp("reviewed_at"),
  reviewComments: text("review_comments"),
  approvedBy: bigint("approved_by", { mode: "number" }),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_performance_reviews - 성과 평가
 */
export const hPerformanceReviews = mysqlTable("h_performance_reviews", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  employeeId: bigint("employee_id", { mode: "number" }).notNull(),
  reviewPeriodStart: date("review_period_start").notNull(),
  reviewPeriodEnd: date("review_period_end").notNull(),
  reviewerId: bigint("reviewer_id", { mode: "number" }),
  overallRating: decimal("overall_rating", { precision: 3, scale: 2 }),
  strengths: text("strengths"),
  areasForImprovement: text("areas_for_improvement"),
  goals: text("goals"),
  comments: text("comments"),
  status: mysqlEnum("status", ["draft", "completed", "acknowledged"]).default("draft"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_incidents - 사고 기록
 */
