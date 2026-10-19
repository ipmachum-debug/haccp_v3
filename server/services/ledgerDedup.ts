/**
 * 원장 중복 정리 — 같은 사용 사건이 원장에 두 번 남은 경우 (2026-10-19, 생산 건 복구와 다른 작업)
 *
 * 사건 = 배치 투입 줄 하나(정본 원료). 원장에 그 사건을 나타내는 사용 거래가 둘:
 *   - 원 거래: 투입 줄 id 로 연결된 출고 (source_line_id = 줄)
 *   - 보충 거래: 투입 줄 id 없이 배치에만 연결된 옛 보충 출고 (source_line_id 없음)
 * 같은 원료인지는 정본 매핑(같은 id 또는 item_master.legacy_material_id FK)으로만 판단한다 — 이름·숫자 우연 일치로 잇지 않는다.
 *
 * 분류 (원 거래 LOT 연결로 판단, 메모 문자열에 기대지 않음):
 *   B — 원 거래 LOT 없음 + 보충 거래만 LOT 연결: 실재고는 한 번 빠졌고 원장만 두 번.
 *       원장 전용 상계(return, LEDGER_DEDUP, reversal_of_id = 원 거래, LOT 없음)를 붙인다. LOT·집계·수불부는 바꾸지 않는다.
 *   A — 원 거래와 보충 거래 모두 LOT 연결: 실재고가 두 번 빠진 근거. 원장·재고 모두 바꾸지 않고 연결과 영향량만 남긴다
 *       (뒤의 잔량 재설정·실사 영향을 따로 검증한 뒤 대표가 정함).
 *   그 밖 모양은 멈추고 사람 확인.
 * 금액: 원 거래·보충 거래 중 어느 금액을 반전할지 자동으로 고르지 않는다 — 상계 거래 금액은 비우고 전후표에 후보만 낸다.
 * 원본 거래를 지우거나 메모를 고치지 않는다. 한 트랜잭션·정리 키 1회·중복 거래당 1회(UNIQUE)·지문이 다르면 멈춤.
 * 회사·원료·배치 번호를 코드에 넣지 않는다 — 실행 입력으로만 받는다.
 */
import { createHash } from "node:crypto";
import { getRawConnection } from "../db";
import { insertAuditWith } from "../lib/production/designFactorySave";

export interface LedgerDedupInput {
  tenantId: number;
  /** 정본 원료 (h_materials.id) */
  materialId: number;
  /** 이 작업 범위의 배치 */
  batchIds: number[];
  reason: string;
}

export interface ExecuteLedgerDedupInput extends LedgerDedupInput {
  caseKey: string;
  expectedFingerprint: string;
  actorUserId: number;
}

export class LedgerDedupBlockedError extends Error {
  constructor(public readonly errors: string[]) {
    super(`원장 정리를 할 수 없습니다: ${errors.join(" / ")}`);
    this.name = "LedgerDedupBlockedError";
  }
}

export class LedgerDedupChangedError extends Error {
  constructor(public readonly expected: string, public readonly actual: string) {
    super("dry-run 뒤에 데이터가 바뀌었습니다. 다시 조회·비교한 뒤 승인받아 실행하세요.");
    this.name = "LedgerDedupChangedError";
  }
}

const EPS = 0.0005;
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const r2 = (x: number) => Math.round(x * 100) / 100;
const num = (v: unknown) => (v == null || v === "" ? 0 : Number(v));

async function q(conn: any, sql: string, params: unknown[]): Promise<any[]> {
  const [rows] = await conn.query(sql, params);
  return rows as any[];
}

function canon(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) o[k] = canon((v as any)[k]);
    return o;
  }
  return v == null ? null : String(v);
}

/** 원료 id 가 정본 원료와 같은 사건인가 — 같은 id, 또는 item_master.legacy_material_id FK 로 이어진 id (회사 안) */
const SAME_MATERIAL_SQL = (col: string) => `(${col} = ? OR EXISTS (SELECT 1 FROM item_master im WHERE im.tenant_id = ? AND im.id = ${col} AND im.legacy_material_id = ?))`;

