/**
 * Material ID 네임스페이스 변환 헬퍼
 *
 * ## 배경
 *
 * 시스템 안에서 `material_id` 컬럼은 두 가지 다른 ID 네임스페이스를 참조합니다:
 *
 * 1. **`h_materials.id`** (canonical) — 입고/lot/재고 시스템이 사용
 *    - `h_inventory_lots.material_id`
 *    - `h_inventory.material_id`
 *    - `h_inventory_transactions.material_id`
 *
 * 2. **`item_master.id`** (BOM/마스터) — 품목제조보고/배합비가 사용
 *    - `h_mf_ingredients.material_id`
 *    - 신규 배치 생성 시 `h_batch_inputs.material_id`로 그대로 들어감
 *
 * ## 문제
 *
 * 같은 자재(예: 멥쌀)가 두 테이블에 별개 ID로 등록됨:
 *   - `h_materials.id = 615` (멥쌀, unit_price=1050)
 *   - `item_master.id = 168` (멥쌀, default_unit_price=0)
 *
 * 신규 배치 생성 시 `h_batch_inputs.material_id = 168`로 저장되는데,
 * `autoMaterialIssue`가 `h_inventory_lots WHERE material_id = 168`로 조회하면
 * 결과가 0건 → 차감 실패 → unit_price=0 저장.
 *
 * ## 해결 (2026-07 P1 — 이름매칭 → FK 우선)
 *
 * item_master → h_materials 변환을 **신뢰할 FK `item_master.legacy_material_id`
 * 우선**으로 수행하고, FK 가 부재/dangling 일 때만 이름 문자열 매칭으로 폴백합니다.
 *   1. `h_materials.id = rawId` 직접 (hm_direct)
 *   2a. `item_master.legacy_material_id → h_materials.id` (im_to_hm_byfk, 신뢰)
 *   2b. FK 부재/dangling 시 `TRIM(item_name)=TRIM(material_name)` (im_to_hm_byname, 취약 폴백)
 *   3. 모두 실패 → rawId 그대로 (fallback_unchanged)
 *
 * 이름 매칭은 "멥쌀" vs "멥쌀(20kg)" 같은 사소한 차이로 깨져 차감이 단락되던
 * 근본 원인(docs/architecture/08-inventory-identity-diagnosis.md 병①)이었음.
 * FK 정본이 채워진 자재는 이제 이름과 무관하게 정확히 변환됨.
 *
 * ⚠️ 완전한 효과를 위해 `item_master.legacy_material_id` 백필 필요
 *    (P0 진단 1a legacy_null 5건 / 1b dangling 3건 — scripts/sql 백필 + 수동검증).
 *
 * 이 헬퍼는 신규 배치 INSERT, 차감 lookup, 단가 폴백 모든 곳에서 사용해야 합니다.
 *
 * ## 캐싱
 *
 * 단일 트랜잭션/요청 동안 같은 ID가 여러 번 변환될 수 있어 LRU 캐시 사용.
 * tenant_id별로 분리 (멀티 테넌시 안전).
 */

import type { Pool, PoolConnection, Connection } from "mysql2/promise";

/** mysql2 Pool, PoolConnection, Connection 모두 호환 */
export type AnyConn = Pick<Pool | PoolConnection | Connection, "execute">;

interface ResolveResult {
  canonicalId: number;       // h_materials.id (lot lookup용)
  itemMasterId: number | null; // item_master.id (BOM lookup용, null 가능)
  materialName: string | null;
  // im_to_hm_byfk: item_master.legacy_material_id FK 로 변환 (신뢰 경로, 2026-07 P1)
  // im_to_hm_byname: FK 부재/dangling 시 이름 문자열 폴백 (레거시, 취약)
  source: "hm_direct" | "im_to_hm_byfk" | "im_to_hm_byname" | "fallback_unchanged" | "not_found";
}

// 프로세스 메모리 캐시 (요청 단위로는 충분)
// key: `${tenantId}:${rawId}` → ResolveResult
const cache = new Map<string, ResolveResult>();
const CACHE_MAX = 5000;

