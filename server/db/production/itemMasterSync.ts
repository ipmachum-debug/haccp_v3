/**
 * 제품 마스터(h_products_v2) ↔ 통합 품목 마스터(item_master) 동기화 헬퍼
 *
 * 2026-04-22 버그 수정: 기존 product.router.ts 는 sync 를 try/catch 로 감싸고
 * 에러를 조용히 삼켜서 item_master 에 누락된 제품이 발생해도 사용자가 모르는 문제가 있었음.
 * (예: 제품 30086 은 h_products_v2 에 있지만 item_master 엔 없어 SKU 등록 불가)
 *
 * 이 헬퍼는 다음 3가지 경우를 모두 처리하는 upsert:
 *   1) legacyProductId 로 이미 연결된 행이 있으면 → UPDATE (필드 동기화)
 *   2) itemCode(+tenantId) 로 다른 경로로 먼저 생긴 행이 있으면 → legacyProductId 연결 + UPDATE
 *   3) 없으면 → INSERT
 *
 * 진짜 예상치 못한 에러는 상위로 throw (라우터에서 적절히 처리).
 */
import type { MySql2Database } from "drizzle-orm/mysql2";
import { and, eq } from "drizzle-orm";

export type SyncAction = "inserted" | "linked" | "updated" | "skipped";

export interface SyncProductParams {
  tenantId: number;
  productId: number;
  productCode: string;
  productName: string;
  category?: string | null;
  unit?: string | null;
  shelfLifeDays?: number | null;
  description?: string | null;
  isActive?: number;
}

export async function syncProductToItemMaster(
  db: MySql2Database<any>,
  params: SyncProductParams,
): Promise<SyncAction> {
  const { itemMaster } = await import("../../../drizzle/schema/schema_dual_unit.js");

  const baseUnit = params.unit || "kg";
  const isActive = params.isActive ?? 1;

  // 1) legacyProductId 매칭 우선 (이미 연결된 상태)
  const linkedRows = await db
    .select({ id: itemMaster.id })
    .from(itemMaster)
    .where(
      and(
        eq(itemMaster.legacyProductId, params.productId),
        eq(itemMaster.tenantId, params.tenantId),
      ),
    )
    .limit(1);

  if (linkedRows.length > 0) {
    await db
      .update(itemMaster)
      .set({
        itemCode: params.productCode,
        itemName: params.productName,
        category: params.category ?? null,
        baseUnit,
        shelfLifeDays: params.shelfLifeDays ?? null,
        description: params.description ?? null,
        isActive,
      })
      .where(eq(itemMaster.id, linkedRows[0].id));
    return "updated";
  }

  // 2) itemCode+tenantId 매칭 (다른 경로로 먼저 생긴 행)
  const sameCodeRows = await db
    .select({ id: itemMaster.id })
    .from(itemMaster)
    .where(
      and(
        eq(itemMaster.itemCode, params.productCode),
        eq(itemMaster.tenantId, params.tenantId),
      ),
    )
    .limit(1);

  if (sameCodeRows.length > 0) {
    await db
      .update(itemMaster)
      .set({
        legacyProductId: params.productId,
        itemName: params.productName,
        itemType: "own_product",
        category: params.category ?? null,
        baseUnit,
        shelfLifeDays: params.shelfLifeDays ?? null,
        description: params.description ?? null,
        isActive,
      })
      .where(eq(itemMaster.id, sameCodeRows[0].id));
    return "linked";
  }

  // 3) 신규 INSERT
  await db.insert(itemMaster).values({
    tenantId: params.tenantId,
    itemCode: params.productCode,
    itemName: params.productName,
    itemType: "own_product",
    category: params.category ?? null,
    baseUnit,
    shelfLifeDays: params.shelfLifeDays ?? null,
    description: params.description ?? null,
    legacyProductId: params.productId,
    isActive,
  });
  return "inserted";
}

/**
 * 비활성화 동기화 (제품 soft delete 시 호출).
 * legacyProductId 로 연결된 item_master 행만 비활성화.
 */
export async function deactivateLinkedItemMaster(
  db: MySql2Database<any>,
  tenantId: number,
  productId: number,
): Promise<void> {
  const { itemMaster } = await import("../../../drizzle/schema/schema_dual_unit.js");
  await db
    .update(itemMaster)
    .set({ isActive: 0 })
    .where(
      and(
        eq(itemMaster.legacyProductId, productId),
        eq(itemMaster.tenantId, tenantId),
      ),
    );
}
