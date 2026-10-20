/**
 * 품목 선택창(material.list)에서 고른 원료의 LOT 찾기 (2026-10-20, 번호 체계 2b)
 *
 * 품목 선택창의 id 는 품목 번호(item_master), LOT·재고 목록의 materialId 는 재고 원료 번호(h_materials) — 종류가 다르다.
 * 둘을 숫자로 직접 비교하면 연결된 원료의 LOT 이 사라지거나(번호가 다를 때), 다른 원료의 LOT 이 보인다(숫자가 우연히 같을 때).
 * 그래서 목록이 함께 주는 FK 연결값(inventoryMaterialId)으로만 맞춘다. 연결이 없으면 빈 목록 — 숫자로 추측하지 않는다.
 */
export function lotsOfInventoryMaterial<T extends { materialId?: unknown; status?: unknown }>(
  lots: readonly T[] | undefined | null,
  inventoryMaterialId: number | null | undefined,
): T[] {
  if (inventoryMaterialId == null || !(Number(inventoryMaterialId) > 0)) return [];
  return (lots ?? []).filter(
    (l) => Number(l.materialId) === Number(inventoryMaterialId) && (l.status === "available" || !l.status),
  );
}

/** 품목은 골랐는데 재고 원료와 연결이 없을 때 화면 안내 */
export const UNLINKED_MATERIAL_NOTICE = "이 품목은 재고 원료와 연결되지 않아 재고를 다룰 수 없습니다 — 원재료 정보에서 품목 연결을 확인하세요.";