export interface DedupEvent {
  batchId: number;
  batchInputId: number;
  productionDate: string;
  quantity: number;
  /** 투입 줄·원 거래·보충 거래 공통 단위 (상계 거래도 같은 단위) */
  unit: string;
  classification: "A" | "B";
  original: { id: number; lotId: number | null; materialId: number; amount: number | null; unitCost: number | null; date: string };
  backfill: { id: number; lotId: number | null; materialId: number; amount: number | null; unitCost: number | null; date: string };
}

export interface LedgerDedupPlan {
  ok: boolean;
  errors: string[];
  warnings: string[];
  fingerprint: string;
  input: LedgerDedupInput;
  events: DedupEvent[];
  totals: {
    events: number; kg: number;
    a: { count: number; kg: number }; b: { count: number; kg: number };
    /** 범위 배치·이 원료의 원장 사용(상계 제외) — 전/후 */
    ledgerUsageBefore: number; ledgerUsageAfter: number;
  };
  /** LOT·집계 — 정리 뒤에도 같아야 한다 */
  stock: { lots: Array<{ id: number; quantity: number; current: number; available: number; status: string }>; aggregate: number | null };
  /** 금액 후보 (자동 선택 안 함) */
  cost: { bOriginalAmount: number; bBackfillAmount: number; aOriginalAmount: number; aBackfillAmount: number };
  /** 원 거래가 다시 LOT 을 깎은 A 의 LOT 별 양 */
  aLotImpact: Array<{ lotId: number; kg: number; originalTxIds: number[] }>;
}

