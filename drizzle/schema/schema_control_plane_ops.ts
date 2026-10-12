/**
 * Control-plane 운영 테이블 — 운영 DB 에 실제로 있고 앱이 쓰는 것만 남김 (2026-10-12, v3 6-c).
 *
 * 제거: super_admin_* / tenant_settings / feature_flags / tenant_feature_flags / usage_counters_daily /
 *       quota_events / system_health_snapshots / tenant_health / backups / migrations /
 *       tenant_migration_runs / incidents / incident_updates / security_events
 *       — Drizzle 에만 있고 운영 DB 에 없으며 앱 코드 참조 0 (12-schema-baseline-step6.md G 그룹).
 *       같은 이유로 schema_control_plane.ts(중복 tenants + 미구축 billing) · schema_control_plane_domain.ts 삭제.
 */
import { mysqlTable, varchar, text, timestamp, int, json, boolean, index } from "drizzle-orm/mysql-core";
import { tenants } from "./schema_main";

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
