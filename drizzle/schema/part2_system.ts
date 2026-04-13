/**
 * part2 분할: 알림/설정 + 유통/출하
 */
import {
  bigint, boolean, date, decimal, int, json,
  mysqlEnum, mysqlTable, text, timestamp, tinyint, varchar
} from "drizzle-orm/mysql-core";
import { tenants } from "./schema_main_core";

// 알림/설정 테이블 (8개)
// ============================================================================

/**
 * h_notifications - 알림
 */
export const hNotifications = mysqlTable("h_notifications", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  notificationType: varchar("notification_type", { length: 50 }),
  title: varchar("title", { length: 200 }).notNull(),
  message: text("message"),
  referenceType: varchar("reference_type", { length: 50 }),
  referenceId: bigint("reference_id", { mode: "number" }),
  priority: mysqlEnum("priority", ["low", "medium", "high", "urgent"]).default("medium"),
  isRead: tinyint("is_read").default(0),
  readAt: timestamp("read_at"),
  actionUrl: varchar("action_url", { length: 500 }), // 바로 가기 URL
  isResolved: tinyint("is_resolved").default(0), // 조치 완료 여부
  resolvedAt: timestamp("resolved_at"), // 조치 완료 시각
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_notification_settings - 알림 설정
 */
export const hNotificationSettings = mysqlTable("h_notification_settings", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  
  // 알림 유형별 수신 설정
  ccpDeviationEnabled: tinyint("ccp_deviation_enabled").default(1), // CCP 이탈
  stockLowEnabled: tinyint("stock_low_enabled").default(1), // 재고 부족
  expiryWarningEnabled: tinyint("expiry_warning_enabled").default(1), // 유통기한 임박
  batchCompletedEnabled: tinyint("batch_completed_enabled").default(1), // 배치 완료
  approvalRequestEnabled: tinyint("approval_request_enabled").default(1), // 승인 요청
  inspectionCompletedEnabled: tinyint("inspection_completed_enabled").default(1), // 검사 완료
  healthCertExpiryEnabled: tinyint("health_cert_expiry_enabled").default(1), // 건강진단서 만료 임박
  
  // 알림 채널 설정
  systemNotificationEnabled: tinyint("system_notification_enabled").default(1), // 시스템 알림
  emailEnabled: tinyint("email_enabled").default(0), // 이메일
  smsEnabled: tinyint("sms_enabled").default(0), // SMS
  
  // 알림 수신 시간 설정
  businessHoursOnly: tinyint("business_hours_only").default(0), // 업무 시간만 수신
  businessHoursStart: varchar("business_hours_start", { length: 5 }).default("09:00"), // 업무 시작 시간
  businessHoursEnd: varchar("business_hours_end", { length: 5 }).default("18:00"), // 업무 종료 시간
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * h_system_settings - 시스템 설정
 */
export const hSystemSettings = mysqlTable("h_system_settings", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  settingKey: varchar("setting_key", { length: 100 }).unique().notNull(),
  settingValue: text("setting_value"),
  settingType: varchar("setting_type", { length: 50 }),
  category: varchar("category", { length: 100 }),
  description: text("description"),
  isEditable: tinyint("is_editable").default(1),
  updatedBy: bigint("updated_by", { mode: "number" }),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * h_site_settings - 사업장 설정
 */
export const hSiteSettings = mysqlTable("h_site_settings", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  settingKey: varchar("setting_key", { length: 100 }).notNull(),
  settingValue: text("setting_value"),
  settingType: varchar("setting_type", { length: 50 }),
  description: text("description"),
  updatedBy: bigint("updated_by", { mode: "number" }),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * h_alert_rules - 알림 규칙
 */
export const hAlertRules = mysqlTable("h_alert_rules", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  ruleName: varchar("rule_name", { length: 200 }).notNull(),
  ruleType: varchar("rule_type", { length: 50 }),
  condition: text("condition"),
  triggerEvent: varchar("trigger_event", { length: 100 }),
  notificationTemplate: text("notification_template"),
  isActive: tinyint("is_active").default(1),
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * h_alert_recipients - 알림 수신자
 */
export const hAlertRecipients = mysqlTable("h_alert_recipients", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  ruleId: bigint("rule_id", { mode: "number" }).notNull(),
  userId: bigint("user_id", { mode: "number" }),
  roleId: bigint("role_id", { mode: "number" }),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 20 }),
  notificationMethod: varchar("notification_method", { length: 50 }),
});

/**
 * h_email_logs - 이메일 로그
 */
export const hEmailLogs = mysqlTable("h_email_logs", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  recipient: varchar("recipient", { length: 320 }).notNull(),
  subject: varchar("subject", { length: 500 }),
  body: text("body"),
  status: mysqlEnum("status", ["sent", "failed", "pending"]).default("pending"),
  sentAt: timestamp("sent_at"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_audit_logs - 감사 로그
 */
export const hAuditLogs = mysqlTable("h_audit_logs", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  userId: bigint("user_id", { mode: "number" }),
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entity_type", { length: 50 }),
  entityId: bigint("entity_id", { mode: "number" }),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// 유통/출하 테이블 (4개)
// ============================================================================

/**
 * h_distribution_records - 유통 기록
 */
export const hDistributionRecords = mysqlTable("h_distribution_records", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  distributionDate: date("distribution_date").notNull(),
  batchId: bigint("batch_id", { mode: "number" }),
  productId: bigint("product_id", { mode: "number" }).notNull(),
  lotNumber: varchar("lot_number", { length: 100 }),
  quantity: decimal("quantity", { precision: 10, scale: 3 }).notNull(),
  unit: varchar("unit", { length: 20 }).notNull(),
  distributorId: bigint("distributor_id", { mode: "number" }),
  distributorName: varchar("distributor_name", { length: 200 }),
  destination: varchar("destination", { length: 200 }),
  vehicleNumber: varchar("vehicle_number", { length: 50 }),
  driverName: varchar("driver_name", { length: 100 }),
  temperature: decimal("temperature", { precision: 5, scale: 2 }),
  status: mysqlEnum("status", ["pending", "in_transit", "delivered", "returned"]).default("pending"),
  deliveredAt: timestamp("delivered_at"),
  notes: text("notes"),
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_distributors - 유통업체
 */
export const hDistributors = mysqlTable("h_distributors", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  distributorCode: varchar("distributor_code", { length: 50 }).unique(),
  distributorName: varchar("distributor_name", { length: 200 }).notNull(),
  businessNumber: varchar("business_number", { length: 50 }),
  contactPerson: varchar("contact_person", { length: 100 }),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 320 }),
  address: text("address"),
  isActive: tinyint("is_active").default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * h_shipping_records - 출하 기록
 */
export const hShippingRecords = mysqlTable("h_shipping_records", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  shippingDate: date("shipping_date").notNull(),
  batchId: bigint("batch_id", { mode: "number" }),
  productId: bigint("product_id", { mode: "number" }).notNull(),
  lotNumber: varchar("lot_number", { length: 100 }),
  quantity: decimal("quantity", { precision: 10, scale: 3 }).notNull(),
  unit: varchar("unit", { length: 20 }).notNull(),
  customerId: bigint("customer_id", { mode: "number" }),
  customerName: varchar("customer_name", { length: 200 }),
  shippingMethod: varchar("shipping_method", { length: 100 }),
  trackingNumber: varchar("tracking_number", { length: 100 }),
  status: mysqlEnum("status", ["prepared", "shipped", "delivered", "cancelled"]).default("prepared"),
  shippedBy: bigint("shipped_by", { mode: "number" }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * h_customers - 고객
 */
export const hCustomers = mysqlTable("h_customers", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  customerCode: varchar("customer_code", { length: 50 }).unique(),
  customerName: varchar("customer_name", { length: 200 }).notNull(),
  customerType: varchar("customer_type", { length: 50 }),
  businessNumber: varchar("business_number", { length: 50 }),
  contactPerson: varchar("contact_person", { length: 100 }),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 320 }),
  address: text("address"),
  isActive: tinyint("is_active").default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

// ============================================================================
