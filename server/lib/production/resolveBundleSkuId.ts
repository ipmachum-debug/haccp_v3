/**
 * SKU 번들 자동 매칭 헬퍼 — PR #281 (Phase 2)
 *
 * production_sku_output INSERT 시 sku_bundles 룩업으로 bundle_sku_id 자동 채움.
 *
 * 사용:
 *   const bundleSkuId = await resolveBundleSkuId(db, tenantId, childSkuId);
 *   await db.insert(productionSkuOutput).values({ ..., bundleSkuId });
 *
 * 설계:
 *   - child SKU 가 여러 parent 번들에 속할 수 있는 경우 → 첫 번째 (또는 가장 우선순위 높은) parent 사용
 *   - 매칭 실패 (단일 SKU) → null 반환
 */
import type { MySql2Database } from "drizzle-orm/mysql2";
import { and, eq } from "drizzle-orm";

export async function resolveBundleSkuId(
  db: MySql2Database<any>,
  tenantId: number,
  childSkuId: number,
): Promise<number | null> {
  if (!tenantId || !childSkuId) return null;

  const { skuBundles } = await import("../../../drizzle/schema/skuBundles.js");

  const rows = await db
    .select({ parentSkuId: skuBundles.parentSkuId })
    .from(skuBundles)
    .where(
      and(
        eq(skuBundles.tenantId, tenantId),
        eq(skuBundles.childSkuId, childSkuId),
      ),
    )
    .orderBy(skuBundles.sortOrder)
    .limit(1);

  return rows[0]?.parentSkuId ?? null;
}

/**
 * 일괄 매칭 (다수의 child SKU 한 번에).
 * Map<childSkuId, parentSkuId | null> 반환.
 */
export async function resolveBundleSkuIdsBulk(
  db: MySql2Database<any>,
  tenantId: number,
  childSkuIds: number[],
): Promise<Map<number, number>> {
  const result = new Map<number, number>();
  if (!tenantId || childSkuIds.length === 0) return result;

  const { skuBundles } = await import("../../../drizzle/schema/skuBundles.js");
  const { inArray, and, eq } = await import("drizzle-orm");

  const rows = await db
    .select({
      childSkuId: skuBundles.childSkuId,
      parentSkuId: skuBundles.parentSkuId,
    })
    .from(skuBundles)
    .where(
      and(
        eq(skuBundles.tenantId, tenantId),
        inArray(skuBundles.childSkuId, childSkuIds),
      ),
    )
    .orderBy(skuBundles.sortOrder);

  for (const r of rows) {
    if (!result.has(r.childSkuId)) {
      result.set(r.childSkuId, r.parentSkuId);
    }
  }
  return result;
}
