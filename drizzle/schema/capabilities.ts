/**
 * Capability 레지스트리
 *
 * 배경: docs/architecture/04-policy-registry.md
 * 소유 레이어: platform/permission/
 *
 * 구조:
 *   capabilities            — 전역 마스터 (feature × action 조합)
 *   role_capabilities       — h_roles 에 capability 부여
 *   user_capability_grants  — 직접 부여 (역할 우회, 예외용)
 *
 * 표준 action: READ / WRITE / APPROVE / CANCEL / POST / EXPORT
 */

import {
  bigint,
  int,
  mysqlTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const capabilities = mysqlTable(
  "capabilities",
  {
    id: int("id").autoincrement().primaryKey(),
    code: varchar("code", { length: 100 }).notNull(),
    featureCode: varchar("feature_code", { length: 50 }).notNull(),
    action: varchar("action", { length: 20 }).notNull(),
    description: varchar("description", { length: 255 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqCode: uniqueIndex("uniq_capabilities_code").on(t.code),
    uniqFeatureAction: uniqueIndex("uniq_capabilities_feature_action").on(
      t.featureCode,
      t.action,
    ),
  }),
);

export const roleCapabilities = mysqlTable(
  "role_capabilities",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenant_id").notNull(),
    roleId: bigint("role_id", { mode: "number" }).notNull(),
    capabilityId: int("capability_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqRoleCap: uniqueIndex("uniq_role_capabilities").on(
      t.tenantId,
      t.roleId,
      t.capabilityId,
    ),
  }),
);

export const userCapabilityGrants = mysqlTable(
  "user_capability_grants",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenant_id").notNull(),
    userId: bigint("user_id", { mode: "number" }).notNull(),
    capabilityId: int("capability_id").notNull(),
    grantedBy: bigint("granted_by", { mode: "number" }),
    reason: varchar("reason", { length: 255 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at"),
  },
  (t) => ({
    uniqUserCap: uniqueIndex("uniq_user_capability_grants").on(
      t.tenantId,
      t.userId,
      t.capabilityId,
    ),
  }),
);

export const STANDARD_ACTIONS = [
  "READ",
  "WRITE",
  "APPROVE",
  "CANCEL",
  "POST",
  "EXPORT",
] as const;

export type StandardAction = (typeof STANDARD_ACTIONS)[number];

export type Capability = typeof capabilities.$inferSelect;
export type NewCapability = typeof capabilities.$inferInsert;
export type RoleCapability = typeof roleCapabilities.$inferSelect;
export type UserCapabilityGrant = typeof userCapabilityGrants.$inferSelect;
