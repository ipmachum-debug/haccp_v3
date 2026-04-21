/**
 * 템플릿 설정 스키마
 */

import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const hTemplateSettings = sqliteTable("h_template_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  templateType: text("template_type").notNull(), // 'material' | 'supplier' | 'product'
  templateName: text("template_name").notNull(),
  selectedFields: text("selected_fields").notNull(), // JSON array of field names
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});
