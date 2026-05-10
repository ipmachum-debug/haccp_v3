/**
 * SKU 번들 재고 계산 + 출고 분해 헬퍼 — PR #282 (Phase 3)
 *
 * Phase 3 결정 (사용자 승인):
 *   - parent 재고 = MIN(child 재고 / ratio × 100) — bottleneck child 가 결정
 *   - child 재고 부족 → 경고 + 부분 출고 허용 (block 아님)
 *   - child 단독 출고 → 가능 (현재 동작 유지)
 *
 * 사용:
 *   getBundleAvailability(db, tenantId, parentSkuId)
 *     → { availableBundles, bottleneck, childBreakdown[] }
 *
 *   previewBundleDecomposition(db, tenantId, parentSkuId, parentQty)
 *     → { children: [{ childSkuId, requiredQty, currentStock, shortage }] }
 */

import type { MySql2Database } from "drizzle-orm/mysql2";
import { and, eq, sql } from "drizzle-orm";

export interface ChildStockInfo {
  childSkuId: number;
  childSkuCode: string;
  childSkuName: string;
  defaultRatio: number;
  /** 현재 재고 (kg) — h_inventory_lots SUM */
  currentStockKg: number;
  /** 1 parent 단위당 필요한 child kg */
  requiredKgPerParent: number;
  /** 이 child 만으로 만들 수 있는 parent 단위 수 */
  maxParentFromThisChild: number;
}

export interface BundleAvailability {
  parentSkuId: number;
  /** 만들 수 있는 parent 단위 수 (가장 부족한 child 가 결정) */
  availableBundles: number;
  /** 병목 child SKU (가장 부족한 것) */
  bottleneck: ChildStockInfo | null;
  childBreakdown: ChildStockInfo[];
  /** 모든 child 합산 kg (참고용) */
  totalAvailableKg: number;
}

/**
 * parent SKU 의 가용 번들 수 계산.
 * - child 재고 / 비율 ratio 기반 MIN 계산
 * - 비율 0 인 child 는 무시 (defensive)
 */
