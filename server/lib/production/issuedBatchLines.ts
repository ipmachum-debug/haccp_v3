/**
 * 배치 투입의 출고 여부 (2026-10-14, 2026-10-17 보강, 2026-10-19 #608 검토 P1)
 *
 * h_batch_inputs.inventory_deducted 는 "LOT 을 실제로 차감했는가" 플래그다. 재고 마스터가 없거나
 * FEFO 가 실패하면 과거 자동출고는 LOT 없이 출고 기록(h_inventory_transactions, lot_id NULL)만 남기고
 * 플래그는 0 으로 뒀다 (덤프 10/14 기준 755건, 음수 허용 정책 10/8 이전 발생분).
 * 플래그만 보고 재실행하면 같은 투입이 두 번 출고되므로, 자동출고는 출고 원장을 함께 본다.
 *
 * 줄 상태 (classifyBatchLines):
 *   - line / input_ref: 줄 id 로 연결된 출고(BATCH·batch_completion, source_line_id) 또는 reference_type='batch_input' 출고
 *   - decided_existing: 사람이 '기존 출고로 인정' 한 줄 (h_batch_line_issue_decisions)
 *   - lineless_1to1: 줄 id 없는 옛 배치 단위 출고와 1:1 — 같은 배치에서 같은 원료(정본 매핑) 줄이 **전부 합쳐** 하나 ↔ 그 원료 줄 없는 출고(하나 또는 합),
 *       단위 같음. 수량은 줄을 나중에 고친 경우가 있어 비교하지 않는다 (예: 생산수량 축소 뒤 투입 줄 수정)
 *   - lineless_paired: 같은 원료 줄이 여럿이고 그중 직접 연결된 줄이 없을 때, 줄 수 = 출고 수 이고 수량이 하나하나 짝지어질 때만
 *     (직접 연결된 줄이 있으면 남은 옛 출고가 그 사건의 보충 표현일 수 있어 애매 — #609 검토 P1)
 *   - ambiguous: 줄 없는 출고는 있는데 위처럼 유일하게 이어지지 않음 — **다시 출고하지 않고, 출고 완료로도 보지 않는다**
 *       (자동 출고는 이 줄을 보류로 남기고, 미출고 줄 수에 들어가 완료·승인이 막힌다. 생산 건 화면에서 사람이 확인해 푼다)
 *   - none: 출고 없음
 * 같은 원료인지는 같은 id 또는 item_master.legacy_material_id FK 로만 본다 (이름 매칭 없음).
 * '다시 출고 금지' 와 '출고 완료' 는 다른 상태다 — ambiguous 는 둘 다 아니다 (#608 검토 P1).
 *
 * ★ 2026-10-17 (Codex #552 검토 P2): 조회가 실패하면 빈 집합으로 계속하지 않는다 — "출고 안 됨" 으로 추정하면
 *   재출고된다. 오류를 그대로 던진다.
 */
import { getRawConnection } from "../../db/connection";

/** 줄 출고 원장 조건 — 신규(BATCH)·구형(batch_completion) 모두, 줄 id 로 연결된 것만 */
export const ISSUED_LINE_SOURCE_TYPES = ["BATCH", "batch_completion"] as const;

export type LineIssueState = "line" | "input_ref" | "decided_existing" | "lineless_1to1" | "lineless_paired" | "ambiguous" | "none";
const REPRESENTED = new Set<LineIssueState>(["line", "input_ref", "decided_existing", "lineless_1to1", "lineless_paired"]);
export const isRepresented = (s: LineIssueState) => REPRESENTED.has(s);

export interface LineIssueInfo {
  lineId: number;
  materialId: number;
  unit: string;
  quantity: number;
  inventoryDeducted: boolean;
  issueHold: boolean;
  state: LineIssueState;
  /** ambiguous·lineless 일 때 대응 후보인 줄 없는 출고 */
  candidates: Array<{ txId: number; quantity: number; unit: string; lotId: number | null; date: string | null }>;
  /** 사람이 정한 것 — existing(기존 출고로 인정) / issue_new(새로 출고) */
  decision: "existing" | "issue_new" | null;
}

const EPS = 0.0005;
const unitOf = (u: unknown) => String(u ?? "kg").trim().toLowerCase() || "kg";
const n = (v: unknown) => (v == null || v === "" ? 0 : Number(v));

