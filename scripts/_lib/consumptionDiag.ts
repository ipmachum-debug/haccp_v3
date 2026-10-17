/**
 * 배치 투입 ↔ 실제 차감 거래 대조 — 재고 복구 진단 공통 (읽기 전용)
 *
 * ★ 2026-10-17 (Codex #569~571 운영 읽기 전용 검증 2·3번):
 *   - 차감 거래를 세 형식 모두로 찾는다 (거래 id 로 중복 제거): reference_type='batch'·reference_id=배치,
 *     source_type IN ('BATCH','batch_completion')·source_id=배치, reference_type='batch_input'·reference_id=투입 줄.
 *     이전엔 reference 만 봐서 source 형식만 있는 정상 차감이 '차감 누락' 으로 나왔다.
 *   - 투입 줄 연결: source_line_id → (없으면) batch_input 의 reference_id. 둘 다 없으면 '투입 줄 미확인' 으로 남긴다 (원료로 추정하지 않음).
 *   - 투입량: 자동출고와 같은 계약 — actual_quantity, 없으면 planned_quantity (이전엔 NULL 을 0 으로 읽어 정상 차감을 이중 차감으로 표시).
 *   - 출고 당시 재고 차감 제외로 처리된 줄(stock_exempt_at_issue=1) 은 거래가 없어도 정상 — 지금 원료 설정으로 판정하지 않는다.
 *   - 초과는 '초과 차감 후보' — 중복을 증명하지 않는다. 같은 줄·LOT·수량 거래가 2건 이상이면 '중복 의심' 을 따로.
 */
import { EPS, r3 } from "./lotLedger";

const norm = (u: unknown) => String(u ?? "").trim().toLowerCase();

export async function diagnoseBatch(conn: any, tenantId: number, batchId: number) {
  const q = async (sql: string, p: any[]) => ((await conn.query(sql, p)) as any)[0] as any[];
  // 출고 당시 재고 차감 제외 기록(stock_exempt_at_issue) — 지금 원료 설정이 아니라 그때 처리 결과로 판정 (Codex #572 검증 P2).
  //   컬럼 이전 DB 는 기록 없음으로.
  const inputSql = (withExempt: boolean) =>
    `SELECT i.id, i.material_id, m.material_name, m.unit AS munit, i.actual_quantity + 0 AS aq, i.planned_quantity + 0 AS pq, i.unit, i.inventory_deducted AS ded,
            ${withExempt ? "i.stock_exempt_at_issue" : "NULL"} AS exempt_at_issue
       FROM h_batch_inputs i LEFT JOIN h_materials m ON m.id = i.material_id AND m.tenant_id = i.tenant_id
      WHERE i.tenant_id = ? AND i.batch_id = ? ORDER BY i.id`;
  let inputs: any[];
  try {
    inputs = await q(inputSql(true), [tenantId, batchId]);
  } catch (e: any) {
    if (!/stock_exempt_at_issue/.test(String(e?.message))) throw e;
    inputs = await q(inputSql(false), [tenantId, batchId]);
  }
  const inputIds = inputs.map((i) => Number(i.id));
  const txs = await q(
    `SELECT t.id, t.material_id, t.lot_id, t.quantity + 0 AS qty, t.unit, t.source_line_id, t.reference_type, t.reference_id, t.notes, l.lot_number
       FROM h_inventory_transactions t LEFT JOIN h_inventory_lots l ON l.id = t.lot_id AND l.tenant_id = t.tenant_id
      WHERE t.tenant_id = ? AND t.transaction_type = 'usage'
        AND ( (t.reference_type = 'batch' AND t.reference_id = ?)
           OR (t.source_type IN ('BATCH', 'batch_completion') AND t.source_id = ?)
           ${inputIds.length ? `OR (t.reference_type = 'batch_input' AND t.reference_id IN (${inputIds.map(() => "?").join(",")}))` : ""} )`,
    [tenantId, batchId, batchId, ...inputIds],
  );
  const lineOf = (t: any): number | null => {
    if (t.source_line_id != null && inputIds.includes(Number(t.source_line_id))) return Number(t.source_line_id);
    if (t.reference_type === "batch_input" && inputIds.includes(Number(t.reference_id))) return Number(t.reference_id);
    return null;
  };
  const byLine = new Map<number, any[]>();
  const unlinked: any[] = [];
  for (const t of txs) {
    const k = lineOf(t);
    if (k == null) { unlinked.push(t); continue; }
    if (!byLine.has(k)) byLine.set(k, []);
    byLine.get(k)!.push(t);
  }
  const lines = inputs.map((i) => {
    const ts = byLine.get(Number(i.id)) ?? [];
    const qty = i.aq != null ? Number(i.aq) : Number(i.pq ?? 0);
    const qtySource = i.aq != null ? "actual" : "planned";
    const sum = r3(ts.reduce((a, t) => a + Number(t.qty), 0));
    const flags: string[] = [];
    const exemptAtIssue = Number(i.exempt_at_issue) === 1;
    if (exemptAtIssue && ts.length) flags.push("재고 차감 제외로 처리됐는데 차감 거래 있음");
    if (Number(i.ded) === 1 && ts.length === 0 && !exemptAtIssue) flags.push("차감 거래 없음(차감 표시 있음)");
    if (Number(i.ded) !== 1 && ts.length === 0 && qty > EPS) flags.push("미차감(차감 표시 없음)");
    if (ts.length && sum > qty + EPS) flags.push(`초과 차감 후보(+${r3(sum - qty)})`);
    if (ts.length && sum + EPS < qty) flags.push(`부족 차감(−${r3(qty - sum)})`);
    const dupKeys = new Map<string, number>();
    for (const t of ts) {
      const k = `${t.lot_id}|${Number(t.qty)}`;
      dupKeys.set(k, (dupKeys.get(k) ?? 0) + 1);
    }
    if ([...dupKeys.values()].some((n) => n > 1)) flags.push("중복 의심(같은 LOT·수량 거래 2건 이상)");
    if (norm(i.unit) !== norm(i.munit)) flags.push(`단위 불일치(투입 ${i.unit} / 원료 ${i.munit ?? "없음"})`);
    if (ts.some((t) => norm(t.unit) !== norm(i.unit))) flags.push("거래 단위 ≠ 투입 단위");
    if (ts.some((t) => /음수 차감/.test(String(t.notes ?? "")) || /^NEG-/.test(String(t.lot_number ?? "")))) flags.push("음수 차감 포함");
    return { inputId: Number(i.id), materialId: Number(i.material_id), material: i.material_name, qty, qtySource, unit: i.unit, deducted: sum, txCount: ts.length, txIds: ts.map((t) => Number(t.id)), exemptAtIssue, flags };
  });
  return {
    inputs: inputs.length, txCount: txs.length, lines,
    unlinkedTx: unlinked.map((t) => ({ id: Number(t.id), materialId: Number(t.material_id), qty: Number(t.qty), unit: t.unit, referenceType: t.reference_type, referenceId: t.reference_id != null ? Number(t.reference_id) : null })),
  };
}