export async function getBundleAvailability(
  db: MySql2Database<any>,
  tenantId: number,
  parentSkuId: number,
): Promise<BundleAvailability | null> {
  const { skuBundles } = await import("../../../drizzle/schema/skuBundles.js");
  const { productSkus } = await import("../../../drizzle/schema/schema_dual_unit.js");

  // 1. 번들 구성 + child SKU 정보 조회
  const composition = await db
    .select({
      childSkuId: skuBundles.childSkuId,
      childSkuCode: productSkus.skuCode,
      childSkuName: productSkus.skuName,
      defaultRatio: skuBundles.defaultRatio,
      kgPerSalesUnit: productSkus.kgPerSalesUnit,
    })
    .from(skuBundles)
    .innerJoin(productSkus, eq(skuBundles.childSkuId, productSkus.id))
    .where(
      and(
        eq(skuBundles.tenantId, tenantId),
        eq(skuBundles.parentSkuId, parentSkuId),
      ),
    );

  if (composition.length === 0) return null;

  // 2. parent SKU 의 1 단위 kg 조회
  const [parent] = await db
    .select({ kgPerSalesUnit: productSkus.kgPerSalesUnit })
    .from(productSkus)
    .where(
      and(eq(productSkus.id, parentSkuId), eq(productSkus.tenantId, tenantId)),
    )
    .limit(1);
  if (!parent) return null;
  const parentKg = Number(parent.kgPerSalesUnit || 1);

  // 3. 각 child 의 현재 재고 (h_inventory_lots SUM)
  const childIds = composition.map((c) => c.childSkuId);
  const stockMap = new Map<number, number>();

  // h_inventory_lots 는 sku_id 기반 (스키마 가정 — 없으면 0)
  try {
    const stockRows: any = await db.execute(sql`
      SELECT sku_id, COALESCE(SUM(remaining_quantity), 0) AS stock_kg
      FROM h_inventory_lots
      WHERE tenant_id = ${tenantId}
        AND sku_id IN (${sql.join(childIds.map((id) => sql`${id}`), sql`, `)})
        AND COALESCE(is_active, 1) = 1
      GROUP BY sku_id
    `);
    const rows = ((stockRows as any)?.[0] ?? []) as any[];
    for (const r of rows) {
      stockMap.set(Number(r.sku_id), Number(r.stock_kg) || 0);
    }
  } catch {
    // 테이블 없거나 컬럼 다른 경우 — 0 으로 처리 (UI 는 "재고 정보 미가용" 표시)
  }

  // 4. child 별 가능 parent 수 계산
  const breakdown: ChildStockInfo[] = composition.map((c) => {
    const ratio = Number(c.defaultRatio) || 0;
    const childKg = Number(c.kgPerSalesUnit || 1);
    // 1 parent 단위 (parentKg) 의 ratio% 가 child 의 kg 차감량
    const requiredKgPerParent = (parentKg * ratio) / 100;
    const stock = stockMap.get(c.childSkuId) ?? 0;
    const maxFrom =
      requiredKgPerParent > 0
        ? Math.floor(stock / requiredKgPerParent)
        : Infinity;
    return {
      childSkuId: c.childSkuId,
      childSkuCode: c.childSkuCode,
      childSkuName: c.childSkuName,
      defaultRatio: ratio,
      currentStockKg: Math.round(stock * 1000) / 1000,
      requiredKgPerParent: Math.round(requiredKgPerParent * 1000) / 1000,
      maxParentFromThisChild: Number.isFinite(maxFrom) ? maxFrom : 0,
    };
  });

  // 5. 병목 child + 가용 parent 수
  let bottleneck: ChildStockInfo | null = null;
  let availableBundles = Number.MAX_SAFE_INTEGER;
  for (const b of breakdown) {
    if (b.maxParentFromThisChild < availableBundles) {
      availableBundles = b.maxParentFromThisChild;
      bottleneck = b;
    }
  }
  if (availableBundles === Number.MAX_SAFE_INTEGER) availableBundles = 0;

  const totalAvailableKg = breakdown.reduce((s, b) => s + b.currentStockKg, 0);

  return {
    parentSkuId,
    availableBundles,
    bottleneck,
    childBreakdown: breakdown,
    totalAvailableKg: Math.round(totalAvailableKg * 1000) / 1000,
  };
}

export interface DecompositionPreview {
  parentSkuId: number;
  parentQty: number;
  /** 각 child 차감 계획 */
  children: Array<{
    childSkuId: number;
    childSkuName: string;
    defaultRatio: number;
    requiredQtyKg: number;
    currentStockKg: number;
    /** 부족분 (양수면 부족) */
    shortageKg: number;
  }>;
  /** 부족 child 가 1개 이상이면 true (경고) */
  hasShortage: boolean;
}

/**
 * parent 출고 N 단위 시 child 별 차감 계획 미리보기.
 * - 실제 차감은 별도 함수에서 (Phase 3.5 / outbound 통합 시)
 * - 사용자 승인 정책: 부족하면 경고만 — block 안 함
 */
export async function previewBundleDecomposition(
  db: MySql2Database<any>,
  tenantId: number,
  parentSkuId: number,
  parentQty: number,
): Promise<DecompositionPreview | null> {
  const availability = await getBundleAvailability(db, tenantId, parentSkuId);
  if (!availability) return null;

  const children = availability.childBreakdown.map((c) => {
    const requiredKg = c.requiredKgPerParent * parentQty;
    const shortage = Math.max(0, requiredKg - c.currentStockKg);
    return {
      childSkuId: c.childSkuId,
      childSkuName: c.childSkuName,
      defaultRatio: c.defaultRatio,
      requiredQtyKg: Math.round(requiredKg * 1000) / 1000,
      currentStockKg: c.currentStockKg,
      shortageKg: Math.round(shortage * 1000) / 1000,
    };
  });

  return {
    parentSkuId,
    parentQty,
    children,
    hasShortage: children.some((c) => c.shortageKg > 0),
  };
}