async function loadLines(c: any, batchId: number, tenantId: number): Promise<any[]> {
  try {
    const [rows]: any = await c.execute(
      `SELECT id, material_id, unit, actual_quantity, planned_quantity, inventory_deducted, issue_hold
         FROM h_batch_inputs WHERE batch_id = ? AND tenant_id = ? ORDER BY id`,
      [batchId, tenantId],
    );
    return rows as any[];
  } catch (e: any) {
    if (e?.code !== "ER_BAD_FIELD_ERROR") throw e; // issue_hold 칸 생성 전 DB
    const [rows]: any = await c.execute(
      `SELECT id, material_id, unit, actual_quantity, planned_quantity, inventory_deducted, 0 AS issue_hold
         FROM h_batch_inputs WHERE batch_id = ? AND tenant_id = ? ORDER BY id`,
      [batchId, tenantId],
    );
    return rows as any[];
  }
}

/** 배치 한 건의 투입 줄 상태 — 같은 연결(conn)로 읽는다 (출고 트랜잭션 안에서도) */
export async function classifyBatchLines(batchId: number, tenantId: number, conn?: any): Promise<Map<number, LineIssueInfo>> {
  const c = conn ?? (await getRawConnection());
  const lines = await loadLines(c, batchId, tenantId);
  const out = new Map<number, LineIssueInfo>();
  if (!lines.length) return out;
  const lineIds = lines.map((l) => Number(l.id));
  const ph = (a: unknown[]) => a.map(() => "?").join(", ");
  const [txRows]: any = await c.execute(
    `SELECT id, material_id, unit, quantity, lot_id, DATE_FORMAT(transaction_date, '%Y-%m-%d') AS td, source_type, source_id, source_line_id, reference_type, reference_id
       FROM h_inventory_transactions
      WHERE tenant_id = ? AND transaction_type = 'usage'
        AND ((source_type IN ('BATCH', 'batch_completion') AND source_id = ?) OR (reference_type = 'batch' AND reference_id = ?)
             OR (reference_type = 'batch_input' AND reference_id IN (${ph(lineIds)})))
      ORDER BY id`,
    [tenantId, batchId, batchId, ...lineIds],
  );
  const txs = txRows as any[];
  let decisions: any[] = [];
  try {
    const [d]: any = await c.execute(`SELECT batch_input_id, decision, tx_id FROM h_batch_line_issue_decisions WHERE tenant_id = ? AND batch_input_id IN (${ph(lineIds)})`, [tenantId, ...lineIds]);
    decisions = d as any[];
  } catch (e: any) {
    if (e?.code !== "ER_NO_SUCH_TABLE") throw e;
  }
  // 정본 매핑 — item_master id ↔ legacy_material_id (회사 안, FK 만)
  const mats = Array.from(new Set([...lines.map((l) => Number(l.material_id)), ...txs.map((t) => Number(t.material_id))].filter((x) => x > 0)));
  const legacy = new Map<number, number>();
  if (mats.length) {
    const [im]: any = await c.execute(
      `SELECT id, legacy_material_id FROM item_master WHERE tenant_id = ? AND legacy_material_id IS NOT NULL AND (id IN (${ph(mats)}) OR legacy_material_id IN (${ph(mats)}))`,
      [tenantId, ...mats, ...mats],
    );
    for (const r of im as any[]) legacy.set(Number(r.id), Number(r.legacy_material_id));
  }
  const sameMat = (a: number, b: number) => a === b || legacy.get(a) === b || legacy.get(b) === a;

  const claimed = new Set(decisions.filter((d) => d.tx_id != null).map((d) => Number(d.tx_id)));
  const decisionOf = new Map<number, "existing" | "issue_new">();
  for (const d of decisions) decisionOf.set(Number(d.batch_input_id), d.decision === "existing" ? "existing" : "issue_new");

  for (const l of lines) {
    const id = Number(l.id);
    const base: LineIssueInfo = {
      lineId: id, materialId: Number(l.material_id), unit: unitOf(l.unit), quantity: n(l.actual_quantity ?? l.planned_quantity),
      inventoryDeducted: Number(l.inventory_deducted) === 1, issueHold: Number(l.issue_hold) === 1, state: "none", candidates: [], decision: decisionOf.get(id) ?? null,
    };
    if (txs.some((t) => (ISSUED_LINE_SOURCE_TYPES as readonly string[]).includes(String(t.source_type)) && Number(t.source_id) === batchId && Number(t.source_line_id) === id)) base.state = "line";
    else if (txs.some((t) => t.reference_type === "batch_input" && Number(t.reference_id) === id)) base.state = "input_ref";
    else if (base.decision === "existing") base.state = "decided_existing";
    out.set(id, base);
  }
  // 원장 정리로 이미 어떤 사건(직접 연결 줄)의 다른 표현으로 연결된 출고 — 다른 줄의 후보로 쓰지 않는다 (#609 검토 P1)
  const ledgerLinked = new Set<number>();
  try {
    const [lk]: any = await c.execute(
      `SELECT original_tx_id, backfill_tx_id FROM h_ledger_event_links WHERE tenant_id = ? AND batch_id = ?`,
      [tenantId, batchId],
    );
    for (const x of lk as any[]) { ledgerLinked.add(Number(x.original_tx_id)); ledgerLinked.add(Number(x.backfill_tx_id)); }
  } catch (e: any) {
    if (e?.code !== "ER_NO_SUCH_TABLE") throw e;
  }
  // 줄 없는 옛 출고 — 사람이 이미 다른 줄에 붙인 출고·원장 정리로 연결된 출고는 뺀다
  const lineless = txs.filter((t) => t.source_line_id == null && t.reference_type !== "batch_input" && !claimed.has(Number(t.id)) && !ledgerLinked.has(Number(t.id)));
  // 대응의 유일성은 같은 원료의 **모든** 줄로 본다 (#609 검토 P1) — 직접 연결된 줄이 있으면 남은 옛 출고가
  //   그 줄 사건의 다른 표현(보충)인지 다른 줄의 출고인지 알 수 없다 → 미해결 줄은 애매(재출고 금지 + 승인·완료 보류).
  //   '새로 출고' 로 정해진 줄은 옛 출고와 무관하다고 사람이 정한 것 — 짝짓기에서 빠지고 직접 연결로도 세지 않는다.
  const done = new Set<number>();
  for (const l of lines) {
    const id = Number(l.id);
    if (done.has(id)) continue;
    const m = Number(l.material_id);
    const groupAll = lines.filter((x) => sameMat(Number(x.material_id), m));
    groupAll.forEach((x) => done.add(Number(x.id)));
    const infosAll = groupAll.map((x) => out.get(Number(x.id))!);
    const open = infosAll.filter((i) => i.state === "none" && i.decision == null);
    if (!open.length) continue;
    const direct = infosAll.filter((i) => i.state !== "none");
    const groupTx = lineless.filter((t) => sameMat(Number(t.material_id), m));
    if (!groupTx.length) continue;
    const cand = groupTx.map((t) => ({ txId: Number(t.id), quantity: n(t.quantity), unit: unitOf(t.unit), lotId: t.lot_id != null ? Number(t.lot_id) : null, date: t.td ?? null }));
    const sameUnit = cand.every((t) => open.every((i) => i.unit === t.unit));
    const issueNew = infosAll.some((i) => i.decision === "issue_new");
    let state: LineIssueState = "ambiguous";
    if (sameUnit && !direct.length && !issueNew && infosAll.length === 1) state = "lineless_1to1";
    else if (sameUnit && !direct.length && !issueNew && open.length === cand.length) {
      const a = open.map((i) => i.quantity).sort((x, y) => x - y);
      const b = cand.map((t) => t.quantity).sort((x, y) => x - y);
      if (a.every((q, k) => Math.abs(q - b[k]) <= EPS)) state = "lineless_paired";
    }
    for (const i of open) { i.state = state; i.candidates = cand; }
  }
  return out;
}

