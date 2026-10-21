/**
 * 재고 조정 · 실사 — applyInventoryDelta 관문 위의 공용 서비스 (v3 5단계 4차, 2026-10-12)
 *
 * 09-inventory-chokepoint-migration.md 의 조정 경로 4곳(adjustStock / adjustStockByProduct /
 * bulkApplyInventoryCount / 구형 adjustInventory)이 각자 LOT·원장을 손으로 쓰고 집계를 안 맞추던 것을
 * 여기로 모은다. 모든 이동은 applyLotDelta (LOT + 원장 + 집계 재계산, 3 leg 원자) 를 거친다.
 *
 * 규칙
 *   - 원료는 번호 종류를 밝혀 받는다 (MaterialRef — 2026-10-20 번호 체계 2b): 품목 선택창 번호는 FK 로만,
 *     재고·실사 목록 번호는 이 회사 h_materials 확인 후 그대로. 숫자로 종류를 추측하지 않는다. 제품은 h_products_v2.id.
 *   - 증가: 가장 최근 LOT 1개에 더한다. 활성 LOT 가 없으면 NoActiveLotsError (입고/생산완료로 LOT 먼저).
 *   - 감소: 오래된 LOT 부터 연쇄 차감 ("B 방식", created_at ASC). 가용 합계 부족이면 StockShortageError.
 *   - 원장 'adjustment' 행은 감소분을 음수로 남긴다 (기존 리포트 SUM 규약, applyLotDelta 가 처리).
 *   - conn 은 호출자의 트랜잭션. 라우터는 withInventoryTx 로 감싼다.
 */

import { todayKST } from "../../utils/timezone";
import type { InvConn } from "./applyInventoryDelta";
import { applyLotDelta, receiveNewLot, InventoryShortageError } from "./applyInventoryDelta";
import { inventoryMaterialIdOfRef, type MaterialRef } from "../identity/itemIdentityService";

const EPS = 0.001;

export class NoActiveLotsError extends Error {
  constructor(public readonly subject: AdjustSubject) {
    super("활성 LOT 없음 — 재고 증가는 수동 입고/생산 완료로, 감소는 기존 LOT 고갈 상태에서 불가.");
    this.name = "NoActiveLotsError";
  }
}

export class StockShortageError extends Error {
  constructor(public readonly requested: number, public readonly available: number) {
    super(`재고 부족: 요청 ${requested.toFixed(3)}, 가용 ${available.toFixed(3)}`);
    this.name = "StockShortageError";
  }
}

export interface AdjustSubject {
  productId?: number | null;
  /** 원료 — 번호와 그 종류 (품목 번호면 FK 로 재고 번호로, 재고 번호면 그대로) */
  material?: MaterialRef | null;
}

export interface AffectedLot {
  lotId: number;
  lotNumber: string;
  changeQty: number;
  newAvailable: number;
}

