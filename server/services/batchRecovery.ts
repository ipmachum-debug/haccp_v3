/**
 * 이력 보존형 생산 건 복구 (2026-10-19 — 같은 날 같은 제품이 중복으로 만들어진 생산 건)
 *
 * 같은 날 같은 제품이 중복으로 만들어진 생산 건을 지우지 않고 '무효' 로 표시하고, 남길 생산 건으로 대체 관계를 남긴다.
 *   - 일반 삭제(deleteBatch — 거래·CCP·결재 물리 삭제)나 상태 직접 변경으로 처리하지 않는다.
 *   - 원료: 무효 건의 사용 거래 하나하나에 원 거래를 가리키는 역거래(return, BATCH_VOID)를 붙인다.
 *     원 거래의 수량·단가·금액·거래일 그대로. 같은 LOT 의 quantity·current_quantity·available_quantity 를
 *     표준 재고 관문(applyLotDelta)으로 되돌리고, 그 원료 집계만 다시 맞춘다 (전체 재계산 없음).
 *     수불부(material_ledger_daily)는 원 거래일의 사용량에서 역거래 양만큼 뺀다. 공급처 입고로 기록하지 않는다.
 *   - CCP: 무효 건의 인스턴스·기록지는 원본 그대로 두고 무효 표시만 (상태를 '반려' 로 바꾸지 않는다).
 *     금속검출 일일 통합 기록지는 무효 건의 통과 행만 보관 후 뺀다 — 감도점검·사람 입력은 그대로, 행 버전을 올려 재확인 필요.
 *     남는 생산 건의 가열 공정 행은 지금 공장 설정으로 다시 계획한다 (원본은 보관표에, 확인·사람 입력이 있으면 멈춤).
 *     다시 계획한 시각은 예정값이다 — 실제 확인 시각으로 쓰지 않는다.
 *   - 결재: 무효 건의 결재 요청은 'cancelled' + 결재 이력. 생산 일정은 'cancelled'. 생산 로그는 메모로 무효·대체를 남긴다.
 *   - 남는 생산 건의 미출고 원료 줄은 자동 출고하지 않고 '보류(별도 확인)' 로 둔다.
 *   - 완료 생산·완제품 LOT·분개는 만들지 않는다. 남는 생산 건을 '예정'·'첫 확인 차감' 대상으로 바꾸지 않는다.
 *
 * 순서: planRecovery (읽기만 — dry-run, 지문) → 대표 승인 → executeRecovery (한 트랜잭션, 지문이 다르면 멈춤).
 * 한 번만: 복구 키 UNIQUE + 원 거래당 역거래 UNIQUE + 생산 건 잠금(FOR UPDATE). 중간 실패 → 전부 되돌림.
 * 회사 격리: 넘긴 번호 중 하나라도 이 회사 것이 아니면 전부 거부.
 * 특정 회사·날짜·번호를 코드에 넣지 않는다 — 대상은 실행 입력으로만 받는다.
 */
import { createHash } from "node:crypto";
import { getRawConnection } from "../db";
import { applyLotDelta } from "../lib/inventory/applyInventoryDelta";
import { expectedPassageEntries } from "../lib/haccp/passageSignature";
import { insertAuditWith } from "../lib/production/designFactorySave";
import { planCcpForDay, insertPlannedRows } from "./ccp-batch";
import type { PlannedProcess } from "../lib/production/ccpDayPlanner";
import { syncCcpRowsToFormRows } from "../db/haccp/ccpFormSettings";

export interface RecoveryInput {
  tenantId: number;
  /** 생산일 YYYY-MM-DD — 바꾸지 않는다 */
  businessDate: string;
  /** 남길 생산 건 — 이 순서로 가열 공정을 다시 계획한다 */
  keepBatchIds: number[];
  /** 무효로 할 생산 건과 대체 생산 건 (같은 제품·같은 계획량) */
  voids: Array<{ batchId: number; supersededBy: number }>;
  /** 남는 생산 건의 미출고 원료 줄 — 자동 출고하지 않고 별도 확인으로 둔다 (미출고 줄 전부여야 함) */
  holdInputIds: number[];
  reason: string;
}

export interface ExecuteRecoveryInput extends RecoveryInput {
  recoveryKey: string;
  /** dry-run 지문 — 그 뒤 수량·LOT·확인·결재가 바뀌었으면 멈춘다 */
  expectedFingerprint: string;
  actorUserId: number;
}

export class RecoveryBlockedError extends Error {
  constructor(public readonly errors: string[]) {
    super(`복구할 수 없습니다: ${errors.join(" / ")}`);
    this.name = "RecoveryBlockedError";
  }
}

export class RecoveryChangedError extends Error {
  constructor(public readonly expected: string, public readonly actual: string) {
    super("dry-run 뒤에 데이터가 바뀌었습니다 (수량·LOT·확인·결재 등). 다시 조회·비교한 뒤 승인받아 실행하세요.");
    this.name = "RecoveryChangedError";
  }
}

const EPS = 0.0005;
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const r2 = (x: number) => Math.round(x * 100) / 100;
const num = (v: unknown) => (v == null || v === "" ? 0 : Number(v));
const DONE_STATUSES = new Set(["completed", "approved", "shipped", "archived"]);
const OPEN_APPROVAL = new Set(["pending_writer", "pending_review", "pending_approval", "pending"]);

async function q(conn: any, sql: string, params: unknown[]): Promise<any[]> {
  const [rows] = await conn.query(sql, params);
  return rows as any[];
}

/** 지문용 — 값만, 순서 고정 */
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

export interface RecoveryPlan {
  ok: boolean;
  errors: string[];
  warnings: string[];
  fingerprint: string;
  input: RecoveryInput;
  batches: {
    before: { count: number; kg: number };
    after: { count: number; kg: number };
    rows: Array<{ id: number; productId: number; productName: string; kg: number; status: string; action: "keep" | "void"; supersededBy: number | null }>;
  };
  reversals: Array<{ txId: number; batchId: number; lotId: number; materialId: number; qty: number; unit: string; unitCost: number | null; amount: number | null; date: string; sourceLineId: number | null }>;
  alreadyReversedTxIds: number[];
  totals: { reversalCount: number; reversalQty: number; reversalAmount: number; materials: number; lots: number; usageBefore: number; usageAfter: number };
  lots: Array<{ lotId: number; lotNumber: string; materialId: number; add: number; status: string; before: { quantity: number; current: number; available: number }; after: { quantity: number; current: number; available: number }; sourceTxIds: number[] }>;
  materials: Array<{ materialId: number; name: string; reverseQty: number; reverseAmount: number; aggregateBefore: number | null; aggregateAfter: number }>;
  ledger: Array<{ materialId: number; date: string; usageBefore: number | null; minus: number; usageAfter: number | null }>;
  ccp: {
    heatingRowsBefore: number;
    heatingRowsAfter: number;
    voidInstanceIds: number[];
    voidFormIds: number[];
    replan: Array<{ batchId: number; instanceId: number; processGroupId: number; formRecordId: number | null; bomVersionId: number | null; beforeRows: Array<{ id: number; equipment: string | null; start: string | null; end: string | null; inputKg: number | null; heatingMin: number | null }>; afterRounds: Array<{ seq: number; equipment: string | null; start: string | null; end: string | null; inputKg: number | null; heatingMin: number | null; occupancyMin: number | null }>; process: PlannedProcess }>;
    metal: null | { formRecordId: number; status: string; rowsVersion: number; confirmed: boolean; passRowsBefore: number; passKgBefore: number; removeRowIds: number[]; removeMap: Array<{ rowId: number; batchId: number }>; passRowsAfter: number; passKgAfter: number; sensitivityRows: number; anchorBatchId: number | null };
  };
  approvals: { cancel: Array<{ id: number; status: string; referenceType: string; referenceId: number; title: string }>; keep: Array<{ id: number; status: string; referenceType: string; referenceId: number }> };
  holds: Array<{ inputId: number; batchId: number; materialId: number; qty: number; unit: string }>;
  relations: { schedules: number[]; productionLogs: Array<{ id: number; batchId: number; versionId: number | null }>; deductionLogs: number; createRequests: Array<{ id: number; batchId: number; requestKey: string; rowKey: string }> };
}

/**
 * dry-run — 읽기만 한다. 실행과 같은 계산(executeRecovery 가 잠금 뒤 다시 부른다).
 * 막는 사유는 errors 로 모두 돌려준다 (하나라도 있으면 실행하지 않음).
 */
