/**
 * schema_main 분할: 시스템 (구독, 그룹, 업로드, 템플릿)
 */
import {
  bigint, boolean, date, decimal, int, json,
  mysqlEnum, mysqlTable, text, timestamp, tinyint, varchar
} from "drizzle-orm/mysql-core";
import { tenants, users } from "./schema_main_core";

export const hUploadHistory = mysqlTable("h_upload_history", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  uploadType: varchar("upload_type", { length: 20 }).notNull(), // material, supplier, product
  userId: bigint("user_id", { mode: "number" }).notNull(),
  userName: varchar("user_name", { length: 100 }).notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  totalCount: int("total_count").notNull(),
  successCount: int("success_count").notNull(),
  errorCount: int("error_count").notNull(),
  errors: text("errors"), // JSON 형식으로 저장
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type UploadHistory = typeof hUploadHistory.$inferSelect;
export type InsertUploadHistory = typeof hUploadHistory.$inferInsert;

// ==================== 템플릿 설정 ====================

export const hTemplateSettings = mysqlTable("h_template_settings", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  templateType: varchar("template_type", { length: 20 }).notNull(), // 'material' | 'supplier' | 'product'
  templateName: varchar("template_name", { length: 100 }).notNull(),
  selectedFields: text("selected_fields").notNull(), // JSON array of field names
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type TemplateSetting = typeof hTemplateSettings.$inferSelect;
export type InsertTemplateSetting = typeof hTemplateSettings.$inferInsert;


// ==================== 사용자 그룹 관리 ====================


export const userGroups = mysqlTable("user_groups", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  groupType: mysqlEnum("group_type", ["department", "team", "project", "custom"]).default("custom").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  createdBy: bigint("created_by", { mode: "number" }).references(() => users.id),
});


export const userGroupMembers = mysqlTable("user_group_members", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  groupId: bigint("group_id", { mode: "number" }).notNull().references(() => userGroups.id, { onDelete: "cascade" }),
  userId: bigint("user_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "cascade" }),
  role: mysqlEnum("role", ["member", "leader", "admin"]).default("member").notNull(),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
});

export type UserGroup = typeof userGroups.$inferSelect;
export type InsertUserGroup = typeof userGroups.$inferInsert;
export type UserGroupMember = typeof userGroupMembers.$inferSelect;
export type InsertUserGroupMember = typeof userGroupMembers.$inferInsert;


// ==================== 회계 관리 ====================

/**
 * [DEPRECATED] 구식 계정 과목 테이블 - income/expense 단순 분류
 * → 신규 코드에서는 accounting_accounts (drizzle/schema/accountingAccounts.ts) 사용
 * → 5분류(자산/부채/자본/수익/비용) + system_code 기반 복식부기 체계로 전환 완료
 * @deprecated P4에서 데이터 마이그레이션 후 제거 예정
 */

export const subscriptionNotifications = mysqlTable("subscription_notifications", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").references(() => tenants.id).notNull(),
  notificationType: mysqlEnum("notification_type", ["7_days", "3_days", "1_day", "expired", "grace_period_end"]).notNull(),
  notificationDate: timestamp("notification_date").defaultNow().notNull(),
  isRead: boolean("is_read").default(false).notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * 패키지별 기능 정의 테이블
 * Basic: HACCP만, Pro: HACCP + 회계
 */

export const packageFeatures = mysqlTable("package_features", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  packageName: mysqlEnum("package_name", ["basic", "pro"]).notNull(),
  featureName: varchar("feature_name", { length: 100 }).notNull(), // "haccp", "accounting"
  isEnabled: boolean("is_enabled").default(true).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Type exports
export type SubscriptionNotification = typeof subscriptionNotifications.$inferSelect;
export type InsertSubscriptionNotification = typeof subscriptionNotifications.$inferInsert;
export type PackageFeature = typeof packageFeatures.$inferSelect;
export type InsertPackageFeature = typeof packageFeatures.$inferInsert;

// ============================================================================
// 범용 체크리스트 레코드 (Generic Checklist Records)
// ============================================================================

/**
 * 범용 체크리스트 레코드 테이블
 * 전용 테이블이 없는 체크리스트 폼의 데이터를 JSON으로 저장
 */

// Type exports