/** 캐시 무효화 (테스트 또는 마스터 데이터 변경 시) */
export function clearMaterialIdResolverCache() {
  cache.clear();
}

/**
 * rawId가 h_materials.id에 직접 존재하는지 확인 후, 아니면 item_master 자재명 매칭으로 h_materials.id 추론.
 *
 * 우선순위:
 *   1. h_materials.id = rawId 매칭 (이미 canonical) → 그대로 반환
 *   2. item_master.id = rawId → item_name 추출 → h_materials.material_name 매칭 → h_materials.id 반환
 *   3. 모두 실패 → rawId 그대로 반환 (fallback_unchanged), 호출자가 분기 가능
 *
 * @param rawId - h_batch_inputs.material_id 또는 h_mf_ingredients.material_id 등 출처 모호한 ID
 * @param tenantId - 테넌트 ID
 * @param conn - mysql2 raw connection (트랜잭션 외부에서 호출 가능)
 * @returns 변환 결과 (canonicalId는 lot/inventory 조회용, itemMasterId는 BOM 조회용)
 */
export async function resolveMaterialIds(
  rawId: number,
  tenantId: number,
  conn: AnyConn
): Promise<ResolveResult> {
  if (!Number.isFinite(rawId) || rawId <= 0) {
    return { canonicalId: rawId, itemMasterId: null, materialName: null, source: "fallback_unchanged" };
  }

  const cacheKey = `${tenantId}:${rawId}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  // 1) h_materials.id = rawId 직접 매칭
  const [hmRows]: any = await conn.execute(
    `SELECT id, material_name FROM h_materials
       WHERE id = ? AND tenant_id = ? LIMIT 1`,
    [rawId, tenantId]
  );
  if ((hmRows as any[]).length > 0) {
    const hm = (hmRows as any[])[0];
    // h_materials.id로 직접 매칭됨 → 같은 이름의 item_master.id를 보너스로 찾아둠
    let imId: number | null = null;
    if (hm.material_name) {
      const [imLookup]: any = await conn.execute(
        `SELECT id FROM item_master
           WHERE tenant_id = ? AND TRIM(item_name) = TRIM(?) LIMIT 1`,
        [tenantId, hm.material_name]
      );
      imId = (imLookup as any[])[0]?.id ?? null;
    }
    const result: ResolveResult = {
      canonicalId: Number(hm.id),
      itemMasterId: imId,
      materialName: hm.material_name ?? null,
      source: "hm_direct",
    };
    setCache(cacheKey, result);
    return result;
  }

  // 2) item_master.id = rawId → legacy_material_id FK 우선, 실패 시 item_name 매칭
  //    (2026-07 P1: 신뢰할 FK 가 있는데 이름 문자열로 잇던 근본 결함 수정.
  //     이름이 조금만 달라도 매칭이 깨져 차감이 단락되던 문제 — FK 를 정본으로.)
  const [imRows]: any = await conn.execute(
    `SELECT id, item_name, legacy_material_id FROM item_master
       WHERE id = ? AND tenant_id = ? LIMIT 1`,
    [rawId, tenantId]
  );
  if ((imRows as any[]).length > 0) {
    const im = (imRows as any[])[0];
    const itemName = im.item_name as string | null;

    // 2a) FK 우선 — legacy_material_id 가 유효한 h_materials 를 가리키면 신뢰.
    const legacyId = im.legacy_material_id != null ? Number(im.legacy_material_id) : null;
    if (legacyId != null && Number.isFinite(legacyId) && legacyId > 0) {
      const [hmByFk]: any = await conn.execute(
        `SELECT id, material_name FROM h_materials
           WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [legacyId, tenantId]
      );
      if ((hmByFk as any[]).length > 0) {
        const hm = (hmByFk as any[])[0];
        const result: ResolveResult = {
          canonicalId: Number(hm.id),
          itemMasterId: rawId,
          materialName: hm.material_name ?? itemName,
          source: "im_to_hm_byfk",
        };
        setCache(cacheKey, result);
        return result;
      }
      // FK 가 dangling(가리키는 h_materials 없음) → 이름 폴백으로 진행 (경고).
      console.warn(
        `[materialIdResolver] item_master.id=${rawId} legacy_material_id=${legacyId} dangling — 이름 폴백. (P0 진단 1b 대상)`
      );
    }

    // 2b) FK 부재/dangling → item_name → h_materials.material_name 매칭 (레거시 폴백)
    if (itemName) {
      const [hmByName]: any = await conn.execute(
        `SELECT id, material_name FROM h_materials
           WHERE tenant_id = ? AND TRIM(material_name) = TRIM(?) LIMIT 1`,
        [tenantId, itemName]
      );
      if ((hmByName as any[]).length > 0) {
        const hm = (hmByName as any[])[0];
        const result: ResolveResult = {
          canonicalId: Number(hm.id),
          itemMasterId: rawId,
          materialName: hm.material_name ?? itemName,
          source: "im_to_hm_byname",
        };
        setCache(cacheKey, result);
        return result;
      }
    }
    // h_materials에 매칭 없음 → item_master만 알고 있는 자재
    const result: ResolveResult = {
      canonicalId: rawId, // h_materials에 없으므로 그냥 raw ID 반환 (lot 조회는 실패할 것)
      itemMasterId: rawId,
      materialName: itemName,
      source: "fallback_unchanged",
    };
    setCache(cacheKey, result);
    return result;
  }

  // 3) 어디에도 없음
  const result: ResolveResult = {
    canonicalId: rawId,
    itemMasterId: null,
    materialName: null,
    source: "not_found",
  };
  setCache(cacheKey, result);
  return result;
}