export async function planRecovery(conn: any, input: RecoveryInput): Promise<RecoveryPlan> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { tenantId, businessDate } = input;
  const keepIds = input.keepBatchIds.map(Number);
  const voidIds = input.voids.map((v) => Number(v.batchId));
  const allIds = [...keepIds, ...voidIds];
  const superOf = new Map(input.voids.map((v) => [Number(v.batchId), Number(v.supersededBy)]));

  const empty = (): RecoveryPlan => ({
    ok: false, errors, warnings, fingerprint: "", input,
    batches: { before: { count: 0, kg: 0 }, after: { count: 0, kg: 0 }, rows: [] },
    reversals: [], alreadyReversedTxIds: [],
    totals: { reversalCount: 0, reversalQty: 0, reversalAmount: 0, materials: 0, lots: 0, usageBefore: 0, usageAfter: 0 },
    lots: [], materials: [], ledger: [],
    ccp: { heatingRowsBefore: 0, heatingRowsAfter: 0, voidInstanceIds: [], voidFormIds: [], replan: [], metal: null },
    approvals: { cancel: [], keep: [] }, holds: [],
    relations: { schedules: [], productionLogs: [], deductionLogs: 0, createRequests: [] },
  });

  // ── 0. 입력 모양
  if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) errors.push("생산일 형식이 아닙니다 (YYYY-MM-DD).");
  if (!keepIds.length || !voidIds.length) errors.push("남길 생산 건과 무효로 할 생산 건이 모두 있어야 합니다.");
  if (new Set(allIds).size !== allIds.length) errors.push("같은 생산 건 번호가 두 번 들어 있습니다.");
  for (const v of input.voids) if (!keepIds.includes(Number(v.supersededBy))) errors.push(`#${v.batchId} 의 대체 생산 건 #${v.supersededBy} 가 남길 목록에 없습니다.`);
  if (!String(input.reason ?? "").trim()) errors.push("사유가 비어 있습니다.");
  if (errors.length) return empty();

  // ── 1. 생산 건 — 회사 격리: 하나라도 이 회사 것이 아니면 전부 거부
  const batches = await q(conn,
    `SELECT b.id, b.product_id, COALESCE(p.product_name, '') AS product_name, b.planned_quantity, b.status, b.plan_only,
            DATE_FORMAT(b.planned_date, '%Y-%m-%d') AS wd, DATE_FORMAT(b.start_time, '%H:%i') AS st,
            b.actual_quantity, b.completed_at, b.voided_at, b.superseded_by_batch_id, b.day_batch_group, b.batch_order, b.site_id
       FROM h_batches b LEFT JOIN h_products_v2 p ON p.id = b.product_id AND p.tenant_id = b.tenant_id
      WHERE b.tenant_id = ? AND b.id IN (?)`,
    [tenantId, allIds]);
  if (batches.length !== allIds.length) {
    errors.push("이 회사의 생산 건이 아닌 번호가 있습니다 — 전부 거부합니다.");
    return empty();
  }
  const byId = new Map(batches.map((b) => [Number(b.id), b]));
  for (const b of batches) {
    const id = Number(b.id);
    if (b.wd !== businessDate) errors.push(`#${id} 의 생산일(${b.wd})이 ${businessDate} 가 아닙니다.`);
    if (b.voided_at) errors.push(`#${id} 는 이미 무효 처리되었습니다.`);
    if (Number(b.plan_only ?? 0) !== 0) errors.push(`#${id} 는 예정 생산 건(plan_only)입니다 — 이 복구 대상이 아닙니다.`);
    if (DONE_STATUSES.has(String(b.status)) || b.completed_at != null || b.actual_quantity != null) errors.push(`#${id} 는 완료·실적이 있는 생산 건입니다 (상태 ${b.status}).`);
    if (String(b.status) === "cancelled") errors.push(`#${id} 는 이미 취소 상태입니다.`);
  }
  for (const v of input.voids) {
    const a = byId.get(Number(v.batchId));
    const k = byId.get(Number(v.supersededBy));
    if (!a || !k) continue;
    if (Number(a.product_id) !== Number(k.product_id)) errors.push(`#${v.batchId} 와 대체 #${v.supersededBy} 의 제품이 다릅니다.`);
    if (Math.abs(num(a.planned_quantity) - num(k.planned_quantity)) > EPS) errors.push(`#${v.batchId} 와 대체 #${v.supersededBy} 의 계획량이 다릅니다 (${a.planned_quantity} / ${k.planned_quantity}).`);
  }
  // 같은 날 다른 생산 건이 있으면 가열 계획을 빈 공장으로 다시 세울 수 없다
  const others = await q(conn,
    `SELECT id FROM h_batches WHERE tenant_id = ? AND planned_date = ? AND id NOT IN (?) AND voided_at IS NULL AND status <> 'cancelled'`,
    [tenantId, businessDate, allIds]);
  if (others.length) errors.push(`같은 날 다른 생산 건이 있습니다 (#${others.map((r) => r.id).join(", #")}) — 계획을 다시 확인해야 합니다.`);
  // 완제품 LOT·SKU 실적
  const prodLots = await q(conn, `SELECT id, batch_id FROM h_inventory_lots WHERE tenant_id = ? AND batch_id IN (?)`, [tenantId, allIds]);
  if (prodLots.length) errors.push(`완제품 LOT 이 있는 생산 건이 있습니다 (LOT #${prodLots.map((r) => r.id).join(", #")}).`);
  let skuOut: any[] = [];
  try { skuOut = await q(conn, `SELECT id, batch_id FROM production_sku_output WHERE tenant_id = ? AND batch_id IN (?)`, [tenantId, voidIds]); } catch (e: any) { if (e?.code !== "ER_NO_SUCH_TABLE") throw e; }
  if (skuOut.length) errors.push(`무효 대상에 SKU 생산 실적이 있습니다 (${skuOut.length}건) — 따로 확인해야 합니다.`);
  // 금속검출 계획 전용 표(쓰지 않음, metalRecordSource) — 무효 대상에 남아 있으면 따로 확인
  let runs: any[] = [];
  try { runs = await q(conn, `SELECT id FROM h_ccp_batch_process_runs WHERE tenant_id = ? AND batch_id IN (?)`, [tenantId, voidIds]); } catch (e: any) { if (e?.code !== "ER_NO_SUCH_TABLE") throw e; }
  if (runs.length) errors.push(`무효 대상에 금속검출 계획 실행 기록이 있습니다 (${runs.length}건) — 따로 확인해야 합니다.`);

  // ── 2. 원료 — 무효 건의 사용 거래 → 역거래
  const inputs = await q(conn,
    `SELECT id, batch_id, material_id, planned_quantity, actual_quantity, unit, inventory_deducted, issue_hold
       FROM h_batch_inputs WHERE tenant_id = ? AND batch_id IN (?) ORDER BY id`,
    [tenantId, allIds]);
  const usage = await q(conn,
    `SELECT t.id, t.lot_id, t.material_id, t.quantity, t.unit, t.unit_cost, t.amount,
            DATE_FORMAT(t.transaction_date, '%Y-%m-%d') AS td, t.reference_type, t.reference_id, t.source_type, t.source_id, t.source_line_id, t.action_type
       FROM h_inventory_transactions t
      WHERE t.tenant_id = ? AND t.transaction_type = 'usage'
        AND ((t.reference_type = 'batch' AND t.reference_id IN (?)) OR (t.source_type = 'BATCH' AND t.source_id IN (?)))
      ORDER BY t.id`,
    [tenantId, allIds, allIds]);
  const usageIds = usage.map((t) => Number(t.id));
  const reversed = usageIds.length
    ? await q(conn, `SELECT id, reversal_of_id FROM h_inventory_transactions WHERE tenant_id = ? AND reversal_of_id IN (?)`, [tenantId, usageIds])
    : [];
  const reversedSet = new Set(reversed.map((r) => Number(r.reversal_of_id)));
  const batchOfTx = (t: any) => Number(t.reference_type === "batch" ? t.reference_id : t.source_id);
  const voidSet = new Set(voidIds);
  const reversals: RecoveryPlan["reversals"] = [];
  const alreadyReversedTxIds: number[] = [];
  for (const t of usage) {
    const bid = batchOfTx(t);
    if (!voidSet.has(bid)) continue;
    if (reversedSet.has(Number(t.id))) { alreadyReversedTxIds.push(Number(t.id)); continue; }
    if (t.lot_id == null) { errors.push(`사용 거래 #${t.id} 에 LOT 이 없어 되돌릴 LOT 을 알 수 없습니다.`); continue; }
    if (!(num(t.quantity) > 0)) { errors.push(`사용 거래 #${t.id} 의 수량이 0 이하입니다.`); continue; }
    if (!t.td) { errors.push(`사용 거래 #${t.id} 에 거래일이 없습니다.`); continue; }
    reversals.push({
      txId: Number(t.id), batchId: bid, lotId: Number(t.lot_id), materialId: Number(t.material_id),
      qty: r3(num(t.quantity)), unit: String(t.unit ?? "kg"),
      unitCost: t.unit_cost != null ? Number(t.unit_cost) : null, amount: t.amount != null ? Number(t.amount) : null,
      date: String(t.td), sourceLineId: t.source_line_id != null ? Number(t.source_line_id) : null,
    });
  }
  if (alreadyReversedTxIds.length) errors.push(`이미 역거래가 있는 원 거래가 있습니다 (#${alreadyReversedTxIds.join(", #")}) — 다른 복구가 진행되었는지 확인하세요.`);
  // 다른 종류 거래(반품·조정 등)가 무효 건에 붙어 있으면 따로 확인
  const otherTx = await q(conn,
    `SELECT id, transaction_type FROM h_inventory_transactions
      WHERE tenant_id = ? AND transaction_type <> 'usage' AND reference_type = 'batch' AND reference_id IN (?)`,
    [tenantId, voidIds]);
  if (otherTx.length) errors.push(`무효 대상에 사용 외 거래가 있습니다 (#${otherTx.map((r) => `${r.id}:${r.transaction_type}`).join(", ")}).`);

  // LOT 전후
  const lotIds = Array.from(new Set(reversals.map((r) => r.lotId)));
  const lotRows = lotIds.length
    ? await q(conn, `SELECT id, lot_number, material_id, product_id, quantity, current_quantity, available_quantity, status FROM h_inventory_lots WHERE tenant_id = ? AND id IN (?) ORDER BY id`, [tenantId, lotIds])
    : [];
  const lotById = new Map(lotRows.map((l) => [Number(l.id), l]));
  const lots: RecoveryPlan["lots"] = [];
  for (const id of lotIds) {
    const l = lotById.get(id);
    const rs = reversals.filter((r) => r.lotId === id);
    if (!l) { errors.push(`LOT #${id} 를 찾을 수 없습니다.`); continue; }
    if (Number(l.material_id) !== rs[0].materialId) errors.push(`LOT #${id} 의 원료(${l.material_id})가 원 거래 원료(${rs[0].materialId})와 다릅니다.`);
    if (!["available", "used"].includes(String(l.status))) errors.push(`LOT #${id} 상태가 ${l.status} 입니다 — 수량만 돌릴지 따로 정해야 합니다.`);
    const add = r3(rs.reduce((a, r) => a + r.qty, 0));
    const before = { quantity: num(l.quantity), current: num(l.current_quantity ?? l.quantity), available: num(l.available_quantity) };
    lots.push({
      lotId: id, lotNumber: String(l.lot_number ?? ""), materialId: Number(l.material_id), add, status: String(l.status),
      before, after: { quantity: r3(before.quantity + add), current: r3(before.current + add), available: r3(before.available + add) },
      sourceTxIds: rs.map((r) => r.txId),
    });
  }

  // 원료별 — 집계 전후 (집계 = available LOT 합, 표준 관문 규칙)
  const matIds = Array.from(new Set(reversals.map((r) => r.materialId)));
  const matRows = matIds.length ? await q(conn, `SELECT id, material_name FROM h_materials WHERE tenant_id = ? AND id IN (?)`, [tenantId, matIds]) : [];
  const aggRows = matIds.length ? await q(conn, `SELECT material_id, available_quantity FROM h_inventory WHERE tenant_id = ? AND material_id IN (?)`, [tenantId, matIds]) : [];
  const lotSumRows = matIds.length
    ? await q(conn, `SELECT id, material_id, available_quantity, status FROM h_inventory_lots WHERE tenant_id = ? AND material_id IN (?)`, [tenantId, matIds])
    : [];
  const materials: RecoveryPlan["materials"] = matIds.map((mid) => {
    const rs = reversals.filter((r) => r.materialId === mid);
    let after = 0;
    for (const l of lotSumRows.filter((x) => Number(x.material_id) === mid)) {
      const add = lots.find((x) => x.lotId === Number(l.id))?.add ?? 0;
      const st = add > 0 && l.status === "used" ? "available" : String(l.status);
      if (st === "available") after += num(l.available_quantity) + add;
    }
    const agg = aggRows.find((a) => Number(a.material_id) === mid);
    return {
      materialId: mid, name: String(matRows.find((m) => Number(m.id) === mid)?.material_name ?? `#${mid}`),
      reverseQty: r3(rs.reduce((a, r) => a + r.qty, 0)), reverseAmount: r2(rs.reduce((a, r) => a + (r.amount ?? 0), 0)),
      aggregateBefore: agg ? num(agg.available_quantity) : null, aggregateAfter: r3(after),
    };
  });

  // 수불부 — 원 거래일의 사용량에서 뺀다 (모자라면 멈춤)
  const ledgerKeys = new Map<string, { materialId: number; date: string; minus: number }>();
  for (const r of reversals) {
    const k = `${r.materialId}|${r.date}`;
    const cur = ledgerKeys.get(k) ?? { materialId: r.materialId, date: r.date, minus: 0 };
    cur.minus = r3(cur.minus + r.qty);
    ledgerKeys.set(k, cur);
  }
  const ledgerRows = matIds.length
    ? await q(conn, `SELECT id, material_id, ledger_date, usage_qty FROM material_ledger_daily WHERE tenant_id = ? AND material_id IN (?) AND ledger_date IN (?)`,
        [tenantId, matIds, Array.from(new Set(reversals.map((r) => r.date)))])
    : [];
  const ledger: RecoveryPlan["ledger"] = [];
  for (const g of Array.from(ledgerKeys.values())) {
    const row = ledgerRows.find((l) => Number(l.material_id) === g.materialId && String(l.ledger_date).slice(0, 10) === g.date);
    const before = row ? num(row.usage_qty) : null;
    if (before == null) errors.push(`수불부에 원료 #${g.materialId} ${g.date} 사용 행이 없습니다.`);
    else if (before + EPS < g.minus) errors.push(`수불부 원료 #${g.materialId} ${g.date} 사용량(${before})이 되돌릴 양(${g.minus})보다 적습니다.`);
    ledger.push({ materialId: g.materialId, date: g.date, usageBefore: before, minus: g.minus, usageAfter: before == null ? null : r3(before - g.minus) });
  }

  // 미출고 줄 — 남는 생산 건의 미출고 줄 전부를 보류로 (자동 출고 금지)
  const issuedLine = new Set(usage.map((t) => Number(t.source_line_id)).filter((x) => x > 0));
  const keepSet = new Set(keepIds);
  const unissuedKeep = inputs.filter((i) => keepSet.has(Number(i.batch_id)) && Number(i.inventory_deducted) !== 1 && !issuedLine.has(Number(i.id)));
  const holdSet = new Set(input.holdInputIds.map(Number));
  const holds: RecoveryPlan["holds"] = [];
  for (const i of unissuedKeep) {
    if (!holdSet.has(Number(i.id))) errors.push(`남는 생산 건 #${i.batch_id} 의 미출고 줄 #${i.id} 가 보류 목록에 없습니다.`);
    holds.push({ inputId: Number(i.id), batchId: Number(i.batch_id), materialId: Number(i.material_id), qty: r3(num(i.planned_quantity ?? i.actual_quantity)), unit: String(i.unit ?? "kg") });
  }
  for (const id of Array.from(holdSet)) {
    if (!unissuedKeep.some((i) => Number(i.id) === id)) errors.push(`보류 목록의 줄 #${id} 는 남는 생산 건의 미출고 줄이 아닙니다.`);
  }

  // ── 3. CCP
  const instances = await q(conn,
    `SELECT id, batch_id, ccp_type, process_group_id, status, voided_at FROM h_ccp_instances WHERE tenant_id = ? AND batch_id IN (?) ORDER BY id`,
    [tenantId, allIds]);
  const instIds = instances.map((i) => Number(i.id));
  const ccpRows = instIds.length
    ? await q(conn,
        `SELECT id, instance_id, equipment_id, equipment_name, batch_no, sort_order, measured_at, temp_c, duration_min, heating_min, cycle_total_min,
                pressure_bar, result, note, auto_generated, planned_start, planned_end, planned_input_kg
           FROM h_ccp_rows WHERE tenant_id = ? AND instance_id IN (?) ORDER BY instance_id, sort_order, id`,
        [tenantId, instIds])
    : [];
  const forms = await q(conn,
    `SELECT id, batch_id, ccp_type, process_group_id, status, rows_version, confirmed_at, confirmed_rows_version, approval_request_id, batch_count, planned_qty_kg, voided_at,
            DATE_FORMAT(work_date, '%Y-%m-%d') AS wd
       FROM h_ccp_form_records
      WHERE tenant_id = ? AND (batch_id IN (?) OR (ccp_type = 'CCP-4P' AND work_date = ?))
      ORDER BY id`,
    [tenantId, allIds, businessDate]);
  const formIds = forms.map((f) => Number(f.id));
  const formRows = formIds.length
    ? await q(conn, `SELECT * FROM h_ccp_form_rows WHERE tenant_id = ? AND form_record_id IN (?) ORDER BY form_record_id, batch_seq, id`, [tenantId, formIds])
    : [];
  const heatInst = instances.filter((i) => i.ccp_type !== "CCP-4P");
  const heatingRowsBefore = ccpRows.filter((r) => heatInst.some((i) => Number(i.id) === Number(r.instance_id))).length;
  const voidInstanceIds = instances.filter((i) => voidSet.has(Number(i.batch_id))).map((i) => Number(i.id));
  const voidForms = forms.filter((f) => f.ccp_type !== "CCP-4P" && voidSet.has(Number(f.batch_id)));
  for (const f of voidForms) {
    if (f.status === "approved") errors.push(`무효 대상 기록지 #${f.id} 가 승인되어 있습니다.`);
    if (f.confirmed_at != null) errors.push(`무효 대상 기록지 #${f.id} 가 확인되어 있습니다 — 따로 확인해야 합니다.`);
  }

  // 남는 생산 건 가열 공정 — 지금 공장 설정으로 다시 계획 (입력 순서 그대로, 그날 다른 생산 없음 → 빈 공장)
  const keepBatches = keepIds.map((id) => byId.get(id)!).filter(Boolean);
  const day = await planCcpForDay({
    tenantId, workDate: businessDate, ignoreBusy: true,
    rows: keepBatches.map((b) => ({ rowKey: String(b.id), productId: Number(b.product_id), plannedKg: num(b.planned_quantity), startTime: b.st || "09:00" })),
  });
  // 원 출고 로그의 BOM 버전 — 다시 계획하는 버전과 같아야 한다
  const logs = await q(conn,
    `SELECT pl.id, pl.mf_report_version_id, pl.notes FROM h_production_log pl
       JOIN h_mf_report_versions rv ON rv.id = pl.mf_report_version_id
       JOIN h_mf_reports r ON r.id = rv.mf_report_id AND r.tenant_id = ?
      WHERE pl.production_date = ? AND pl.notes LIKE '%batch_id:%'`,
    [tenantId, businessDate]);
  const logOf = (bid: number) => logs.filter((l) => new RegExp(`batch_id:${bid}(?![0-9])`).test(String(l.notes ?? "")));
  const replan: RecoveryPlan["ccp"]["replan"] = [];
  let heatingRowsAfter = 0;
  for (const b of keepBatches) {
    const bid = Number(b.id);
    const plan = day.plans.find((p) => p.rowKey === String(bid));
    const meta = day.meta.find((m) => m.rowKey === String(bid));
    const versionId = meta?.bom.versionId ?? null;
    const logVersions = Array.from(new Set(logOf(bid).map((l) => Number(l.mf_report_version_id))));
    if (logVersions.length && (versionId == null || !logVersions.includes(versionId))) {
      errors.push(`#${bid} 원 출고 BOM 버전(${logVersions.join(",")})과 지금 계획 버전(${versionId ?? "-"})이 다릅니다.`);
    }
    if (meta?.bom.massBasis === "error") errors.push(`#${bid} BOM 계산 오류: ${meta.bom.error ?? ""}`);
    const myInst = heatInst.filter((i) => Number(i.batch_id) === bid);
    const planGroups = new Set((plan?.processes ?? []).map((p) => p.processGroupId));
    const instGroups = new Set(myInst.map((i) => Number(i.process_group_id)));
    if (planGroups.size !== instGroups.size || Array.from(planGroups).some((g) => !instGroups.has(g))) {
      errors.push(`#${bid} 가열 공정이 지금 설정(${Array.from(planGroups).join(",") || "없음"})과 기존 인스턴스(${Array.from(instGroups).join(",") || "없음"})가 다릅니다.`);
      continue;
    }
    for (const inst of myInst) {
      const proc = plan!.processes.find((p) => p.processGroupId === Number(inst.process_group_id))!;
      if (!proc.rounds.length) errors.push(`#${bid} 공정 ${proc.name} 계획 회차가 없습니다.`);
      const rows = ccpRows.filter((r) => Number(r.instance_id) === Number(inst.id));
      for (const r of rows) {
        if (r.measured_at != null || Number(r.auto_generated ?? 1) !== 1) errors.push(`#${bid} CCP 행 #${r.id} 에 사람 입력·측정 시각이 있습니다 — 다시 계획하지 않습니다.`);
      }
      const f = forms.find((x) => Number(x.batch_id) === bid && x.ccp_type === inst.ccp_type && Number(x.process_group_id) === Number(inst.process_group_id));
      if (!f) errors.push(`#${bid} 공정 ${proc.name} 기록지가 없습니다.`);
      else {
        if (f.status === "approved" || f.confirmed_at != null || num(f.rows_version) > 0) errors.push(`#${bid} 기록지 #${f.id} 는 확인·수정·승인된 기록지입니다 — 다시 계획하지 않습니다.`);
        for (const fr of formRows.filter((x) => Number(x.form_record_id) === Number(f.id))) {
          if (fr.confirmed_by != null || fr.action_by != null || Number(fr.is_deviation ?? 0) === 1 || fr.corrective_action != null) {
            errors.push(`#${bid} 기록지 #${f.id} 행 #${fr.id} 에 사람 입력(확인자·조치·이탈)이 있습니다.`);
          }
        }
      }
      heatingRowsAfter += proc.rounds.length;
      replan.push({
        batchId: bid, instanceId: Number(inst.id), processGroupId: Number(inst.process_group_id), formRecordId: f ? Number(f.id) : null, bomVersionId: versionId,
        beforeRows: rows.map((r) => ({ id: Number(r.id), equipment: r.equipment_name ?? null, start: r.planned_start ?? null, end: r.planned_end ?? null, inputKg: r.planned_input_kg != null ? Number(r.planned_input_kg) : null, heatingMin: r.heating_min != null ? Number(r.heating_min) : null })),
        afterRounds: proc.rounds.map((x) => ({ seq: x.seq, equipment: x.equipmentName, start: x.plannedStart, end: x.plannedEnd, inputKg: x.inputKg, heatingMin: x.heatingMin, occupancyMin: x.occupancyMin })),
        process: proc,
      });
    }
  }

  // 금속검출 일일 통합 기록지 — 무효 건의 통과 행만 (제품별 생성 순서 = 생산 건 순서로 검증)
  let metal: RecoveryPlan["ccp"]["metal"] = null;
  const dayMetal = forms.filter((f) => f.ccp_type === "CCP-4P" && f.wd === businessDate && !f.voided_at);
  if (dayMetal.length > 1) errors.push(`금속검출 일일 기록지가 ${dayMetal.length}장입니다 — 하나여야 합니다.`);
  if (dayMetal.length === 1) {
    const mf = dayMetal[0];
    if (mf.status === "approved") errors.push(`금속검출 기록지 #${mf.id} 가 승인되어 있습니다.`);
    const rowsOf = formRows.filter((r) => Number(r.form_record_id) === Number(mf.id));
    const pass = rowsOf.filter((r) => r.equipment_type === "passage").sort((a, b) => num(a.batch_seq) - num(b.batch_seq) || num(a.id) - num(b.id));
    // 제품별로 생산 건 순서 (일일 통과 행 생성과 같은 순서)
    const ordered = [...batches].sort((a, b) =>
      String(a.day_batch_group ?? `_${a.id}`).localeCompare(String(b.day_batch_group ?? `_${b.id}`)) || num(a.batch_order) - num(b.batch_order) || num(a.id) - num(b.id));
    const removeMap: Array<{ rowId: number; batchId: number }> = [];
    const names = Array.from(new Set(ordered.map((b) => String(b.product_name))));
    const passNames = new Set(pass.map((r) => String(r.product_name ?? "")));
    for (const nm of Array.from(passNames)) if (!names.includes(nm)) errors.push(`금속검출 통과 행에 대상 밖 제품(${nm})이 있습니다.`);
    for (const nm of names) {
      const bs = ordered.filter((b) => String(b.product_name) === nm);
      const rs = pass.filter((r) => String(r.product_name ?? "") === nm);
      const exp = expectedPassageEntries(bs.map((b) => ({ batch_id: b.id, sku_id: null, product_name: b.product_name, sku_name: null, sales_unit: null, sku_quantity: null, sku_kg: null, planned_quantity: b.planned_quantity })), nm);
      if (rs.length !== bs.length) { errors.push(`금속검출 통과 행(${nm}) ${rs.length}개와 생산 건 ${bs.length}건이 맞지 않습니다 — 대응을 확인할 수 없습니다.`); continue; }
      rs.forEach((r, i) => {
        if (Number(r.pass_qty) !== exp[i].qty || String(r.pass_unit ?? "kg") !== String(exp[i].unit)) {
          errors.push(`금속검출 통과 행 #${r.id}(${nm}) 수량 ${r.pass_qty}${r.pass_unit ?? ""} 이 생산 건 #${bs[i].id} 의 ${exp[i].qty}${exp[i].unit} 와 다릅니다.`);
        } else if (voidSet.has(Number(bs[i].id))) removeMap.push({ rowId: Number(r.id), batchId: Number(bs[i].id) });
      });
    }
    const removeIds = new Set(removeMap.map((m) => m.rowId));
    const passKg = (rs: any[]) => r3(rs.filter((r) => String(r.pass_unit ?? "kg") === "kg").reduce((a, r) => a + num(r.pass_qty), 0));
    metal = {
      formRecordId: Number(mf.id), status: String(mf.status), rowsVersion: num(mf.rows_version), confirmed: mf.confirmed_at != null,
      passRowsBefore: pass.length, passKgBefore: passKg(pass), removeRowIds: removeMap.map((m) => m.rowId), removeMap,
      passRowsAfter: pass.length - removeIds.size, passKgAfter: passKg(pass.filter((r) => !removeIds.has(Number(r.id)))),
      sensitivityRows: rowsOf.length - pass.length, anchorBatchId: mf.batch_id != null ? Number(mf.batch_id) : null,
    };
    if (metal.confirmed) warnings.push(`금속검출 기록지 #${mf.id} 는 확인되어 있었습니다 — 통과 행을 뺀 뒤 다시 확인해야 합니다.`);
  }

  // ── 4. 결재
  const voidFormIds = voidForms.map((f) => Number(f.id));
  const approvals = await q(conn,
    `SELECT id, status, reference_type, reference_id, request_type, title FROM h_approval_requests
      WHERE tenant_id = ? AND ((reference_type = 'batch' AND reference_id IN (?)) OR (reference_type = 'ccp_form_record' AND reference_id IN (?)))
      ORDER BY id`,
    [tenantId, allIds, [...formIds, 0]]);
  const voidFormSet = new Set(voidFormIds);
  const cancel: RecoveryPlan["approvals"]["cancel"] = [];
  const keepAp: RecoveryPlan["approvals"]["keep"] = [];
  for (const a of approvals) {
    const target = a.reference_type === "batch" ? voidSet.has(Number(a.reference_id)) : voidFormSet.has(Number(a.reference_id));
    if (!target) { keepAp.push({ id: Number(a.id), status: String(a.status), referenceType: String(a.reference_type), referenceId: Number(a.reference_id) }); continue; }
    if (a.status === "approved") errors.push(`무효 대상 결재 #${a.id} 가 승인되어 있습니다.`);
    else if (OPEN_APPROVAL.has(String(a.status))) cancel.push({ id: Number(a.id), status: String(a.status), referenceType: String(a.reference_type), referenceId: Number(a.reference_id), title: String(a.title ?? "") });
  }

  // ── 5. 연결 기록 (생산 일정·생산 로그·차감 로그·생성 요청 키)
  const schedules = await q(conn, `SELECT id, batch_id, status FROM h_batch_schedules WHERE tenant_id = ? AND batch_id IN (?) ORDER BY id`, [tenantId, allIds]);
  const voidLogs = logs.flatMap((l) => {
    const m = /batch_id:(\d+)(?![0-9])/.exec(String(l.notes ?? ""));
    const bid = m ? Number(m[1]) : 0;
    return voidSet.has(bid) ? [{ id: Number(l.id), batchId: bid, versionId: l.mf_report_version_id != null ? Number(l.mf_report_version_id) : null }] : [];
  });
  const dedRows = voidLogs.length ? await q(conn, `SELECT COUNT(*) AS n FROM h_inventory_deduction_log WHERE production_log_id IN (?)`, [voidLogs.map((l) => l.id)]) : [{ n: 0 }];
  let reqRows: any[] = [];
  try { reqRows = await q(conn, `SELECT id, batch_id, request_key, row_key, status FROM h_batch_create_requests WHERE tenant_id = ? AND batch_id IN (?) ORDER BY id`, [tenantId, voidIds]); } catch (e: any) { if (e?.code !== "ER_NO_SUCH_TABLE") throw e; }

  // ── 6. 합계
  const usageVoidKeep = usage.filter((t) => allIds.includes(batchOfTx(t)));
  const usageBefore = r3(usageVoidKeep.reduce((a, t) => a + num(t.quantity), 0));
  const reversalQty = r3(reversals.reduce((a, r) => a + r.qty, 0));
  const kg = (ids: number[]) => r3(ids.reduce((a, id) => a + num(byId.get(id)?.planned_quantity), 0));

  const plan: RecoveryPlan = {
    ok: false, errors, warnings, fingerprint: "", input,
    batches: {
      before: { count: allIds.length, kg: kg(allIds) },
      after: { count: keepIds.length, kg: kg(keepIds) },
      rows: [...batches].sort((a, b) => num(a.id) - num(b.id)).map((b) => ({
        id: Number(b.id), productId: Number(b.product_id), productName: String(b.product_name), kg: num(b.planned_quantity), status: String(b.status),
        action: voidSet.has(Number(b.id)) ? "void" as const : "keep" as const, supersededBy: superOf.get(Number(b.id)) ?? null,
      })),
    },
    reversals, alreadyReversedTxIds,
    totals: {
      reversalCount: reversals.length, reversalQty, reversalAmount: r2(reversals.reduce((a, r) => a + (r.amount ?? 0), 0)),
      materials: matIds.length, lots: lotIds.length, usageBefore, usageAfter: r3(usageBefore - reversalQty),
    },
    lots, materials, ledger,
    ccp: { heatingRowsBefore, heatingRowsAfter, voidInstanceIds, voidFormIds, replan, metal },
    approvals: { cancel, keep: keepAp }, holds,
    relations: {
      schedules: schedules.filter((s) => voidSet.has(Number(s.batch_id))).map((s) => Number(s.id)),
      productionLogs: voidLogs, deductionLogs: Number(dedRows[0]?.n ?? 0),
      createRequests: reqRows.map((r) => ({ id: Number(r.id), batchId: Number(r.batch_id), requestKey: String(r.request_key), rowKey: String(r.row_key) })),
    },
  };

  // 지문 — 대상 상태 전부 (하나라도 바뀌면 실행 멈춤)
  const state = {
    // 대상 입력만 (실행 때 붙는 복구 키·실행자·지문은 넣지 않는다 — dry-run 과 실행이 같은 지문)
    input: { tenantId, businessDate, reason: String(input.reason ?? "").trim(), keepBatchIds: keepIds, voids: input.voids.map((v) => ({ batchId: Number(v.batchId), supersededBy: Number(v.supersededBy) })), holdInputIds: [...holdSet].sort((a, b) => a - b) },
    batches: batches.map((b) => ({ id: b.id, product_id: b.product_id, planned_quantity: b.planned_quantity, status: b.status, plan_only: b.plan_only, wd: b.wd, voided_at: b.voided_at, actual_quantity: b.actual_quantity })).sort((a, b) => num(a.id) - num(b.id)),
    inputs: inputs.map((i) => ({ id: i.id, m: i.material_id, p: i.planned_quantity, a: i.actual_quantity, d: i.inventory_deducted, h: i.issue_hold })),
    usage: usageVoidKeep.map((t) => ({ id: t.id, lot: t.lot_id, q: t.quantity, c: t.unit_cost, amt: t.amount, d: t.td })),
    reversed: reversed.map((r) => r.id),
    lots: lotRows.map((l) => ({ id: l.id, q: l.quantity, c: l.current_quantity, a: l.available_quantity, s: l.status })),
    agg: aggRows.map((a) => ({ m: a.material_id, a: a.available_quantity })),
    ledger: ledgerRows.map((l) => ({ id: l.id, u: l.usage_qty })),
    instances: instances.map((i) => ({ id: i.id, s: i.status, v: i.voided_at })),
    ccpRows, forms: forms.map((f) => ({ ...f })), formRows,
    approvals: approvals.map((a) => ({ id: a.id, s: a.status })),
    schedules: schedules.map((s) => ({ id: s.id, s: s.status })),
    plan: replan.map((r) => ({ b: r.batchId, g: r.processGroupId, v: r.bomVersionId, rounds: r.process.rounds })),
  };
  plan.fingerprint = createHash("sha256").update(JSON.stringify(canon(state))).digest("hex");
  plan.ok = errors.length === 0;
  return plan;
}

