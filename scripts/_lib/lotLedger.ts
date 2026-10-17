/**
 * 원료 LOT + 거래로 다시 세운 장부 — 재고 복구 도구 공통 (읽기 전용)
 * report-lot-integrity / lot-current-align / report-stock-count-sheet 가 같은 계산을 쓴다.
 *
 * ★ 2026-10-17 (Codex #569~571 운영 읽기 전용 검증 1번): LOT.quantity 는 최초 입고량이 아니다 — 재고 관문(applyLotDelta) 이
 *   차감·증가 때 quantity 도 같이 바꾼다. 그래서 '입고 수량 + 조정 − 사용' 은 정상 LOT 도 불일치로 잡았다 (오탐).
 *   지금: 거래만으로 장부를 다시 세운다 — 관문 원장 규약(양수 수량 + 유형으로 방향, 조정 감소만 음수):
 *     장부 = Σ입고(receipt·inbound) + Σ반품(return) + Σ조정(부호 그대로) − Σ사용·출고·폐기(usage·outbound·disposal)
 *   판단 가능한 LOT 만 비교한다:
 *     complete   입고 거래가 있고 방향이 애매한 거래(transfer) 가 없음
 *     no_receipt 입고 거래 없음 (예전 기록 방식·음수 자리표시·직접 생성) → 장부 판단 불가
 *     ambiguous  이동(transfer) 거래 있음 (방향 규약이 정해지지 않음) → 장부 판단 불가
 *   관문의 음수 금지 차감은 0 에서 멈춘다(GREATEST) — 가용 0 · 장부 음수는 '0 클램프 가능' 으로 따로.
 */
export const EPS = 0.0005;
export const r3 = (n: number) => Math.round(n * 1000) / 1000;
export const same = (a: number, b: number) => Math.abs(a - b) <= EPS;

export type LedgerState = "complete" | "no_receipt" | "ambiguous";

export type LotLedgerRow = {
  id: number; materialId: number; material: string | null; materialUnit: string | null; lot: string; status: string; unit: string;
  quantity: number; current: number | null; available: number;
  /** 거래로 다시 세운 장부 잔량 — 판단 불가면 null */
  ledger: number | null; ledgerState: LedgerState;
  receiptTx: number; increaseTx: number; decreaseTx: number; adjTx: number; txCount: number;
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
            COALESCE(t.rcpt, 0) + 0 AS rcpt, COALESCE(t.rcpt_n, 0) AS rcpt_n, COALESCE(t.inc, 0) + 0 AS inc,
            COALESCE(t.dec_, 0) + 0 AS dec_, COALESCE(t.adj, 0) + 0 AS adj, COALESCE(t.xfer_n, 0) AS xfer_n, COALESCE(t.n, 0) AS ntx
       FROM h_inventory_lots l
       LEFT JOIN h_materials m ON m.id = l.material_id AND m.tenant_id = l.tenant_id
       LEFT JOIN (SELECT lot_id,
                         SUM(CASE WHEN transaction_type IN ('receipt', 'inbound') THEN quantity ELSE 0 END) AS rcpt,
                         SUM(transaction_type IN ('receipt', 'inbound')) AS rcpt_n,
                         SUM(CASE WHEN transaction_type = 'return' THEN quantity ELSE 0 END) AS inc,
                         SUM(CASE WHEN transaction_type IN ('usage', 'outbound', 'disposal') THEN quantity ELSE 0 END) AS dec_,
                         SUM(CASE WHEN transaction_type = 'adjustment' THEN quantity ELSE 0 END) AS adj,
                         SUM(transaction_type = 'transfer') AS xfer_n,
                         COUNT(*) AS n
                    FROM h_inventory_transactions WHERE tenant_id = ? GROUP BY lot_id) t ON t.lot_id = l.id
      WHERE l.tenant_id = ? AND l.material_id IS NOT NULL ${where}
      ORDER BY l.material_id, l.receipt_date, l.id`,
    [tenantId, tenantId, ...materialIds, ...lotIds],
  );
  return (rows as any[]).map((l) => {
    const ledgerState: LedgerState = Number(l.xfer_n) > 0 ? "ambiguous" : Number(l.rcpt_n) === 0 ? "no_receipt" : "complete";
    const ledger = ledgerState === "complete" ? r3(Number(l.rcpt) + Number(l.inc) + Number(l.adj) - Number(l.dec_)) : null;
    return {
      id: Number(l.id), materialId: Number(l.material_id), material: l.material_name, materialUnit: l.munit, lot: l.lot_number, status: l.status, unit: l.unit,
      quantity: Number(l.q), current: l.c == null ? null : Number(l.c), available: Number(l.a),
      ledger, ledgerState,
      receiptTx: r3(Number(l.rcpt)), increaseTx: r3(Number(l.inc)), decreaseTx: r3(Number(l.dec_)), adjTx: r3(Number(l.adj)), txCount: Number(l.ntx),
      receiptDate: l.rd, expiryDate: l.ed, updatedMinute: l.upd_min,
    };
  });
}

/** LOT 분류 — 장부 비교는 판단 가능한(complete) LOT 만 */
export function classifyLot(l: LotLedgerRow): Array<{ cat: string; proposal?: string }> {
  const isNeg = /^NEG-/.test(String(l.lot ?? ""));
  const cats: Array<{ cat: string; proposal?: string }> = [];
  const ledgerOk = l.ledger != null && same(l.available, l.ledger);
  const clamp = l.ledger != null && same(l.available, 0) && l.ledger < -EPS; // 음수 금지 차감이 0 에서 멈춤 — 오류 아님
  if (l.ledger == null && !isNeg && (l.status === "available" || l.available > EPS)) cats.push({ cat: l.ledgerState === "ambiguous" ? "LEDGER_AMBIGUOUS" : "LEDGER_NO_RECEIPT" });
  if (l.status === "used" && l.available > EPS) cats.push({ cat: ledgerOk ? "USED_REMAINING_LEDGER" : "USED_REMAINING_OTHER" });
  if (l.ledger != null && !ledgerOk) cats.push({ cat: clamp ? "LEDGER_CLAMP_ZERO" : "AVAILABLE_LEDGER_DIFF" });
  if (l.current != null && !same(l.current, l.available)) {
    cats.push({ cat: "CURRENT_DIFF", ...(ledgerOk ? { proposal: `현재수량 ${l.current} → ${l.available} (가용·장부와 같게)` } : {}) });
  }
  if (l.available < -EPS) cats.push({ cat: isNeg ? "NEGATIVE_PLACEHOLDER" : "NEGATIVE_REAL" });
  return cats;
}
