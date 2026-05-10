/**
 * 번들 LOT 매핑 — PR #283 (Phase 4)
 *
 * parent SKU LOT (BLEND-{date}-{seq}) ↔ child SKU LOT (실제 생산 LOT) 의 N:1 매핑.
 *
 * 사용 흐름:
 *   1. parent SKU 출고 시 → 신규 parent LOT 채번 (BLEND-{date}-{seq})
 *   2. child SKU LOT 들에서 비율대로 차감 (FEFO 우선)
 *   3. 각 차감 → bundle_lots 행 생성 (parent_lot_id, child_lot_id, deducted_qty)
 *
 * 회수 시뮬레이션:
 *   parent LOT 회수 → JOIN bundle_lots → 모든 child LOT 자동 매핑
 *   각 child LOT 의 다른 출고 (단독 판매 분) 도 함께 추적 가능
 *
 * 정책 (사용자 승인):
 *   - parent LOT 채번: 신규 (BLEND-{date}-{seq}) — 추적 깔끔
 *   - 1 parent LOT 은 N 개 child LOT 으로 구성 가능 (N≥2)
 */
import {
  mysqlTable,
  bigint,
  int,
  decimal,
  timestamp,
  index,
  text,
} from "drizzle-orm/mysql-core";
import { tenants } from "./schema_main";
import { hInventoryLots } from "./part2_inventory";

export const bundleLots = mysqlTable(
  "bundle_lots",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    tenantId: int("tenant_id")
      .notNull()
      .default(1)
      .references(() => tenants.id),
    /** parent SKU 의 LOT (h_inventory_lots.id, sku_id = parent SKU) */
    parentLotId: bigint("parent_lot_id", { mode: "number" })
      .notNull()
      .references(() => hInventoryLots.id),
    /** child SKU 의 LOT (h_inventory_lots.id, sku_id = child SKU) */
    childLotId: bigint("child_lot_id", { mode: "number" })
      .notNull()
      .references(() => hInventoryLots.id),
    /** 이 child LOT 에서 parent LOT 으로 차감된 수량 (kg) */
    deductedQtyKg: decimal("deducted_qty_kg", {
      precision: 12,
      scale: 3,
    }).notNull(),
    /** 차감 시점 (출고 날짜) */
    mappedAt: timestamp("mapped_at").defaultNow().notNull(),
    /** 비고 (회수 시뮬레이션 추적용) */
    notes: text("notes"),
  },
  (table) => ({
    parentLotIdx: index("idx_bundle_lots_parent").on(table.parentLotId),
    childLotIdx: index("idx_bundle_lots_child").on(table.childLotId),
    tenantIdx: index("idx_bundle_lots_tenant").on(table.tenantId),
  }),
);

export type BundleLot = typeof bundleLots.$inferSelect;
export type BundleLotInsert = typeof bundleLots.$inferInsert;