/** 원본 행을 그대로 보관 — DB 값 그대로 JSON (컬럼 목록은 표에서 읽음) */
async function archiveRows(conn: any, recoveryId: number, tenantId: number, table: string, ids: number[], action: string, opts: { tenantScoped?: boolean } = {}): Promise<number> {
  if (!ids.length) return 0;
  if (!/^[a-z0-9_]+$/.test(table)) throw new Error(`보관표 이름 오류: ${table}`);
  const cols = await q(conn, `SELECT COLUMN_NAME AS c FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`, [table]);
  const obj = cols.map((r) => `'${String(r.c)}', t.\`${String(r.c)}\``).join(", ");
  const tenantCond = opts.tenantScoped === false ? "" : " AND t.tenant_id = ?";
  const [res]: any = await conn.query(
    `INSERT INTO h_recovery_archive (tenant_id, recovery_id, table_name, row_id, action, row_json, archived_at)
     SELECT ?, ?, ?, t.id, ?, JSON_OBJECT(${obj}), NOW() FROM \`${table}\` t WHERE t.id IN (?)${tenantCond}`,
    opts.tenantScoped === false ? [tenantId, recoveryId, table, action, ids] : [tenantId, recoveryId, table, action, ids, tenantId],
  );
  return Number(res?.affectedRows ?? 0);
}

