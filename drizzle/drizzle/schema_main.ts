import {bigint,
  boolean,
  date,
  decimal,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  tinyint,
  varchar} from "drizzle-orm/mysql-core";

/**
 * HACCP 식품 안전 관리 시스템 데이터베이스 스키마
 * 총 178개 테이블로 구성
 * 
 * 카테고리:
 * - 사용자/권한 (10개)
 * - 기본 정보 (2개)
 * - 배치 관리 (10개)
 * - CCP 관리 (8개)
 * - 재고 관리 (8개)
 * - 제품/원재료 (10개)
 * - 레시피 (8개)
 * - 위생 관리 (10개)
 * - 승인/워크플로우 (6개)
 * - 문서/매뉴얼 (8개)
 * - 체크리스트 (6개)
 * - 교육/훈련 (4개)
 * - 검증/검사 (8개)
 * - 부적합/시정 (4개)
 * - 알림/설정 (8개)
 * - 유통/출하 (4개)
 * - 기타 (20개)
 */

// ============================================================================
// 테넌트 (멀티테넌트 SaaS)
// ============================================================================

/**
 * 테넌트 테이블 (고객사)
 */
export const tenants = mysqlTable("tenants", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  status: mysqlEnum("status", ["active", "suspended", "trial", "expired"]).default("trial").notNull(),
  
  // 구독 관리
  subscriptionPackage: mysqlEnum("subscription_package", ["basic", "pro"]).default("basic").notNull(),
  subscriptionStartDate: date("subscription_start_date"),
  subscriptionEndDate: date("subscription_end_date"),
  subscriptionDays: int("subscription_days").default(0), // 구독 일수
  gracePeriodEndDate: date("grace_period_end_date"), // 유예기간 종료일 (7일)
  isReadOnly: boolean("is_read_only").default(false), // 읽기 전용 모드
  
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
  role: mysqlEnum("role", ["super_admin", "admin", "worker", "monitor"]).default("worker").notNull(),
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

export const hProducts = mysqlTable("h_products", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  productCode: varchar("product_code", { length: 50 }).notNull().unique(),
  productName: varchar("product_name", { length: 100 }).notNull(),
  category: varchar("category", { length: 100 }),
  unit: varchar("unit", { length: 20 }),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }),
  shelfLifeDays: int("shelf_life_days"),
  description: text("description"),
  defaultCcpTypes: json("default_ccp_types").$type<string[]>(), // 제품별 기본 CCP 타입 (JSON 배열)
  isActive: tinyint("is_active").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const hMaterials = mysqlTable("h_materials", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  materialCode: varchar("material_code", { length: 50 }).notNull().unique(),
  materialName: varchar("material_name", { length: 100 }).notNull(),
  kind: varchar("kind", { length: 20 }).default("RAW").notNull(), // RAW, MIXED
  category: varchar("category", { length: 100 }), // 레거시 필드 (문자열 카테고리)
  categoryId: bigint("category_id", { mode: "number" }), // categories 테이블 FK
  unit: varchar("unit", { length: 20 }), // 재고단위 (기본 단위)
  supplierId: bigint("supplier_id", { mode: "number" }),
  shelfLifeDays: int("shelf_life_days"),
  expiryWarningDays: int("expiry_warning_days").default(7),
  safetyStockLevel: decimal("safety_stock_level", { precision: 10, scale: 3 }).default("0.000"),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).default("0.00"),
  // 단위 환산 관리
  purchaseUnit: varchar("purchase_unit", { length: 20 }), // 구매단위 (예: 박스, 포대)
  conversionRate: decimal("conversion_rate", { precision: 10, scale: 4 }).default("1.0000"), // 구매단위 → 재고단위 환산비율
  defaultPackagingSize: decimal("default_packaging_size", { precision: 15, scale: 2 }), // 기본 포장 규격 (예: 5kg의 5)
  description: text("description"),
  isActive: tinyint("is_active").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * 원재료 단가 이력 테이블
 * 원재료 단가 변경 이력을 추적하여 비용 분석 정확성 향상
 */
export const hMaterialPriceHistory = mysqlTable("h_material_price_history", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  materialId: bigint("material_id", { mode: "number" }).notNull(),
  oldPrice: decimal("old_price", { precision: 10, scale: 2 }),
  newPrice: decimal("new_price", { precision: 10, scale: 2 }).notNull(),
  changedBy: bigint("changed_by", { mode: "number" }),
  changedAt: timestamp("changed_at").defaultNow().notNull(),
  reason: text("reason"),
});

/**
 * 재고 회전율 임계값 설정 테이블
 * 원재료별 회전율 임계값을 설정하여 자동 알림 생성
 */
