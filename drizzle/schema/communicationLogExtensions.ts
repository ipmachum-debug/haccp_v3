import { mysqlTable, bigint, int, text, varchar, timestamp, boolean, index, foreignKey } from "drizzle-orm/mysql-core";
import { tenants } from "../schema_main";
import { communicationLogs } from "./communicationLog";

// 커뮤니케이션 로그 댓글 테이블
export const communicationLogComments = mysqlTable(
  "communication_log_comments",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull().default(1),
    logId: bigint("log_id", { mode: "number" }).notNull(),
    content: text("content").notNull(),
    authorId: bigint("author_id", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    tenantFk: foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete("cascade"),
    logFk: foreignKey({
      columns: [table.logId],
      foreignColumns: [communicationLogs.id],
    }).onDelete("cascade"),
    logIdIdx: index("idx_clc_log_id").on(table.logId),
    authorIdIdx: index("idx_clc_author_id").on(table.authorId),
    createdAtIdx: index("idx_clc_created_at").on(table.createdAt),
  })
);

// 커뮤니케이션 로그 파일 첨부 테이블
export const communicationLogFiles = mysqlTable(
  "communication_log_files",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull().default(1),
    logId: bigint("log_id", { mode: "number" }).notNull(),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    filePath: varchar("file_path", { length: 500 }).notNull(),
    fileSize: bigint("file_size", { mode: "number" }).notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    uploadedBy: bigint("uploaded_by", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    tenantFk: foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete("cascade"),
    logFk: foreignKey({
      columns: [table.logId],
      foreignColumns: [communicationLogs.id],
    }).onDelete("cascade"),
    logIdIdx: index("idx_clf_log_id").on(table.logId),
    uploadedByIdx: index("idx_clf_uploaded_by").on(table.uploadedBy),
  })
);

// 커뮤니케이션 로그 알림 테이블
export const communicationLogNotifications = mysqlTable(
  "communication_log_notifications",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull().default(1),
    logId: bigint("log_id", { mode: "number" }).notNull(),
    userId: bigint("user_id", { mode: "number" }).notNull(),
    type: varchar("type", { length: 20 }).notNull(), // 'status_change', 'mention', 'comment'
    message: varchar("message", { length: 500 }).notNull(),
    isRead: boolean("is_read").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    tenantFk: foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete("cascade"),
    logFk: foreignKey({
      columns: [table.logId],
      foreignColumns: [communicationLogs.id],
    }).onDelete("cascade"),
    userIdIdx: index("idx_cln_user_id").on(table.userId),
    isReadIdx: index("idx_cln_is_read").on(table.isRead),
    createdAtIdx: index("idx_cln_created_at").on(table.createdAt),
    userUnreadIdx: index("idx_cln_user_unread").on(table.userId, table.isRead),
  })
);
