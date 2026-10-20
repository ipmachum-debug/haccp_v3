/**
 * ItemIdentityService — 품목 정체성 변환의 단일 진입점
 *
 * 정책: docs/architecture/11-identity-policy-v3.md (v3 개편 0단계, 2026-10-12)
 *
 *   item_master (정체성)  ──legacy_product_id──▶ h_products_v2 (제품 상세)   ┐ 수량 세계:
 *                        ──legacy_material_id─▶ h_materials (원재료 상세)   ┘ 배치·투입·LOT·재고·원장
 *   BOM(h_mf_*) · SKU · 카탈로그 = item_master id
 *
 * 규칙
 *   - 숫자 id 하나만 들고 여러 테이블에 JOIN 하지 않는다. 어느 네임스페이스의 id 인지
 *     이 서비스의 함수 이름이 말해 준다.
 *   - `item_master.id = h_products_v2.id` / `= h_materials.id` 를 전제하지 않는다
 *     (덤프 실측: 818/885 가 우연히 같고, id 범위 317~716 vs 1~327 이 1건 겹침).
 *   - 변환 실패는 null 로 돌려주고 호출측이 결정한다. 이름 매칭 같은 추측은 하지 않는다
 *     (원재료는 materialIdResolver 의 FK 우선 경로만 신뢰 경로로 본다).
 *
 * 이 파일은 기존 두 resolver 의 façade 다. 구현은 그쪽에 있고, 신규 코드는 이 파일만 import 한다.
 *   - server/lib/production/materialIdResolver.ts  (원재료: item_master ↔ h_materials)
 *   - server/lib/production/bomProductResolver.ts  (제품: h_products_v2 ↔ item_master, BOM 조회용)
 */

import type { Pool, PoolConnection, Connection } from "mysql2/promise";
import { getRawConnection } from "../../db/connection";
import { resolvePriceFallback, clearMaterialIdResolverCache } from "../production/materialIdResolver";
import { resolveBomProductIds, bomItemIdsOfProduct, bomProductV2IdExpr, inPlaceholders, selectBomVersion } from "../production/bomProductResolver";
import type { ItemMasterId, ProductionProductId, InventoryMaterialId } from "../../../shared/identity/itemIds";
export type { ItemMasterId, ProductionProductId, InventoryMaterialId } from "../../../shared/identity/itemIds";
export { asItemMasterId, asProductionProductId, asInventoryMaterialId } from "../../../shared/identity/itemIds";

export type IdentityConn = Pick<Pool | PoolConnection | Connection, "execute">;

/** 어느 테이블의 id 인지 항상 같이 다닌다 */
export type IdNamespace = "item_master" | "h_products_v2" | "h_materials";

export interface ItemRef {
  namespace: IdNamespace;
  id: number;
}

export interface ItemIdentity {
  tenantId: number;
  itemMasterId: number;
  itemType: "raw_material" | "own_product" | "external_product" | "subsidiary";
  itemCode: string;
  itemName: string;
  baseUnit: string | null;
  /** 제품 상세 (own_product / external_product) — 없으면 null */
  productionProductId: number | null;
  /** 원재료 상세 (raw_material / subsidiary) — 없으면 null */
  inventoryMaterialId: number | null;
}

const PRODUCT_TYPES = "('own_product', 'external_product')";
const MATERIAL_TYPES = "('raw_material', 'subsidiary')";