export const hInventoryTurnoverSettings = mysqlTable("h_inventory_turnover_settings", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  materialId: bigint("material_id", { mode: "number" }).notNull().unique(),
  thresholdRate: decimal("threshold_rate", { precision: 5, scale: 2 }).notNull(),
  alertEnabled: tinyint("alert_enabled").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const hProductsV2 = mysqlTable("h_products_v2", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  productCode: varchar("product_code", { length: 50 }).notNull().unique(),
  productName: varchar("product_name", { length: 100 }).notNull(),
  version: int("version").default(1).notNull(),
  category: varchar("category", { length: 100 }),
  unit: varchar("unit", { length: 20 }),
  shelfLifeDays: int("shelf_life_days"),
  description: text("description"),
  isActive: tinyint("is_active").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const hProductVersions = mysqlTable("h_product_versions", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  productId: bigint("product_id", { mode: "number" }).notNull(),
  version: int("version"),
  changeLog: text("change_log"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const hMaterialMaster = mysqlTable("h_material_master", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  materialCode: varchar("material_code", { length: 50 }).notNull().unique(),
  materialName: varchar("material_name", { length: 100 }).notNull(),
  category: varchar("category", { length: 100 }),
  unit: varchar("unit", { length: 20 }),
  supplierId: bigint("supplier_id", { mode: "number" }),
  shelfLifeDays: int("shelf_life_days"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const hMaterialReceivings = mysqlTable("h_material_receivings", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  materialId: bigint("material_id", { mode: "number" }).notNull(),
  lotNumber: varchar("lot_number", { length: 100 }),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  unit: varchar("unit", { length: 20 }),
  expiryDate: date("expiry_date"),
  supplierId: bigint("supplier_id", { mode: "number" }),
  receivedDate: date("received_date").notNull(),
  receivedBy: bigint("received_by", { mode: "number" }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// hMaterialInspections는 part2.ts에 확장된 버전으로 정의되어 있음 (appearance, odor, color, temperature, result 포함)

export const hIntermediates = mysqlTable("h_intermediates", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  intermediateCode: varchar("intermediate_code", { length: 50 }).notNull().unique(),
  intermediateName: varchar("intermediate_name", { length: 100 }).notNull(),
  category: varchar("category", { length: 100 }),
  unit: varchar("unit", { length: 20 }),
  shelfLifeDays: int("shelf_life_days"),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const hIntermediateMaster = mysqlTable("h_intermediate_master", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  intermediateCode: varchar("intermediate_code", { length: 50 }).notNull().unique(),
  intermediateName: varchar("intermediate_name", { length: 100 }).notNull(),
  category: varchar("category", { length: 100 }),
  unit: varchar("unit", { length: 20 }),
  shelfLifeDays: int("shelf_life_days"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const hIntermediateComponents = mysqlTable("h_intermediate_components", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  intermediateId: bigint("intermediate_id", { mode: "number" }).notNull(),
  materialId: bigint("material_id", { mode: "number" }),
  intermediateSourceId: bigint("intermediate_source_id", { mode: "number" }),
  quantity: decimal("quantity", { precision: 10, scale: 3 }).notNull(),
  unit: varchar("unit", { length: 20 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// 레시피 테이블 (8개) - 배치보다 먼저 정의 (FK 참조)
// ============================================================================

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

export const hBatches = mysqlTable("h_batches", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  batchCode: varchar("batch_code", { length: 100 }).notNull().unique(),
  dayBatchGroup: varchar("day_batch_group", { length: 100 }),
  batchOrder: int("batch_order"),
  productId: bigint("product_id", { mode: "number" }).notNull(),
  recipeId: bigint("recipe_id", { mode: "number" }),
  plannedQuantity: decimal("planned_quantity", { precision: 10, scale: 2 }).notNull(),
  actualQuantity: decimal("actual_quantity", { precision: 10, scale: 2 }),
  plannedDate: date("planned_date").notNull(),
  startTime: timestamp("start_time"),
  endTime: timestamp("end_time"),
  status: mysqlEnum("status", [
    "planned",
    "in_progress",
    "paused",
    "completed",
    "failed",
    "cancelled",
    "shipped",
    "archived",
  ]).default("planned").notNull(),
  mode: mysqlEnum("mode", ["auto", "manual"]).default("auto"),
  manualStartTime: timestamp("manual_start_time"),
  manualEndTime: timestamp("manual_end_time"),
  lotNumber: varchar("lot_number", { length: 100 }),
  expiryDate: date("expiry_date"),
  revenue: decimal("revenue", { precision: 15, scale: 2 }),
  plannedCost: decimal("planned_cost", { precision: 15, scale: 2 }),
  actualCost: decimal("actual_cost", { precision: 15, scale: 2 }),
  costFinalizedAt: timestamp("cost_finalized_at"),
  notes: text("notes"),
  completionIdempotencyKey: varchar("completion_idempotency_key", { length: 255 }).unique(),
  completedAt: timestamp("completed_at"),
  completionReportUrl: text("completion_report_url"),
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const hBatchProductions = mysqlTable("h_batch_productions", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  batchId: bigint("batch_id", { mode: "number" }).notNull(),
  productionDate: date("production_date").notNull(),
  shift: varchar("shift", { length: 20 }),
  lineNumber: varchar("line_number", { length: 50 }),
  operatorId: bigint("operator_id", { mode: "number" }),
  startTime: timestamp("start_time"),
  endTime: timestamp("end_time"),
  yieldRate: decimal("yield_rate", { precision: 5, scale: 2 }),
  status: mysqlEnum("status", ["planned", "in_progress", "completed", "failed", "paused"]).default("planned").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const hBatchInputs = mysqlTable("h_batch_inputs", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  batchId: bigint("batch_id", { mode: "number" }).notNull(),
  materialId: bigint("material_id", { mode: "number" }).notNull(),
  lotId: bigint("lot_id", { mode: "number" }),
  plannedQuantity: decimal("planned_quantity", { precision: 10, scale: 3 }).notNull(),
  actualQuantity: decimal("actual_quantity", { precision: 10, scale: 3 }),
  unit: varchar("unit", { length: 20 }).notNull(),
  inputTime: timestamp("input_time"),
  inputBy: bigint("input_by", { mode: "number" }),
  notes: text("notes"),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }),
  totalPrice: decimal("total_price", { precision: 10, scale: 2 }),
  inventoryDeducted: tinyint("inventory_deducted").default(0).notNull(),
  processGroupId: int("process_group_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const hBatchCompletionRetries = mysqlTable("h_batch_completion_retries", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  batchId: bigint("batch_id", { mode: "number" }).notNull(),
  taskType: varchar("task_type", { length: 50 }).notNull(),
  errorMessage: text("error_message"),
  retryCount: int("retry_count").default(0).notNull(),
  maxRetries: int("max_retries").default(3).notNull(),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  lastRetryAt: timestamp("last_retry_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const hProductionLogs = mysqlTable("h_production_logs", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  batchId: bigint("batch_id", { mode: "number" }).notNull(),
  logTime: timestamp("log_time").notNull(),
  eventType: varchar("event_type", { length: 100 }),
  description: text("description"),
  operatorId: bigint("operator_id", { mode: "number" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const hProductionPerformance = mysqlTable("h_production_performance", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  batchId: bigint("batch_id", { mode: "number" }).notNull(),
  plannedQuantity: decimal("planned_quantity", { precision: 10, scale: 2 }),
  actualQuantity: decimal("actual_quantity", { precision: 10, scale: 2 }),
  yieldRate: decimal("yield_rate", { precision: 5, scale: 2 }),
  defectRate: decimal("defect_rate", { precision: 5, scale: 2 }),
  productionTime: int("production_time"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const hProductionAlerts = mysqlTable("h_production_alerts", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  batchId: bigint("batch_id", { mode: "number" }),
  alertType: varchar("alert_type", { length: 100 }),
  severity: mysqlEnum("severity", ["low", "medium", "high", "critical"]),
  message: text("message"),
  isResolved: tinyint("is_resolved").default(0).notNull(),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const hBatchUploads = mysqlTable("h_batch_uploads", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  fileName: varchar("file_name", { length: 255 }),
  filePath: varchar("file_path", { length: 255 }),
  batchCount: int("batch_count"),
  status: mysqlEnum("status", ["pending", "processing", "completed", "failed"]).default("pending").notNull(),
  errorMessage: text("error_message"),
  uploadedBy: bigint("uploaded_by", { mode: "number" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const hBatchChecklistTemplates = mysqlTable("h_batch_checklist_templates", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  templateName: varchar("template_name", { length: 100 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const hBatchChecklistTemplateItems = mysqlTable("h_batch_checklist_template_items", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  templateId: bigint("template_id", { mode: "number" }).notNull(),
  itemName: varchar("item_name", { length: 100 }).notNull(),
  itemOrder: int("item_order"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const hBatchSchedules = mysqlTable("h_batch_schedules", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  batchId: bigint("batch_id", { mode: "number" }).notNull(),
  scheduledDate: date("scheduled_date").notNull(),
  startTime: timestamp("start_time"),
  endTime: timestamp("end_time"),
  startNotifiedAt: timestamp("start_notified_at"),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const hProductionStart = mysqlTable("h_production_start", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  batchId: bigint("batch_id", { mode: "number" }).notNull(),
  startTime: timestamp("start_time").notNull(),
  operatorId: bigint("operator_id", { mode: "number" }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// CCP 관리 테이블 (8개)
// ============================================================================

export const hCcpInstances = mysqlTable("h_ccp_instances", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  workDate: date("work_date").notNull(),
  ccpType: varchar("ccp_type", { length: 50 }).notNull(),
  processGroupId: int("process_group_id"),
  productName: varchar("product_name", { length: 100 }),
  productId: bigint("product_id", { mode: "number" }),
  batchId: bigint("batch_id", { mode: "number" }),
  status: mysqlEnum("status", ["draft", "submitted", "approved", "rejected"]).default("draft").notNull(),
  submittedAt: timestamp("submitted_at"),
  submittedBy: bigint("submitted_by", { mode: "number" }),
  approvedAt: timestamp("approved_at"),
  approvedBy: bigint("approved_by", { mode: "number" }),
  createdBy: bigint("created_by", { mode: "number" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const hCcpRows = mysqlTable("h_ccp_rows", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  instanceId: bigint("instance_id", { mode: "number" }).notNull(),
  sortOrder: int("sort_order"),
  rowType: mysqlEnum("row_type", ["measurement", "corrective_action", "verification"]).default("measurement").notNull(),
  measuredAt: timestamp("measured_at"),
  tempC: decimal("temp_c", { precision: 5, scale: 1 }),
  durationMin: int("duration_min"),
  pressureBar: decimal("pressure_bar", { precision: 5, scale: 2 }),
  result: mysqlEnum("result", ["PASS", "FAIL", "N/A"]),
  note: text("note"),
  equipmentId: int("equipment_id"),
  equipmentName: varchar("equipment_name", { length: 100 }),
  batchNo: int("batch_no"),
  autoGenerated: tinyint("auto_generated").default(0),
  heatingMin: int("heating_min"),
  cycleTotalMin: int("cycle_total_min"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const hCcpRecords = mysqlTable("h_ccp_records", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  instanceId: bigint("instance_id", { mode: "number" }).notNull(),
  recordData: json("record_data"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const hCcpTemplates = mysqlTable("h_ccp_templates", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  ccpType: varchar("ccp_type", { length: 50 }).notNull(),
  processGroupId: int("process_group_id"),
  templateName: varchar("template_name", { length: 100 }).notNull(),
  productNamePattern: varchar("product_name_pattern", { length: 255 }),
  priority: int("priority").default(0).notNull(),
  isActive: tinyint("is_active").default(1).notNull(),
  description: text("description"),
  criticalLimit: text("critical_limit"), // 한계기준 요약 (예: "75°C 이상", "2시간 이내")
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const hCcpTemplateRows = mysqlTable("h_ccp_template_rows", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  templateId: bigint("template_id", { mode: "number" }).notNull(),
  sortOrder: int("sort_order"),
  rowType: mysqlEnum("row_type", ["measurement", "corrective_action", "verification"]).default("measurement").notNull(),
  criticalLimitMin: decimal("critical_limit_min", { precision: 10, scale: 3 }),
  criticalLimitMax: decimal("critical_limit_max", { precision: 10, scale: 3 }),
  unit: varchar("unit", { length: 20 }),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const hCcpTemplatesV2 = mysqlTable("h_ccp_templates_v2", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  ccpType: varchar("ccp_type", { length: 50 }).notNull(),
  processGroupId: int("process_group_id"),
  templateName: varchar("template_name", { length: 100 }).notNull(),
  version: int("version").default(1).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const hCcpTemplateRowsV2 = mysqlTable("h_ccp_template_rows_v2", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  templateId: bigint("template_id", { mode: "number" }).notNull(),
  sortOrder: int("sort_order"),
  rowType: mysqlEnum("row_type", ["measurement", "corrective_action", "verification"]).default("measurement").notNull(),
  criticalLimitMin: decimal("critical_limit_min", { precision: 10, scale: 3 }),
  criticalLimitMax: decimal("critical_limit_max", { precision: 10, scale: 3 }),
  unit: varchar("unit", { length: 20 }),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const hCcpManualMapping = mysqlTable("h_ccp_manual_mapping", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  productId: bigint("product_id", { mode: "number" }).notNull(),
  ccpType: varchar("ccp_type", { length: 50 }).notNull(),
  processGroupId: int("process_group_id"),
  templateId: bigint("template_id", { mode: "number" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const hCcpSchedules = mysqlTable("h_ccp_schedules", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  ccpInstanceId: bigint("ccp_instance_id", { mode: "number" }).notNull(),
  scheduledDate: date("scheduled_date").notNull(),
  frequency: mysqlEnum("frequency", ["daily", "weekly", "monthly"]).notNull(),
  status: mysqlEnum("status", ["pending", "completed", "skipped"]).default("pending").notNull(),
  completedAt: timestamp("completed_at"),
  completedBy: bigint("completed_by", { mode: "number" }),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

// ============================================================================
// 배치-LOT 연결 테이블 (2개)
// ============================================================================

/**
 * 배치에서 사용된 원재료 LOT 정보
 */
export const hBatchMaterials = mysqlTable("h_batch_materials", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  batchId: bigint("batch_id", { mode: "number" }).notNull(),
  lotId: bigint("lot_id", { mode: "number" }).notNull(),
  materialId: bigint("material_id", { mode: "number" }).notNull(),
  quantityUsed: decimal("quantity_used", { precision: 10, scale: 2 }).notNull(),
  uom: varchar("uom", { length: 20 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * 배치에서 생산된 완제품 LOT 정보
 */
export const hBatchProducts = mysqlTable("h_batch_products", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  batchId: bigint("batch_id", { mode: "number" }).notNull(),
  productId: bigint("product_id", { mode: "number" }).notNull(),
  lotNumber: varchar("lot_number", { length: 100 }).notNull(),
  quantityProduced: decimal("quantity_produced", { precision: 10, scale: 2 }).notNull(),
  uom: varchar("uom", { length: 20 }).notNull(),
  manufactureDate: date("manufacture_date").notNull(),
  expiryDate: date("expiry_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// hNotifications는 schema/part2.ts에 정의되어 있음

// ============================================================================
// 타입 정의
// ============================================================================

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export type Site = typeof hSites.$inferSelect;
export type InsertSite = typeof hSites.$inferInsert;

export type Product = typeof hProducts.$inferSelect;
export type InsertProduct = typeof hProducts.$inferInsert;

export type Material = typeof hMaterials.$inferSelect;
export type InsertMaterial = typeof hMaterials.$inferInsert;

export type RecipeStep = typeof hRecipeSteps.$inferSelect;
export type InsertRecipeStep = typeof hRecipeSteps.$inferInsert;

// Export all tables from schema_part2.ts
export * from './schema/part2';

export type Batch = typeof hBatches.$inferSelect;
export type InsertBatch = typeof hBatches.$inferInsert;

export type CcpInstance = typeof hCcpInstances.$inferSelect;
export type InsertCcpInstance = typeof hCcpInstances.$inferInsert;

export type BatchMaterial = typeof hBatchMaterials.$inferSelect;
export type InsertBatchMaterial = typeof hBatchMaterials.$inferInsert;

export type BatchProduct = typeof hBatchProducts.$inferSelect;
export type InsertBatchProduct = typeof hBatchProducts.$inferInsert;

// ============================================================================
// 미구현 HACCP 체크리스트 테이블 (11개)
// ============================================================================

/**
 * 1. 수질 검사 기록
 */
export const hWaterQualityTests = mysqlTable("h_water_quality_tests", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  testDate: date("test_date").notNull(),
  testLocation: varchar("test_location", { length: 200 }).notNull(), // 검사 위치
  ph: decimal("ph", { precision: 4, scale: 2 }), // pH 값
  turbidity: decimal("turbidity", { precision: 10, scale: 2 }), // 탁도 (NTU)
  residualChlorine: decimal("residual_chlorine", { precision: 10, scale: 2 }), // 잔류염소 (ppm)
  coliformBacteria: varchar("coliform_bacteria", { length: 50 }), // 대장균 검사 결과
  testResult: mysqlEnum("test_result", ["pass", "fail", "pending"]).default("pending").notNull(),
  remarks: text("remarks"),
  inspectorId: bigint("inspector_id", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * 2. 공기압축기 관리
 */
export const hAirCompressors = mysqlTable("h_air_compressors", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  equipmentCode: varchar("equipment_code", { length: 100 }).notNull().unique(), // 장비 코드
  equipmentName: varchar("equipment_name", { length: 200 }).notNull(),
  location: varchar("location", { length: 200 }).notNull(),
  installDate: date("install_date"),
  lastMaintenanceDate: date("last_maintenance_date"),
  nextMaintenanceDate: date("next_maintenance_date"),
  maintenanceCycle: int("maintenance_cycle").default(90), // 유지보수 주기 (일)
  status: mysqlEnum("status", ["normal", "warning", "error", "inactive"]).default("normal").notNull(),
  remarks: text("remarks"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * 3. 공기압축기 점검 기록
 */
export const hAirCompressorChecks = mysqlTable("h_air_compressor_checks", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  compressorId: bigint("compressor_id", { mode: "number" }).notNull(),
  checkDate: date("check_date").notNull(),
  pressure: decimal("pressure", { precision: 10, scale: 2 }), // 압력 (bar)
  temperature: decimal("temperature", { precision: 5, scale: 2 }), // 온도 (°C)
  oilLevel: mysqlEnum("oil_level", ["normal", "low", "high"]).default("normal"),
  filterCondition: mysqlEnum("filter_condition", ["good", "fair", "poor"]).default("good"),
  abnormalNoise: tinyint("abnormal_noise").default(0), // 이상 소음 여부
  leakage: tinyint("leakage").default(0), // 누출 여부
  checkResult: mysqlEnum("check_result", ["pass", "fail"]).default("pass").notNull(),
  remarks: text("remarks"),
  inspectorId: bigint("inspector_id", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * 4. 유효성 평가 기록
 */
export const hValidityEvaluations = mysqlTable("h_validity_evaluations", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  evaluationDate: date("evaluation_date").notNull(),
  evaluationType: varchar("evaluation_type", { length: 100 }).notNull(), // 평가 유형 (예: HACCP 계획, CCP 모니터링)
  evaluationScope: text("evaluation_scope"), // 평가 범위
  evaluationMethod: text("evaluation_method"), // 평가 방법
  findings: text("findings"), // 발견 사항
  recommendations: text("recommendations"), // 권고 사항
  evaluationResult: mysqlEnum("evaluation_result", ["effective", "partially_effective", "ineffective"]).default("effective").notNull(),
  evaluatorId: bigint("evaluator_id", { mode: "number" }).notNull(),
  approvedBy: bigint("approved_by", { mode: "number" }),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * 5. 개인위생 점검표
 */
export const hPersonalHygieneChecks = mysqlTable("h_personal_hygiene_checks", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  employeeId: bigint("employee_id", { mode: "number" }).notNull(),
  checkDate: date("check_date").notNull(),
  uniformCleanliness: mysqlEnum("uniform_cleanliness", ["good", "fair", "poor"]).default("good"), // 작업복 청결도
  handWashing: tinyint("hand_washing").default(1), // 손 씻기 여부
  nailTrimming: tinyint("nail_trimming").default(1), // 손톱 정리 여부
  jewelry: tinyint("jewelry").default(0), // 장신구 착용 여부 (0: 없음, 1: 있음)
  hairnet: tinyint("hairnet").default(1), // 위생모 착용 여부
  mask: tinyint("mask").default(1), // 마스크 착용 여부
  healthCondition: mysqlEnum("health_condition", ["good", "minor_issue", "sick"]).default("good"), // 건강 상태
  checkResult: mysqlEnum("check_result", ["pass", "fail"]).default("pass").notNull(),
  remarks: text("remarks"),
  inspectorId: bigint("inspector_id", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * 6. 용수 사용 점검표
 */
export const hWaterUsageChecks = mysqlTable("h_water_usage_checks", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  checkDate: date("check_date").notNull(),
  usageArea: varchar("usage_area", { length: 200 }).notNull(), // 사용 구역
  waterSource: varchar("water_source", { length: 100 }).notNull(), // 수원 (상수도, 지하수 등)
  usageAmount: decimal("usage_amount", { precision: 10, scale: 2 }), // 사용량 (톤)
  waterPressure: decimal("water_pressure", { precision: 10, scale: 2 }), // 수압 (bar)
  waterTemperature: decimal("water_temperature", { precision: 5, scale: 2 }), // 수온 (°C)
  visualInspection: mysqlEnum("visual_inspection", ["clear", "slightly_cloudy", "cloudy"]).default("clear"), // 육안 검사
  checkResult: mysqlEnum("check_result", ["pass", "fail"]).default("pass").notNull(),
  remarks: text("remarks"),
  inspectorId: bigint("inspector_id", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * 7. 설비 세척·소독 기록
 */
export const hEquipmentCleaningRecords = mysqlTable("h_equipment_cleaning_records", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  equipmentId: bigint("equipment_id", { mode: "number" }),
  equipmentName: varchar("equipment_name", { length: 200 }).notNull(),
  cleaningDate: date("cleaning_date").notNull(),
  cleaningTime: varchar("cleaning_time", { length: 50 }), // 세척 시간
  cleaningMethod: varchar("cleaning_method", { length: 200 }), // 세척 방법
  detergentUsed: varchar("detergent_used", { length: 200 }), // 사용 세제
  sanitizerUsed: varchar("sanitizer_used", { length: 200 }), // 사용 소독제
  cleaningDuration: int("cleaning_duration"), // 세척 소요 시간 (분)
  verificationMethod: varchar("verification_method", { length: 200 }), // 검증 방법
  verificationResult: mysqlEnum("verification_result", ["pass", "fail"]).default("pass").notNull(),
  remarks: text("remarks"),
  cleanerId: bigint("cleaner_id", { mode: "number" }).notNull(),
  verifierId: bigint("verifier_id", { mode: "number" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * 8. 이물 관리 기록
 */
export const hForeignMaterialRecords = mysqlTable("h_foreign_material_records", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  detectionDate: date("detection_date").notNull(),
  detectionLocation: varchar("detection_location", { length: 200 }).notNull(), // 발견 위치
  productId: bigint("product_id", { mode: "number" }),
  batchId: bigint("batch_id", { mode: "number" }),
  materialType: varchar("material_type", { length: 100 }).notNull(), // 이물 종류 (금속, 플라스틱, 유리 등)
  materialDescription: text("material_description"), // 이물 상세 설명
  materialSize: varchar("material_size", { length: 100 }), // 이물 크기
  detectionMethod: varchar("detection_method", { length: 200 }), // 발견 방법 (육안, 금속검출기 등)
  immediateAction: text("immediate_action"), // 즉시 조치 사항
  rootCause: text("root_cause"), // 근본 원인
  correctiveAction: text("corrective_action"), // 시정 조치
  preventiveAction: text("preventive_action"), // 예방 조치
  severity: mysqlEnum("severity", ["low", "medium", "high", "critical"]).default("medium").notNull(),
  status: mysqlEnum("status", ["open", "investigating", "resolved", "closed"]).default("open").notNull(),
  reportedBy: bigint("reported_by", { mode: "number" }).notNull(),
  investigatedBy: bigint("investigated_by", { mode: "number" }),
  closedAt: timestamp("closed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * 9. 냉동·냉장 설비 점검
 */
export const hRefrigerationChecks = mysqlTable("h_refrigeration_checks", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  equipmentId: bigint("equipment_id", { mode: "number" }),
  equipmentName: varchar("equipment_name", { length: 200 }).notNull(),
  equipmentType: mysqlEnum("equipment_type", ["freezer", "refrigerator", "cold_storage"]).notNull(), // 설비 유형
  checkDate: date("check_date").notNull(),
  checkTime: varchar("check_time", { length: 50 }), // 점검 시간
  temperature: decimal("temperature", { precision: 5, scale: 2 }).notNull(), // 온도 (°C)
  targetTemperature: decimal("target_temperature", { precision: 5, scale: 2 }), // 목표 온도 (°C)
  humidity: decimal("humidity", { precision: 5, scale: 2 }), // 습도 (%)
  doorSealCondition: mysqlEnum("door_seal_condition", ["good", "fair", "poor"]).default("good"), // 문 밀폐 상태
  defrostCondition: mysqlEnum("defrost_condition", ["normal", "ice_buildup", "needs_defrost"]).default("normal"), // 제상 상태
  abnormalNoise: tinyint("abnormal_noise").default(0), // 이상 소음 여부
  checkResult: mysqlEnum("check_result", ["pass", "fail"]).default("pass").notNull(),
  remarks: text("remarks"),
  inspectorId: bigint("inspector_id", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * 10. 포장재 보관 관리
 */
export const hPackagingStorageRecords = mysqlTable("h_packaging_storage_records", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  materialId: bigint("material_id", { mode: "number" }),
  materialName: varchar("material_name", { length: 200 }).notNull(),
  materialType: varchar("material_type", { length: 100 }).notNull(), // 포장재 종류 (박스, 필름, 라벨 등)
  storageLocation: varchar("storage_location", { length: 200 }).notNull(), // 보관 위치
  receivedDate: date("received_date").notNull(), // 입고일
  lotNumber: varchar("lot_number", { length: 100 }),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  uom: varchar("uom", { length: 20 }).notNull(), // 단위
  storageCondition: mysqlEnum("storage_condition", ["good", "fair", "poor"]).default("good"), // 보관 상태
  temperatureControlled: tinyint("temperature_controlled").default(0), // 온도 관리 여부
  humidityControlled: tinyint("humidity_controlled").default(0), // 습도 관리 여부
  expiryDate: date("expiry_date"), // 유효기한
  inspectionResult: mysqlEnum("inspection_result", ["pass", "fail"]).default("pass").notNull(),
  remarks: text("remarks"),
  inspectorId: bigint("inspector_id", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * 11. 품질 이상 발생 기록
 */
export const hQualityIssueRecords = mysqlTable("h_quality_issue_records", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  issueDate: date("issue_date").notNull(),
  issueType: varchar("issue_type", { length: 100 }).notNull(), // 이상 유형 (색상, 맛, 냄새, 포장 등)
  productId: bigint("product_id", { mode: "number" }),
  batchId: bigint("batch_id", { mode: "number" }),
  lotNumber: varchar("lot_number", { length: 100 }),
  issueDescription: text("issue_description").notNull(), // 이상 내용
  detectionStage: varchar("detection_stage", { length: 100 }), // 발견 단계 (원료, 공정, 완제품 등)
  affectedQuantity: decimal("affected_quantity", { precision: 10, scale: 2 }), // 영향 받은 수량
  immediateAction: text("immediate_action"), // 즉시 조치
  rootCause: text("root_cause"), // 근본 원인
  correctiveAction: text("corrective_action"), // 시정 조치
  preventiveAction: text("preventive_action"), // 예방 조치
  severity: mysqlEnum("severity", ["low", "medium", "high", "critical"]).default("medium").notNull(),
  status: mysqlEnum("status", ["open", "investigating", "resolved", "closed"]).default("open").notNull(),
  reportedBy: bigint("reported_by", { mode: "number" }).notNull(),
  investigatedBy: bigint("investigated_by", { mode: "number" }),
  closedAt: timestamp("closed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * 12. 개선조치(CAPA) 기록
 */
export const hCapaRecords = mysqlTable("h_capa_records", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  capaNumber: varchar("capa_number", { length: 100 }).notNull().unique(), // CAPA 번호
  issueDate: date("issue_date").notNull(),
  issueSource: varchar("issue_source", { length: 200 }), // 이슈 출처 (내부 감사, 고객 불만, 자체 점검 등)
  relatedRecordType: varchar("related_record_type", { length: 100 }), // 관련 기록 유형
  relatedRecordId: bigint("related_record_id", { mode: "number" }), // 관련 기록 ID
  problemDescription: text("problem_description").notNull(), // 문제 설명
  rootCauseAnalysis: text("root_cause_analysis"), // 근본 원인 분석
  correctiveAction: text("corrective_action"), // 시정 조치 (Corrective Action)
  preventiveAction: text("preventive_action"), // 예방 조치 (Preventive Action)
  actionOwner: bigint("action_owner", { mode: "number" }), // 조치 담당자
  targetCompletionDate: date("target_completion_date"), // 목표 완료일
  actualCompletionDate: date("actual_completion_date"), // 실제 완료일
  verificationMethod: text("verification_method"), // 검증 방법
  verificationResult: mysqlEnum("verification_result", ["effective", "ineffective", "pending"]).default("pending"), // 검증 결과
  verifiedBy: bigint("verified_by", { mode: "number" }), // 검증자
  verifiedAt: timestamp("verified_at"), // 검증일
  status: mysqlEnum("status", ["open", "in_progress", "completed", "verified", "closed"]).default("open").notNull(),
  priority: mysqlEnum("priority", ["low", "medium", "high", "critical"]).default("medium").notNull(),
  remarks: text("remarks"),
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

// ============================================================================
// 타입 정의 (11개 체크리스트)
// ============================================================================

export type WaterQualityTest = typeof hWaterQualityTests.$inferSelect;
export type InsertWaterQualityTest = typeof hWaterQualityTests.$inferInsert;

export type AirCompressor = typeof hAirCompressors.$inferSelect;
export type InsertAirCompressor = typeof hAirCompressors.$inferInsert;

export type AirCompressorCheck = typeof hAirCompressorChecks.$inferSelect;
export type InsertAirCompressorCheck = typeof hAirCompressorChecks.$inferInsert;

export type ValidityEvaluation = typeof hValidityEvaluations.$inferSelect;
export type InsertValidityEvaluation = typeof hValidityEvaluations.$inferInsert;

export type PersonalHygieneCheck = typeof hPersonalHygieneChecks.$inferSelect;
export type InsertPersonalHygieneCheck = typeof hPersonalHygieneChecks.$inferInsert;

export type WaterUsageCheck = typeof hWaterUsageChecks.$inferSelect;
export type InsertWaterUsageCheck = typeof hWaterUsageChecks.$inferInsert;

export type EquipmentCleaningRecord = typeof hEquipmentCleaningRecords.$inferSelect;
export type InsertEquipmentCleaningRecord = typeof hEquipmentCleaningRecords.$inferInsert;

export type ForeignMaterialRecord = typeof hForeignMaterialRecords.$inferSelect;
export type InsertForeignMaterialRecord = typeof hForeignMaterialRecords.$inferInsert;

export type RefrigerationCheck = typeof hRefrigerationChecks.$inferSelect;
export type InsertRefrigerationCheck = typeof hRefrigerationChecks.$inferInsert;

export type PackagingStorageRecord = typeof hPackagingStorageRecords.$inferSelect;
export type InsertPackagingStorageRecord = typeof hPackagingStorageRecords.$inferInsert;

export type QualityIssueRecord = typeof hQualityIssueRecords.$inferSelect;
export type InsertQualityIssueRecord = typeof hQualityIssueRecords.$inferInsert;

export type CapaRecord = typeof hCapaRecords.$inferSelect;
export type InsertCapaRecord = typeof hCapaRecords.$inferInsert;

// ==================== 업로드 이력 ====================
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
 * 계정 과목 테이블
 * 표준화된 계정 과목 체계 (세무사/회계사 활용 가능)
 */
export const accountingCategories = mysqlTable("accounting_categories", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  name: varchar("name", { length: 100 }).notNull(),
  code: varchar("code", { length: 20 }).notNull().unique(), // 계정 코드 (예: 401, 501)
  type: mysqlEnum("type", ["income", "expense"]).notNull(),
  parentId: bigint("parent_id", { mode: "number" }), // 대분류/중분류 계층 구조
  description: text("description"),
  isActive: tinyint("is_active").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * 거래 내역 테이블
 * 모든 수입/지출 거래 기록
 */
export const accountingTransactions = mysqlTable("accounting_transactions", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  transactionDate: varchar("transaction_date", { length: 10 }).notNull(), // 거래 일자 (YYYY-MM-DD)
  type: mysqlEnum("type", ["income", "expense"]).notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(), // 금액
  categoryId: bigint("category_id", { mode: "number" }).notNull().references(() => accountingCategories.id),
  description: text("description"), // 거래 내용/메모
  referenceType: varchar("reference_type", { length: 50 }), // 연결 타입 (batch, supplier, etc.)
  referenceId: bigint("reference_id", { mode: "number" }), // 연결 ID
  createdBy: bigint("created_by", { mode: "number" }).notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * 일일 마감 테이블
 * 일별 재무 집계 (자동 생성)
 */
export const accountingDailyClose = mysqlTable("accounting_daily_close", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  closeDate: varchar("close_date", { length: 10 }).notNull().unique(), // 마감 일자 (YYYY-MM-DD)
  totalIncome: decimal("total_income", { precision: 15, scale: 2 }).default("0").notNull(), // 총 수입
  totalExpense: decimal("total_expense", { precision: 15, scale: 2 }).default("0").notNull(), // 총 지출
  netCashFlow: decimal("net_cash_flow", { precision: 15, scale: 2 }).default("0").notNull(), // 순현금흐름
  transactionCount: int("transaction_count").default(0).notNull(), // 거래 건수
  isLocked: tinyint("is_locked").default(0).notNull(), // 마감 확정 여부
  closedBy: bigint("closed_by", { mode: "number" }).references(() => users.id),
  closedAt: timestamp("closed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AccountingCategory = typeof accountingCategories.$inferSelect;
export type InsertAccountingCategory = typeof accountingCategories.$inferInsert;
export type AccountingTransaction = typeof accountingTransactions.$inferSelect;
export type InsertAccountingTransaction = typeof accountingTransactions.$inferInsert;
export type AccountingDailyClose = typeof accountingDailyClose.$inferSelect;
export type InsertAccountingDailyClose = typeof accountingDailyClose.$inferInsert;

// ============================================
// 회계 관리 v2 - 거래처 및 원장 (2026-01-30)
// ============================================

/**
 * 거래처 테이블 (공급업체, 고객사, 외주업체)
 * HACCP 기존 공급업체/고객사 데이터와 통합
 */
export const partners = mysqlTable("partners", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  partnerType: mysqlEnum("partner_type", ["supplier", "customer", "subcontractor"]).notNull(),
  bizNo: varchar("biz_no", { length: 50 }), // 사업자등록번호 (optional)
  supplierCode: varchar("supplier_code", { length: 50 }),
  supplierType: varchar("supplier_type", { length: 50 }),
  certifications: text("certifications"),
  rating: varchar("rating", { length: 20 }),
  companyName: varchar("company_name", { length: 255 }).notNull(),
  ceoName: varchar("ceo_name", { length: 100 }),
  contactPerson: varchar("contact_person", { length: 100 }), // 담당자
  bizType: varchar("biz_type", { length: 255 }), // 업태
  bizItem: varchar("biz_item", { length: 255 }), // 종목
  address: varchar({ length: 500 }),
  phone: varchar({ length: 50 }),
  fax: varchar({ length: 50 }),
  email: varchar({ length: 320 }),
  bankName: varchar("bank_name", { length: 50 }), // 은행명
  bankAccount: varchar("bank_account", { length: 50 }), // 계좌번호
  isActive: tinyint("is_active").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * 거래처 담당자 테이블
 */
export const partnerContacts = mysqlTable("partner_contacts", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  partnerId: bigint("partner_id", { mode: "number" }).notNull().references(() => partners.id),
  name: varchar({ length: 100 }),
  phone: varchar({ length: 50 }),
  email: varchar({ length: 320 }),
  role: varchar({ length: 100 }),
  isPrimary: tinyint("is_primary").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * 매입 원장 (Accounts Payable Ledger)
 * 공급업체로부터의 모든 매입 거래 기록
 */
export const apLedger = mysqlTable("ap_ledger", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  supplierPartnerId: bigint("supplier_partner_id", { mode: "number" }).notNull().references(() => partners.id),
  occurredAt: timestamp("occurred_at").notNull(),
  apEntryType: mysqlEnum("ap_entry_type", ["bill", "payment", "credit", "adjust"]).notNull(),
  amount: decimal({ precision: 18, scale: 2 }).notNull(),
  refType: varchar("ref_type", { length: 50 }), // 'receiving', 'manual', etc.
  refId: bigint("ref_id", { mode: "number" }), // h_material_receivings.id, etc.
  memo: varchar({ length: 255 }),
  accountingAccountId: bigint("accounting_account_id", { mode: "number" }), // FK → accounting_accounts.id
  createdBy: bigint("created_by", { mode: "number" }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * 매출 원장 (Accounts Receivable Ledger)
 * 고객사로의 모든 매출 거래 기록
 */
export const arLedger = mysqlTable("ar_ledger", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  customerPartnerId: bigint("customer_partner_id", { mode: "number" }).notNull().references(() => partners.id),
  occurredAt: timestamp("occurred_at").notNull(),
  arEntryType: mysqlEnum("ar_entry_type", ["debit", "payment", "credit", "writeoff", "adjust"]).notNull(),
  amount: decimal({ precision: 18, scale: 2 }).notNull(),
  dueDate: date("due_date"),
  refType: varchar("ref_type", { length: 50 }), // 'shipment', 'manual', etc.
  refId: bigint("ref_id", { mode: "number" }),
  memo: varchar({ length: 255 }),
  accountingAccountId: bigint("accounting_account_id", { mode: "number" }), // FK → accounting_accounts.id
  createdBy: bigint("created_by", { mode: "number" }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * 은행 계좌 테이블
 */
export const bankAccounts = mysqlTable("bank_accounts", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  bankName: varchar("bank_name", { length: 100 }).notNull(),
  accountNo: varchar("account_no", { length: 100 }).notNull(),
  accountName: varchar("account_name", { length: 200 }),
  accountType: mysqlEnum("account_type", ["checking", "savings", "investment", "other"]).default("checking").notNull(),
  balance: decimal({ precision: 18, scale: 2 }).default("0").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("KRW"),
  defaultAccountingAccountId: bigint("default_accounting_account_id", { mode: "number" }),
  isActive: mysqlEnum("is_active", ["Y", "N"]).default("Y").notNull(),
  isPrimary: tinyint("is_primary").default(0).notNull(),
  notes: text("notes"),
  createdBy: bigint("created_by", { mode: "number" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * 은행 거래 내역 테이블
 * 엑셀 업로드 또는 API 연동으로 수집
 */
export const bankTransactions = mysqlTable("bank_transactions", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  bankAccountId: bigint("bank_account_id", { mode: "number" }).notNull().references(() => bankAccounts.id),
  occurredAt: timestamp("occurred_at").notNull(),
  bankDirection: mysqlEnum("bank_direction", ["in", "out"]).notNull(),
  amount: decimal({ precision: 18, scale: 2 }).notNull(),
  counterpartyText: varchar("counterparty_text", { length: 255 }), // 거래 상대방 이름
  memo: varchar({ length: 255 }),
  balance: decimal({ precision: 18, scale: 2 }), // 거래 후 잔액
  hashKey: varchar("hash_key", { length: 64 }).notNull().unique(), // 중복 방지용
  matchedType: varchar("matched_type", { length: 50 }), // 'ap', 'ar', 'manual', null
  matchedId: bigint("matched_id", { mode: "number" }), // apLedger.id, arLedger.id, etc.
  matchedPartnerId: bigint("matched_partner_id", { mode: "number" }).references(() => partners.id), // 매칭된 거래처 ID
  matchedAt: timestamp("matched_at"), // 매칭 시간
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * 계정 과목 v2 (5분류 체계)
 * asset(자산), liability(부채), equity(자본), revenue(수익), expense(비용)
 */
export const accountingAccountsV2 = mysqlTable("accounting_accounts_v2", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  code: varchar({ length: 50 }).notNull().unique(),
  name: varchar({ length: 100 }).notNull(),
  accountType: mysqlEnum("account_type", ["asset", "liability", "equity", "revenue", "expense"]).notNull(),
  parentId: bigint("parent_id", { mode: "number" }),
  isActive: tinyint("is_active").default(1).notNull(),
  sortOrder: int("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * 자동 매칭 규칙 테이블
 * 은행 거래 내역을 자동으로 매입/매출 원장과 매칭
 */
export const matchingRules = mysqlTable("matching_rules", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  userId: bigint("user_id", { mode: "number" }).notNull().references(() => users.id),
  ruleType: varchar("rule_type", { length: 32 }).notNull(), // 'keyword', 'amount', 'pattern'
  priority: int("priority").default(100).notNull(),
  weight: decimal({ precision: 5, scale: 2 }).default("1.00").notNull(),
  conditions: text("conditions").notNull(), // JSON
  actions: text("actions").notNull(), // JSON
  isActive: tinyint("is_active").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * 월간 마감 테이블
 * 일일 마감 데이터를 집계하여 월간 재무 현황 생성
 */
export const accountingMonthlyClose = mysqlTable("accounting_monthly_close", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  year: int("year").notNull(),
  month: int("month").notNull(), // 1-12
  status: mysqlEnum("status", ["draft", "closed"]).default("draft").notNull(),
  missingCloseDates: json("missing_close_dates"), // 미마감 날짜 배열
  summary: json("summary"), // 월간 집계 데이터
  reportPdfUrl: text("report_pdf_url"), // PDF 리포트 URL
  closedBy: bigint("closed_by", { mode: "number" }).references(() => users.id),
  closedAt: timestamp("closed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * 월간 마감 감사 로그
 * 월 마감 생성/확정/재오픈 이력 추적
 */
export const accountingMonthlyCloseAudit = mysqlTable("accounting_monthly_close_audit", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  monthlyCloseId: bigint("monthly_close_id", { mode: "number" }).notNull(),
  action: mysqlEnum("action", ["generate", "close", "reopen", "export_pdf"]).notNull(),
  actorId: bigint("actor_id", { mode: "number" }).notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Type exports
export type AccountingMonthlyClose = typeof accountingMonthlyClose.$inferSelect;
export type InsertAccountingMonthlyClose = typeof accountingMonthlyClose.$inferInsert;
export type AccountingMonthlyCloseAudit = typeof accountingMonthlyCloseAudit.$inferSelect;
export type InsertAccountingMonthlyCloseAudit = typeof accountingMonthlyCloseAudit.$inferInsert;

export type Partner = typeof partners.$inferSelect;
export type InsertPartner = typeof partners.$inferInsert;
export type PartnerContact = typeof partnerContacts.$inferSelect;
export type InsertPartnerContact = typeof partnerContacts.$inferInsert;
export type ApLedgerEntry = typeof apLedger.$inferSelect;
export type InsertApLedgerEntry = typeof apLedger.$inferInsert;
export type ArLedgerEntry = typeof arLedger.$inferSelect;
export type InsertArLedgerEntry = typeof arLedger.$inferInsert;
export type BankAccount = typeof bankAccounts.$inferSelect;
export type InsertBankAccount = typeof bankAccounts.$inferInsert;
export type BankTransaction = typeof bankTransactions.$inferSelect;
export type InsertBankTransaction = typeof bankTransactions.$inferInsert;
export type AccountingAccountV2 = typeof accountingAccountsV2.$inferSelect;
export type InsertAccountingAccountV2 = typeof accountingAccountsV2.$inferInsert;
export type MatchingRule = typeof matchingRules.$inferSelect;
export type InsertMatchingRule = typeof matchingRules.$inferInsert;


// ============================================================================
// 구독 관리 테이블
// ============================================================================

/**
 * 구독 만료 알림 테이블
 * 7일, 3일, 1일 전 알림 기록
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
export const hGenericChecklistRecords = mysqlTable("h_generic_checklist_records", {
  id: int("id").autoincrement().primaryKey(),
  siteId: int("site_id").notNull(),
  tenantId: int("tenant_id").notNull().default(1),
  formType: varchar("form_type", { length: 100 }).notNull(), // 폼 유형 식별자
  tenantSeq: int("tenant_seq"),
  formDate: varchar("form_date", { length: 20 }).notNull(), // 작성일 (YYYY-MM-DD)
  title: varchar("title", { length: 500 }), // 제목
  formData: json("form_data"), // 폼 데이터 (JSON)
  status: mysqlEnum("status", ["draft", "submitted", "approved", "rejected"]).default("draft"),
  createdBy: int("created_by"),
  updatedBy: int("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type GenericChecklistRecord = typeof hGenericChecklistRecords.$inferSelect;
export type InsertGenericChecklistRecord = typeof hGenericChecklistRecords.$inferInsert;

// ============================================================================
// CCP 모니터링 기록지 (CCP Monitoring Form Records)
// CCP-2B: 가열(굽기), CCP-1B: 가열(증숙), CCP-4P: 금속검출
// ============================================================================

export const hCcpFormRecords = mysqlTable("h_ccp_form_records", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().default(1),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  batchId: bigint("batch_id", { mode: "number" }).notNull(),
  ccpType: varchar("ccp_type", { length: 20 }).notNull(),       // 'CCP-1B','CCP-2B','CCP-4P'
  workDate: date("work_date").notNull(),
  productId: bigint("product_id", { mode: "number" }),
  productName: varchar("product_name", { length: 200 }),
  processGroupId: int("process_group_id"),
  processGroupName: varchar("process_group_name", { length: 100 }),

  // 배치 계산 정보
  bomBatchKg: decimal("bom_batch_kg", { precision: 10, scale: 2 }),
  plannedQtyKg: decimal("planned_qty_kg", { precision: 10, scale: 2 }),
  batchCount: int("batch_count").notNull().default(1),

  // 설비 그룹 설정
  equipGroupMode: mysqlEnum("equip_group_mode", ["concurrent", "sequential"]).notNull().default("sequential"),
  equipIntervalMin: int("equip_interval_min").default(10),

  // CL 한계기준 - CCP-2B (굽기)
  clHeatTimeMinLo: int("cl_heat_time_min_lo"),
  clHeatTimeMinHi: int("cl_heat_time_min_hi"),
  clHeatTempLo: decimal("cl_heat_temp_lo", { precision: 5, scale: 1 }),
  // CL 한계기준 - CCP-1B (증숙)
  clPressureMpaLo: decimal("cl_pressure_mpa_lo", { precision: 5, scale: 3 }),
  clProductTempLo: decimal("cl_product_temp_lo", { precision: 5, scale: 1 }),
  // CL 한계기준 - CCP-4P (금속검출)
  clMetalSensitivity: int("cl_metal_sensitivity").default(130),
  clFeMm: decimal("cl_fe_mm", { precision: 4, scale: 1 }).default("2.0"),
  clSusMm: decimal("cl_sus_mm", { precision: 4, scale: 1 }).default("3.0"),

  // 승인 정보
  writerId: bigint("writer_id", { mode: "number" }),
  approverId: bigint("approver_id", { mode: "number" }),
  status: mysqlEnum("status", ["draft", "submitted", "approved", "rejected"]).notNull().default("draft"),
  approvalRequestId: bigint("approval_request_id", { mode: "number" }),
  submittedAt: timestamp("submitted_at"),
  approvedAt: timestamp("approved_at"),
  rejectedReason: text("rejected_reason"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type CcpFormRecord = typeof hCcpFormRecords.$inferSelect;
export type InsertCcpFormRecord = typeof hCcpFormRecords.$inferInsert;


export const hCcpFormRows = mysqlTable("h_ccp_form_rows", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().default(1),
  formRecordId: bigint("form_record_id", { mode: "number" }).notNull(),
  batchSeq: int("batch_seq").notNull().default(1),
  equipmentId: int("equipment_id"),
  equipmentName: varchar("equipment_name", { length: 100 }),
  equipmentType: varchar("equipment_type", { length: 50 }),

  // 공통 필드
  productName: varchar("product_name", { length: 200 }),
  measurementTime: varchar("measurement_time", { length: 10 }),  // TIME stored as string
  inputQtyKg: decimal("input_qty_kg", { precision: 10, scale: 2 }),
  result: mysqlEnum("result", ["적합", "부적합"]),

  // CCP-2B (가열굽기)
  heatTimeMin: int("heat_time_min"),
  heatTempC: decimal("heat_temp_c", { precision: 5, scale: 1 }),

  // CCP-1B (가열증숙)
  siruName: varchar("siru_name", { length: 50 }),
  pressureMpa: decimal("pressure_mpa", { precision: 5, scale: 3 }),
  tempEdgeC: decimal("temp_edge_c", { precision: 5, scale: 1 }),
  tempCenterC: decimal("temp_center_c", { precision: 5, scale: 1 }),

  // CCP-4P (금속검출) - 감도 모니터링
  metalPassTime: varchar("metal_pass_time", { length: 10 }),
  metalFeMid: varchar("metal_fe_mid", { length: 10 }),
  metalSusMid: varchar("metal_sus_mid", { length: 10 }),
  metalProductOnly: varchar("metal_product_only", { length: 10 }),
  metalFeProduct: varchar("metal_fe_product", { length: 10 }),
  metalSusProduct: varchar("metal_sus_product", { length: 10 }),

  // CCP-4P 통과량
  passTimeStart: varchar("pass_time_start", { length: 10 }),
  passTimeEnd: varchar("pass_time_end", { length: 10 }),
  passQty: int("pass_qty"),
  detectedQty: int("detected_qty"),
  specialNote: text("special_note"),

  // 이탈/개선조치
  isDeviation: tinyint("is_deviation").notNull().default(0),
  deviationNote: text("deviation_note"),
  correctiveAction: text("corrective_action"),
  actionBy: varchar("action_by", { length: 100 }),
  confirmedBy: varchar("confirmed_by", { length: 100 }),

  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type CcpFormRow = typeof hCcpFormRows.$inferSelect;
export type InsertCcpFormRow = typeof hCcpFormRows.$inferInsert;


export const hCcpEquipBatchSettings = mysqlTable("h_ccp_equip_batch_settings", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().default(1),
  processGroupId: int("process_group_id").notNull(),
  groupMode: mysqlEnum("group_mode", ["concurrent", "sequential"]).notNull().default("sequential"),
  intervalBetweenMin: int("interval_between_min").default(10),
  maxConcurrent: int("max_concurrent").default(1),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type CcpEquipBatchSetting = typeof hCcpEquipBatchSettings.$inferSelect;
export type InsertCcpEquipBatchSetting = typeof hCcpEquipBatchSettings.$inferInsert;
