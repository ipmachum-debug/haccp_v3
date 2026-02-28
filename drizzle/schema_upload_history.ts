import { tenants } from './schema_main';
/**
 * 일괄 업로드 이력 스키마
 */

import {mysqlTable, bigint, varchar, int, timestamp, text} from "drizzle-orm/mysql-core";

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