async function conn(c?: IdentityConn): Promise<IdentityConn> {
  return c ?? (await getRawConnection());
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ────────────────────────────────────────────────────────────────────────────
// 조회
// ────────────────────────────────────────────────────────────────────────────

/** item_master 한 건 + 연결된 상세 id */
export async function getItem(itemMasterId: number, tenantId: number, c?: IdentityConn): Promise<ItemIdentity | null> {
  const [rows] = await (await conn(c)).execute<any[]>(
    `SELECT id, tenant_id, item_type, item_code, item_name, base_unit, legacy_product_id, legacy_material_id
       FROM item_master WHERE id = ? AND tenant_id = ? LIMIT 1`,
    [itemMasterId, tenantId],
  );
  const r = (rows as any[])[0];
  if (!r) return null;
  return {
    tenantId,
    itemMasterId: Number(r.id),
    itemType: r.item_type,
    itemCode: r.item_code,
    itemName: r.item_name,
    baseUnit: r.base_unit ?? null,
    productionProductId: num(r.legacy_product_id),
    inventoryMaterialId: num(r.legacy_material_id),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 제품: item_master ↔ h_products_v2
// ────────────────────────────────────────────────────────────────────────────

/** item_master.id → h_products_v2.id (배치·CCP 가 쓰는 id). 연결 없으면 null. */
export async function toProductionProductId(itemMasterId: ItemMasterId, tenantId: number, c?: IdentityConn): Promise<ProductionProductId | null> {
  const [rows] = await (await conn(c)).execute<any[]>(
    `SELECT im.legacy_product_id
       FROM item_master im
       JOIN h_products_v2 p ON p.id = im.legacy_product_id AND p.tenant_id = im.tenant_id
      WHERE im.id = ? AND im.tenant_id = ? AND im.item_type IN ${PRODUCT_TYPES} LIMIT 1`,
    [itemMasterId, tenantId],
  );
  return num((rows as any[])[0]?.legacy_product_id) as ProductionProductId | null;
}

/** h_products_v2.id → item_master.id (BOM·SKU 가 쓰는 id). 연결 없으면 null. */
export async function toItemMasterIdFromProduct(productionProductId: ProductionProductId, tenantId: number, c?: IdentityConn): Promise<ItemMasterId | null> {
  const [rows] = await (await conn(c)).execute<any[]>(
    `SELECT id FROM item_master
      WHERE tenant_id = ? AND legacy_product_id = ? AND item_type IN ${PRODUCT_TYPES}
      ORDER BY is_active DESC, id ASC LIMIT 1`,
    [tenantId, productionProductId],
  );
  return num((rows as any[])[0]?.id) as ItemMasterId | null;
}

/**
 * 여러 item_master.id → h_products_v2.id 일괄 변환 (파서·목록 화면용).
 * 반환 Map 에 없는 키 = 연결 없음.
 */
export async function toProductionProductIds(itemMasterIds: number[], tenantId: number, c?: IdentityConn): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  const ids = Array.from(new Set(itemMasterIds.filter((n) => Number.isFinite(n) && n > 0)));
  if (ids.length === 0) return out;
  const [rows] = await (await conn(c)).execute<any[]>(
    `SELECT im.id, im.legacy_product_id
       FROM item_master im
       JOIN h_products_v2 p ON p.id = im.legacy_product_id AND p.tenant_id = im.tenant_id
      WHERE im.tenant_id = ? AND im.id IN (${inPlaceholders(ids)}) AND im.item_type IN ${PRODUCT_TYPES}`,
    [tenantId, ...ids],
  );
  for (const r of rows as any[]) {
    const v = num(r.legacy_product_id);
    if (v) out.set(Number(r.id), v);
  }
  return out;
}

/** BOM(h_mf_reports) 을 찾을 때 — 생산 제품 번호 → 그 제품의 정체성 번호들 (FK 만, bomProductResolver 위임) */
export { resolveBomProductIds, bomItemIdsOfProduct, bomProductV2IdExpr, inPlaceholders, selectBomVersion };
/** 단가 4단 폴백 (마지막 입고가 → h_materials → item_master). 자재 id 변환과 같이 쓰여 여기서 함께 노출 */
export { resolvePriceFallback, clearMaterialIdResolverCache };

// ────────────────────────────────────────────────────────────────────────────
// 원재료: item_master ↔ h_materials
// ────────────────────────────────────────────────────────────────────────────

/**
 * 수량 세계 칸(생산 건 투입 줄 h_batch_inputs.material_id 등)의 원료 번호 → 재고 원료 번호 (2026-10-20, 번호 체계 2c).
 *   정책(§3-1): 이 칸은 재고 원료 번호 칸이다 — 지금 생산 건을 만드는 경로(BOM → 투입 줄)는 FK 로 바꾼 재고 번호를 쓴다.
 *     이 회사에 그 재고 원료가 있으면 → 그 번호 (같은 숫자가 다른 원료의 품목 번호여도 재고 번호로 읽는다 — 칸의 종류가 재고)
 *     없으면 옛 줄의 품목 번호일 수 있다 → 그 품목의 FK 로만 (재고 번호로는 읽힐 수 없으니 모호하지 않다)
 *     둘 다 아니면 → 연결 없음 (원래 숫자를 재고 번호처럼 써서 출고·LOT 조회를 이어 가지 않는다)
 *   이름 매칭·캐시 없음.
 */
export async function inventoryMaterialIdOfStockLine(stored: number, tenantId: number, c?: IdentityConn): Promise<StoredMaterialResolution> {
  const n = num(stored);
  if (n == null) return { ok: false, reason: "missing", message: "원료 번호가 없습니다." };
  const cx = await conn(c);
  const [hm] = await cx.execute<any[]>(`SELECT id FROM h_materials WHERE id = ? AND tenant_id = ? LIMIT 1`, [n, tenantId]);
  if ((hm as any[])[0]) {
    return { ok: true, inventoryMaterialId: n as InventoryMaterialId, itemMasterId: await toItemMasterIdFromMaterial(n as InventoryMaterialId, tenantId, cx) };
  }
  const fk = await inventoryMaterialIdOfItem(n as ItemMasterId, tenantId, cx);
  if (fk != null) return { ok: true, inventoryMaterialId: fk, itemMasterId: n as ItemMasterId };
  const [im] = await cx.execute<any[]>(`SELECT id FROM item_master WHERE id = ? AND tenant_id = ? LIMIT 1`, [n, tenantId]);
  return (im as any[])[0]
    ? { ok: false, reason: "unlinked", message: `품목(번호 ${n})이 재고 원료와 연결되지 않았습니다 — 원재료 정보에서 품목 연결을 확인하세요.` }
    : { ok: false, reason: "missing", message: `원료(번호 ${n})를 이 회사에서 찾을 수 없습니다.` };
}

/**
 * 정체성 원료 번호 → 재고 원료 번호 — FK(legacy_material_id) 만 (2026-10-20, 번호 체계 2단계).
 * 화면이 품목 목록(material.list = item_master)에서 고른 원료처럼 '정체성 번호가 분명한' 곳에서 쓴다. 연결 없으면 null (추측 안 함).
 */
export async function inventoryMaterialIdOfItem(itemMasterId: ItemMasterId, tenantId: number, c?: IdentityConn): Promise<InventoryMaterialId | null> {
  const [rows] = await (await conn(c)).execute<any[]>(
    `SELECT im.legacy_material_id FROM item_master im
       JOIN h_materials hm ON hm.id = im.legacy_material_id AND hm.tenant_id = im.tenant_id
      WHERE im.id = ? AND im.tenant_id = ? AND im.item_type IN ${MATERIAL_TYPES} LIMIT 1`,
    [itemMasterId, tenantId],
  );
  return num((rows as any[])[0]?.legacy_material_id) as InventoryMaterialId | null;
}

/**
 * 원료 번호 + 그 번호의 종류 (2026-10-20, 번호 체계 2b — 입고·조정·설정 입력 계약).
 *   item      = 품목 선택창(material.list = item_master) 에서 고른 번호 → FK(legacy_material_id) 로만 재고 번호로
 *   inventory = 재고·LOT·실사 목록(h_materials) 에서 온 번호 → 이 회사 h_materials 에 있는지만 확인, 그대로
 * 종류는 화면/API 가 안다 — 숫자를 보고 추측하지 않는다 (같은 숫자가 다른 원료의 다른 종류 번호일 수 있음).
 */
export type MaterialRef =
  | { kind: "item"; id: ItemMasterId }
  | { kind: "inventory"; id: InventoryMaterialId };

export class MaterialRefError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MaterialRefError";
  }
}