/** dry-run — 읽기만 한다 */
export async function planLedgerDedup(conn: any, input: LedgerDedupInput): Promise<LedgerDedupPlan> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { tenantId, materialId } = input;
  const batchIds = Array.from(new Set(input.batchIds.map(Number)));
  const plan: LedgerDedupPlan = {
    ok: false, errors, warnings, fingerprint: "", input, events: [],
    totals: { events: 0, kg: 0, a: { count: 0, kg: 0 }, b: { count: 0, kg: 0 }, ledgerUsageBefore: 0, ledgerUsageAfter: 0 },
    stock: { lots: [], aggregate: null }, cost: { bOriginalAmount: 0, bBackfillAmount: 0, aOriginalAmount: 0, aBackfillAmount: 0 }, aLotImpact: [],
  };
  if (!batchIds.length) errors.push("대상 배치가 없습니다.");
  if (!String(input.reason ?? "").trim()) errors.push("사유가 비어 있습니다.");
  if (errors.length) return plan;

  const mat = await q(conn, `SELECT id FROM h_materials WHERE id = ? AND tenant_id = ?`, [materialId, tenantId]);
  if (!mat.length) { errors.push("이 회사의 원료(정본)가 아닙니다."); return plan; }
  const batches = await q(conn, `SELECT id, status, DATE_FORMAT(planned_date, '%Y-%m-%d') AS wd FROM h_batches WHERE tenant_id = ? AND id IN (?)`, [tenantId, batchIds]);
  if (batches.length !== batchIds.length) { errors.push("이 회사의 배치가 아닌 번호가 있습니다 — 전부 거부합니다."); return plan; }

  // 사건 = 이 원료의 투입 줄
  const lines = await q(conn,
    `SELECT bi.id, bi.batch_id, bi.material_id, bi.unit, bi.actual_quantity, bi.planned_quantity, bi.inventory_deducted FROM h_batch_inputs bi
      WHERE bi.tenant_id = ? AND bi.batch_id IN (?) AND ${SAME_MATERIAL_SQL("bi.material_id")} ORDER BY bi.id`,
    [tenantId, batchIds, materialId, tenantId, materialId]);
  // 원장 표현 — 줄 연결 / 투입 참조 / 배치 단위(줄 없음)
  const txs = await q(conn,
    `SELECT t.id, t.lot_id, t.material_id, t.quantity, t.unit, t.unit_cost, t.amount, DATE_FORMAT(t.transaction_date, '%Y-%m-%d') AS td,
            t.reference_type, t.reference_id, t.source_type, t.source_id, t.source_line_id
       FROM h_inventory_transactions t
      WHERE t.tenant_id = ? AND t.transaction_type = 'usage' AND ${SAME_MATERIAL_SQL("t.material_id")}
        AND ((t.source_type IN ('BATCH', 'batch_completion') AND t.source_id IN (?)) OR (t.reference_type = 'batch' AND t.reference_id IN (?))
             OR (t.reference_type = 'batch_input' AND t.reference_id IN (?)))
      ORDER BY t.id`,
    [tenantId, materialId, tenantId, materialId, batchIds, batchIds, [...lines.map((l) => Number(l.id)), 0]]);
  const txIds = txs.map((t) => Number(t.id));
  const offsets = txIds.length ? await q(conn, `SELECT id, reversal_of_id FROM h_inventory_transactions WHERE tenant_id = ? AND reversal_of_id IN (?)`, [tenantId, txIds]) : [];
  const offsetOf = new Set(offsets.map((o) => Number(o.reversal_of_id)));
  const links = lines.length ? await q(conn, `SELECT batch_input_id, case_id FROM h_ledger_event_links WHERE tenant_id = ? AND batch_input_id IN (?)`, [tenantId, lines.map((l) => Number(l.id))]) : [];
  const linked = new Set(links.map((l) => Number(l.batch_input_id)));

  const batchOf = (t: any) => Number(t.reference_type === "batch_input" ? lines.find((l) => Number(l.id) === Number(t.reference_id))?.batch_id : t.source_id ?? t.reference_id);
  for (const b of batches) {
    const bid = Number(b.id);
    const myLines = lines.filter((l) => Number(l.batch_id) === bid);
    if (myLines.length !== 1) { errors.push(`배치 #${bid}: 이 원료 투입 줄이 ${myLines.length}개 — 사건을 하나로 정할 수 없습니다 (사람 확인).`); continue; }
    const line = myLines[0];
    if (linked.has(Number(line.id))) { errors.push(`배치 #${bid} 투입 줄 #${line.id} 는 이미 원장 정리에 연결되어 있습니다.`); continue; }
    const mine = txs.filter((t) => batchOf(t) === bid && !offsetOf.has(Number(t.id)));
    const orig = mine.filter((t) => Number(t.source_line_id) === Number(line.id) || (t.reference_type === "batch_input" && Number(t.reference_id) === Number(line.id)));
    const back = mine.filter((t) => t.source_line_id == null && t.reference_type !== "batch_input");
    if (orig.length !== 1 || back.length !== 1 || mine.length !== 2) {
      errors.push(`배치 #${bid}: 원장 표현이 원 거래 ${orig.length}·보충 ${back.length}·전체 ${mine.length} — '원 거래 1 + 보충 1' 모양이 아닙니다 (사람 확인).`);
      continue;
    }
    const o = orig[0], k = back[0];
    // 단위 — 투입 줄·원 거래·보충 거래가 같은 단위여야 같은 사건 (숫자만 같다고 같은 사건으로 보지 않는다, #608 검토 P2)
    const u = (x: unknown) => String(x ?? "").trim().toLowerCase();
    if (!u(line.unit) || u(line.unit) !== u(o.unit) || u(o.unit) !== u(k.unit)) {
      errors.push(`배치 #${bid}: 단위가 같지 않습니다 (투입 줄 ${line.unit ?? "없음"} · 원 거래 ${o.unit ?? "없음"} · 보충 ${k.unit ?? "없음"}) — 환산하지 않고 멈춥니다.`); continue;
    }
    const lineQty = num(line.actual_quantity ?? line.planned_quantity);
    if (Math.abs(num(o.quantity) - num(k.quantity)) > EPS || Math.abs(num(o.quantity) - lineQty) > EPS) {
      errors.push(`배치 #${bid}: 원 거래 ${o.quantity}·보충 ${k.quantity}·투입 줄 ${lineQty} 수량이 같지 않습니다.`); continue;
    }
    if (o.td !== k.td) { errors.push(`배치 #${bid}: 원 거래일(${o.td})과 보충 거래일(${k.td})이 다릅니다.`); continue; }
    let cls: "A" | "B";
    if (o.lot_id == null && k.lot_id != null) cls = "B";
    else if (o.lot_id != null && k.lot_id != null) cls = "A";
    else { errors.push(`배치 #${bid}: LOT 연결 모양(원 ${o.lot_id ?? "없음"} / 보충 ${k.lot_id ?? "없음"})이 A·B 어느 쪽도 아닙니다 (사람 확인).`); continue; }
    const pick = (t: any) => ({ id: Number(t.id), lotId: t.lot_id != null ? Number(t.lot_id) : null, materialId: Number(t.material_id), amount: t.amount != null ? Number(t.amount) : null, unitCost: t.unit_cost != null ? Number(t.unit_cost) : null, date: String(t.td) });
    plan.events.push({ batchId: bid, batchInputId: Number(line.id), productionDate: String(b.wd), quantity: r3(num(o.quantity)), unit: String(o.unit).trim(), classification: cls, original: pick(o), backfill: pick(k) });
  }

  const ev = plan.events;
  const a = ev.filter((e) => e.classification === "A"), b = ev.filter((e) => e.classification === "B");
  const usageBefore = r3(txs.filter((t) => !offsetOf.has(Number(t.id))).reduce((s, t) => s + num(t.quantity), 0));
  plan.totals = {
    events: ev.length, kg: r3(ev.reduce((s, e) => s + e.quantity, 0)),
    a: { count: a.length, kg: r3(a.reduce((s, e) => s + e.quantity, 0)) }, b: { count: b.length, kg: r3(b.reduce((s, e) => s + e.quantity, 0)) },
    ledgerUsageBefore: usageBefore, ledgerUsageAfter: r3(usageBefore - b.reduce((s, e) => s + e.quantity, 0)),
  };
  plan.cost = {
    bOriginalAmount: r2(b.reduce((s, e) => s + (e.original.amount ?? 0), 0)), bBackfillAmount: r2(b.reduce((s, e) => s + (e.backfill.amount ?? 0), 0)),
    aOriginalAmount: r2(a.reduce((s, e) => s + (e.original.amount ?? 0), 0)), aBackfillAmount: r2(a.reduce((s, e) => s + (e.backfill.amount ?? 0), 0)),
  };
  const byLot = new Map<number, { kg: number; ids: number[] }>();
  for (const e of a) {
    const cur = byLot.get(e.original.lotId!) ?? { kg: 0, ids: [] };
    cur.kg = r3(cur.kg + e.quantity); cur.ids.push(e.original.id); byLot.set(e.original.lotId!, cur);
  }
  plan.aLotImpact = Array.from(byLot.entries()).map(([lotId, v]) => ({ lotId, kg: v.kg, originalTxIds: v.ids }));
  if (a.length) warnings.push(`A ${a.length}건 ${plan.totals.a.kg}kg: 원 거래가 LOT 을 다시 깎은 근거 — 재고·원장은 바꾸지 않고 연결·영향량만 남깁니다 (뒤의 잔량 재설정·실사 영향 검증 후 대표 결정).`);

  const lots = await q(conn, `SELECT id, quantity, current_quantity, available_quantity, status FROM h_inventory_lots WHERE tenant_id = ? AND material_id = ? ORDER BY id`, [tenantId, materialId]);
  plan.stock.lots = lots.map((l) => ({ id: Number(l.id), quantity: num(l.quantity), current: num(l.current_quantity), available: num(l.available_quantity), status: String(l.status) }));
  const agg = await q(conn, `SELECT available_quantity FROM h_inventory WHERE tenant_id = ? AND material_id = ?`, [tenantId, materialId]);
  plan.stock.aggregate = agg.length ? num(agg[0].available_quantity) : null;

  const state = {
    input: { tenantId, materialId, batchIds: [...batchIds].sort((x, y) => x - y), reason: String(input.reason).trim() },
    lines: lines.map((l) => ({ id: l.id, m: l.material_id, u: l.unit, a: l.actual_quantity, p: l.planned_quantity, d: l.inventory_deducted })),
    txs, offsets: offsets.map((o) => o.id), links: links.map((l) => l.batch_input_id),
    lots: plan.stock.lots, agg: plan.stock.aggregate,
  };
  plan.fingerprint = createHash("sha256").update(JSON.stringify(canon(state))).digest("hex");
  plan.ok = errors.length === 0 && ev.length > 0;
  if (!ev.length && !errors.length) errors.push("정리할 사건이 없습니다.");
  return plan;
}

