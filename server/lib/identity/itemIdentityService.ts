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
import { resolveMaterialIds } from "../production/materialIdResolver";
import { resolveBomProductIds, bomProductV2IdExpr, inPlaceholders } from "../production/bomProductResolver";

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
export async function toProductionProductId(itemMasterId: number, tenantId: number, c?: IdentityConn): Promise<number | null> {
  const [rows] = await (await conn(c)).execute<any[]>(
    `SELECT im.legacy_product_id
       FROM item_master im
       JOIN h_products_v2 p ON p.id = im.legacy_product_id AND p.tenant_id = im.tenant_id
      WHERE im.id = ? AND im.tenant_id = ? AND im.item_type IN ${PRODUCT_TYPES} LIMIT 1`,
    [itemMasterId, tenantId],
  );
  return num((rows as any[])[0]?.legacy_product_id);
}

/** h_products_v2.id → item_master.id (BOM·SKU 가 쓰는 id). 연결 없으면 null. */
export async function toItemMasterIdFromProduct(productionProductId: number, tenantId: number, c?: IdentityConn): Promise<number | null> {
  const [rows] = await (await conn(c)).execute<any[]>(
    `SELECT id FROM item_master
      WHERE tenant_id = ? AND legacy_product_id = ? AND item_type IN ${PRODUCT_TYPES}
      ORDER BY is_active DESC, id ASC LIMIT 1`,
    [tenantId, productionProductId],
  );
  return num((rows as any[])[0]?.id);
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

/** BOM(h_mf_reports) 을 찾을 때 쓸 product_id 후보 — [v2 id, item_master id ...] (bomProductResolver 위임) */
export { resolveBomProductIds, bomProductV2IdExpr };

// ────────────────────────────────────────────────────────────────────────────
// 원재료: item_master ↔ h_materials
// ────────────────────────────────────────────────────────────────────────────

/**
 * 어느 네임스페이스인지 모르는 material_id → h_materials.id (LOT·재고·원장이 쓰는 id).
 * materialIdResolver 위임: h_materials 직접 일치 → legacy_material_id FK → (폴백) 이름 매칭.
 * 신뢰 경로(FK)가 아니면 `trusted=false` 로 알려 준다.
 */
export async function toInventoryMaterialId(
  anyMaterialId: number,
  tenantId: number,
  c?: IdentityConn,
): Promise<{ id: number; trusted: boolean; source: string; itemMasterId: number | null }> {
  const r = await resolveMaterialIds(anyMaterialId, tenantId, await conn(c));
  return {
    id: r.canonicalId,
    trusted: r.source === "hm_direct" || r.source === "im_to_hm_byfk",
    source: r.source,
    itemMasterId: r.itemMasterId,
  };
}

/** h_materials.id → item_master.id. 연결 없으면 null. */
export async function toItemMasterIdFromMaterial(inventoryMaterialId: number, tenantId: number, c?: IdentityConn): Promise<number | null> {
  const [rows] = await (await conn(c)).execute<any[]>(
    `SELECT id FROM item_master
      WHERE tenant_id = ? AND legacy_material_id = ? AND item_type IN ${MATERIAL_TYPES}
      ORDER BY is_active DESC, id ASC LIMIT 1`,
    [tenantId, inventoryMaterialId],
  );
  return num((rows as any[])[0]?.id);
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