/** API 입력 { itemMasterId } 또는 { inventoryMaterialId } — 정확히 하나 (둘 다·없음은 거부) */
export function materialRefOf(input: { itemMasterId?: number | null; inventoryMaterialId?: number | null }): MaterialRef {
  const im = num(input.itemMasterId);
  const inv = num(input.inventoryMaterialId);
  if ((im == null) === (inv == null)) throw new MaterialRefError("원료 번호는 품목 번호(itemMasterId) 또는 재고 원료 번호(inventoryMaterialId) 중 하나만 보내야 합니다.");
  return im != null ? { kind: "item", id: im as ItemMasterId } : { kind: "inventory", id: inv as InventoryMaterialId };
}

/**
 * 조회 화면의 원료 거르기 (2026-10-20, 번호 체계 2d) — 번호를 안 줬으면 undefined(거르지 않음),
 * 줬는데 연결 없음·다른 회사면 null(그 원료 자료 없음 — 숫자로 다른 원료 자료를 보여 주지 않음), 아니면 재고 원료 번호.
 */
export async function inventoryMaterialIdForQuery(
  input: { itemMasterId?: number | null; inventoryMaterialId?: number | null }, tenantId: number, c?: IdentityConn,
): Promise<InventoryMaterialId | null | undefined> {
  if (num(input.itemMasterId) == null && num(input.inventoryMaterialId) == null) return undefined;
  try {
    return await inventoryMaterialIdOfRef(materialRefOf(input), tenantId, c);
  } catch (e) {
    if (e instanceof MaterialRefError) return null;
    throw e;
  }
}