export interface ExecuteLedgerDedupResult {
  status: "done" | "already_done";
  caseId: number;
  summary: any;
}

/** 실행 — 한 트랜잭션. 원장 상계(B)와 연결(A·B)만 쓰고 LOT·집계·수불부·원본 거래는 바꾸지 않는다 */
export async function executeLedgerDedup(
  input: ExecuteLedgerDedupInput,
  opts: { pool?: any; onStep?: (step: string) => Promise<void> | void } = {},
): Promise<ExecuteLedgerDedupResult> {
  const pool = opts.pool ?? (await getRawConnection());
  const step = async (s: string) => { if (opts.onStep) await opts.onStep(s); };
  if (!String(input.caseKey ?? "").trim()) throw new LedgerDedupBlockedError(["정리 키가 비어 있습니다."]);
  const { tenantId } = input;
  const conn = await pool.getConnection();
  const readDone = async (c: any) => {
    const r = await q(c, `SELECT id, summary_json FROM h_ledger_dedup_cases WHERE tenant_id = ? AND case_key = ?`, [tenantId, input.caseKey]);
    if (!r.length) return null;
    const s = r[0].summary_json;
    return { status: "already_done" as const, caseId: Number(r[0].id), summary: typeof s === "string" ? JSON.parse(s) : s };
  };
  try {
    await conn.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
    await conn.beginTransaction();
    try {
      // 대상 배치의 이 원료 투입 줄 잠금 — 같은 정리·자동 출고가 동시에 오면 줄 선다
      const batchIds = Array.from(new Set(input.batchIds.map(Number)));
      await q(conn, `SELECT id FROM h_batch_inputs WHERE tenant_id = ? AND batch_id IN (?) ORDER BY id FOR UPDATE`, [tenantId, batchIds]);
      const done = await q(conn, `SELECT id FROM h_ledger_dedup_cases WHERE tenant_id = ? AND case_key = ? FOR UPDATE`, [tenantId, input.caseKey]);
      if (done.length) { await conn.rollback(); return (await readDone(pool))!; }

      const plan = await planLedgerDedup(conn, input);
      if (!plan.ok) throw new LedgerDedupBlockedError(plan.errors);
      if (plan.fingerprint !== input.expectedFingerprint) throw new LedgerDedupChangedError(input.expectedFingerprint, plan.fingerprint);
      // 원 거래·보충 거래 잠금 (상계 UNIQUE 와 함께 중복 처리 방지)
      await q(conn, `SELECT id FROM h_inventory_transactions WHERE tenant_id = ? AND id IN (?) ORDER BY id FOR UPDATE`,
        [tenantId, plan.events.flatMap((e) => [e.original.id, e.backfill.id])]);
      await step("planned");

      const reason = String(input.reason).trim();
      const [ins]: any = await conn.query(
        `INSERT INTO h_ledger_dedup_cases (tenant_id, case_key, material_id, reason, plan_json, fingerprint, executed_by, executed_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [tenantId, input.caseKey, input.materialId, reason, JSON.stringify(plan), plan.fingerprint, input.actorUserId],
      );
      const caseId = Number(ins.insertId);
      const tag = `[원장정리 #${caseId}]`;

      const offsetIds: number[] = [];
      for (const [i, e] of plan.events.entries()) {
        let offsetId: number | null = null;
        if (e.classification === "B") {
          // 원장 전용 상계 — LOT 없음(재고 변화 없음), 금액 비움(어느 금액을 반전할지 대표 결정 전), 원 거래 연결
          const [r]: any = await conn.query(
            `INSERT INTO h_inventory_transactions
               (tenant_id, lot_id, material_id, transaction_type, quantity, unit, unit_cost, amount, transaction_date,
                reference_type, reference_id, source_type, source_id, source_line_id, action_type, notes, created_by, reversal_of_id)
             VALUES (?, NULL, ?, 'return', ?, ?, NULL, NULL, ?, 'batch', ?, 'LEDGER_DEDUP', ?, ?, 'DUPLICATE_LEDGER_OFFSET', ?, ?, ?)`,
            [tenantId, input.materialId, e.quantity, e.unit, e.original.date, e.batchId, caseId, e.batchInputId,
              `${tag} 원장 중복 상계 — 원 거래 #${e.original.id}(LOT 없음)와 보충 거래 #${e.backfill.id}(LOT #${e.backfill.lotId})가 같은 투입 줄 #${e.batchInputId} 사건. 재고 변화 없음·환불 아님`,
              input.actorUserId, e.original.id],
          );
          offsetId = Number(r.insertId);
          offsetIds.push(offsetId);
        }
        await conn.query(
          `INSERT INTO h_ledger_event_links (tenant_id, case_id, event_key, batch_id, batch_input_id, canonical_material_id, original_tx_id, backfill_tx_id,
             classification, physical_tx_id, duplicate_tx_id, offset_tx_id, quantity, status, note, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [tenantId, caseId, `batch_input:${e.batchInputId}`, e.batchId, e.batchInputId, input.materialId, e.original.id, e.backfill.id,
            e.classification === "B" ? "B_LEDGER_ONLY" : "A_LOT_REDEDUCTED",
            e.classification === "B" ? e.backfill.id : null, e.original.id, offsetId, e.quantity,
            e.classification === "B" ? "ledger_offset" : "stock_review_pending",
            e.classification === "B" ? "실재고 1회(보충 거래 LOT) · 원 거래는 원장 전용 상계" : `원 거래도 LOT #${e.original.lotId} 를 깎음 — 재고 영향 검증·대표 결정 대기`],
        );
        if (i === Math.floor(plan.events.length / 2)) await step("half");
      }
      await step("written");

      // 적용 뒤 검사 — LOT·집계가 그대로인가, 상계 수·양
      const lotsAfter = await q(conn, `SELECT id, quantity, current_quantity, available_quantity, status FROM h_inventory_lots WHERE tenant_id = ? AND material_id = ? ORDER BY id`, [tenantId, input.materialId]);
      const sameLots = JSON.stringify(lotsAfter.map((l) => ({ id: Number(l.id), quantity: num(l.quantity), current: num(l.current_quantity), available: num(l.available_quantity), status: String(l.status) }))) === JSON.stringify(plan.stock.lots);
      const aggAfter = await q(conn, `SELECT available_quantity FROM h_inventory WHERE tenant_id = ? AND material_id = ?`, [tenantId, input.materialId]);
      if (!sameLots || (aggAfter.length ? num(aggAfter[0].available_quantity) : null) !== plan.stock.aggregate) throw new Error("원장 정리 중 LOT·집계가 바뀌었습니다 — 되돌립니다.");
      const off = await q(conn, `SELECT COUNT(*) AS n, COALESCE(SUM(quantity), 0) AS kg FROM h_inventory_transactions WHERE tenant_id = ? AND source_type = 'LEDGER_DEDUP' AND source_id = ?`, [tenantId, caseId]);
      if (Number(off[0].n) !== plan.totals.b.count || Math.abs(num(off[0].kg) - plan.totals.b.kg) > EPS) throw new Error("상계 거래 수·양이 계획과 다릅니다.");
      await step("verified");

      const summary = {
        caseId, caseKey: input.caseKey, materialId: input.materialId, actorUserId: input.actorUserId, reason, fingerprint: plan.fingerprint,
        totals: plan.totals, cost: plan.cost, aLotImpact: plan.aLotImpact, offsetTransactionIds: offsetIds,
        notes: [
          "B: 원장 전용 상계(LOT·집계·수불부 변화 없음) — 원 거래·보충 거래 원본 그대로",
          "A: 연결만 — 재고 영향은 뒤의 잔량 재설정·실사와 함께 따로 검증 후 대표 결정",
          "금액: 상계 거래 금액 비움 — 원 거래/보충 거래 금액 중 무엇을 반전할지 자동 선택하지 않음",
        ],
      };
      await conn.query(`UPDATE h_ledger_dedup_cases SET summary_json = ? WHERE id = ?`, [JSON.stringify(summary), caseId]);
      await insertAuditWith(conn, {
        tenantId, action: "ledger.dedup", entityType: "ledger_dedup_case", entityId: caseId, userId: input.actorUserId, changes: summary,
        description: `${tag} 원장 중복 정리: B ${plan.totals.b.count}건 ${plan.totals.b.kg}kg 상계, A ${plan.totals.a.count}건 ${plan.totals.a.kg}kg 연결(재고 검증 대기)`,
      });
      await step("before_commit");
      await conn.commit();
      return { status: "done", caseId, summary };
    } catch (e: any) {
      try { await conn.rollback(); } catch { /* 원래 오류를 알린다 */ }
      if (e?.code === "ER_DUP_ENTRY" && /uq_ldc_tenant_key/.test(String(e?.message))) {
        const d = await readDone(pool);
        if (d) return d;
      }
      throw e;
    }
  } finally {
    conn.release();
  }
}