export interface ExecuteRecoveryResult {
  status: "done" | "already_done";
  recoveryId: number;
  summary: any;
}

/**
 * 실행 — 한 트랜잭션. 생산 건을 잠근 뒤 다시 계산해 dry-run 지문과 같을 때만 적용한다.
 * onStep: 시험용 — 단계마다 불러 중간 실패를 흉내 낸다 (운영 호출은 넘기지 않음).
 */
export async function executeRecovery(
  input: ExecuteRecoveryInput,
  opts: { pool?: any; onStep?: (step: string) => Promise<void> | void; regenerateDaily?: boolean } = {},
): Promise<ExecuteRecoveryResult> {
  const pool = opts.pool ?? (await getRawConnection());
  const step = async (s: string) => { if (opts.onStep) await opts.onStep(s); };
  if (!String(input.recoveryKey ?? "").trim()) throw new RecoveryBlockedError(["복구 키가 비어 있습니다."]);
  const conn = await pool.getConnection();
  const { tenantId } = input;
  const keepIds = input.keepBatchIds.map(Number);
  const voidIds = input.voids.map((v) => Number(v.batchId));
  const allIds = [...keepIds, ...voidIds];
  let result: ExecuteRecoveryResult;
  try {
    // 잠금 뒤 읽기는 최신 커밋 값으로 (앞선 실행이 끝났으면 그 결과를 본다)
    await conn.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
    await conn.beginTransaction();
    try {
      // 1) 생산 건 잠금 — 같은 복구 동시 실행은 여기서 줄 선다
      const locked = await q(conn, `SELECT id FROM h_batches WHERE tenant_id = ? AND id IN (?) ORDER BY id FOR UPDATE`, [tenantId, allIds]);
      // 2) 같은 복구 키 — 이미 끝났으면 아무것도 하지 않음
      const done = await q(conn, `SELECT id, summary_json FROM h_batch_recoveries WHERE tenant_id = ? AND recovery_key = ? FOR UPDATE`, [tenantId, input.recoveryKey]);
      if (done.length) {
        await conn.rollback();
        const s = done[0].summary_json;
        return { status: "already_done", recoveryId: Number(done[0].id), summary: typeof s === "string" ? JSON.parse(s) : s };
      }
      if (locked.length !== allIds.length) throw new RecoveryBlockedError(["이 회사의 생산 건이 아닌 번호가 있습니다 — 전부 거부합니다."]);
      // 3) 되돌릴 LOT · 그날 기록지 잠금
      const lotIds = (await q(conn,
        `SELECT DISTINCT lot_id FROM h_inventory_transactions WHERE tenant_id = ? AND transaction_type = 'usage' AND lot_id IS NOT NULL
           AND ((reference_type = 'batch' AND reference_id IN (?)) OR (source_type = 'BATCH' AND source_id IN (?)))`,
        [tenantId, voidIds, voidIds])).map((r) => Number(r.lot_id));
      if (lotIds.length) await q(conn, `SELECT id FROM h_inventory_lots WHERE tenant_id = ? AND id IN (?) ORDER BY id FOR UPDATE`, [tenantId, lotIds]);
      await q(conn, `SELECT id FROM h_ccp_form_records WHERE tenant_id = ? AND (batch_id IN (?) OR (ccp_type = 'CCP-4P' AND work_date = ?)) ORDER BY id FOR UPDATE`, [tenantId, allIds, input.businessDate]);

      // 4) 다시 계산 — 막는 사유·지문
      const plan = await planRecovery(conn, input);
      if (!plan.ok) throw new RecoveryBlockedError(plan.errors);
      if (plan.fingerprint !== input.expectedFingerprint) throw new RecoveryChangedError(input.expectedFingerprint, plan.fingerprint);
      await step("planned");

      const reason = String(input.reason).trim();
      const [ins]: any = await conn.query(
        `INSERT INTO h_batch_recoveries (tenant_id, recovery_key, business_date, reason, plan_json, fingerprint, executed_by, executed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [tenantId, input.recoveryKey, input.businessDate, reason, JSON.stringify(plan), plan.fingerprint, input.actorUserId],
      );
      const recoveryId = Number(ins.insertId);
      const tag = `[복구 #${recoveryId}]`;

      // 5) 원본 보관 (바꾸거나 빼기 전 모습)
      const replanInst = plan.ccp.replan.map((r) => r.instanceId);
      const replanForms = plan.ccp.replan.map((r) => r.formRecordId).filter((x): x is number => x != null);
      const replanRows = replanInst.length ? (await q(conn, `SELECT id FROM h_ccp_rows WHERE tenant_id = ? AND instance_id IN (?)`, [tenantId, replanInst])).map((r) => Number(r.id)) : [];
      const replanFormRows = replanForms.length ? (await q(conn, `SELECT id FROM h_ccp_form_rows WHERE tenant_id = ? AND form_record_id IN (?)`, [tenantId, replanForms])).map((r) => Number(r.id)) : [];
      const ledgerIds = plan.ledger.length
        ? (await q(conn, `SELECT id FROM material_ledger_daily WHERE tenant_id = ? AND material_id IN (?) AND ledger_date IN (?)`,
            [tenantId, plan.ledger.map((l) => l.materialId), Array.from(new Set(plan.ledger.map((l) => l.date)))])).map((r) => Number(r.id))
        : [];
      const aggIds = plan.materials.length ? (await q(conn, `SELECT id FROM h_inventory WHERE tenant_id = ? AND material_id IN (?)`, [tenantId, plan.materials.map((m) => m.materialId)])).map((r) => Number(r.id)) : [];
      await archiveRows(conn, recoveryId, tenantId, "h_batches", allIds, "before");
      await archiveRows(conn, recoveryId, tenantId, "h_inventory_lots", plan.lots.map((l) => l.lotId), "before");
      await archiveRows(conn, recoveryId, tenantId, "h_inventory", aggIds, "before");
      await archiveRows(conn, recoveryId, tenantId, "material_ledger_daily", ledgerIds, "before");
      await archiveRows(conn, recoveryId, tenantId, "h_ccp_instances", plan.ccp.voidInstanceIds, "before_void");
      await archiveRows(conn, recoveryId, tenantId, "h_ccp_form_records", [...plan.ccp.voidFormIds, ...replanForms, ...(plan.ccp.metal ? [plan.ccp.metal.formRecordId] : [])], "before");
      await archiveRows(conn, recoveryId, tenantId, "h_ccp_rows", replanRows, "replaced");
      await archiveRows(conn, recoveryId, tenantId, "h_ccp_form_rows", replanFormRows, "replaced");
      await archiveRows(conn, recoveryId, tenantId, "h_ccp_form_rows", plan.ccp.metal?.removeRowIds ?? [], "removed_void_passage");
      await archiveRows(conn, recoveryId, tenantId, "h_approval_requests", plan.approvals.cancel.map((a) => a.id), "before");
      await archiveRows(conn, recoveryId, tenantId, "h_batch_schedules", plan.relations.schedules, "before");
      await archiveRows(conn, recoveryId, tenantId, "h_production_log", plan.relations.productionLogs.map((l) => l.id), "before", { tenantScoped: false });
      await archiveRows(conn, recoveryId, tenantId, "h_batch_inputs", plan.holds.map((h) => h.inputId), "before_hold");
      await step("archived");

      // 6) 역거래 — 원 거래 하나에 하나, 원 수량·단가·금액·거래일 그대로 (입고 아님)
      const reversalIds: number[] = [];
      for (const r of plan.reversals) {
        const res = await applyLotDelta(conn, {
          tenantId, lotId: r.lotId, subject: { materialId: r.materialId }, quantity: r.qty, direction: "increase",
          transactionType: "return", unit: r.unit, unitCost: r.unitCost, amountOverride: r.amount,
          reference: { referenceType: "batch", referenceId: r.batchId, sourceType: "BATCH_VOID", sourceId: recoveryId, sourceLineId: r.sourceLineId, actionType: "VOID_REVERSAL" },
          notes: `${tag} 중복 생산 건 #${r.batchId} 무효 — 원 사용 거래 #${r.txId} 역거래 (공급처 입고 아님)`,
          createdBy: input.actorUserId, transactionDate: r.date, reversalOfId: r.txId,
        });
        reversalIds.push(res.transactionId);
        if (reversalIds.length === Math.ceil(plan.reversals.length / 2)) await step("reversals_half");
      }
      await step("reversed");

      // 7) 수불부 — 원 거래일 사용량에서 뺀다 (모자라면 멈춤)
      for (const l of plan.ledger) {
        const [u]: any = await conn.query(
          `UPDATE material_ledger_daily SET usage_qty = usage_qty - ?, notes = CONCAT(COALESCE(notes, ''), ?), updated_at = NOW()
            WHERE tenant_id = ? AND material_id = ? AND ledger_date = ? AND usage_qty >= ? - ${EPS}`,
          [l.minus, `, ${tag} 중복 생산 건 무효 -${l.minus}`, tenantId, l.materialId, l.date, l.minus],
        );
        if (Number(u.affectedRows) !== 1) throw new Error(`수불부 원료 #${l.materialId} ${l.date} 를 맞출 수 없습니다.`);
      }

      // 8) 생산 건 무효 + 대체 관계 (원본 행은 그대로, 상태는 집계 제외용 'cancelled')
      for (const v of input.voids) {
        const [u]: any = await conn.query(
          `UPDATE h_batches SET status = 'cancelled', voided_at = NOW(), voided_by = ?, void_reason = ?, superseded_by_batch_id = ?
            WHERE id = ? AND tenant_id = ? AND voided_at IS NULL`,
          [input.actorUserId, `${tag} ${reason}`.slice(0, 500), v.supersededBy, v.batchId, tenantId],
        );
        if (Number(u.affectedRows) !== 1) throw new Error(`생산 건 #${v.batchId} 를 무효로 표시하지 못했습니다.`);
      }
      // CCP 인스턴스·기록지 무효 표시 (상태·행은 그대로 — '반려' 로 바꾸지 않음)
      if (plan.ccp.voidInstanceIds.length) await conn.query(`UPDATE h_ccp_instances SET voided_at = NOW() WHERE tenant_id = ? AND id IN (?)`, [tenantId, plan.ccp.voidInstanceIds]);
      if (plan.ccp.voidFormIds.length) {
        await conn.query(`UPDATE h_ccp_form_records SET voided_at = NOW(), void_reason = ? WHERE tenant_id = ? AND id IN (?)`, [`${tag} 중복 생산 건 무효 — ${reason}`.slice(0, 500), tenantId, plan.ccp.voidFormIds]);
      }
      await step("voided");

      // 9) 결재 — 무효 건 결재 요청 취소 + 결재 이력
      for (const a of plan.approvals.cancel) {
        const [u]: any = await conn.query(
          `UPDATE h_approval_requests SET status = 'cancelled', notes = CONCAT(COALESCE(notes, ''), ?) WHERE id = ? AND tenant_id = ? AND status = ?`,
          [`\n${tag} 중복 생산 건 무효로 결재 취소 (원래 ${a.status})`, a.id, tenantId, a.status],
        );
        if (Number(u.affectedRows) !== 1) throw new Error(`결재 #${a.id} 상태가 바뀌었습니다.`);
        await conn.query(
          `INSERT INTO h_approval_history (tenant_id, request_id, action, action_by, action_at, comments) VALUES (?, ?, 'cancelled', ?, NOW(), ?)`,
          [tenantId, a.id, input.actorUserId, `${tag} 이력 보존형 복구 — 중복 생산 건 무효 (원래 ${a.status}). ${reason}`],
        );
      }
      // 생산 일정 취소 · 생산 로그에 무효·대체 메모 (차감 로그는 이 로그에 매달려 함께 추적)
      if (plan.relations.schedules.length) {
        await conn.query(`UPDATE h_batch_schedules SET status = 'cancelled', notes = CONCAT(COALESCE(notes, ''), ?) WHERE tenant_id = ? AND id IN (?)`, [` | ${tag} 무효`, tenantId, plan.relations.schedules]);
      }
      const superOf = new Map(input.voids.map((v) => [Number(v.batchId), Number(v.supersededBy)]));
      for (const l of plan.relations.productionLogs) {
        await conn.query(`UPDATE h_production_log SET notes = CONCAT(COALESCE(notes, ''), ?) WHERE id = ?`, [` | voided:recovery#${recoveryId} superseded_by:${superOf.get(l.batchId)}`, l.id]);
      }

      // 10) 미출고 줄 보류 — 자동 출고하지 않음 (별도 확인)
      if (plan.holds.length) {
        const [u]: any = await conn.query(
          `UPDATE h_batch_inputs SET issue_hold = 1, issue_hold_reason = ? WHERE tenant_id = ? AND id IN (?) AND inventory_deducted = 0`,
          [`${tag} 미출고 원료 — 원인·실제 투입·LOT·단위 확인 전 자동 출고 금지`, tenantId, plan.holds.map((h) => h.inputId)],
        );
        if (Number(u.affectedRows) !== plan.holds.length) throw new Error("미출고 줄 보류 수가 맞지 않습니다.");
      }

      // 11) 금속검출 일일 기록지 — 무효 건 통과 행만 빼고(보관 완료), 감도점검·사람 입력은 그대로. 행 버전 ↑ → 다시 확인
      if (plan.ccp.metal) {
        const m = plan.ccp.metal;
        if (m.removeRowIds.length) {
          const [d]: any = await conn.query(`DELETE FROM h_ccp_form_rows WHERE tenant_id = ? AND form_record_id = ? AND id IN (?)`, [tenantId, m.formRecordId, m.removeRowIds]);
          if (Number(d.affectedRows) !== m.removeRowIds.length) throw new Error("금속검출 통과 행 수가 맞지 않습니다.");
        }
        const active = await q(conn,
          `SELECT COALESCE(SUM(planned_quantity), 0) AS kg, COUNT(*) AS n FROM h_batches WHERE tenant_id = ? AND planned_date = ? AND voided_at IS NULL AND status <> 'cancelled'`,
          [tenantId, input.businessDate]);
        const anchor = m.anchorBatchId != null && voidIds.includes(m.anchorBatchId) ? keepIds[0] : m.anchorBatchId;
        await conn.query(
          `UPDATE h_ccp_form_records SET rows_version = rows_version + 1, planned_qty_kg = ?, batch_count = ?, batch_id = ? WHERE id = ? AND tenant_id = ?`,
          [num(active[0].kg), Number(active[0].n), anchor, m.formRecordId, tenantId],
        );
      }
      await step("metal");

      // 12) 남는 생산 건 가열 공정 — 잠금 뒤 다시 계산한(지문에 든) 계획 그대로 예정 행으로 (원본은 보관표). 기록지 행은 같은 연결로 다시 만든다
      for (const r of plan.ccp.replan) {
        await conn.query(`DELETE FROM h_ccp_rows WHERE tenant_id = ? AND instance_id = ?`, [tenantId, r.instanceId]);
        await insertPlannedRows(r.instanceId, r.process, conn, tenantId);
        if (r.formRecordId != null) {
          await conn.query(`DELETE FROM h_ccp_form_rows WHERE tenant_id = ? AND form_record_id = ?`, [tenantId, r.formRecordId]);
          await conn.query(`UPDATE h_ccp_form_records SET batch_count = ? WHERE id = ? AND tenant_id = ?`, [r.process.rounds.length, r.formRecordId, tenantId]);
        }
      }
      for (const bid of Array.from(new Set(plan.ccp.replan.map((r) => r.batchId)))) {
        await syncCcpRowsToFormRows({ batchId: bid, tenantId, conn, skip4P: true });
      }
      await step("replanned");

      // 13) 적용 뒤 검사 — 하나라도 다르면 전부 되돌림
      const after = await q(conn,
        `SELECT COUNT(*) AS n, COALESCE(SUM(planned_quantity), 0) AS kg FROM h_batches WHERE tenant_id = ? AND id IN (?) AND voided_at IS NULL AND status <> 'cancelled'`,
        [tenantId, allIds]);
      if (Number(after[0].n) !== plan.batches.after.count || Math.abs(num(after[0].kg) - plan.batches.after.kg) > EPS) throw new Error("적용 뒤 생산 건 수·kg 가 계획과 다릅니다.");
      const revCnt = await q(conn, `SELECT COUNT(*) AS n, COALESCE(SUM(quantity), 0) AS q FROM h_inventory_transactions WHERE tenant_id = ? AND source_type = 'BATCH_VOID' AND source_id = ?`, [tenantId, recoveryId]);
      if (Number(revCnt[0].n) !== plan.totals.reversalCount || Math.abs(num(revCnt[0].q) - plan.totals.reversalQty) > EPS) throw new Error("적용 뒤 역거래 수·양이 계획과 다릅니다.");
      for (const l of plan.lots) {
        const [x] = await q(conn, `SELECT quantity, current_quantity, available_quantity FROM h_inventory_lots WHERE id = ? AND tenant_id = ?`, [l.lotId, tenantId]);
        if (Math.abs(num(x.available_quantity) - l.after.available) > EPS || Math.abs(num(x.current_quantity) - l.after.current) > EPS || Math.abs(num(x.quantity) - l.after.quantity) > EPS) {
          throw new Error(`적용 뒤 LOT #${l.lotId} 수량이 계획과 다릅니다.`);
        }
      }
      const heatAfter = await q(conn,
        `SELECT COUNT(*) AS n FROM h_ccp_rows r JOIN h_ccp_instances i ON i.id = r.instance_id AND i.tenant_id = r.tenant_id
          WHERE r.tenant_id = ? AND i.batch_id IN (?) AND i.ccp_type <> 'CCP-4P' AND i.voided_at IS NULL`,
        [tenantId, keepIds]);
      if (Number(heatAfter[0].n) !== plan.ccp.heatingRowsAfter) throw new Error("적용 뒤 가열 공정 행 수가 계획과 다릅니다.");
      await step("verified");

      const summary = {
        recoveryId, recoveryKey: input.recoveryKey, businessDate: input.businessDate, actorUserId: input.actorUserId, reason,
        fingerprint: plan.fingerprint,
        batches: { before: plan.batches.before, after: plan.batches.after, voided: input.voids, kept: keepIds },
        reversals: { count: plan.totals.reversalCount, qty: plan.totals.reversalQty, amount: plan.totals.reversalAmount, materials: plan.totals.materials, lots: plan.totals.lots, transactionIds: reversalIds },
        ccp: { heatingRowsBefore: plan.ccp.heatingRowsBefore, heatingRowsAfter: plan.ccp.heatingRowsAfter, voidInstances: plan.ccp.voidInstanceIds.length, voidForms: plan.ccp.voidFormIds.length, metal: plan.ccp.metal },
        approvalsCancelled: plan.approvals.cancel.map((a) => a.id),
        holds: plan.holds.map((h) => h.inputId),
        relations: plan.relations,
        notes: [
          "다시 계획한 가열 공정 시각은 예정값 — 실제 확인 시각 아님",
          "금속검출 통과·감도점검 실제 시각은 만들지 않음 — 기록지 다시 확인 필요",
          "생성 요청 키는 'done' 유지 (재시도가 생산 건을 다시 만들지 않게) — 요청 → 무효 생산 건 → 대체 생산 건으로 추적",
        ],
      };
      await conn.query(`UPDATE h_batch_recoveries SET summary_json = ? WHERE id = ?`, [JSON.stringify(summary), recoveryId]);
      for (const v of input.voids) {
        await insertAuditWith(conn, {
          tenantId, action: "batch.void", entityType: "batch", entityId: v.batchId, userId: input.actorUserId,
          changes: { recoveryId, supersededBy: v.supersededBy, reversals: plan.reversals.filter((r) => r.batchId === v.batchId).map((r) => r.txId) },
          description: `${tag} 중복 생산 건 무효 → 대체 #${v.supersededBy}. ${reason}`.slice(0, 1000),
        });
      }
      await insertAuditWith(conn, {
        tenantId, action: "batch.recovery", entityType: "batch_recovery", entityId: recoveryId, userId: input.actorUserId,
        changes: summary, description: `${tag} 이력 보존형 복구 ${input.businessDate}: ${plan.batches.before.count}건 ${plan.batches.before.kg}kg → ${plan.batches.after.count}건 ${plan.batches.after.kg}kg`,
      });
      await step("before_commit");
      await conn.commit();
      result = { status: "done", recoveryId, summary };
    } catch (e: any) {
      try { await conn.rollback(); } catch { /* 연결이 끊긴 경우 — 원래 오류를 알린다 */ }
      // 같은 키가 동시에 커밋된 경우 — 그 결과를 돌려준다
      if (e?.code === "ER_DUP_ENTRY" && /uq_br_tenant_key/.test(String(e?.message))) {
        const done = await q(pool, `SELECT id, summary_json FROM h_batch_recoveries WHERE tenant_id = ? AND recovery_key = ?`, [tenantId, input.recoveryKey]);
        if (done.length) {
          const s = done[0].summary_json;
          return { status: "already_done", recoveryId: Number(done[0].id), summary: typeof s === "string" ? JSON.parse(s) : s };
        }
      }
      throw e;
    }
  } finally {
    conn.release();
  }

  // 커밋 뒤 — 생산일지 다시 만들기 (실패해도 복구는 유지, 다음 갱신 때 맞춰짐)
  if (opts.regenerateDaily !== false) {
    try {
      const { autoRegenerateProductionDaily } = await import("../lib/production/autoProductionDaily");
      await autoRegenerateProductionDaily(tenantId, input.businessDate);
    } catch (e: any) {
      console.warn(`[batchRecovery] 생산일지 갱신 실패 (복구는 완료): ${e?.message ?? e}`);
    }
  }
  return result;
}
