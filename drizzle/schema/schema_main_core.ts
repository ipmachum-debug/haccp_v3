/**
 * schema_main 분할: 코어 (테넌트, 사용자, 권한, 조직)
 */
import {
  bigint, boolean, date, decimal, int, json,
  mysqlEnum, mysqlTable, text, timestamp, tinyint, varchar
} from "drizzle-orm/mysql-core";

export const tenants = mysqlTable("tenants", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  status: mysqlEnum("status", ["active", "suspended", "trial", "expired"]).default("trial").notNull(),
  
  // 구독 관리
  subscriptionPackage: mysqlEnum("subscription_package", ["starter", "standard", "enterprise"]).default("starter").notNull(),
  subscriptionStartDate: date("subscription_start_date"),
  subscriptionEndDate: date("subscription_end_date"),
  subscriptionDays: int("subscription_days").default(0), // 구독 일수
  gracePeriodEndDate: date("grace_period_end_date"), // 유예기간 종료일 (7일)
  isReadOnly: boolean("is_read_only").default(false), // 읽기 전용 모드

  // 업종 정보 (2026-04-19 추가, schema_control_plane 와 동기화)
  industryCode: varchar("industry_code", { length: 20 }),
  industryCategory: varchar("industry_category", { length: 50 }),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

// ============================================================================
// 사용자/권한 테이블 (10개)
// ============================================================================

/**
 * 사용자 테이블 (로컬 JWT 인증)
 * Manus OAuth 완전 제거, 이메일 + 비밀번호 기반 인증
 */

export const users = mysqlTable("users", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').references(() => tenants.id),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  role: mysqlEnum("role", ["super_admin", "admin", "accountant", "worker", "monitor", "inspector", "employee"]).default("worker").notNull(),
  userType: mysqlEnum("user_type", ["b2b_partner", "general_user", "company_staff", "other", "client_admin", "employee"]).default("employee"),
  userMemo: text("user_memo"),
  companyName: varchar("company_name", { length: 255 }),
  businessNumber: varchar("business_number", { length: 50 }),
  adminMemo: text("admin_memo"),
  companyId: bigint("company_id", { mode: "number" }),
  siteId: bigint("site_id", { mode: "number" }),
  isActive: tinyint("is_active").default(1).notNull(),
  emailVerified: tinyint("email_verified").default(0).notNull(),
  approvalStatus: mysqlEnum("approval_status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  invitedBy: bigint("invited_by", { mode: "number" }),
  invitedAt: timestamp("invited_at"),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});


export const hRoles = mysqlTable("h_roles", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  roleName: varchar("role_name", { length: 100 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});


export const hUserRoles = mysqlTable("h_user_roles", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  roleId: bigint("role_id", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});


export const hEmployees = mysqlTable("h_employees", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  userId: bigint("user_id", { mode: "number" }),
  employeeCode: varchar("employee_code", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  departmentId: bigint("department_id", { mode: "number" }),
  positionId: bigint("position_id", { mode: "number" }),
  hireDate: date("hire_date"),
  isActive: tinyint("is_active").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});


export const hDepartments = mysqlTable("h_departments", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  departmentName: varchar("department_name", { length: 100 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});


export const hPositions = mysqlTable("h_positions", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  positionName: varchar("position_name", { length: 100 }).notNull(),
  level: int("level"),
  approvalRole: mysqlEnum("approval_role", ["none", "reviewer", "approver"]).default("none"),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
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

/**
 * 이메일 인증 토큰 테이블
 */

export const emailVerificationTokens = mysqlTable("email_verification_tokens", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// 기본 정보 테이블 (2개)
// ============================================================================


export const hSites = mysqlTable("h_sites", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  siteCode: varchar("site_code", { length: 50 }).notNull().unique(),
  siteName: varchar("site_name", { length: 200 }).notNull(),
  address: varchar("address", { length: 255 }),
  phone: varchar("phone", { length: 20 }),
  managerId: bigint("manager_id", { mode: "number" }),
  isActive: tinyint("is_active").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});


export const hCompanyInfo = mysqlTable("h_company_info", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  companyName: varchar("company_name", { length: 200 }).notNull(),
  representativeName: varchar("representative_name", { length: 100 }),
  registrationNumber: varchar("registration_number", { length: 50 }),
  address: varchar("address", { length: 255 }),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 255 }),
  website: varchar("website", { length: 255 }),
  industry: varchar("industry", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

// ============================================================================
// 제품/원재료 테이블 (10개) - 배치보다 먼저 정의 (FK 참조)
// ============================================================================


// Type exports
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Site = typeof hSites.$inferSelect;
export type InsertSite = typeof hSites.$inferInsert;
