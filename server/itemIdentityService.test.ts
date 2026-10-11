import { describe, it, expect, vi } from "vitest";
import {
  getItem,
  toProductionProductId,
  toItemMasterIdFromProduct,
  toProductionProductIds,
  toItemMasterIdFromMaterial,
  assertExists,
} from "./lib/identity/itemIdentityService";

/** execute 호출마다 미리 정한 행을 돌려주는 가짜 커넥션 (호출 순서대로 소비) */
function fakeConn(...results: any[][]) {
  const calls: Array<{ sql: string; params: any[] }> = [];
  let i = 0;
  const execute = vi.fn(async (sql: string, params: any[] = []) => {
    calls.push({ sql: sql.replace(/\s+/g, " ").trim(), params });
    return [results[i++] ?? [], []] as any;
  });
  return { conn: { execute } as any, calls };
}

describe("ItemIdentityService — 제품 (item_master ↔ h_products_v2)", () => {
  it("toProductionProductId: legacy_product_id 로 v2 id 를 준다 (찹쌀떡 256 → 82)", async () => {
    const { conn, calls } = fakeConn([{ legacy_product_id: 82 }]);
    expect(await toProductionProductId(256, 2, conn)).toBe(82);
    expect(calls[0].sql).toContain("JOIN h_products_v2 p ON p.id = im.legacy_product_id");
    expect(calls[0].params).toEqual([256, 2]);
  });

  it("toProductionProductId: 연결 없으면 null — id 동일을 전제하지 않는다", async () => {
    const { conn } = fakeConn([]);
    expect(await toProductionProductId(316, 2, conn)).toBeNull();
  });

  it("toItemMasterIdFromProduct: v2 82 → item_master 256", async () => {
    const { conn, calls } = fakeConn([{ id: 256 }]);
    expect(await toItemMasterIdFromProduct(82, 2, conn)).toBe(256);
    expect(calls[0].params).toEqual([2, 82]);
  });

  it("toProductionProductIds: 일괄 변환, 연결 없는 키는 Map 에 없다", async () => {
    const { conn, calls } = fakeConn([
      { id: 256, legacy_product_id: 82 },
      { id: 263, legacy_product_id: 86 },
    ]);
    const m = await toProductionProductIds([256, 263, 316, 256, 0, NaN], 2, conn);
    expect([...m.entries()]).toEqual([[256, 82], [263, 86]]);
    expect(m.has(316)).toBe(false);
    // 중복/0/NaN 제거 후 IN (?, ?, ?)
    expect(calls[0].sql).toContain("IN (?, ?, ?)");
    expect(calls[0].params).toEqual([2, 256, 263, 316]);
  });

  it("toProductionProductIds: 빈 입력은 조회 없이 빈 Map", async () => {
    const { conn, calls } = fakeConn();
    expect((await toProductionProductIds([], 2, conn)).size).toBe(0);
    expect(calls).toHaveLength(0);
  });
});

describe("ItemIdentityService — 원재료 / 조회 / 검증", () => {
  it("toItemMasterIdFromMaterial: h_materials 615 → item_master 168", async () => {
    const { conn, calls } = fakeConn([{ id: 168 }]);
    expect(await toItemMasterIdFromMaterial(615, 2, conn)).toBe(168);
    expect(calls[0].sql).toContain("legacy_material_id = ?");
  });

  it("getItem: 상세 id 두 개를 함께 준다", async () => {
    const { conn } = fakeConn([{
      id: 256, tenant_id: 2, item_type: "own_product", item_code: "P-082", item_name: "찹쌀떡(떡마루)",
      base_unit: "kg", legacy_product_id: 82, legacy_material_id: null,
    }]);
    const it_ = await getItem(256, 2, conn);
    expect(it_).toMatchObject({ itemMasterId: 256, itemType: "own_product", productionProductId: 82, inventoryMaterialId: null });
  });

  it("assertExists: 없는 id 는 네임스페이스를 명시해 throw", async () => {
    const { conn } = fakeConn([]);
    await expect(assertExists({ namespace: "h_products_v2", id: 999 }, 2, conn)).rejects.toThrow("h_products_v2#999");
    const ok = fakeConn([{ 1: 1 }]);
    await expect(assertExists({ namespace: "h_materials", id: 615 }, 2, ok.conn)).resolves.toBeUndefined();
  });
});
