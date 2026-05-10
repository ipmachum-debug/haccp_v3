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
 * 정방향 동기화: h_materials → item_master(raw_material)
 *
 * 2026-05-09 (PR #277): syncProductToItemMaster 의 raw_material 버전.
 * material.router.ts:update 등에서 h_materials 가 변경됐을 때
 * item_master 도 같이 갱신되도록 사용.
 *
 * 매칭 우선순위:
 *   1) legacyMaterialId = materialId 매칭 (기존 연결)
 *   2) id = materialId 매칭 (PR #269 패턴: id 동일)
 *   3) itemCode = materialCode 매칭 (다른 경로로 먼저 생긴 행)
 *   4) 신규 INSERT
 */
export interface SyncMaterialParams {
  tenantId: number;
  materialId: number;
  materialCode: string;
  materialName: string;
  category?: string | null;
  unit?: string | null;
  supplierId?: number | null;
  purchaseUnit?: string | null;
  purchaseConversionRate?: string | null;
  shelfLifeDays?: number | null;
  description?: string | null;
  isActive?: number;
}

export async function syncMaterialToItemMaster(
  db: MySql2Database<any>,
  params: SyncMaterialParams,
): Promise<SyncAction> {
  const { itemMaster } = await import("../../../drizzle/schema/schema_dual_unit.js");

  const baseUnit = params.unit || "kg";
  const isActive = params.isActive ?? 1;

  // 1) legacyMaterialId 매칭 우선 (기존 연결)
  const linkedRows = await db
    .select({ id: itemMaster.id })
    .from(itemMaster)
    .where(
      and(
        eq(itemMaster.legacyMaterialId, params.materialId),
        eq(itemMaster.tenantId, params.tenantId),
      ),
    )
    .limit(1);

  if (linkedRows.length > 0) {
    await db
      .update(itemMaster)
      .set({
        itemCode: params.materialCode,
        itemName: params.materialName,
        category: params.category ?? null,
        baseUnit,
        supplierId: params.supplierId ?? null,
        purchaseUnit: params.purchaseUnit ?? null,
        purchaseConversionRate: params.purchaseConversionRate ?? "1.0000",
        shelfLifeDays: params.shelfLifeDays ?? null,
        description: params.description ?? null,
        isActive,
      })
      .where(eq(itemMaster.id, linkedRows[0].id));
    return "updated";
  }

  // 2) id 동일 매칭 (PR #269 패턴: 신규 등록 시 item_master.id == h_materials.id)
  const sameIdRows = await db
    .select({ id: itemMaster.id, itemType: itemMaster.itemType })
    .from(itemMaster)
    .where(
      and(
        eq(itemMaster.id, params.materialId),
        eq(itemMaster.tenantId, params.tenantId),
      ),
    )
    .limit(1);

  if (sameIdRows.length > 0 && sameIdRows[0].itemType === "raw_material") {
    await db
      .update(itemMaster)
      .set({
        itemCode: params.materialCode,
        itemName: params.materialName,
        category: params.category ?? null,
        baseUnit,
        supplierId: params.supplierId ?? null,
        purchaseUnit: params.purchaseUnit ?? null,
        purchaseConversionRate: params.purchaseConversionRate ?? "1.0000",
        shelfLifeDays: params.shelfLifeDays ?? null,
        description: params.description ?? null,
        legacyMaterialId: params.materialId,
        isActive,
      })
      .where(eq(itemMaster.id, sameIdRows[0].id));
    return "updated";
  }

  // 3) itemCode + tenantId 매칭 (다른 경로로 먼저 생긴 행)
  const sameCodeRows = await db
    .select({ id: itemMaster.id })
    .from(itemMaster)
    .where(
      and(
        eq(itemMaster.itemCode, params.materialCode),
        eq(itemMaster.tenantId, params.tenantId),
      ),
    )
    .limit(1);

  if (sameCodeRows.length > 0) {
    await db
      .update(itemMaster)
      .set({
        legacyMaterialId: params.materialId,
        itemName: params.materialName,
        itemType: "raw_material",
        category: params.category ?? null,
        baseUnit,
        supplierId: params.supplierId ?? null,
        purchaseUnit: params.purchaseUnit ?? null,
        purchaseConversionRate: params.purchaseConversionRate ?? "1.0000",
        shelfLifeDays: params.shelfLifeDays ?? null,
        description: params.description ?? null,
        isActive,
      })
      .where(eq(itemMaster.id, sameCodeRows[0].id));
    return "linked";
  }

  // 4) 신규 INSERT
  await db.insert(itemMaster).values({
    tenantId: params.tenantId,
    itemCode: params.materialCode,
    itemName: params.materialName,
    itemType: "raw_material",
    category: params.category ?? null,
    baseUnit,
    supplierId: params.supplierId ?? null,
    purchaseUnit: params.purchaseUnit ?? null,
    purchaseConversionRate: params.purchaseConversionRate ?? "1.0000",
    shelfLifeDays: params.shelfLifeDays ?? null,
    description: params.description ?? null,
    legacyMaterialId: params.materialId,
    isActive,
  } as any);
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

/**
 * 역방향 동기화: item_master(own_product) → h_products_v2
 *
 * 2026-05-08 (PR #268): item_master 가 canonical 로 결정된 후,
 * itemMaster.router.ts:create 등 item_master 단독 INSERT 경로에서
 * h_products_v2 도 함께 채워주기 위한 헬퍼.
 *
 * docs/architecture/07-canonical-tables.md 의 Strangler Fig 1단계.
 *
 * 전략: h_products_v2 의 id 를 item_master.id 와 동일하게 INSERT —
 * 다운스트림 라우터들이 item_master.id 를 product_id 로 사용하므로
 * dual lookup (PR #266) 가 정상 매칭됨.
 *
 * 충돌 처리:
 *   1) h_products_v2.id == itemId 이미 존재 → UPDATE
 *   2) productCode 가 다른 row 에서 사용 중 (UNIQUE 충돌) → SKIP
 *   3) 그 외 → INSERT with explicit id
 */
export interface SyncItemMasterParams {
  tenantId: number;
  itemId: number;
  itemCode: string;
  itemName: string;
  category?: string | null;
  baseUnit?: string | null;
  shelfLifeDays?: number | null;
  description?: string | null;
  isActive?: number;
}

export async function syncItemMasterToProduct(
  db: MySql2Database<any>,
  params: SyncItemMasterParams,
): Promise<SyncAction> {
  const { hProductsV2 } = await import("../../../drizzle/schema/schema_main_products.js");

  const unit = params.baseUnit || "kg";
  const isActive = params.isActive ?? 1;

  // 1) 동일 id 존재 → UPDATE
  const existingById = await db
    .select({ id: hProductsV2.id })
    .from(hProductsV2)
    .where(
      and(
        eq(hProductsV2.id, params.itemId),
        eq(hProductsV2.tenantId, params.tenantId),
      ),
    )
    .limit(1);

  if (existingById.length > 0) {
    await db
      .update(hProductsV2)
      .set({
        productCode: params.itemCode,
        productName: params.itemName,
        category: params.category ?? null,
        unit,
        shelfLifeDays: params.shelfLifeDays ?? null,
        description: params.description ?? null,
        isActive,
      })
      .where(eq(hProductsV2.id, params.itemId));
    return "updated";
  }

  // 2) productCode 충돌 (UNIQUE) → SKIP (다른 id 가 같은 code 점유 중)
  const codeConflict = await db
    .select({ id: hProductsV2.id })
    .from(hProductsV2)
    .where(
      and(
        eq(hProductsV2.productCode, params.itemCode),
        eq(hProductsV2.tenantId, params.tenantId),
      ),
    )
    .limit(1);

  if (codeConflict.length > 0) {
    return "skipped";
  }

  // 3) 신규 INSERT — id 명시 (item_master.id 와 일치)
  await db.insert(hProductsV2).values({
    id: params.itemId,
    tenantId: params.tenantId,
    productCode: params.itemCode,
    productName: params.itemName,
    category: params.category ?? null,
    unit,
    shelfLifeDays: params.shelfLifeDays ?? null,
    description: params.description ?? null,
    isActive,
  } as any);
  return "inserted";
}

/**
 * 역방향 동기화: item_master(raw_material) → h_materials
 *
 * 2026-05-08 (PR #269): PR #268 의 own_product 패턴을 raw_material 로 확장.
 * BOM tree / inventory / 매입 라우터들이 h_materials.id 와 item_master.id
 * 어느 쪽이든 material_id 로 사용하므로 동일 id 로 INSERT.
 *
 * 충돌 처리:
 *   1) h_materials.id == itemId 이미 존재 → UPDATE
 *   2) materialCode 가 다른 row 에서 사용 중 (UNIQUE 충돌) → SKIP
 *   3) 그 외 → INSERT with explicit id (kind='RAW' 고정)
 */
export interface SyncItemMasterToMaterialParams {
  tenantId: number;
  itemId: number;
  itemCode: string;
  itemName: string;
  category?: string | null;
  baseUnit?: string | null;
  supplierId?: number | null;
  purchaseUnit?: string | null;
  purchaseConversionRate?: string | null;
  shelfLifeDays?: number | null;
  description?: string | null;
  isActive?: number;
}

export async function syncItemMasterToMaterial(
  db: MySql2Database<any>,
  params: SyncItemMasterToMaterialParams,
): Promise<SyncAction> {
  const { hMaterials } = await import("../../../drizzle/schema/schema_main_products.js");

  const unit = params.baseUnit || "kg";
  const isActive = params.isActive ?? 1;

  // 1) 동일 id 존재 → UPDATE
  const existingById = await db
    .select({ id: hMaterials.id })
    .from(hMaterials)
    .where(
      and(
        eq(hMaterials.id, params.itemId),
        eq(hMaterials.tenantId, params.tenantId),
      ),
    )
    .limit(1);

  if (existingById.length > 0) {
    await db
      .update(hMaterials)
      .set({
        materialCode: params.itemCode,
        materialName: params.itemName,
        category: params.category ?? null,
        unit,
        supplierId: params.supplierId ?? null,
        purchaseUnit: params.purchaseUnit ?? null,
        conversionRate: params.purchaseConversionRate ?? "1.0000",
        shelfLifeDays: params.shelfLifeDays ?? null,
        description: params.description ?? null,
        isActive,
      })
      .where(eq(hMaterials.id, params.itemId));
    return "updated";
  }

  // 2) materialCode 충돌 (UNIQUE) → SKIP
  const codeConflict = await db
    .select({ id: hMaterials.id })
    .from(hMaterials)
    .where(
      and(
        eq(hMaterials.materialCode, params.itemCode),
        eq(hMaterials.tenantId, params.tenantId),
      ),
    )
    .limit(1);

  if (codeConflict.length > 0) {
    return "skipped";
  }

  // 3) 신규 INSERT — id 명시
  await db.insert(hMaterials).values({
    id: params.itemId,
    tenantId: params.tenantId,
    materialCode: params.itemCode,
    materialName: params.itemName,
    kind: "RAW",
    category: params.category ?? null,
    unit,
    supplierId: params.supplierId ?? null,
    purchaseUnit: params.purchaseUnit ?? null,
    conversionRate: params.purchaseConversionRate ?? "1.0000",
    shelfLifeDays: params.shelfLifeDays ?? null,
    description: params.description ?? null,
    isActive,
  } as any);
  return "inserted";
}
