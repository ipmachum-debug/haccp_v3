import { tenants } from '../schema_main';
/**
 * 사용자 인증 관련 테이블
 */

import {
  bigint,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "./_shared";

// ============================================================================
// 사용자 및 권한 테이블
// ============================================================================

// users 테이블은 schema_main.ts에 정의되어 있음

export const hEmployees = mysqlTable("h_employees", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  employeeCode: varchar("employee_code", { length: 50 }).notNull().unique(),
  employeeName: varchar("employee_name", { length: 100 }).notNull(),
  department: varchar("department", { length: 100 }),
  position: varchar("position", { length: 100 }),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 20 }),
  hireDate: timestamp("hire_date"),
  isActive: int("is_active").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const hUserRoles = mysqlTable("h_user_roles", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  roleId: bigint("role_id", { mode: "number" }).notNull(),
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
  assignedBy: bigint("assigned_by", { mode: "number" }),
});

export const hRbacRoles = mysqlTable("h_rbac_roles", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  roleName: varchar("role_name", { length: 100 }).notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const hRbacPermissions = mysqlTable("h_rbac_permissions", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  permissionName: varchar("permission_name", { length: 100 }).notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const hRbacRolePermissions = mysqlTable("h_rbac_role_permissions", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  roleId: bigint("role_id", { mode: "number" }).notNull(),
  permissionId: bigint("permission_id", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const hOrganization = mysqlTable("h_organization", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  parentId: bigint("parent_id", { mode: "number" }),
  organizationName: varchar("organization_name", { length: 100 }).notNull(),
  level: int("level"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const hUserWidgetSettings = mysqlTable("h_user_widget_settings", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  widgetId: varchar("widget_id", { length: 100 }).notNull(),
  isVisible: int("is_visible").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const hUserFavorites = mysqlTable("h_user_favorites", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  menuPath: varchar("menu_path", { length: 255 }).notNull(),
  menuLabel: varchar("menu_label", { length: 100 }).notNull(),
  menuIcon: varchar("menu_icon", { length: 50 }),
  sortOrder: int("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
