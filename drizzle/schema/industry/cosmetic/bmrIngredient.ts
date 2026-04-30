/**
 * 화장품 GMP — h_cosmetic_bmr_ingredient (BMR 별 원료 투입 기록)
 *
 * ============================================================================
 * Phase 2-4b: BMR 제조 시 실제 투입한 원료/양 기록.
 *
 * 배합표 (Phase 2-4a) 와의 차이:
 *   - h_cosmetic_formula_ingredient: 표준 배합비 (% 기준, 마스터)
 *   - h_cosmetic_bmr_ingredient    : 실제 투입량 (kg/g 기준, BMR 별 실측)
 *
 * 향후 (Phase 2-4c):
 *   - 배합표 → BMR 자동 채움 (formula 의 ingredient 들을 BMR plannedQty 로 prefill)
 *   - 실측 차이 (planned vs actual) 분석
 *
 * 의존성:
 *   - h_cosmetic_bmr (FK) — BMR 별 투입 기록
 *   - 선택적으로 formula_ingredient_id 참조 (배합표 항목 trace) — 이번 PR 미구현
 * ============================================================================
 */

import {
  bigint,
  decimal,
  int,
  mysqlTable,
  text,
  timestamp,
  varchar,
  index,
} from "drizzle-orm/mysql-core";
import { tenants } from "../../schema_main";

export const hCosmeticBmrIngredient = mysqlTable(
  "h_cosmetic_bmr_ingredient",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull().references(() => tenants.id),
    bmrId: bigint("bmr_id", { mode: "number" }).notNull(), // h_cosmetic_bmr.id

    // 원료 정보
    materialName: varchar("material_name", { length: 200 }).notNull(),
    materialCode: varchar("material_code", { length: 100 }),
    inciName: varchar("inci_name", { length: 200 }),
    lotNumber: varchar("lot_number", { length: 100 }), // 원료 LOT (추적용)

    // 투입량
    plannedQuantity: decimal("planned_quantity", { precision: 12, scale: 4 }), // 계획량 (배합표 기준)
    actualQuantity: decimal("actual_quantity", { precision: 12, scale: 4 }), // 실제 투입량
    unit: varchar("unit", { length: 20 }).notNull().default("g"), // g, mL, kg 등

    // 메타
    inputBy: bigint("input_by", { mode: "number" }),
    inputAt: timestamp("input_at"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    idxBmr: index("idx_cosmetic_bmr_ing_bmr").on(table.tenantId, table.bmrId),
  }),
);

export type CosmeticBmrIngredient = typeof hCosmeticBmrIngredient.$inferSelect;
