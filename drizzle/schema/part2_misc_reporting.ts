/**
 * part2_misc 분할: reporting
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

export const hBatchReports = mysqlTable("h_batch_reports", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  batchId: bigint("batch_id", { mode: "number" }).notNull(),
  reportDate: date("report_date").notNull(),
  reportType: varchar("report_type", { length: 50 }),
  reportContent: text("report_content"),
  pdfUrl: varchar("pdf_url", { length: 500 }),
  generatedBy: bigint("generated_by", { mode: "number" }),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
});

/**
 * h_daily_reports - 일일 보고서
 */
export const hDailyReports = mysqlTable("h_daily_reports", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  reportDate: date("report_date").notNull(),
  reportType: varchar("report_type", { length: 50 }),
  summary: text("summary"),
  pdfUrl: varchar("pdf_url", { length: 500 }),
  generatedBy: bigint("generated_by", { mode: "number" }),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
});

/**
 * h_monthly_reports - 월간 보고서
 */
export const hMonthlyReports = mysqlTable("h_monthly_reports", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  reportYear: int("report_year").notNull(),
  reportMonth: int("report_month").notNull(),
  reportType: varchar("report_type", { length: 50 }),
  summary: text("summary"),
  pdfUrl: varchar("pdf_url", { length: 500 }),
  generatedBy: bigint("generated_by", { mode: "number" }),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
});

/**
 * h_kpi_metrics - KPI 지표
 */
export const hKpiMetrics = mysqlTable("h_kpi_metrics", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }),
  metricDate: date("metric_date").notNull(),
  metricName: varchar("metric_name", { length: 100 }).notNull(),
  metricValue: decimal("metric_value", { precision: 12, scale: 3 }),
  unit: varchar("unit", { length: 50 }),
  target: decimal("target", { precision: 12, scale: 3 }),
  category: varchar("category", { length: 100 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_dashboard_widgets - 대시보드 위젯
 */
export const hDashboardWidgets = mysqlTable("h_dashboard_widgets", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  userId: bigint("user_id", { mode: "number" }),
  widgetType: varchar("widget_type", { length: 50 }).notNull(),
  widgetTitle: varchar("widget_title", { length: 200 }),
  widgetConfig: text("widget_config"),
  position: int("position").default(0),
  isVisible: tinyint("is_visible").default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_file_attachments - 파일 첨부
 */
export const hCustomFields = mysqlTable("h_custom_fields", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  fieldName: varchar("field_name", { length: 100 }).notNull(),
  fieldType: varchar("field_type", { length: 50 }),
  fieldOptions: text("field_options"),
  isRequired: tinyint("is_required").default(0),
  sortOrder: int("sort_order").default(0),
  isActive: tinyint("is_active").default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_custom_field_values - 사용자 정의 필드 값
 */
export const hCustomFieldValues = mysqlTable("h_custom_field_values", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  fieldId: bigint("field_id", { mode: "number" }).notNull(),
  entityId: bigint("entity_id", { mode: "number" }).notNull(),
  fieldValue: text("field_value"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * h_reports_templates - 보고서 템플릿
 */
export const hReportsTemplates = mysqlTable("h_reports_templates", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  templateName: varchar("template_name", { length: 200 }).notNull(),
  reportType: varchar("report_type", { length: 50 }),
  templateContent: text("template_content"),
  isActive: tinyint("is_active").default(1),
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * h_report_schedules - 보고서 예약
 */
export const hReportSchedules = mysqlTable("h_report_schedules", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  templateId: bigint("template_id", { mode: "number" }).notNull(),
  scheduleName: varchar("schedule_name", { length: 200 }).notNull(),
  frequency: varchar("frequency", { length: 50 }),
  recipients: text("recipients"),
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  isActive: tinyint("is_active").default(1),
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_holidays - 휴일
 */
export const hCustomerFeedback = mysqlTable("h_customer_feedback", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  feedbackDate: date("feedback_date").notNull(),
  customerId: bigint("customer_id", { mode: "number" }),
  feedbackType: varchar("feedback_type", { length: 50 }),
  rating: int("rating"),
  comments: text("comments"),
  productId: bigint("product_id", { mode: "number" }),
  status: mysqlEnum("status", ["new", "reviewed", "actioned"]).default("new"),
  reviewedBy: bigint("reviewed_by", { mode: "number" }),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_quality_objectives - 품질 목표
 */
export const hBatchSchedules = mysqlTable("h_batch_schedules", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  batchId: bigint("batch_id", { mode: "number" }).notNull(),
  scheduledDate: timestamp("scheduled_date").notNull(),
  status: varchar("status", { length: 50 }).default("planned"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// ============================================================================
// HACCP 핵심 기능 테이블 (4개) - 2026-02-01 추가
// ============================================================================

/**
 * h_ccp_monitoring - CCP 모니터링 기록
 */