function setCache(key: string, value: ResolveResult) {
  if (cache.size >= CACHE_MAX) {
    // 단순 LRU: 첫 번째 키 삭제
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(key, value);
}

/**
 * 4단 폴백 단가 체인:
 *   1. FEFO 가능한 lot 중 가장 빠른 expiry의 unit_price (호출자가 별도 처리)
 *   2. 마지막 입고 lot의 unit_price (재고 부족 또는 lot 자체 없을 때)
 *   3. h_materials.unit_price
 *   4. item_master.default_unit_price
 *
 * 이 함수는 (2) (3) (4) 폴백을 처리. (1) 실시간 FEFO는 호출자가 직접.
 *
 * @returns { unitPrice, source } — unitPrice가 0보다 크면 채택
 */
export async function resolvePriceFallback(
  canonicalId: number,
  itemMasterId: number | null,
  tenantId: number,
  conn: AnyConn
): Promise<{ unitPrice: number; source: "last_lot" | "h_materials" | "item_master" | "none" }> {
  // (2) 마지막 입고 lot의 unit_price (canonicalId 기준)
  const [lotRows]: any = await conn.execute(
    `SELECT unit_price FROM h_inventory_lots
       WHERE tenant_id = ? AND material_id = ?
         AND unit_price IS NOT NULL AND unit_price > 0
       ORDER BY receipt_date DESC, id DESC LIMIT 1`,
    [tenantId, canonicalId]
  );
  if ((lotRows as any[]).length > 0) {
    const p = parseFloat((lotRows as any[])[0].unit_price ?? 0);
    if (p > 0) return { unitPrice: p, source: "last_lot" };
  }

  // (3) h_materials.unit_price
  const [hmRows]: any = await conn.execute(
    `SELECT unit_price FROM h_materials
       WHERE tenant_id = ? AND id = ? LIMIT 1`,
    [tenantId, canonicalId]
  );
  if ((hmRows as any[]).length > 0) {
    const p = parseFloat((hmRows as any[])[0].unit_price ?? 0);
    if (p > 0) return { unitPrice: p, source: "h_materials" };
  }

  // (4) item_master.default_unit_price
  if (itemMasterId !== null) {
    const [imRows]: any = await conn.execute(
      `SELECT default_unit_price FROM item_master
         WHERE tenant_id = ? AND id = ? LIMIT 1`,
      [tenantId, itemMasterId]
    );
    if ((imRows as any[]).length > 0) {
      const p = parseFloat((imRows as any[])[0].default_unit_price ?? 0);
      if (p > 0) return { unitPrice: p, source: "item_master" };
    }
  }

  return { unitPrice: 0, source: "none" };
}
