/**
 * 화장품 GMP — 배합표 (Formula) 마스터
 *
 * ============================================================================
 * Phase 2-4a: 제품별 표준 배합표 — 재사용 가능한 마스터.
 *
 * 두 테이블:
 *   - h_cosmetic_formula           : 배합표 헤더 (제품 + 버전 + 상태)
 *   - h_cosmetic_formula_ingredient: 배합 항목 (원료 + 배합비 %)
 *
 * lifecycle:
 *   draft → approved → active (운영 사용) → deprecated (구버전 보관)
 *
 * 다음 단계 (Phase 2-4b):
 *   - h_cosmetic_bmr_ingredient — BMR 별 실제 투입량 (배합표 기준 + 실측 차이)
 *
 * 의존성:
 *   - h_products (FK) — 어느 제품의 배합표?
 *
 * 주의 (용어):
 *   - "배합" / "배합표" — 화장품 업계 표준 용어 (Formula)
 *   - "처방" 은 약사 어감이라 코드/UI 에서 회피
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
  uniqueIndex,
  index,
  varchar,
} from "drizzle-orm/mysql-core";
import { tenants } from "../../schema_main";

/**
 * h_cosmetic_formula — 배합표 헤더
 *
 * 같은 product 에 여러 버전 존재 가능 (1.0, 1.1, 2.0 ...).
 * 한 시점에는 active 1개만 사용 권장 (앱 레이어 체크).
 */
export const hCosmeticFormula = mysqlTable(
  "h_cosmetic_formula",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull().references(() => tenants.id),

    formulaCode: varchar("formula_code", { length: 50 }).notNull(), // FOR-YYYYMMDD-NNN
    productId: bigint("product_id", { mode: "number" }).notNull(), // h_products FK
    name: varchar("name", { length: 200 }).notNull(),
    version: varchar("version", { length: 20 }).notNull().default("1.0"),

    description: text("description"),

    status: mysqlEnum("status", [
      "draft", // 작성 중
      "approved", // QA 승인 (사용 가능)
      "active", // 운영 표준 (BMR 에서 참조)
      "deprecated", // 구버전 (참조 용도만)
    ]).notNull().default("draft"),

    // 승인 추적
    approvedBy: bigint("approved_by", { mode: "number" }),
    approvedAt: timestamp("approved_at"),

    // 메타
    createdBy: bigint("created_by", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    uniqFormulaCode: uniqueIndex("uniq_cosmetic_formula_code").on(
      table.tenantId,
      table.formulaCode,
    ),
    idxProduct: index("idx_cosmetic_formula_product").on(
      table.tenantId,
      table.productId,
    ),
  }),
);

/**
 * h_cosmetic_formula_ingredient — 배합 항목 (원료 단위)
 *
 * percentage = 전체 배치 대비 % (모두 합산 100% 권장 — 앱 레이어 검증)
 */
export const hCosmeticFormulaIngredient = mysqlTable(
  "h_cosmetic_formula_ingredient",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull().references(() => tenants.id),
    formulaId: bigint("formula_id", { mode: "number" }).notNull(), // h_cosmetic_formula.id

    // 원료
    materialName: varchar("material_name", { length: 200 }).notNull(),
    materialCode: varchar("material_code", { length: 100 }), // 표준 코드 (선택)
    inciName: varchar("inci_name", { length: 200 }), // 전성분 표시 명칭 (KFDA — Phase 2-5 활용)

    // 배합비
    percentage: decimal("percentage", { precision: 7, scale: 4 }).notNull(), // 0.0001 ~ 100.0000

    // 분류 / 역할
    role: varchar("role", { length: 50 }), // 예: solvent / emulsifier / preservative
    sortOrder: int("sort_order").notNull().default(0),

    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    idxFormula: index("idx_cosmetic_formula_ing_formula").on(
      table.tenantId,
      table.formulaId,
    ),
  }),
);

export type CosmeticFormula = typeof hCosmeticFormula.$inferSelect;
export type CosmeticFormulaIngredient = typeof hCosmeticFormulaIngredient.$inferSelect;
