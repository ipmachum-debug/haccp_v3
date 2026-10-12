/**
 * 재고 조정 · 실사 — applyInventoryDelta 관문 위의 공용 서비스 (v3 5단계 4차, 2026-10-12)
 *
 * 09-inventory-chokepoint-migration.md 의 조정 경로 4곳(adjustStock / adjustStockByProduct /
 * bulkApplyInventoryCount / 구형 adjustInventory)이 각자 LOT·원장을 손으로 쓰고 집계를 안 맞추던 것을
 * 여기로 모은다. 모든 이동은 applyLotDelta (LOT + 원장 + 집계 재계산, 3 leg 원자) 를 거친다.
 *
 * 규칙
 *   - 자재 id 는 ItemIdentityService 로 h_materials 네임스페이스로 변환한 뒤 LOT 를 찾는다
 *     (item_master id 가 들어와도 안전). 제품은 h_products_v2.id.
 *   - 증가: 가장 최근 LOT 1개에 더한다. 활성 LOT 가 없으면 NoActiveLotsError (입고/생산완료로 LOT 먼저).
 *   - 감소: 오래된 LOT 부터 연쇄 차감 ("B 방식", created_at ASC). 가용 합계 부족이면 StockShortageError.
 *   - 원장 'adjustment' 행은 감소분을 음수로 남긴다 (기존 리포트 SUM 규약, applyLotDelta 가 처리).
 *   - conn 은 호출자의 트랜잭션. 라우터는 withInventoryTx 로 감싼다.
 */

import type { InvConn } from "./applyInventoryDelta";
import { applyLotDelta, InventoryShortageError } from "./applyInventoryDelta";
import { toInventoryMaterialId } from "../identity/itemIdentityService";

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
  /** 어느 네임스페이스든 허용 — 내부에서 h_materials.id 로 변환 */
  materialId?: number | null;
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

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * LOT 1개 조정 (사용자가 LOT 를 직접 고른 경우). delta 부호로 증감.
 */
export async function adjustLot(
  conn: InvConn,
  p: { tenantId: number; lotId: number; delta: number; reason: string; userId: number; source?: string },
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
    transactionDate: todayStr(),
    reference: { referenceType: "adjustment", actionType: p.source ?? "ADJUST_LOT" },
    notes: `[재고조정] ${p.reason} (${before} → ${(before + p.delta).toFixed(3)})`,
    createdBy: p.userId,
  });
  return { lotId: lot.id, lotNumber: lot.lot_number, changeQty: p.delta, newAvailable: r.remaining, before };
}

/**
 * 품목 단위 조정 (+/-) — LOT 자동 배분. 실사 반영도 이 함수를 품목마다 호출한다.
 */
export async function adjustBySubject(
  conn: InvConn,
  p: { tenantId: number; subject: AdjustSubject; delta: number; reason: string; userId: number; source?: string },
): Promise<{ affected: AffectedLot[]; before: number; after: number }> {
  if (Math.abs(p.delta) < EPS) throw new Error("조정 수량은 0 이 될 수 없습니다");
  const hasP = p.subject.productId != null && Number(p.subject.productId) > 0;
  const hasM = p.subject.materialId != null && Number(p.subject.materialId) > 0;
  if (hasP === hasM) throw new Error("productId 또는 materialId 중 하나만 지정해야 합니다");

  // 대상 LOT (활성) — 자재는 네임스페이스 변환 후 canonical + 원본 id 모두 매칭 (전환기 안전)
  let col: "product_id" | "material_id";
  let ids: number[];
  let subjectForDelta: { productId?: number; materialId?: number };
  if (hasP) {
    col = "product_id";
    ids = [Number(p.subject.productId)];
    subjectForDelta = { productId: ids[0] };
  } else {
    col = "material_id";
    const raw = Number(p.subject.materialId);
    const resolved = await toInventoryMaterialId(raw, p.tenantId, conn);
    ids = Array.from(new Set([resolved.id, raw]));
    subjectForDelta = { materialId: resolved.id };
  }

  const [rows] = await conn.execute(
    `SELECT id, lot_number, quantity, available_quantity, unit, material_id, product_id, created_at
       FROM h_inventory_lots
      WHERE tenant_id = ? AND ${col} IN (${ids.map(() => "?").join(", ")}) AND status = 'available'
      ORDER BY created_at ${p.delta > 0 ? "DESC" : "ASC"}, id ${p.delta > 0 ? "DESC" : "ASC"}
      FOR UPDATE`,
    [p.tenantId, ...ids],
  );
  const lots = rows as LotRow[];
  const before = lots.reduce((s, l) => s + (parseFloat(l.available_quantity) || 0), 0);
  if (lots.length === 0) throw new NoActiveLotsError(p.subject);

  const affected: AffectedLot[] = [];
  const date = todayStr();
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
