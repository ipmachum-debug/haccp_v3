/**
 * CCP-4P 통과 기록 비교 — (품목, 통과량, 단위) 목록이 같은가 (2026-10-18, Codex #590 R590-05)
 *
 * 이전: 통과행 수와 통과량 합만 비교 → 같은 숫자가 단위만 바뀌면(kg 10 → 팩 10) 다시 만들지 않았다.
 * 지금: 행 하나하나의 (품목, 수량, 단위) 묶음이 순서와 상관없이 같아야 같은 기록으로 본다.
 * 순수 함수 — DB 없음.
 */
export interface PassageEntry {
  name: string;
  qty: number;
  unit: string | null;
}

/** 당일 배치·SKU 실적 행 (통과행을 만드는 쿼리와 같은 컬럼) */
export interface PassageSourceRow {
  batch_id: number | string;
  sku_id: number | string | null;
  product_name: string | null;
  sku_name: string | null;
  sales_unit: string | null;
  sku_quantity: number | string | null;
  sku_kg: number | string | null;
  planned_quantity: number | string | null;
}

/**
 * 통과행 생성 규칙과 같은 방식으로 '있어야 할' 통과 기록을 만든다 — 통과량 = 생산량.
 *   품목 = SKU 이름 → 제품 이름, 수량 = SKU 실적(같은 배치·SKU 합) → kg, 단위 = SKU 판매단위 → kg
 */
export function expectedPassageEntries(rows: PassageSourceRow[], fallbackName: string): PassageEntry[] {
  const skuSum = new Map<string, number>();
  for (const r of rows) {
    if (r.sku_id == null) continue;
    const k = `${r.batch_id}:${r.sku_id}`;
    skuSum.set(k, (skuSum.get(k) ?? 0) + (parseFloat(String(r.sku_quantity ?? 0)) || 0));
  }
  return rows.map((r) => {
    const skuQty = parseInt(String(r.sku_quantity ?? 0)) || 0;
    let qty = skuQty || Math.round(parseFloat(String(r.sku_kg ?? "")) || parseFloat(String(r.planned_quantity ?? "")) || 0);
    if (r.sku_id != null) {
      const total = skuSum.get(`${r.batch_id}:${r.sku_id}`);
      if (total) qty = Math.round(total);
    }
    return {
      name: r.sku_name || r.product_name || fallbackName || "",
      qty,
      unit: skuQty ? (r.sales_unit || "ea") : "kg",
    };
  });
}

/** 순서와 상관없는 비교용 서명. withUnit=false 는 단위 컬럼이 아직 없는 DB 용 */
export function passageSignature(entries: PassageEntry[], withUnit = true): string {
  return entries
    .map((e) => [String(e.name ?? "").trim(), Number(e.qty ?? 0), withUnit ? String(e.unit ?? "") : ""].join("\u0001"))
    .sort()
    .join("\u0002");
}

export function passageMatches(existing: PassageEntry[], expected: PassageEntry[], withUnit = true): boolean {
  return existing.length === expected.length && passageSignature(existing, withUnit) === passageSignature(expected, withUnit);
}
