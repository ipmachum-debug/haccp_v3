/**
 * 화장품 GMP — 안정성시험 (Stability Test) Phase 2-8
 *
 * ============================================================================
 * ICH Q1A 가이드라인 기반:
 *   - long_term: 25°C/60%RH (장기, 12~36개월)
 *   - accelerated: 40°C/75%RH (가속, 6개월)
 *   - stress: 50°C+ 또는 광선 조사 (스트레스)
 *
 * 두 테이블:
 *   - h_cosmetic_stability_test       : 시험 헤더 (제품 + 조건 + 기간)
 *   - h_cosmetic_stability_observation: 관측치 (월별 시계열 — 외관/pH/점도/미생물)
 * ============================================================================
 */

import {
  bigint,
  date,
  decimal,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  index,
  varchar,
} from "drizzle-orm/mysql-core";
import { tenants } from "../../schema_main";

export const hCosmeticStabilityTest = mysqlTable(
  "h_cosmetic_stability_test",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull().references(() => tenants.id),

    testCode: varchar("test_code", { length: 50 }).notNull(), // STB-YYYYMMDD-NNN
    productId: bigint("product_id", { mode: "number" }).notNull(),
    bmrId: bigint("bmr_id", { mode: "number" }), // 어느 BMR 의 시료? (선택)

    testType: mysqlEnum("test_type", [
      "long_term",   // 장기 (25°C/60%RH)
      "accelerated", // 가속 (40°C/75%RH)
      "stress",      // 스트레스 (고온/광선)
    ]).notNull(),

    // 보관 조건
    storageTempC: decimal("storage_temp_c", { precision: 5, scale: 2 }), // 25.00, 40.00 등
    storageHumidity: decimal("storage_humidity", { precision: 5, scale: 2 }), // 60.00, 75.00 등 (%)
    storageLight: mysqlEnum("storage_light", [
      "dark",          // 차광
      "ambient",       // 일반 실내
      "direct_sunlight", // 직사광
    ]).default("dark"),

    // 기간
    plannedDurationMonths: int("planned_duration_months").notNull().default(12),
    startedAt: date("started_at"),
    completedAt: date("completed_at"),

    status: mysqlEnum("status", [
      "planned",     // 계획
      "in_progress", // 진행 중
      "completed",   // 완료 (사용기한 결정)
      "failed",      // 실패 (안정성 미충족)
    ]).notNull().default("planned"),

    conclusion: text("conclusion"), // 시험 결론 (사용기한 / 보관조건 결정)

    approvedBy: bigint("approved_by", { mode: "number" }),
    approvedAt: timestamp("approved_at"),

    createdBy: bigint("created_by", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    uniqTestCode: uniqueIndex("uniq_cosmetic_stability_code").on(
      table.tenantId,
      table.testCode,
    ),
    idxProduct: index("idx_cosmetic_stability_product").on(
      table.tenantId,
      table.productId,
    ),
    idxStatus: index("idx_cosmetic_stability_status").on(
      table.tenantId,
      table.status,
    ),
  }),
);

export const hCosmeticStabilityObservation = mysqlTable(
  "h_cosmetic_stability_observation",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull().references(() => tenants.id),
    testId: bigint("test_id", { mode: "number" }).notNull(), // h_cosmetic_stability_test.id

    observationMonth: int("observation_month").notNull(), // 0/1/3/6/9/12...
    observationDate: date("observation_date").notNull(),

    // 관측 항목 (모두 nullable — 관측 항목별 선택 가능)
    appearance: text("appearance"),
    color: varchar("color", { length: 100 }),
    odor: varchar("odor", { length: 100 }),
    ph: decimal("ph", { precision: 5, scale: 2 }),
    viscosity: decimal("viscosity", { precision: 12, scale: 4 }),
    microbialCount: int("microbial_count"), // cfu/g

    passFail: mysqlEnum("pass_fail", [
      "pass",       // 적합 (모든 항목 표준 내)
      "acceptable", // 일부 변화 있으나 허용 범위
      "fail",       // 부적합 (안정성 미충족)
    ]).notNull().default("pass"),

    notes: text("notes"),
    measuredBy: bigint("measured_by", { mode: "number" }),
    measuredAt: timestamp("measured_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    idxTest: index("idx_cosmetic_stability_obs_test").on(
      table.tenantId,
      table.testId,
    ),
  }),
);

export type CosmeticStabilityTest = typeof hCosmeticStabilityTest.$inferSelect;
export type CosmeticStabilityObservation = typeof hCosmeticStabilityObservation.$inferSelect;
