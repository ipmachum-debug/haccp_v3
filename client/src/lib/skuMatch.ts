/**
 * SKU + 품목명 통합 매칭 엔진 (Phase 8+)
 *
 * 우선순위:
 *   1. SKU 코드 완전일치       → score 1.0  (exact)
 *   2. 바코드 완전일치          → score 0.99 (barcode)
 *   3. SKU 부분일치 + 품명일치  → score 0.9~0.98 (sku_contains)
 *   4. 품명 퍼지일치 ≥0.9       → score 0.9~0.95 (item_name)
 *   5. 품명 퍼지일치 0.7~0.9    → AI 재검증 대상 (fuzzy_review)
 *   6. 그 외                     → 미매칭 (unmatched)
 *
 * 매칭 결과는 itemType 정보 포함 → 재고 차감 테이블 결정에 사용:
 *   own_product        → h_inventory_lots.product_id
 *   raw_material       → h_inventory_lots.material_id
 *   subsidiary         → h_inventory_lots.material_id (부자재 공용)
 *   external_product   → h_inventory_lots.material_id (외부제품 공용)
 */
import { fuzzyMatchItem } from "./fuzzyMatch";

// product_skus.listAll 응답 타입
export type SkuMaster = {
  id: number;
  itemId: number;
  skuCode: string;
  skuName: string;
  netWeightG?: string | number | null;
  piecesPerPack?: number | null;
  packsPerBox?: number | null;
  salesUnit?: string;
  kgPerSalesUnit?: string | number;
  unitPrice?: string | number | null;
  barcode?: string | null;
  isDefault?: number;
  itemCode: string;
  itemName: string;
  itemType: "raw_material" | "own_product" | "external_product" | "subsidiary";
  category?: string | null;
};

export type MatchStrategy =
  | "sku_exact"       // SKU 코드 완전일치
  | "barcode_exact"   // 바코드 완전일치
  | "sku_contains"    // SKU 부분일치 + 품명 보조
  | "item_name_high"  // 품명 퍼지 ≥0.9
  | "item_name_mid"   // 품명 퍼지 0.7~0.9 (AI 재검증 대상)
  | "unmatched";

export type MatchCandidate = {
  sku: SkuMaster;
  score: number;           // 0~1
  strategy: MatchStrategy;
  reason: string;
  needsReview: boolean;    // AI 재검증/사용자 확인 필요
};

export type MatchResult = {
  bestMatch: MatchCandidate | null;
  candidates: MatchCandidate[]; // 상위 N개
  needsReview: boolean;         // bestMatch.score < 0.9 or 후보 2개 이상 동점
  needsAi: boolean;             // item_name_mid 구간 (0.7~0.9)
};

// 소문자/공백/특수문자 제거
function normalize(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[\s\-_()（）\[\]【】·.,/\\]/g, "")
    .trim();
}

/**
 * 품목명 + SKU 코드 + 바코드 통합 매칭
 *
 * @param input 엑셀 행의 데이터
 * @param masterSkus product_skus.listAll 결과 전체
 * @param topN 후보 상위 N개 (기본 5)
 */
