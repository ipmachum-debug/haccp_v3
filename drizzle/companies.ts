import { tenants } from '../schema_main';

/**
 * 회사(테넌트) 관리 테이블
 * Shared Database 멀티 테넌트 구조
 */

import {
  bigint,
  int,
  mysqlEnum,
  mysqlTable,
  timestamp,
  varchar,
} from "./_shared";

export const companies = mysqlTable("companies", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  companyCode: varchar("company_code", { length: 50 }).notNull().unique(),
  companyName: varchar("company_name", { length: 255 }).notNull(),
  businessNumber: varchar("business_number", { length: 50 }),
  address: varchar("address", { length: 500 }),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 255 }),
  subscriptionPlan: mysqlEnum("subscription_plan", ["free", "basic", "pro", "enterprise"]).default("free").notNull(),
  subscriptionStatus: mysqlEnum("subscription_status", ["active", "suspended", "cancelled"]).default("active").notNull(),
  maxUsers: int("max_users").default(10).notNull(),
  maxSites: int("max_sites").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
