/**
 * part2_misc 분할: system
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

export const hProductionLogs = mysqlTable("h_production_logs", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  batchId: bigint("batch_id", { mode: "number" }).notNull(),
  logTime: timestamp("log_time").defaultNow().notNull(),
  eventType: varchar("event_type", { length: 50 }),
  description: text("description"),
  operatorId: bigint("operator_id", { mode: "number" }),
  notes: text("notes"),
});

/**
 * h_temperature_logs - 온도 로그
 */
export const hTemperatureLogs = mysqlTable("h_temperature_logs", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  logTime: timestamp("log_time").defaultNow().notNull(),
  location: varchar("location", { length: 100 }),
  equipmentId: bigint("equipment_id", { mode: "number" }),
  temperature: decimal("temperature", { precision: 5, scale: 2 }).notNull(),
  humidity: decimal("humidity", { precision: 5, scale: 2 }),
  status: mysqlEnum("status", ["normal", "warning", "critical"]).default("normal"),
  recordedBy: bigint("recorded_by", { mode: "number" }),
});

/**
 * h_batch_reports - 배치 보고서
 */
export const hSessions = mysqlTable("h_sessions", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  sessionToken: varchar("session_token", { length: 255 }).unique().notNull(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_login_history - 로그인 이력
 */
export const hLoginHistory = mysqlTable("h_login_history", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  loginAt: timestamp("login_at").defaultNow().notNull(),
  logoutAt: timestamp("logout_at"),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  loginStatus: mysqlEnum("login_status", ["success", "failed"]).default("success"),
});

/**
 * h_api_logs - API 로그
 */
export const hApiLogs = mysqlTable("h_api_logs", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  userId: bigint("user_id", { mode: "number" }),
  endpoint: varchar("endpoint", { length: 500 }).notNull(),
  method: varchar("method", { length: 10 }),
  statusCode: int("status_code"),
  requestBody: text("request_body"),
  responseBody: text("response_body"),
  duration: int("duration"),
  ipAddress: varchar("ip_address", { length: 45 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_error_logs - 오류 로그
 */
export const hErrorLogs = mysqlTable("h_error_logs", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  errorType: varchar("error_type", { length: 100 }),
  errorMessage: text("error_message"),
  stackTrace: text("stack_trace"),
  userId: bigint("user_id", { mode: "number" }),
  endpoint: varchar("endpoint", { length: 500 }),
  ipAddress: varchar("ip_address", { length: 45 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_scheduled_tasks - 예약 작업
 */
export const hScheduledTasks = mysqlTable("h_scheduled_tasks", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  taskName: varchar("task_name", { length: 200 }).notNull(),
  taskType: varchar("task_type", { length: 50 }),
  schedule: varchar("schedule", { length: 100 }),
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  status: mysqlEnum("status", ["active", "paused", "completed", "failed"]).default("active"),
  isActive: tinyint("is_active").default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_task_history - 작업 이력
 */
export const hTaskHistory = mysqlTable("h_task_history", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  taskId: bigint("task_id", { mode: "number" }).notNull(),
  runAt: timestamp("run_at").defaultNow().notNull(),
  status: mysqlEnum("status", ["success", "failed"]).notNull(),
  duration: int("duration"),
  errorMessage: text("error_message"),
  result: text("result"),
});

/**
 * h_backup_logs - 백업 로그
 */
export const hBackupLogs = mysqlTable("h_backup_logs", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  backupDate: timestamp("backup_date").defaultNow().notNull(),
  backupType: varchar("backup_type", { length: 50 }),
  backupSize: bigint("backup_size", { mode: "number" }),
  backupLocation: varchar("backup_location", { length: 500 }),
  status: mysqlEnum("status", ["success", "failed"]).default("success"),
  errorMessage: text("error_message"),
  duration: int("duration"),
});

/**
 * h_system_health - 시스템 상태
 */
export const hSystemHealth = mysqlTable("h_system_health", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  checkTime: timestamp("check_time").defaultNow().notNull(),
  cpuUsage: decimal("cpu_usage", { precision: 5, scale: 2 }),
  memoryUsage: decimal("memory_usage", { precision: 5, scale: 2 }),
  diskUsage: decimal("disk_usage", { precision: 5, scale: 2 }),
  databaseSize: bigint("database_size", { mode: "number" }),
  activeUsers: int("active_users"),
  status: mysqlEnum("status", ["healthy", "warning", "critical"]).default("healthy"),
});

/**
 * h_change_logs - 변경 로그
 */
export const hChangeLogs = mysqlTable("h_change_logs", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  changeDate: timestamp("change_date").defaultNow().notNull(),
  changeType: varchar("change_type", { length: 50 }),
  entityType: varchar("entity_type", { length: 50 }),
  entityId: bigint("entity_id", { mode: "number" }),
  fieldName: varchar("field_name", { length: 100 }),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  changedBy: bigint("changed_by", { mode: "number" }),
});

/**
 * h_data_migrations - 데이터 마이그레이션
 */
export const hDataMigrations = mysqlTable("h_data_migrations", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  migrationName: varchar("migration_name", { length: 200 }).notNull(),
  migrationVersion: varchar("migration_version", { length: 50 }),
  status: mysqlEnum("status", ["pending", "in_progress", "completed", "failed"]).default("pending"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_integrations - 외부 연동
 */
export const hIntegrations = mysqlTable("h_integrations", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  integrationName: varchar("integration_name", { length: 200 }).notNull(),
  integrationType: varchar("integration_type", { length: 50 }),
  apiEndpoint: varchar("api_endpoint", { length: 500 }),
  apiKey: varchar("api_key", { length: 500 }),
  isActive: tinyint("is_active").default(1),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * h_sync_logs - 동기화 로그
 */
export const hSyncLogs = mysqlTable("h_sync_logs", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  integrationId: bigint("integration_id", { mode: "number" }).notNull(),
  syncAt: timestamp("sync_at").defaultNow().notNull(),
  syncType: varchar("sync_type", { length: 50 }),
  recordsProcessed: int("records_processed"),
  recordsSuccess: int("records_success"),
  recordsFailed: int("records_failed"),
  status: mysqlEnum("status", ["success", "partial", "failed"]).default("success"),
  errorMessage: text("error_message"),
  duration: int("duration"),
});

/**
 * h_webhooks - 웹훅
 */
export const hWebhooks = mysqlTable("h_webhooks", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  webhookName: varchar("webhook_name", { length: 200 }).notNull(),
  webhookUrl: varchar("webhook_url", { length: 500 }).notNull(),
  eventType: varchar("event_type", { length: 100 }),
  isActive: tinyint("is_active").default(1),
  secret: varchar("secret", { length: 255 }),
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_webhook_logs - 웹훅 로그
 */
export const hWebhookLogs = mysqlTable("h_webhook_logs", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  webhookId: bigint("webhook_id", { mode: "number" }).notNull(),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
  payload: text("payload"),
  responseStatus: int("response_status"),
  responseBody: text("response_body"),
  status: mysqlEnum("status", ["success", "failed"]).default("success"),
  errorMessage: text("error_message"),
  duration: int("duration"),
});

/**
 * h_custom_fields - 사용자 정의 필드
 */