/** 원료 번호(종류 명시) → 이 회사의 재고 원료 번호. 연결 없음·다른 회사·없는 번호는 쓰기 전에 거부 (추측·이름 매칭 없음) */
export async function inventoryMaterialIdOfRef(ref: MaterialRef, tenantId: number, c?: IdentityConn): Promise<InventoryMaterialId> {
  if (ref.kind === "item") {
    const id = await inventoryMaterialIdOfItem(ref.id, tenantId, c);
    if (id == null) throw new MaterialRefError(`이 품목(품목 번호 ${ref.id})은 재고 원료와 연결되지 않았습니다 — 원재료 정보에서 품목 연결을 확인하세요.`);
    return id;
  }
  const [rows] = await (await conn(c)).execute<any[]>(`SELECT id FROM h_materials WHERE id = ? AND tenant_id = ? LIMIT 1`, [ref.id, tenantId]);
  if (!(rows as any[])[0]) throw new MaterialRefError(`재고 원료(번호 ${ref.id})를 이 회사에서 찾을 수 없습니다.`);
  return ref.id;
}

export type StoredMaterialResolution =
  | { ok: true; inventoryMaterialId: InventoryMaterialId; itemMasterId: ItemMasterId | null }
  | { ok: false; reason: "ambiguous" | "unlinked" | "missing"; message: string };

/**
 * 저장된 칸의 원료 번호 → 재고 원료 번호 — 저장값의 종류가 섞인 옛 칸 전용 (2026-10-20, 번호 체계 2b).
 *   purchase_order_lines.material_id · accounting_purchases.material_id 는 경로·시기에 따라 품목 번호도 재고 번호도 들어 있고,
 *   어느 쪽인지 적힌 칸이 없다. 그래서 두 해석이 '같은 재고 원료' 를 가리킬 때만 쓰고, 다르면 쓰지 않는다 (추측 안 함):
 *     품목 N 의 FK = X, 재고 N 없음      → X        (품목 번호로만 읽힘)
 *     품목 N 없음, 재고 N 있음           → N        (재고 번호로만 읽힘 — 옛 줄)
 *     품목 N 의 FK = N, 재고 N 있음      → N        (두 해석이 같음)
 *     품목 N 의 FK = X≠N, 재고 N 있음    → 모호 — 거부
 *     품목 N 연결 없음, 재고 N 있음      → 모호 — 거부
 *     품목 N 연결 없음, 재고 N 없음      → 연결 없음 — 거부
 *   새로 쓰는 값은 종류가 분명한 입력(MaterialRef)으로 받는다. 이 함수는 이미 저장된 값을 읽을 때만.
 */
export async function inventoryMaterialIdOfStoredMixed(stored: number, tenantId: number, c?: IdentityConn): Promise<StoredMaterialResolution> {
  const n = num(stored);
  if (n == null) return { ok: false, reason: "missing", message: "원료 번호가 없습니다." };
  const cx = await conn(c);
  const [im] = await cx.execute<any[]>(
    // 품목 종류와 상관없이 '품목 번호로 읽히는지' 를 본다 (외부 제품 품목 번호를 재고 번호로 잘못 읽지 않게). 재고 연결은 원료 종류만.
    `SELECT im.id, CASE WHEN im.item_type IN ${MATERIAL_TYPES} THEN hm.id END AS fk FROM item_master im
       LEFT JOIN h_materials hm ON hm.id = im.legacy_material_id AND hm.tenant_id = im.tenant_id
      WHERE im.id = ? AND im.tenant_id = ? LIMIT 1`,
    [n, tenantId],
  );
  const [hm] = await cx.execute<any[]>(`SELECT id FROM h_materials WHERE id = ? AND tenant_id = ? LIMIT 1`, [n, tenantId]);
  const item = (im as any[])[0];
  const fk = num(item?.fk);
  const inv = (hm as any[])[0] ? n : null;
  if (item && fk != null && (inv == null || fk === inv)) {
    return { ok: true, inventoryMaterialId: fk as InventoryMaterialId, itemMasterId: n as ItemMasterId };
  }
  if (!item && inv != null) {
    return { ok: true, inventoryMaterialId: inv as InventoryMaterialId, itemMasterId: await toItemMasterIdFromMaterial(inv as InventoryMaterialId, tenantId, cx) };
  }
  if (inv != null) {
    return { ok: false, reason: "ambiguous", message: `원료 번호 ${n} 이(가) 품목 번호로도 재고 원료 번호로도 읽혀 서로 다른 원료를 가리킵니다 — 이 줄의 원료를 다시 선택하세요.` };
  }
  return item
    ? { ok: false, reason: "unlinked", message: `품목(번호 ${n})이 재고 원료와 연결되지 않았습니다 — 원재료 정보에서 품목 연결을 확인하세요.` }
    : { ok: false, reason: "missing", message: `원료(번호 ${n})를 이 회사에서 찾을 수 없습니다.` };
}

