/**
 * SKU 번들 (혼합 제품) 정의 — PR #280
 *
 * 사용처:
 *   - 같은 품목제조보고를 따로 생산하지만 1개 SKU 로 출고하는 혼합 제품
 *   - 예: 카스테라앙금인절미(혼합) = 카스테라쑥앙금인절미 + 흑임자인절미 + 콩고물인절미
 *
 * 정책:
 *   - 비율 고정 (default_ratio): 매 출고마다 동일 비율 — HACCP 라벨/원산지/알레르겐 일관성
 *   - 각 child SKU 는 자체 배치/CCP/생산일지 유지 (식약처 요건)
 *   - parent SKU 는 inventory/sales 단계에서만 등장 (생산 단계 X)
 *
 * 설계 결정 (사용자 선택 — 2026-05-09):
 *   - (A) 고정 비율 — 단순, HACCP 표준 좋음 ✅
 *   - (B) 가변 비율 — 부적합 보완 등 유연성 (rejected)
 *
 * 다음 단계 (PR #281+):
 *   - 배치 일괄 생성 UI (parent SKU 선택 → child 배치 N개 자동 생성)
 *   - 출고 시 parent → child 자동 분해 (FEFO LOT 차감)
 *   - 재고 화면: parent 라인 + child 라인 동시 표시
 */
import { mysqlTable, bigint, int, decimal, timestamp, index, unique } from "drizzle-orm/mysql-core";
import { tenants } from "./schema_main";
import { productSkus } from "./schema_dual_unit";

export const skuBundles = mysqlTable(
  "sku_bundles",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    tenantId: int("tenant_id")
      .notNull()
      .default(1)
      .references(() => tenants.id),
    /** 출고용 SKU (혼합 인절미) */
    parentSkuId: bigint("parent_sku_id", { mode: "number" })
      .notNull()
      .references(() => productSkus.id),
    /** 생산용 child SKU (쑥앙금/흑임자/콩고물 등) */
    childSkuId: bigint("child_sku_id", { mode: "number" })
      .notNull()
      .references(() => productSkus.id),
    /** 표준 비율 (%) — 합계는 100% 권장. 예: 33.33 + 33.33 + 33.34 */
    defaultRatio: decimal("default_ratio", { precision: 5, scale: 2 }).notNull(),
    /** 정렬 순서 (UI/리포트 표시용) */
    sortOrder: int("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull().onUpdateNow(),
  },
  (table) => ({
    /** 같은 parent + child 페어 중복 방지 */
    uqBundlePair: unique("uk_bundle_pair").on(
      table.tenantId,
      table.parentSkuId,
      table.childSkuId,
    ),
    parentIdx: index("idx_bundle_parent").on(table.parentSkuId),
    childIdx: index("idx_bundle_child").on(table.childSkuId),
  }),
);

export type SkuBundle = typeof skuBundles.$inferSelect;
export type SkuBundleInsert = typeof skuBundles.$inferInsert;
