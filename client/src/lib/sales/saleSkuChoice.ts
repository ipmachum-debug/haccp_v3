/**
 * 판매 SKU 고르기 — 매출 엑셀 일괄등록(ExcelBulkUploadModal) 공통 규칙 (2026-10-16)
 * 서버 확정 규칙(server/lib/accounting/saleSku.ts)과 같은 뜻:
 *   - 자사제품 SKU 가 하나면 그 SKU
 *   - 엑셀 SKU 코드 또는 품목명이 SKU 코드·SKU 명과 정확히 같으면 그 SKU (공백·-·_ 무시, 대소문자 무시)
 *   - 그 밖에 SKU 가 여럿이면 null → 행에서 골라야 한다 (안 고르면 등록 차단, 서버 확정도 차단)
 *   - 매입 모드·자사제품 아님·묶음 지정 행은 대상 아님 (묶음은 묶음 대표 SKU)
 */
export type SaleSkuCandidate = { id: number; skuCode: string; skuName: string | null };

const norm = (v: string | null | undefined) => String(v ?? "").toLowerCase().replace(/[\s\-_]/g, "");

export function pickSaleSkuId(cands: SaleSkuCandidate[], hint: { skuCode?: string; itemName?: string }): number | null {
  if (cands.length === 1) return cands[0].id;
  if (cands.length === 0) return null;
  if (hint.skuCode) {
    const byCode = cands.find((k) => norm(k.skuCode) === norm(hint.skuCode));
    if (byCode) return byCode.id;
  }
  if (hint.itemName) {
    const byName = cands.find((k) => norm(k.skuName) === norm(hint.itemName));
    if (byName) return byName.id;
  }
  return null;
}

export function needsSaleSkuChoice(p: {
  isPurchase: boolean; itemType: string | null | undefined; bundleSkuId?: number | null; skuId?: number | null; candidateCount: number;
}): boolean {
  return !p.isPurchase && p.itemType === "own_product" && !p.bundleSkuId && !p.skuId && p.candidateCount > 1;
}

/** 등록 payload 의 skuId — 묶음이면 묶음 대표 SKU, 아니면 고른 SKU, 자사제품 아니면 없음 */
export function saleSkuIdForPayload(r: { itemType: string | null | undefined; bundleSkuId?: number | null; skuId?: number | null }): number | undefined {
  return r.itemType === "own_product" ? (r.bundleSkuId ?? r.skuId ?? undefined) : undefined;
}