/**
 * 품목 번호를 '종류 표시 없는 옛 칸'(발주 줄 등)에 새로 쓸 때 저장할 숫자 — 다시 읽어도(inventoryMaterialIdOfStoredMixed) 같은 원료로 읽히는 쪽.
 *   품목 번호가 그대로 안전하면 품목 번호, 다른 원료의 재고 번호와 겹치면 그 품목의 재고 원료 번호(FK)가 안전할 때 그 번호.
 *   둘 다 모호하면 저장 전에 거부. 재고 원료와 연결 안 된 품목은(겹치지 않을 때) 품목 번호 그대로 — 입고 때 '연결 없음' 으로 멈춘다.
 */
export async function storableMaterialNumberOfItem(itemMasterId: ItemMasterId, tenantId: number, c?: IdentityConn): Promise<number> {
  const cx = await conn(c);
  const [im] = await cx.execute<any[]>(`SELECT id FROM item_master WHERE id = ? AND tenant_id = ? LIMIT 1`, [itemMasterId, tenantId]);
  if (!(im as any[])[0]) throw new MaterialRefError(`품목(번호 ${itemMasterId})을 이 회사에서 찾을 수 없습니다.`);
  const asIs = await inventoryMaterialIdOfStoredMixed(itemMasterId, tenantId, cx);
  if (asIs.ok && Number(asIs.itemMasterId) === Number(itemMasterId)) return itemMasterId;
  if (!asIs.ok && asIs.reason === "unlinked") return itemMasterId;
  const fk = await inventoryMaterialIdOfItem(itemMasterId, tenantId, cx);
  if (fk != null) {
    const viaFk = await inventoryMaterialIdOfStoredMixed(fk, tenantId, cx);
    if (viaFk.ok && Number(viaFk.inventoryMaterialId) === Number(fk)) return fk;
  }
  throw new MaterialRefError(`이 품목(번호 ${itemMasterId})은 번호가 다른 원료와 겹쳐 발주 줄에 안전하게 저장할 수 없습니다 — 운영 담당에게 알려 주세요.`);
}

/** h_materials.id → item_master.id. 연결 없으면 null. */
export async function toItemMasterIdFromMaterial(inventoryMaterialId: InventoryMaterialId, tenantId: number, c?: IdentityConn): Promise<ItemMasterId | null> {
  const [rows] = await (await conn(c)).execute<any[]>(
    `SELECT id FROM item_master
      WHERE tenant_id = ? AND legacy_material_id = ? AND item_type IN ${MATERIAL_TYPES}
      ORDER BY is_active DESC, id ASC LIMIT 1`,
    [tenantId, inventoryMaterialId],
  );
  return num((rows as any[])[0]?.id) as ItemMasterId | null;
}

// ────────────────────────────────────────────────────────────────────────────
// 검증
// ────────────────────────────────────────────────────────────────────────────

/**
 * 어떤 테이블에 들어갈 id 가 그 네임스페이스에 실제로 존재하는지 확인.
 * FK 가 걸리기 전(11 문서 4단계) 까지 쓰기 경로에서 호출해 고아 생성을 막는다.
 */
export async function assertExists(ref: ItemRef, tenantId: number, c?: IdentityConn): Promise<void> {
  const table = ref.namespace;
  const [rows] = await (await conn(c)).execute<any[]>(
    `SELECT 1 FROM ${table} WHERE id = ? AND tenant_id = ? LIMIT 1`,
    [ref.id, tenantId],
  );
  if ((rows as any[]).length === 0) {
    throw new Error(`[ItemIdentity] ${table}#${ref.id} 가 tenant=${tenantId} 에 없습니다. (네임스페이스 확인: 11-identity-policy-v3.md)`);
  }
}
