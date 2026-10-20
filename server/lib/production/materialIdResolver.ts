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
  // hm_direct_ambiguous: 같은 숫자가 다른 원료의 정체성 번호이기도 함 — 재고 번호로 읽었지만 호출측 번호 종류를 알 수 없어 신뢰 안 함 (2026-10-20)
  source: "hm_direct" | "hm_direct_ambiguous" | "im_to_hm_byfk" | "fallback_unchanged" | "not_found";
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
    // 정체성 번호는 FK(legacy_material_id) 로만 — 이름으로 찾지 않는다 (2026-10-20 번호 체계 2단계, 이전: 같은 이름의 item_master)
    const [imLookup]: any = await conn.execute(
      `SELECT id FROM item_master
         WHERE tenant_id = ? AND legacy_material_id = ? AND item_type IN ('raw_material', 'subsidiary')
         ORDER BY is_active DESC, id ASC LIMIT 1`,
      [tenantId, Number(hm.id)]
    );
    const imId: number | null = (imLookup as any[])[0]?.id ?? null;
    // 같은 숫자가 '다른 원료' 의 정체성 번호이기도 하면 (그 정체성 품목은 다른 재고 원료에 연결됨) — 호출측이 어느 번호를 줬는지 모른다.
    //   기존 동작(재고 번호로 읽기)은 유지하되 신뢰하지 않음으로 표시하고 남긴다. 번호 종류를 아는 호출측은 expect 로 정확히 변환한다.
    const [clash]: any = await conn.execute(
      `SELECT id, legacy_material_id FROM item_master
         WHERE id = ? AND tenant_id = ? AND item_type IN ('raw_material', 'subsidiary')
           AND legacy_material_id IS NOT NULL AND legacy_material_id <> ? LIMIT 1`,
      [rawId, tenantId, rawId]
    );
    const ambiguous = (clash as any[]).length > 0;
    if (ambiguous) {
      console.warn(`[materialIdResolver] 번호 ${rawId} 은(는) 재고 원료 번호이면서 다른 원료(재고 ${(clash as any[])[0].legacy_material_id})의 정체성 번호입니다 — 호출측 번호 종류 확인 필요 (tenant=${tenantId})`);
    }
    const result: ResolveResult = {
      canonicalId: Number(hm.id),
      itemMasterId: imId,
      materialName: hm.material_name ?? null,
      source: ambiguous ? "hm_direct_ambiguous" : "hm_direct",
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
      // FK 가 dangling(가리키는 h_materials 없음) → 연결 없음으로 (경고).
      console.warn(
        `[materialIdResolver] item_master.id=${rawId} legacy_material_id=${legacyId} dangling — 재고 원료 연결 없음. (P0 진단 1b 대상)`
      );
    }

    // 2b) FK 부재/dangling — 이름으로 맞추지 않는다 (2026-10-20 번호 체계 2단계: 이전엔 item_name = material_name 으로 이었음).
    //     연결이 없는 원료는 재고 원료를 모르는 것으로 둔다 → 출고·LOT 조회가 비고, 화면이 '품목 연결 필요' 로 드러낸다.
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
  conn: AnyConn,
  /** 2026-10-13: 시점 기준 — 주면 "그 날짜 이전 최근 입고가" (과거 배치는 과거 가격). 없으면 현재 기준 */
  asOfDate?: string | null
): Promise<{ unitPrice: number; source: "last_lot" | "last_receipt_tx" | "h_materials" | "item_master" | "none" }> {
  const asOf = asOfDate ? String(asOfDate).slice(0, 10) : null;
  // (2) 마지막 입고 lot의 unit_price (canonicalId 기준) — 자리표시(NEG-)·실사(COUNT-) LOT 제외
  const [lotRows]: any = await conn.execute(
    `SELECT unit_price FROM h_inventory_lots
       WHERE tenant_id = ? AND material_id = ?
         AND unit_price IS NOT NULL AND unit_price > 0
         AND lot_number NOT LIKE 'NEG-%' AND lot_number NOT LIKE 'COUNT-%'
         ${asOf ? "AND (receipt_date IS NULL OR receipt_date <= ?)" : ""}
       ORDER BY receipt_date DESC, id DESC LIMIT 1`,
    asOf ? [tenantId, canonicalId, asOf] : [tenantId, canonicalId]
  );
  if ((lotRows as any[]).length > 0) {
    const p = parseFloat((lotRows as any[])[0].unit_price ?? 0);
    if (p > 0) return { unitPrice: p, source: "last_lot" };
  }

  // (2-b) 2026-10-13: LOT 단가가 비어 있어도 입고 거래에 금액이 있으면 금액 ÷ 수량 (LOT 수량 단위당)
  //   매입 등록 경로가 LOT unit_price 를 안 넣던 기간(~2026-10-13)의 LOT 를 마스터 옛 단가 대신 실제 입고가로 잡는다.
  const [txRows]: any = await conn.execute(
    `SELECT amount, quantity FROM h_inventory_transactions
       WHERE tenant_id = ? AND material_id = ? AND transaction_type = 'receipt'
         AND amount IS NOT NULL AND amount > 0 AND quantity IS NOT NULL AND quantity > 0
         ${asOf ? "AND transaction_date <= ?" : ""}
       ORDER BY transaction_date DESC, id DESC LIMIT 1`,
    asOf ? [tenantId, canonicalId, asOf] : [tenantId, canonicalId]
  );
  if ((txRows as any[]).length > 0) {
    const r = (txRows as any[])[0];
    const p = parseFloat(r.amount) / parseFloat(r.quantity);
    if (p > 0) return { unitPrice: Math.round(p * 100) / 100, source: "last_receipt_tx" };
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
