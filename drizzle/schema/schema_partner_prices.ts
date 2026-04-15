import { tenants } from "./schema_main";
import { partners } from "./schema_main_accounting";
import {
  mysqlTable,
  bigint,
  varchar,
  decimal,
  text,
  timestamp,
  date,
  mysqlEnum,
  index,
  int,
  uniqueIndex,
  tinyint,
} from "drizzle-orm/mysql-core";

/**
 * 거래처별 단가표 (Partner Prices) — Phase B (2026-04-14)
 * ═══════════════════════════════════════════════════════════════
 * "거래처별 원재료/제품 단가" 를 저장하여:
 *   1. 발주/매입 등록 시 공급업체 + 원재료 선택 → 단가 자동 채움
 *   2. 매출 등록 시 고객 + 제품 선택 → 단가 자동 채움
 *   3. 유효 기간 지원 (effective_from ~ effective_to)
 *   4. 단가 변경 이력 관리 (이전 단가를 비활성화 + 새 단가 INSERT)
 *
 * 중복 방지:
 *   (tenant_id, partner_id, target_type, material_id|product_id, effective_from) 유니크
 * ═══════════════════════════════════════════════════════════════
 */
export const partnerPrices = mysqlTable("partner_prices", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().default(1).references(() => tenants.id),
  partnerId: bigint("partner_id", { mode: "number" }).notNull().references(() => partners.id),

  // 대상 구분
  targetType: mysqlEnum("target_type", ["material", "product"]).notNull(),
  materialId: bigint("material_id", { mode: "number" }), // targetType='material' 일 때
  productId: bigint("product_id", { mode: "number" }), // targetType='product' 일 때

  // 품목명 snapshot (조회 최적화)
  itemName: varchar("item_name", { length: 255 }).notNull(),
  itemCode: varchar("item_code", { length: 100 }),

  // 단가 정보
  unitPrice: decimal("unit_price", { precision: 15, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("KRW"),
  discountRate: decimal("discount_rate", { precision: 5, scale: 2 }).default("0.00"), // 할인율 (%)

  // 유효 기간
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"), // NULL = 무제한

  // 메모
  notes: text("notes"),
  isActive: tinyint("is_active").notNull().default(1),

  // 감사
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  // 거래처 + 대상별 유니크 (활성화된 단가는 같은 effective_from 으로 중복 불가)
  uqPartnerMaterial: uniqueIndex("uq_pp_partner_material").on(
    table.tenantId,
    table.partnerId,
    table.materialId,
    table.effectiveFrom,
  ),
  uqPartnerProduct: uniqueIndex("uq_pp_partner_product").on(
    table.tenantId,
    table.partnerId,
    table.productId,
    table.effectiveFrom,
  ),
  tenantPartnerIdx: index("idx_pp_tenant_partner").on(table.tenantId, table.partnerId),
  materialIdx: index("idx_pp_material").on(table.materialId),
  productIdx: index("idx_pp_product").on(table.productId),
}));