export async function getIssuedBatchLineIds(batchId: number, tenantId: number, conn?: any): Promise<Set<number>> {
  const m = await classifyBatchLines(batchId, tenantId, conn);
  return new Set(Array.from(m.values()).filter((i) => isRepresented(i.state)).map((i) => i.lineId));
}

/** 한 줄 — 출고 트랜잭션 안에서 줄을 잠근 뒤 다시 확인할 때 (같은 분류) */
export async function batchLineIssueState(conn: any, lineId: number, tenantId: number): Promise<LineIssueState> {
  const [[row]]: any = await conn.execute(`SELECT batch_id FROM h_batch_inputs WHERE id = ? AND tenant_id = ?`, [lineId, tenantId]);
  if (!row) return "none";
  return (await classifyBatchLines(Number(row.batch_id), tenantId, conn)).get(lineId)?.state ?? "none";
}

/**
 * 아직 출고되지 않은 투입 줄 수 — 플래그 0 이고, 원장에 출고로 나타나지 않았고(애매한 줄 포함), 수량 > 0.
 * 이 수가 0 이 아니면 제품 LOT 생성·생산원가 확정(생산완료 분개)·승인을 하지 않는다 (Codex #552 검토 P1).
 * 조회 실패는 throw.
 */
export async function countUnissuedBatchLines(batchId: number, tenantId: number, conn?: any): Promise<number> {
  const m = await classifyBatchLines(batchId, tenantId, conn);
  return Array.from(m.values()).filter((i) => !i.inventoryDeducted && i.quantity > 0 && !isRepresented(i.state)).length;
}
