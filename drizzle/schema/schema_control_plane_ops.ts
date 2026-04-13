/**
 * Control Plane Schema - Operations & Monitoring
 * 슈퍼관리자 사용자, 운영, 모니터링, 감사로그
 */

import { mysqlTable, varchar, text, timestamp, int, decimal, json, boolean, uniqueIndex, index } from "drizzle-orm/mysql-core";
import { tenants } from "./schema_main";

// ============================================
// 4. Super Admin 사용자/권한 (운영자용)
// ============================================

export const superAdminUsers = mysqlTable("super_admin_users", {
  id: varchar("id", { length: 36 }).primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  
  status: varchar("status", { length: 20 }).notNull().default("active"), // active/inactive
  lastLoginAt: timestamp("last_login_at"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
}, (table) => ({
  emailIdx: uniqueIndex("email_idx").on(table.email),
}));

export const superAdminRoles = mysqlTable("super_admin_roles", {
  id: varchar("id", { length: 36 }).primaryKey(),
  code: varchar("code", { length: 50 }).notNull().unique(), // owner/support/ops/dev/finance
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  codeIdx: uniqueIndex("code_idx").on(table.code),
}));

export const superAdminUserRoles = mysqlTable("super_admin_user_roles", {
  userId: varchar("user_id", { length: 36 }).notNull().references(() => superAdminUsers.id, { onDelete: "cascade" }),
  roleId: varchar("role_id", { length: 36 }).notNull().references(() => superAdminRoles.id, { onDelete: "cascade" }),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  pk: uniqueIndex("pk").on(table.userId, table.roleId),
}));

export const superAdminSessions = mysqlTable("super_admin_sessions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => superAdminUsers.id, { onDelete: "cascade" }),
  
  token: varchar("token", { length: 255 }).notNull().unique(),
  ip: varchar("ip", { length: 50 }),
  userAgent: text("user_agent"),
  
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index("user_id_idx").on(table.userId),
  tokenIdx: uniqueIndex("token_idx").on(table.token),
}));

// ============================================
// 5. Tenant 상태/운영 설정
// ============================================

export const tenantSettings = mysqlTable("tenant_settings", {
  tenantId: varchar("tenant_id", { length: 36 }).primaryKey().references(() => tenants.id, { onDelete: "cascade" }),
  
  // 제한사항 오버라이드
  maxUsersOverride: int("max_users_override"),
  maxSitesOverride: int("max_sites_override"),
  
  // 기능 오버라이드 (JSON)
  featureOverridesJson: json("feature_overrides_json").$type<Record<string, boolean>>(),
  
  // 보안 정책 (JSON)
  securityPolicyJson: json("security_policy_json").$type<{
    passwordMinLength?: number;
    require2FA?: boolean;
    sessionTimeoutMinutes?: number;
    ipWhitelist?: string[];
  }>(),
  
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

export const featureFlags = mysqlTable("feature_flags", {
  id: varchar("id", { length: 36 }).primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  
  isActive: boolean("is_active").notNull().default(false),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
}, (table) => ({
  keyIdx: uniqueIndex("key_idx").on(table.key),
}));

export const tenantFeatureFlags = mysqlTable("tenant_feature_flags", {
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  flagId: varchar("flag_id", { length: 36 }).notNull().references(() => featureFlags.id, { onDelete: "cascade" }),
  
  enabled: boolean("enabled").notNull().default(false),
  configJson: json("config_json").$type<Record<string, any>>(),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
}, (table) => ({
  pk: uniqueIndex("pk").on(table.tenantId, table.flagId),
}));

// ============================================
// 6. Usage / Quota (사용량 기반 과금/제한)
// ============================================

export const usageCountersDaily = mysqlTable("usage_counters_daily", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  metric: varchar("metric", { length: 100 }).notNull(), // batches_created, storage_bytes, api_calls
  value: decimal("value", { precision: 20, scale: 2 }).notNull().default("0"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
}, (table) => ({
  uniqueIdx: uniqueIndex("unique_idx").on(table.tenantId, table.date, table.metric),
  tenantDateIdx: index("tenant_date_idx").on(table.tenantId, table.date),
}));

export const quotaEvents = mysqlTable("quota_events", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  
  metric: varchar("metric", { length: 100 }).notNull(),
  limitValue: decimal("limit_value", { precision: 20, scale: 2 }).notNull(),
  currentValue: decimal("current_value", { precision: 20, scale: 2 }).notNull(),
  
  action: varchar("action", { length: 20 }).notNull(), // warn/block/throttle
  triggeredAt: timestamp("triggered_at").notNull().defaultNow(),
}, (table) => ({
  tenantIdIdx: index("tenant_id_idx").on(table.tenantId),
}));

// ============================================
// 7. 모니터링/장애/백업/마이그레이션
// ============================================

export const systemHealthSnapshots = mysqlTable("system_health_snapshots", {
  id: varchar("id", { length: 36 }).primaryKey(),
  capturedAt: timestamp("captured_at").notNull().defaultNow(),
  
  appRegion: varchar("app_region", { length: 50 }),
  
  dbCpu: decimal("db_cpu", { precision: 5, scale: 2 }),
  dbStorage: decimal("db_storage", { precision: 10, scale: 2 }), // GB
  errorRate: decimal("error_rate", { precision: 5, scale: 2 }),
  p95LatencyMs: int("p95_latency_ms"),
}, (table) => ({
  capturedAtIdx: index("captured_at_idx").on(table.capturedAt),
}));

export const tenantHealth = mysqlTable("tenant_health", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  capturedAt: timestamp("captured_at").notNull().defaultNow(),
  
  jobsBacklog: int("jobs_backlog").default(0),
  lastSuccessfulBackupAt: timestamp("last_successful_backup_at"),
  lastMigrationVersion: varchar("last_migration_version", { length: 50 }),
  errorRate: decimal("error_rate", { precision: 5, scale: 2 }),
}, (table) => ({
  tenantIdIdx: index("tenant_id_idx").on(table.tenantId),
  capturedAtIdx: index("captured_at_idx").on(table.capturedAt),
}));

