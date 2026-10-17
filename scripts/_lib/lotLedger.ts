/**
 * 원료 LOT + 장부 값 (입고 수량 + 조정·반품 − 사용·출고·폐기·이동 거래 합) — 재고 복구 도구 공통 (읽기 전용)
 * report-lot-integrity / lot-current-align / report-stock-count-sheet 가 같은 계산을 쓴다.
 */
export const EPS = 0.0005;
export const r3 = (n: number) => Math.round(n * 1000) / 1000;
export const same = (a: number, b: number) => Math.abs(a - b) <= EPS;

export type LotLedgerRow = {
  id: number; materialId: number; material: string | null; materialUnit: string | null; lot: string; status: string; unit: string;
  quantity: number; current: number | null; available: number; ledger: number; usedTx: number; adjTx: number; txCount: number;
  receiptDate: string | null; expiryDate: string | null; updatedMinute: string;
};

export async function loadLotLedger(conn: any, tenantId: number, materialIds: number[] = [], lotIds: number[] = []): Promise<LotLedgerRow[]> {
  const where = [
    materialIds.length ? `AND l.material_id IN (${materialIds.map(() => "?").join(",")})` : "",
    lotIds.length ? `AND l.id IN (${lotIds.map(() => "?").join(",")})` : "",
  ].join(" ");
  const [rows]: any = await conn.query(
    `SELECT l.id, l.material_id, m.material_name, m.unit AS munit, l.lot_number, l.status, l.unit,
            l.quantity + 0 AS q, l.current_quantity + 0 AS c, l.available_quantity + 0 AS a,
            DATE_FORMAT(l.receipt_date, '%Y-%m-%d') AS rd, DATE_FORMAT(l.expiry_date, '%Y-%m-%d') AS ed,
            DATE_FORMAT(l.updated_at, '%Y-%m-%d %H:%i') AS upd_min,
            COALESCE(t.used, 0) + 0 AS used, COALESCE(t.adj, 0) + 0 AS adj, COALESCE(t.n, 0) AS ntx
       FROM h_inventory_lots l
       LEFT JOIN h_materials m ON m.id = l.material_id AND m.tenant_id = l.tenant_id
       LEFT JOIN (SELECT lot_id,
                         SUM(CASE WHEN transaction_type IN ('usage', 'outbound', 'disposal', 'transfer') THEN quantity ELSE 0 END) AS used,
                         SUM(CASE WHEN transaction_type IN ('adjustment', 'return') THEN quantity ELSE 0 END) AS adj,
                         COUNT(*) AS n
                    FROM h_inventory_transactions WHERE tenant_id = ? GROUP BY lot_id) t ON t.lot_id = l.id
      WHERE l.tenant_id = ? AND l.material_id IS NOT NULL ${where}
      ORDER BY l.material_id, l.receipt_date, l.id`,
    [tenantId, tenantId, ...materialIds, ...lotIds],
  );
  return (rows as any[]).map((l) => ({
    id: Number(l.id), materialId: Number(l.material_id), material: l.material_name, materialUnit: l.munit, lot: l.lot_number, status: l.status, unit: l.unit,
    quantity: Number(l.q), current: l.c == null ? null : Number(l.c), available: Number(l.a),
    ledger: r3(Number(l.q) + Number(l.adj) - Number(l.used)), usedTx: r3(Number(l.used)), adjTx: r3(Number(l.adj)), txCount: Number(l.ntx),
    receiptDate: l.rd, expiryDate: l.ed, updatedMinute: l.upd_min,
  }));
}

/** LOT 분류 — report-lot-integrity 와 같은 기준 */
export function classifyLot(l: LotLedgerRow): Array<{ cat: string; proposal?: string }> {
  const isNeg = /^NEG-/.test(String(l.lot ?? ""));
  const cats: Array<{ cat: string; proposal?: string }> = [];
  if (l.status === "used" && l.available > EPS) cats.push({ cat: same(l.available, l.ledger) ? "USED_REMAINING_LEDGER" : "USED_REMAINING_OTHER" });
  if (l.status === "available" && !isNeg && !same(l.available, l.ledger)) cats.push({ cat: "AVAILABLE_LEDGER_DIFF" });
  if (l.current != null && !same(l.current, l.available)) {
    cats.push({ cat: "CURRENT_DIFF", ...(same(l.available, l.ledger) ? { proposal: `현재수량 ${l.current} → ${l.available} (가용·장부와 같게)` } : {}) });
  }
  if (l.available < -EPS) cats.push({ cat: isNeg ? "NEGATIVE_PLACEHOLDER" : "NEGATIVE_REAL" });
  return cats;
}