export function matchSkuAndItem(
  input: {
    itemName?: string;
    skuCode?: string;
    barcode?: string;
  },
  masterSkus: SkuMaster[],
  topN: number = 5,
): MatchResult {
  if (masterSkus.length === 0) {
    return { bestMatch: null, candidates: [], needsReview: true, needsAi: false };
  }

  const itemName = (input.itemName || "").trim();
  const skuCode = (input.skuCode || "").trim();
  const barcode = (input.barcode || "").trim();

  const candidates: MatchCandidate[] = [];
  const seen = new Set<number>();

  // ── 1. SKU 코드 완전일치 ──
  if (skuCode) {
    const skuNorm = normalize(skuCode);
    for (const sku of masterSkus) {
      if (seen.has(sku.id)) continue;
      if (normalize(sku.skuCode) === skuNorm) {
        candidates.push({
          sku,
          score: 1.0,
          strategy: "sku_exact",
          reason: `SKU 코드 완전일치: ${sku.skuCode}`,
          needsReview: false,
        });
        seen.add(sku.id);
      }
    }
  }

  // ── 2. 바코드 완전일치 ──
  if (barcode && candidates.length === 0) {
    for (const sku of masterSkus) {
      if (seen.has(sku.id)) continue;
      if (sku.barcode && normalize(sku.barcode) === normalize(barcode)) {
        candidates.push({
          sku,
          score: 0.99,
          strategy: "barcode_exact",
          reason: `바코드 완전일치: ${sku.barcode}`,
          needsReview: false,
        });
        seen.add(sku.id);
      }
    }
  }

  // ── 3. SKU 부분일치 (prefix/contains) + 품명 보조점수 ──
  if (skuCode && candidates.length === 0) {
    const skuNorm = normalize(skuCode);
    for (const sku of masterSkus) {
      if (seen.has(sku.id)) continue;
      const masterSkuNorm = normalize(sku.skuCode);
      // 부분일치 (한쪽이 다른 쪽에 포함)
      const isContains =
        masterSkuNorm.includes(skuNorm) || skuNorm.includes(masterSkuNorm);
      if (!isContains) continue;

      // 품명 보조점수: 최대 +0.1
      let itemBonus = 0;
      if (itemName) {
        const itemMatch = fuzzyMatchItem(itemName, [{ itemName: sku.itemName }], 1);
        if (itemMatch[0]?.score >= 0.9) itemBonus = 0.1;
        else if (itemMatch[0]?.score >= 0.7) itemBonus = 0.05;
      }
      const baseScore = 0.88 + Math.min(skuNorm.length, masterSkuNorm.length) /
        Math.max(skuNorm.length, masterSkuNorm.length) * 0.05;
      const score = Math.min(0.98, baseScore + itemBonus);
      candidates.push({
        sku,
        score,
        strategy: "sku_contains",
        reason: `SKU 부분일치: ${sku.skuCode}${itemBonus > 0 ? ` (품명 보조 +${itemBonus.toFixed(2)})` : ""}`,
        needsReview: score < 0.95,
      });
      seen.add(sku.id);
    }
  }

  // ── 4. 품명 퍼지 매칭 (SKU가 없거나 SKU 매칭 실패 시 fallback) ──
  if (itemName) {
    // itemMaster 중복 제거 (같은 item 에 여러 SKU 가능하므로 기본 SKU 우선)
    const itemMap = new Map<number, SkuMaster>();
    for (const sku of masterSkus) {
      const existing = itemMap.get(sku.itemId);
      if (!existing || sku.isDefault === 1) {
        itemMap.set(sku.itemId, sku);
      }
    }
    const uniqueItems = Array.from(itemMap.values()).map((sku) => ({
      ...sku,
      itemName: sku.itemName,
    }));
    const fuzzyResults = fuzzyMatchItem(itemName, uniqueItems, topN);
    for (const r of fuzzyResults) {
      const sku = r.item as SkuMaster;
      if (seen.has(sku.id)) continue;
      const strategy: MatchStrategy =
        r.score >= 0.9 ? "item_name_high" : r.score >= 0.7 ? "item_name_mid" : "unmatched";
      if (strategy === "unmatched") continue;
      candidates.push({
        sku,
        score: r.score,
        strategy,
        reason: `품명 퍼지매칭 (${r.matchType}): ${sku.itemName}`,
        needsReview: strategy !== "item_name_high" || r.score < 0.95,
      });
      seen.add(sku.id);
    }
  }

  // ── 점수 내림차순 정렬 ──
  candidates.sort((a, b) => b.score - a.score);
  const topCandidates = candidates.slice(0, topN);

  const bestMatch = topCandidates[0] || null;
  const hasAiCandidate = topCandidates.some((c) => c.strategy === "item_name_mid");

  return {
    bestMatch,
    candidates: topCandidates,
    needsReview: !bestMatch || bestMatch.score < 0.9,
    needsAi: hasAiCandidate && (!bestMatch || bestMatch.score < 0.9),
  };
}

/**
 * 일괄 매칭 (엑셀 전체 행 처리)
 * - itemName / skuCode 각각 제공
 * - needsAi 인 행만 모아 AI 배치 호출에 넘길 수 있음
 */
export function matchSkuAndItemBatch(
  rows: Array<{ itemName?: string; skuCode?: string; barcode?: string }>,
  masterSkus: SkuMaster[],
): Array<{ rowIndex: number; match: MatchResult }> {
  return rows.map((row, idx) => ({
    rowIndex: idx,
    match: matchSkuAndItem(row, masterSkus),
  }));
}

/**
 * 품목 타입 → 재고 차감 대상 테이블 결정
 *   own_product              → productId 경로 (h_inventory_lots.product_id)
 *   raw_material/subsidiary/
 *   external_product         → materialId 경로 (h_inventory_lots.material_id)
 */
export function resolveInventoryPath(
  itemType: SkuMaster["itemType"],
): { path: "product" | "material"; idField: "productId" | "materialId" } {
  if (itemType === "own_product") {
    return { path: "product", idField: "productId" };
  }
  return { path: "material", idField: "materialId" };
}