interface LotRow {
  id: number;
  lot_number: string;
  quantity: string;
  available_quantity: string;
  unit: string;
  material_id: number | null;
  product_id: number | null;
  created_at: string;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * LOT 1개 조정 (사용자가 LOT 를 직접 고른 경우). delta 부호로 증감.
 */
export async function adjustLot(
  conn: InvConn,
  p: { tenantId: number; lotId: number; delta: number; reason: string; userId: number; source?: string; businessDate?: string | null },
): Promise<AffectedLot & { before: number }> {
  if (Math.abs(p.delta) < EPS) throw new Error("조정할 수량 변동이 없습니다.");

  const [rows] = await conn.execute(
    `SELECT id, lot_number, quantity, available_quantity, unit, material_id, product_id, created_at
       FROM h_inventory_lots WHERE id = ? AND tenant_id = ? LIMIT 1 FOR UPDATE`,
    [p.lotId, p.tenantId],
  );
  const lot = (rows as LotRow[])[0];
  if (!lot) throw new Error("LOT을 찾을 수 없습니다.");

  const before = parseFloat(lot.available_quantity) || 0;
  const subject = lot.product_id ? { productId: Number(lot.product_id) } : { materialId: Number(lot.material_id) };
  const r = await applyLotDelta(conn, {
    tenantId: p.tenantId,
    lotId: lot.id,
    subject,
    quantity: Math.abs(p.delta),
    direction: p.delta > 0 ? "increase" : "decrease",
    transactionType: "adjustment",
    unit: lot.unit || "kg",
    transactionDate: p.businessDate || todayStr(),
    reference: { referenceType: "adjustment", actionType: p.source ?? "ADJUST_LOT" },
    notes: `[재고조정] ${p.reason} (${before} → ${(before + p.delta).toFixed(3)})`,
    createdBy: p.userId,
  });
  return { lotId: lot.id, lotNumber: lot.lot_number, changeQty: p.delta, newAvailable: r.remaining, before };
}

/** 대상 LOT 조회 (활성, FOR UPDATE) — 원료는 종류에 맞게 재고 번호 하나로 바꾼 뒤 그 번호의 LOT 만 */
async function loadActiveLots(
  conn: InvConn,
  p: { tenantId: number; subject: AdjustSubject; order: "ASC" | "DESC" },
): Promise<{ lots: LotRow[]; before: number; subjectForDelta: { productId?: number; materialId?: number }; canonicalId: number; col: "product_id" | "material_id" }> {
  const hasP = p.subject.productId != null && Number(p.subject.productId) > 0;
  const hasM = p.subject.material != null;
  if (hasP === hasM) throw new Error("제품 또는 원료 중 하나만 지정해야 합니다");

  let col: "product_id" | "material_id";
  let ids: number[];
  let subjectForDelta: { productId?: number; materialId?: number };
  let canonicalId: number;
  if (hasP) {
    col = "product_id";
    canonicalId = Number(p.subject.productId);
    ids = [canonicalId];
    subjectForDelta = { productId: canonicalId };
  } else {
    col = "material_id";
    // 이전: 숫자만 받아 h_materials 직접 일치를 먼저 골랐다 — 품목 번호가 다른 원료의 재고 번호와 같으면 그 원료를 조정 (Codex 2b 점검 P1).
    //   지금: 종류대로 바꾸고, 연결 없음·다른 회사면 LOT 을 잠그기 전에 거부. 원본 숫자로 LOT 을 더 찾지 않는다.
    canonicalId = await inventoryMaterialIdOfRef(p.subject.material!, p.tenantId, conn);
    ids = [canonicalId];
    subjectForDelta = { materialId: canonicalId };
  }

  // ★ 2026-10-21 (단지 10/18 실사 정합): 순서는 입고일 기준 (없으면 등록일). 이전: 등록 시각 — 엑셀 일괄 등록 LOT 은
  //   등록 시각이 모두 같은 날이라 실제 입고 순서와 달랐다 (감소 = 먼저 들어온 LOT 부터, 증가 = 가장 최근 LOT).
  const [rows] = await conn.execute(
    `SELECT id, lot_number, quantity, available_quantity, unit, material_id, product_id, created_at
       FROM h_inventory_lots
      WHERE tenant_id = ? AND ${col} IN (${ids.map(() => "?").join(", ")}) AND status = 'available'
      ORDER BY COALESCE(receipt_date, DATE(created_at)) ${p.order}, created_at ${p.order}, id ${p.order}
      FOR UPDATE`,
    [p.tenantId, ...ids],
  );
  const lots = rows as LotRow[];
  const before = lots.reduce((s, l) => s + (parseFloat(l.available_quantity) || 0), 0);
  return { lots, before, subjectForDelta, canonicalId, col };
}

/**
 * 품목 단위 조정 (+/-) — LOT 자동 배분. 실사 반영도 이 함수를 품목마다 호출한다.
 */
export async function adjustBySubject(
  conn: InvConn,
  p: { tenantId: number; subject: AdjustSubject; delta: number; reason: string; userId: number; source?: string; businessDate?: string | null },
): Promise<{ affected: AffectedLot[]; before: number; after: number }> {
  if (Math.abs(p.delta) < EPS) throw new Error("조정 수량은 0 이 될 수 없습니다");
  const { lots, before, subjectForDelta } = await loadActiveLots(conn, { tenantId: p.tenantId, subject: p.subject, order: p.delta > 0 ? "DESC" : "ASC" });
  if (lots.length === 0) throw new NoActiveLotsError(p.subject);

  const affected: AffectedLot[] = [];
  const date = p.businessDate || todayStr();
  const note = `[재고조정] ${p.reason}`;
  const reference = { referenceType: "adjustment", actionType: p.source ?? "ADJUST_SUBJECT" };

  if (p.delta > 0) {
    const target = lots[0];
    const r = await applyLotDelta(conn, {
      tenantId: p.tenantId, lotId: target.id, subject: subjectForDelta,
      quantity: p.delta, direction: "increase", transactionType: "adjustment",
      unit: target.unit || "kg", transactionDate: date, reference, notes: note, createdBy: p.userId,
    });
    affected.push({ lotId: target.id, lotNumber: target.lot_number, changeQty: p.delta, newAvailable: r.remaining });
  } else {
    let remaining = Math.abs(p.delta);
    if (before + EPS < remaining) throw new StockShortageError(remaining, before);
    for (const lot of lots) {
      if (remaining <= EPS) break;
      const avail = parseFloat(lot.available_quantity) || 0;
      if (avail <= EPS) continue;
      const take = Math.min(remaining, avail);
      let r;
      try {
        r = await applyLotDelta(conn, {
          tenantId: p.tenantId, lotId: lot.id, subject: subjectForDelta,
          quantity: take, direction: "decrease", transactionType: "adjustment",
          unit: lot.unit || "kg", transactionDate: date, reference, notes: note, createdBy: p.userId,
        });
      } catch (e) {
        if (e instanceof InventoryShortageError) throw new StockShortageError(remaining, before);
        throw e;
      }
      affected.push({ lotId: lot.id, lotNumber: lot.lot_number, changeQty: -take, newAvailable: r.remaining });
      remaining -= take;
    }
  }

  return { affected, before, after: before + p.delta };
}

export interface PhysicalCountResult {
  before: number;
  after: number;
  diff: number;
  /** needs_review = 자동으로 맞추지 않음 (실사일 당일 거래·단위 다름·이동 거래·쓸 수 없는 LOT 잔량 등) — message 에 사유 */
  status: "applied" | "skipped" | "needs_review";
  /** 실사 수량(센 날 기준) · 실사일 뒤 순변동 · 지금 기대량 = 실사 + 순변동 (실사일이 오늘이면 순변동 0) */
  countedQty?: number;
  postCountNet?: number;
  expectedNow?: number;
  message?: string;
  affected: AffectedLot[];
  createdLotNumber?: string;
}

/**
 * 실사 반영 1품목 — 실사 수량에 맞춰 조정. 활성 LOT 가 없는데 실사 수량이 있으면
 * 실사 LOT 를 새로 만든다 (receiveNewLot, transaction_type='adjustment'). 그래야 "한 번도 입고
 * 등록을 안 한 자재" 도 실사로 장부에 올라온다 (2026-10 실사 요구).
 */
export async function applyPhysicalCount(
  conn: InvConn,
  p: {
    tenantId: number; subject: AdjustSubject; actualQty: number; reason: string; userId: number; unit?: string | null; countDate?: string | null;
    /** 쓸 수 없는 상태(사용완료·만료·폐기) LOT 에 남은 잔량을 실사와 함께 0 으로 — 센 수량은 쓸 수 있는 재고만이라는 뜻 (기본 꺼짐) */
    clearUnusableLots?: boolean;
  },
): Promise<PhysicalCountResult> {
  if (!Number.isFinite(p.actualQty) || p.actualQty < 0) throw new Error("실사 수량은 0 이상이어야 합니다");
  if (p.countDate && !/^\d{4}-\d{2}-\d{2}$/.test(p.countDate)) throw new Error("실사일은 YYYY-MM-DD 형식이어야 합니다");
  const today = todayKST();
  if (p.countDate && p.countDate > today) throw new Error("실사일이 오늘보다 뒤입니다");
  const { lots, before, subjectForDelta, canonicalId, col } = await loadActiveLots(conn, { tenantId: p.tenantId, subject: p.subject, order: "ASC" });
  const counted = r3(p.actualQty);

  // ★ 2026-10-21 (단지 10/18 실사 정합): 쓸 수 없는 상태(used·expired·disposed)인데 잔량이 남은 LOT.
  //   실사 반영은 'available' LOT 만 조정하므로, 그 잔량은 반영 뒤에도 장부에 남는다 (출고 후보로 다시 쓰일 수 있음).
  //   기본: 맞추지 않고 확인 필요. clearUnusableLots: 실사와 같은 날짜·같은 트랜잭션에서 0 으로 (따로 먼저 정리하면
  //   그 정리 거래가 '실사일 뒤 이동'이나 '실사일 당일 거래'로 잡혀 실사를 막는다 — Codex 10/18 보정표 차단 2·3).
  const [staleRows]: any = await conn.execute(
    `SELECT id, lot_number, available_quantity + 0 AS a, unit, status FROM h_inventory_lots
      WHERE tenant_id = ? AND ${col} = ? AND status IN ('used', 'expired', 'disposed') AND available_quantity > ?
      ORDER BY COALESCE(receipt_date, DATE(created_at)), created_at, id
      FOR UPDATE`,
    [p.tenantId, canonicalId, EPS],
  );
  const stale = staleRows as Array<{ id: number; lot_number: string; a: number; unit: string | null; status: string }>;
  const staleQty = r3(stale.reduce((s, l) => s + Number(l.a), 0));
  const shownBefore = p.clearUnusableLots ? r3(before + staleQty) : before;
  const review = (message: string, postCountNet?: number): PhysicalCountResult =>
    ({ before: shownBefore, after: shownBefore, diff: 0, status: "needs_review", message, affected: [], countedQty: counted, postCountNet, expectedNow: postCountNet == null ? undefined : r3(counted + postCountNet) });
  if (stale.length > 0 && !p.clearUnusableLots) {
    return review(`쓸 수 없는 상태(사용완료·만료·폐기) LOT ${stale.length}개에 잔량 ${staleQty} 이 남아 있음 — 그 LOT 을 먼저 정리하거나 '쓸 수 없는 LOT 잔량 함께 정리'로 실사 반영`);
  }
  if (stale.length > 0) {
    const unit = (p.unit || lots[0]?.unit || "kg").trim().toLowerCase();
    const otherUnit = stale.filter((l) => String(l.unit ?? "").trim().toLowerCase() !== unit);
    if (otherUnit.length > 0) return review(`정리할 LOT ${otherUnit.map((l) => l.lot_number).join(", ")} 의 단위가 ${unit} 와 다름 — 환산 없이 정리하지 않음`);
  }

  // ★ 2026-10-21: 실사일이 지난 날이면 '그날 센 수량' 에 그 뒤 업무일의 실제 LOT 이동을 더한 값이 지금 있어야 할 양이다.
  //   이전: 실사 수량 − 지금 재고로 바로 맞춰 실사일 뒤의 정상 입출고(입고·생산 출고)를 지웠다.
  //   LOT 을 실제로 움직인 거래만(lot_id 있음) — 원장 전용 행(LOT 없음)은 LOT 재고를 바꾸지 않았으므로 빼지 않는다.
  //   자동으로 정할 수 없는 경우는 맞추지 않고 '확인 필요': 실사일 당일 거래(센 시각 전후를 모름)·LOT 간 이동(음수 상쇄 제외)·단위 다름.
  let postCountNet = 0;
  if (p.countDate && p.countDate < today) {
    const unit = (p.unit || lots[0]?.unit || "kg").trim().toLowerCase();
    const [txs]: any = await conn.execute(
      `SELECT t.transaction_type AS type, t.quantity + 0 AS q, t.unit, DATE_FORMAT(t.transaction_date, '%Y-%m-%d') AS d, t.action_type AS action
         FROM h_inventory_transactions t
         JOIN h_inventory_lots l ON l.id = t.lot_id AND l.tenant_id = t.tenant_id
        WHERE t.tenant_id = ? AND l.${col} = ? AND t.transaction_date >= ?`,
      [p.tenantId, canonicalId, p.countDate],
    );
    const rows = txs as any[];
    const sameDay = rows.filter((t) => t.d === p.countDate).length;
    if (sameDay > 0) return review(`실사일(${p.countDate}) 당일 거래 ${sameDay}건 — 센 시각 전후를 알 수 없어 자동으로 맞추지 않음`);
    const transfers = rows.filter((t) => t.type === "transfer" && t.action !== "NEGATIVE_RECONCILE").length;
    if (transfers > 0) return review(`실사일 뒤 LOT 이동 거래 ${transfers}건 — 방향을 정할 수 없어 자동으로 맞추지 않음`);
    const otherUnit = rows.filter((t) => String(t.unit ?? "").trim().toLowerCase() !== unit).length;
    if (otherUnit > 0) return review(`실사일 뒤 거래 ${otherUnit}건의 단위가 ${unit} 와 다름 — 환산 없이 더하지 않음`);
    for (const t of rows) {
      const q = Number(t.q) || 0;
      if (t.type === "receipt" || t.type === "inbound" || t.type === "return") postCountNet += Math.abs(q);
      else if (t.type === "usage" || t.type === "outbound" || t.type === "disposal") postCountNet -= Math.abs(q);
      else if (t.type === "adjustment") postCountNet += q; // 조정은 부호 그대로 (감소분 음수 — applyLotDelta 규약)
      // transfer(NEGATIVE_RECONCILE) = 같은 원료 LOT 끼리 메꿈 — 합계 변화 없음
    }
    postCountNet = r3(postCountNet);
  }
  const expectedNow = r3(counted + postCountNet);
  if (expectedNow < -EPS) return review(`실사 ${counted} + 실사일 뒤 순변동 ${postCountNet} = ${expectedNow} — 0 보다 작음 (실사일 뒤 출고가 센 양보다 많음)`, postCountNet);
  const extra = { countedQty: counted, postCountNet, expectedNow };
  // 화면에 보이는 차이 = 기대량 − (가용 + 정리할 잔량). LOT 조정량은 가용 LOT 기준 (정리 잔량은 따로 0 으로).
  const shownDiff = r3(expectedNow - shownBefore);
  const diff = r3(expectedNow - before);
  if (Math.abs(diff) < EPS && stale.length === 0) {
    return { before, after: expectedNow, diff: 0, status: "skipped", message: "차이 없음 — 적용 skip", affected: [], ...extra };
  }

  // 쓸 수 없는 LOT 잔량 0 으로 — 실사일 날짜의 조정 거래 (가용 집계는 원래 'available' 만 세므로 바뀌지 않음)
  const cleared: AffectedLot[] = [];
  for (const l of stale) {
    const q = r3(Number(l.a));
    const r = await applyLotDelta(conn, {
      tenantId: p.tenantId, lotId: Number(l.id), subject: subjectForDelta,
      quantity: q, direction: "decrease", transactionType: "adjustment",
      unit: l.unit || "kg", transactionDate: p.countDate || todayStr(),
      reference: { referenceType: "adjustment", actionType: "PHYSICAL_COUNT_CLEAR_UNUSABLE" },
      notes: `[실사] ${p.reason} — 쓸 수 없는 상태(${l.status}) LOT 잔량 ${q} 정리`, createdBy: p.userId,
    });
    cleared.push({ lotId: Number(l.id), lotNumber: l.lot_number, changeQty: -q, newAvailable: r.remaining });
  }
  const clearedNote = cleared.length ? `쓸 수 없는 LOT ${cleared.length}개 잔량 ${staleQty} 정리` : "";
  if (Math.abs(diff) < EPS) {
    return { before: shownBefore, after: expectedNow, diff: shownDiff, status: "applied", ...extra, message: clearedNote, affected: cleared };
  }

  if (lots.length === 0 && diff > 0) {
    const unit = p.unit || "kg";
    const tag = col === "product_id" ? `P${canonicalId}` : `M${canonicalId}`;
    const lotNumber = `COUNT-${tag}-${todayStr().replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const r = await receiveNewLot(conn, {
      tenantId: p.tenantId,
      subject: subjectForDelta,
      lotNumber,
      quantity: diff,
      unit,
      receiptDate: p.countDate || todayStr(),
      transactionType: "adjustment",
      reference: { referenceType: "adjustment", actionType: "PHYSICAL_COUNT_NEW_LOT" },
      notes: `[실사] ${p.reason} — 활성 LOT 없어 실사 LOT 생성`,
      createdBy: p.userId,
    });
    return {
      before: shownBefore, after: expectedNow, diff: shownDiff, status: "applied", ...extra,
      message: [clearedNote, `활성 LOT 없음 → 실사 LOT ${r.lotNumber} 생성`].filter(Boolean).join(" · "),
      affected: [...cleared, { lotId: r.lotId, lotNumber: r.lotNumber, changeQty: diff, newAvailable: diff }],
      createdLotNumber: r.lotNumber,
    };
  }

  const r = await adjustBySubject(conn, {
    tenantId: p.tenantId, subject: p.subject, delta: diff, reason: p.reason, userId: p.userId, source: "PHYSICAL_COUNT",
    businessDate: p.countDate || null,
  });
  return { before: shownBefore, after: r.after, diff: shownDiff, status: "applied", ...extra,
    message: [clearedNote, `${r.affected.length}개 LOT 조정${postCountNet ? ` (실사 ${counted} + 실사일 뒤 순변동 ${postCountNet})` : ""}`].filter(Boolean).join(" · "),
    affected: [...cleared, ...r.affected] };
}