export const backups = mysqlTable("backups", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  
  backupType: varchar("backup_type", { length: 20 }).notNull(), // full/incremental
  storageUri: text("storage_uri"), // S3 URI or key
  
  status: varchar("status", { length: 20 }).notNull().default("queued"), // queued/running/success/failed
  
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  errorMessage: text("error_message"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  tenantIdIdx: index("tenant_id_idx").on(table.tenantId),
  statusIdx: index("status_idx").on(table.status),
}));

export const migrations = mysqlTable("migrations", {
  id: varchar("id", { length: 36 }).primaryKey(),
  version: varchar("version", { length: 50 }).notNull().unique(),
  description: text("description"),
  
  appliedAt: timestamp("applied_at").notNull().defaultNow(),
  notes: text("notes"),
}, (table) => ({
  versionIdx: uniqueIndex("version_idx").on(table.version),
}));

export const tenantMigrationRuns = mysqlTable("tenant_migration_runs", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  migrationVersion: varchar("migration_version", { length: 50 }).notNull(),
  
  status: varchar("status", { length: 20 }).notNull().default("pending"), // pending/running/success/failed
  
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  errorMessage: text("error_message"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  tenantIdIdx: index("tenant_id_idx").on(table.tenantId),
  uniqueIdx: uniqueIndex("unique_idx").on(table.tenantId, table.migrationVersion),
}));

export const incidents = mysqlTable("incidents", {
  id: varchar("id", { length: 36 }).primaryKey(),
  severity: varchar("severity", { length: 10 }).notNull(), // sev1/sev2/sev3/sev4
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  
  status: varchar("status", { length: 20 }).notNull().default("investigating"), // investigating/identified/monitoring/resolved
  
  startedAt: timestamp("started_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
}, (table) => ({
  statusIdx: index("status_idx").on(table.status),
  startedAtIdx: index("started_at_idx").on(table.startedAt),
}));

export const incidentUpdates = mysqlTable("incident_updates", {
  id: varchar("id", { length: 36 }).primaryKey(),
  incidentId: varchar("incident_id", { length: 36 }).notNull().references(() => incidents.id, { onDelete: "cascade" }),
  
  message: text("message").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  incidentIdIdx: index("incident_id_idx").on(table.incidentId),
}));

// ============================================
// 8. 보안/감사로그
// ============================================

export const auditLogs = mysqlTable("audit_logs", {
  id: varchar("id", { length: 36 }).primaryKey(),
  
  actorType: varchar("actor_type", { length: 20 }).notNull(), // super_admin/system
  actorId: varchar("actor_id", { length: 36 }),
  
  tenantId: varchar("tenant_id", { length: 36 }).references(() => tenants.id, { onDelete: "set null" }), // nullable for system-wide events
  
  action: varchar("action", { length: 100 }).notNull(), // tenant.suspend, license.extend
  targetType: varchar("target_type", { length: 50 }),
  targetId: varchar("target_id", { length: 36 }),
  
  ip: varchar("ip", { length: 50 }),
  userAgent: text("user_agent"),
  
  metaJson: json("meta_json").$type<Record<string, any>>(),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  tenantIdIdx: index("tenant_id_idx").on(table.tenantId),
  createdAtIdx: index("created_at_idx").on(table.createdAt),
  actorIdx: index("actor_idx").on(table.actorType, table.actorId),
}));

export const securityEvents = mysqlTable("security_events", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 }).references(() => tenants.id, { onDelete: "set null" }),
  
  eventType: varchar("event_type", { length: 50 }).notNull(), // bruteforce/token_abuse/suspicious_login
  riskScore: int("risk_score").notNull().default(0), // 0-100
  
  ip: varchar("ip", { length: 50 }),
  userAgent: text("user_agent"),
  detailsJson: json("details_json").$type<Record<string, any>>(),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  tenantIdIdx: index("tenant_id_idx").on(table.tenantId),
  createdAtIdx: index("created_at_idx").on(table.createdAt),
}));

// ============================================
// 9. Dashboard Banners (환영 메시지 + 이벤트 배너)
// ============================================

export const banners = mysqlTable("banners", {
  id: int("id").primaryKey().autoincrement(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  type: varchar("type", { length: 20 }).notNull().default("event"), // welcome/event/notice/update
  color: varchar("color", { length: 50 }).default("blue"),
  icon: varchar("icon", { length: 50 }).default("Bell"),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  targetRoles: json("target_roles").$type<string[]>(), // null = all roles
  tenantId: int("tenant_id").references(() => tenants.id, { onDelete: "cascade" }), // null = all tenants
  priority: int("priority").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
}, (table) => ({
  tenantIdIdx: index("tenant_id_idx").on(table.tenantId),
  activeIdx: index("active_idx").on(table.isActive),
  dateIdx: index("date_idx").on(table.startDate, table.endDate),
}));
