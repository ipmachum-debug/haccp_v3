/**
 * 매출 SKU 해결 (2026-10-16)
 *
 * 문제: 매출에 SKU 가 없어 확정 FEFO 가 제품(product_id) 단위로 LOT 을 골랐다. 한 제품에 SKU 가 여럿이면
 *   (예: 하늘사랑 1.6kg — SKU208 박스·SKU209 박스·SKU 없는 kg LOT) 다른 SKU·다른 단위의 LOT 에서 빠질 수 있었다.
 * 규칙
 *   - SKU 를 지정했으면: 이 회사 SKU 인지, 제품(item_master.legacy_product_id)과 맞는지 확인. 제품은 SKU 에서 정한다.
 *   - SKU 없이 제품만: 그 제품의 활성 SKU 가 하나면 그것, 없으면 SKU 없이(기존 동작),
 *     여럿이면 "SKU 를 선택하세요" — 확정을 막는다 (틀린 SKU 에서 빼는 것보다 낫다).
 *   - 정체성: SKU → item_master(id) → legacy_product_id = h_products_v2.id (재고·LOT 의 product_id).
 *     item_master.id 와 h_products_v2.id 를 같다고 보지 않는다 (11-identity-policy-v3).
 */

export type SaleSkuInfo = { skuId: number; productId: number | null; salesUnit: string | null; skuName: string | null; ownProductUnlinked?: boolean };

export type SaleSkuResolution =
  | { kind: "sku"; sku: SaleSkuInfo }
  | { kind: "none" }
  | { kind: "ambiguous"; candidates: Array<{ id: number; skuName: string | null }> };

type Exec = { execute: (sql: string, params?: any[]) => Promise<any> };

const rows = (r: any): any[] => (Array.isArray(r?.[0]) ? r[0] : []);

/** SKU 한 건 — 이 회사 것, 활성 여부와 상관없이 (과거 매출 표시용) */
export async function loadSaleSku(conn: Exec, tenantId: number, skuId: number): Promise<SaleSkuInfo | null> {
  const r = rows(await conn.execute(
    `SELECT ps.id, ps.sku_name, ps.sales_unit, im.legacy_product_id, im.item_type, im.item_name
       FROM product_skus ps
       LEFT JOIN item_master im ON im.id = ps.item_id AND im.tenant_id = ps.tenant_id
      WHERE ps.id = ? AND ps.tenant_id = ? LIMIT 1`,
    [skuId, tenantId],
  ))[0];
  if (!r) return null;
  return {
    skuId: Number(r.id),
    productId: r.legacy_product_id != null ? Number(r.legacy_product_id) : null,
    salesUnit: r.sales_unit ?? null,
    skuName: r.sku_name ?? null,
    ownProductUnlinked: r.item_type === "own_product" && r.legacy_product_id == null,
  };
}

/**
 * 매출의 SKU 정하기.
 * @throws SKU 가 이 회사 것이 아니거나, 지정한 제품과 SKU 의 제품이 다르면
 */
export async function resolveSaleSku(conn: Exec, tenantId: number, p: { skuId?: number | null; productId?: number | null }): Promise<SaleSkuResolution> {
  if (p.skuId) {
    const sku = await loadSaleSku(conn, tenantId, Number(p.skuId));
    if (!sku) throw new Error(`SKU #${p.skuId} 를 찾을 수 없습니다 (이 회사 SKU 가 아님).`);
    // ★ 2026-10-17 (지티 브라우저 검증 F08): 자사제품 SKU 인데 재고 제품과 연결이 없으면 product_id 없는 매출을 만들거나 확정하지 않는다
    if (sku.ownProductUnlinked) throw new Error(`SKU '${sku.skuName ?? sku.skuId}' 의 품목이 재고 제품과 연결돼 있지 않습니다 — 품목 마스터 연결을 먼저 확인하세요.`);
    if (p.productId && sku.productId && Number(p.productId) !== sku.productId) {
      throw new Error(`SKU #${sku.skuId}(${sku.skuName ?? ""}) 는 제품 #${sku.productId} 의 SKU 입니다 — 매출 제품 #${p.productId} 와 다릅니다.`);
    }
    return { kind: "sku", sku };
  }
  if (!p.productId) return { kind: "none" };
  const list = rows(await conn.execute(
    `SELECT ps.id, ps.sku_name, ps.sales_unit, im.legacy_product_id
       FROM product_skus ps
       JOIN item_master im ON im.id = ps.item_id AND im.tenant_id = ps.tenant_id
      WHERE ps.tenant_id = ? AND ps.is_active = 1 AND im.legacy_product_id = ? AND im.item_type = 'own_product'
      ORDER BY ps.is_default DESC, ps.id ASC`,
    [tenantId, Number(p.productId)],
  ));
  if (list.length === 0) return { kind: "none" };
  if (list.length === 1) {
    const r = list[0];
    return { kind: "sku", sku: { skuId: Number(r.id), productId: Number(r.legacy_product_id), salesUnit: r.sales_unit ?? null, skuName: r.sku_name ?? null } };
  }
  return { kind: "ambiguous", candidates: list.map((r) => ({ id: Number(r.id), skuName: r.sku_name ?? null })) };
}
