/**
 * part2_misc 분할: common
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

export const hCodeGroups = mysqlTable("h_code_groups", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  groupCode: varchar("group_code", { length: 50 }).unique().notNull(),
  groupName: varchar("group_name", { length: 100 }).notNull(),
  description: text("description"),
  isActive: tinyint("is_active").default(1),
  sortOrder: int("sort_order").default(0),
});

/**
 * h_codes - 코드
 */
export const hCodes = mysqlTable("h_codes", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  groupCode: varchar("group_code", { length: 50 }).notNull(),
  code: varchar("code", { length: 50 }).notNull(),
  codeName: varchar("code_name", { length: 200 }).notNull(),
  codeValue: varchar("code_value", { length: 200 }),
  description: text("description"),
  isActive: tinyint("is_active").default(1),
  sortOrder: int("sort_order").default(0),
});

/**
 * h_equipment - 설비/장비
 */
export const hFileAttachments = mysqlTable("h_file_attachments", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  referenceType: varchar("reference_type", { length: 50 }).notNull(),
  referenceId: bigint("reference_id", { mode: "number" }).notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileUrl: varchar("file_url", { length: 500 }).notNull(),
  fileSize: bigint("file_size", { mode: "number" }),
  mimeType: varchar("mime_type", { length: 100 }),
  uploadedBy: bigint("uploaded_by", { mode: "number" }),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

/**
 * h_comments - 댓글
 */
export const hComments = mysqlTable("h_comments", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  referenceType: varchar("reference_type", { length: 50 }).notNull(),
  referenceId: bigint("reference_id", { mode: "number" }).notNull(),
  commentText: text("comment_text").notNull(),
  parentCommentId: bigint("parent_comment_id", { mode: "number" }),
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * h_tags - 태그
 */
export const hTags = mysqlTable("h_tags", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  tagName: varchar("tag_name", { length: 100 }).unique().notNull(),
  tagColor: varchar("tag_color", { length: 20 }),
  category: varchar("category", { length: 100 }),
  usageCount: int("usage_count").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_entity_tags - 엔티티 태그 연결
 */
export const hEntityTags = mysqlTable("h_entity_tags", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  entityId: bigint("entity_id", { mode: "number" }).notNull(),
  tagId: bigint("tag_id", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_favorites - 즐겨찾기
 */
export const hFavorites = mysqlTable("h_favorites", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  entityId: bigint("entity_id", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_bookmarks - 북마크
 */
export const hBookmarks = mysqlTable("h_bookmarks", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  bookmarkName: varchar("bookmark_name", { length: 200 }).notNull(),
  bookmarkUrl: varchar("bookmark_url", { length: 500 }).notNull(),
  category: varchar("category", { length: 100 }),
  sortOrder: int("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_user_preferences - 사용자 환경설정
 */
export const hUserPreferences = mysqlTable("h_user_preferences", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  preferenceKey: varchar("preference_key", { length: 100 }).notNull(),
  preferenceValue: text("preference_value"),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * h_sessions - 세션
 */
