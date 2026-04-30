/**
 * 화장품 GMP — h_cosmetic_bmr_ipc (In-Process Control 측정값)
 *
 * ============================================================================
 * Phase 2-3: BMR 제조 중 IPC 측정값 기록 + 한계 자동 평가.
 *
 * 식품 HACCP 의 ccp_monitoring_records 와 유사하지만:
 *   - food: 4종 CCP 한정 (CCP-1B 가열, CCP-4P 금속검출 등)
 *   - cosmetic: 임의의 IPC 항목 (점도, pH, 미생물, 색상, 비중 등 — measurementType 자유)
 *   - food: 한계 위반 시 자동 LOT HOLD + 손실분개 + CAR (F-3 폐쇄 루프)
 *   - cosmetic: 일단 pass/fail 기록만, 자동화는 향후 (Phase 2-7)
 *
 * 의존성:
 *   - h_cosmetic_bmr.id (FK) — BMR 별 IPC 측정값
 *   - 같은 BMR 의 IPC 가 모두 pass 면 status='completed' 로 전이 가능 (앱 레이어 검증)
 * ============================================================================
 */

import {
  bigint,
  decimal,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  index,
} from "drizzle-orm/mysql-core";
import { tenants } from "../../schema_main";

/**
 * h_cosmetic_bmr_ipc — IPC 측정값
 *
 * passFail 자동 평가:
 *   - measuredValue NULL 또는 expected 미설정 → 'pending'
 *   - measuredValue >= expectedMin AND measuredValue <= expectedMax → 'pass'
 *   - 그 외 → 'fail'
 * (서버 createIpc 함수에서 자동 결정)
 */
export const hCosmeticBmrIpc = mysqlTable(
  "h_cosmetic_bmr_ipc",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull().references(() => tenants.id),
    bmrId: bigint("bmr_id", { mode: "number" }).notNull(), // h_cosmetic_bmr.id

    // 측정 항목
    measurementType: varchar("measurement_type", { length: 50 }).notNull(),
    // 예: viscosity, ph, microbial, color, weight, density, appearance
    measurementLabel: varchar("measurement_label", { length: 100 }),
    // 한국어 표시명 (예: "점도", "pH")

    // 한계값
    expectedMin: decimal("expected_min", { precision: 12, scale: 4 }),
    expectedMax: decimal("expected_max", { precision: 12, scale: 4 }),

    // 측정값
    measuredValue: decimal("measured_value", { precision: 12, scale: 4 }),
    unit: varchar("unit", { length: 20 }), // cP, pH, cfu/g 등

    // 평가
    passFail: mysqlEnum("pass_fail", ["pass", "fail", "pending"])
      .notNull()
      .default("pending"),

    // 메타
    measuredBy: bigint("measured_by", { mode: "number" }),
    measuredAt: timestamp("measured_at"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    idxBmr: index("idx_cosmetic_bmr_ipc_bmr").on(table.tenantId, table.bmrId),
  }),
);

export type CosmeticBmrIpc = typeof hCosmeticBmrIpc.$inferSelect;
export type CosmeticBmrIpcInsert = typeof hCosmeticBmrIpc.$inferInsert;
