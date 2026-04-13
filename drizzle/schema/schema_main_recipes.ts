/**
 * schema_main 분할: 레시피
 */
import {
  bigint, boolean, date, decimal, int, json,
  mysqlEnum, mysqlTable, text, timestamp, tinyint, varchar
} from "drizzle-orm/mysql-core";
import { tenants } from "./schema_main_core";

export const hRecipeHeaders = mysqlTable("h_recipe_headers", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  recipeCode: varchar("recipe_code", { length: 50 }).notNull().unique(),
  recipeName: varchar("recipe_name", { length: 100 }).notNull(),
  productId: bigint("product_id", { mode: "number" }).notNull(),
  version: int("version").default(1).notNull(),
  targetQuantity: decimal("target_quantity", { precision: 10, scale: 2 }),
  unit: varchar("unit", { length: 20 }),
  description: text("description"),
  isActive: tinyint("is_active").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});


export const hRecipeLines = mysqlTable("h_recipe_lines", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  recipeId: bigint("recipe_id", { mode: "number" }).notNull(),
  lineNumber: int("line_number").notNull(),
  materialId: bigint("material_id", { mode: "number" }),
  intermediateId: bigint("intermediate_id", { mode: "number" }),
  quantity: decimal("quantity", { precision: 10, scale: 3 }).notNull(),
  unit: varchar("unit", { length: 20 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});


export const hRecipeSteps = mysqlTable("h_recipe_steps", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  recipeId: bigint("recipe_id", { mode: "number" }).notNull(),
  stepNumber: int("step_number").notNull(),
  stepName: varchar("step_name", { length: 100 }).notNull(),
  description: text("description"),
  duration: int("duration"),
  temperature: decimal("temperature", { precision: 5, scale: 1 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});


export const hRecipeVersions = mysqlTable("h_recipe_versions", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  recipeId: bigint("recipe_id", { mode: "number" }).notNull(),
  version: int("version").notNull(),
  changeLog: text("change_log"),
  createdBy: bigint("created_by", { mode: "number" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});


export const hRecipeCcp = mysqlTable("h_recipe_ccp", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  recipeId: bigint("recipe_id", { mode: "number" }).notNull(),
  ccpType: varchar("ccp_type", { length: 50 }).notNull(),
  processGroupId: int("process_group_id"),
  stepNumber: int("step_number"),
  criticalLimitMin: decimal("critical_limit_min", { precision: 10, scale: 3 }),
  criticalLimitMax: decimal("critical_limit_max", { precision: 10, scale: 3 }),
  unit: varchar("unit", { length: 20 }),
  monitoringFrequency: varchar("monitoring_frequency", { length: 50 }),
  correctiveAction: text("corrective_action"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});


export const hRecipeAllergens = mysqlTable("h_recipe_allergens", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  recipeId: bigint("recipe_id", { mode: "number" }).notNull(),
  allergenName: varchar("allergen_name", { length: 100 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});


export const hRecipeNutrition = mysqlTable("h_recipe_nutrition", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  recipeId: bigint("recipe_id", { mode: "number" }).notNull(),
  calories: decimal("calories", { precision: 8, scale: 2 }),
  protein: decimal("protein", { precision: 8, scale: 2 }),
  fat: decimal("fat", { precision: 8, scale: 2 }),
  carbohydrate: decimal("carbohydrate", { precision: 8, scale: 2 }),
  sodium: decimal("sodium", { precision: 8, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});


export const hRecipeEquipment = mysqlTable("h_recipe_equipment", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  recipeId: bigint("recipe_id", { mode: "number" }).notNull(),
  equipmentName: varchar("equipment_name", { length: 100 }).notNull(),
  quantity: int("quantity"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// 배치 관리 테이블 (10개)
// ============================================================================


// Type exports
export type RecipeStep = typeof hRecipeSteps.$inferSelect;
export type InsertRecipeStep = typeof hRecipeSteps.$inferInsert;
