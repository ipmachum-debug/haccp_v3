/**
 * applyInventoryDelta — 재고 3자 불변식 단일 관문 (P2, 병② 봉인)
 * ============================================================================
 * docs/architecture/08-inventory-identity-diagnosis.md 의 **병② — 3자 불변식 위반**.
 *
 * 재고 이동 1건은 항상 세 원장을 함께 갱신해야 정합:
 *   (1) h_inventory_lots         — LOT (FEFO 차감의 실질 원천/ground truth)
 *   (2) h_inventory_transactions — 원장(감사 추적)
 *   (3) h_inventory              — 자재/제품별 집계
 *
 * 문제(진단 census): ~20+ write 경로가 3 leg 을 각자 손으로 짜고, 다수가 하나 이상을
 * 누락한다(LOT 만 만들고 원장 없음 / LOT 차감했는데 집계 안 건드림 / 원장만 쓰고 LOT
 * 미차감). 그 결과 집계가 LOT 정본에서 표류(drift)하고 유령 원장이 쌓인다.
 *
 * ## 이 모듈의 핵심 — 자가 치유 집계(recomputeAggregateFromLots)
 *
 * 집계 leg 을 "증감"이 아니라 **LOT 합계로 재계산**한다. 그러면:
 *   · 어떤 경로가 과거에 집계를 빠뜨렸어도, 다음 이동에서 자동 교정된다.
 *   · 표류가 구조적으로 불가능해진다(집계 ≡ ΣLOT.available 이 매 이동마다 성립).
 *
 * ## Strangler Fig 이주
 *
 * 기존 경로를 한 번에 다시 쓰지 않는다. 두 가지 최소 침습 이주가 가능:
 *   A) "집계 누락(AGG-omitted)" 경로 → 기존 LOT/원장 코드는 두고, 커밋 직전
 *      `await recomputeAggregateFromLots(conn, { tenantId, subject, unit })` 한 줄 추가.
 *   B) 신규/정리 경로 → `receiveNewLot` / `applyLotDelta` 로 3 leg 을 통째로 위임.
 *
 * ## 규약 정규화(census 가 드러낸 분열을 여기서 통일)
 *   · 부호: 원장 quantity 는 **항상 양수**, 방향은 transaction_type 으로 표현.
 *   · lot_id: 매칭 실패는 **NULL**(과거 sentinel 0 금지).
 *   · id 공간: 원장/집계의 material_id 는 canonical h_materials.id 만(item_master.id 유입 금지).
 *              제품 이동은 material_id=NULL + product_id 사용.
 *
 * ⚠️ 이 모듈은 **호출자가 넘긴 트랜잭션 conn** 위에서 동작한다(원자성은 호출자 책임).
 *    트랜잭션이 없다면 `withInventoryTx()` 로 감싸서 호출한다.
 */

import type { PoolConnection } from "mysql2/promise";
import { withTransaction } from "../../db/connection";

/** mysql2 PoolConnection(또는 그 execute 만) 호환 */
export type InvConn = Pick<PoolConnection, "execute">;

const EPS = 0.001;

/** 재고 주체: 자재(canonical h_materials.id) 또는 제품(h_products_v2.id). 정확히 하나. */
export interface InventorySubject {
  materialId?: number | null;
  productId?: number | null;
}

/** 소진 시도 시 가용 부족 — 호출자가 잡아서 사용자 메시지로 변환 */
export class InventoryShortageError extends Error {
  constructor(
    public readonly lotId: number,
    public readonly available: number,
    public readonly requested: number,
  ) {
    super(`LOT#${lotId} 재고 부족: 가용 ${available}, 요청 ${requested}`);
    this.name = "InventoryShortageError";
  }
}

function normalizeSubject(subject: InventorySubject): {
  col: "material_id" | "product_id";
  id: number;
  materialId: number | null;
  productId: number | null;
} {
  const hasMat = subject.materialId != null && Number(subject.materialId) > 0;
  const hasProd = subject.productId != null && Number(subject.productId) > 0;
  if (hasMat === hasProd) {
    throw new Error(
      `applyInventoryDelta: subject 는 materialId 또는 productId 중 정확히 하나여야 합니다 (materialId=${subject.materialId}, productId=${subject.productId})`,
    );
  }
  return hasMat
    ? { col: "material_id", id: Number(subject.materialId), materialId: Number(subject.materialId), productId: null }
    : { col: "product_id", id: Number(subject.productId), materialId: null, productId: Number(subject.productId) };
}

/**
 * ★ 자가 치유 집계 — h_inventory 를 Σ h_inventory_lots(available) 로 재계산.
 *
 * 정책(Track A 재조정 스크립트와 동일):
 *   available := Σ LOT.available_quantity (status='available')
 *   total     := available + reserved      (기존 reserved 보존)
 * 집계 행을 FOR UPDATE 로 잠가 동일 주체 동시 이동을 직렬화 → 재계산 일관성 보장.
 *
 * 같은 트랜잭션 conn 안에서 LOT 갱신 '뒤'에 호출하면, 갱신된 LOT 값이 SUM 에 반영된다.
 *
 * @returns 재계산된 { available, total, reserved }
 */
export async function recomputeAggregateFromLots(
  conn: InvConn,
  args: { tenantId: number; subject: InventorySubject; unit?: string },
): Promise<{ available: number; total: number; reserved: number }> {
  const { tenantId } = args;
  const s = normalizeSubject(args.subject);

  // (1) 집계 행 잠금(FOR UPDATE) — 없으면 이후 INSERT
  const [invRows]: any = await conn.execute(
    `SELECT id, reserved_quantity, unit FROM h_inventory
       WHERE tenant_id = ? AND ${s.col} = ? LIMIT 1 FOR UPDATE`,
    [tenantId, s.id],
  );
  const existing = (invRows as any[])[0];
  const reserved = existing ? parseFloat(existing.reserved_quantity ?? "0") || 0 : 0;

  // (2) LOT 정본 합계(available 상태)
  const [sumRows]: any = await conn.execute(
    `SELECT COALESCE(SUM(available_quantity), 0) AS avail,
            MAX(unit) AS lot_unit
       FROM h_inventory_lots
       WHERE tenant_id = ? AND ${s.col} = ? AND status = 'available'`,
    [tenantId, s.id],
  );
  const available = Math.round((parseFloat(sumRows[0]?.avail ?? "0") || 0) * 1000) / 1000;
  const total = Math.round((available + reserved) * 1000) / 1000;
  const unit = args.unit || existing?.unit || sumRows[0]?.lot_unit || "EA";

  // (3) UPSERT
  if (existing) {
    await conn.execute(
      `UPDATE h_inventory
         SET total_quantity = ?, available_quantity = ?, last_updated = NOW()
         WHERE id = ?`,
      [total, available, existing.id],
    );
  } else {
    await conn.execute(
      `INSERT INTO h_inventory
         (tenant_id, ${s.col}, total_quantity, available_quantity, reserved_quantity, unit, last_updated)
       VALUES (?, ?, ?, ?, '0.000', ?, NOW())`,
      [tenantId, s.id, total, available, unit],
    );
  }

  return { available, total, reserved };
}

/** 원장 방향 → LOT 증감 부호 매핑 */
export type InvDirection = "increase" | "decrease";

export interface ApplyLotDeltaParams {
  tenantId: number;
  lotId: number;
  subject: InventorySubject; // 원장 material_id/product_id 기록 + 집계 재계산 대상
  quantity: number; // 크기(항상 양수)
  direction: InvDirection;
  transactionType: string; // 'usage' | 'receipt' | 'return' | 'disposal' | 'adjustment' ...
  unit: string;
  unitCost?: number | null;
  reference?: {
    referenceType?: string | null;
    referenceId?: number | null;
    sourceType?: string | null;
    sourceId?: number | null;
    sourceLineId?: number | null;
    actionType?: string | null;
  };
  notes?: string | null;
  createdBy: number;
  /** true 면 가용 부족이어도 throw 하지 않고 GREATEST(0) 로 진행(조정/실사 등). 기본 false. */
  allowNegative?: boolean;
}

/**
 * 기존 LOT 에 수량 델타 적용 + 원장 기록 + 집계 재계산 (3 leg 원자).
 * 소진 이동(decrease)에서 가용 부족이면 InventoryShortageError(allowNegative=false 시).
 *
 * ⚠️ conn 은 호출자의 트랜잭션. LOT 을 FOR UPDATE 로 잠근다.
 */
export async function applyLotDelta(
  conn: InvConn,
  p: ApplyLotDeltaParams,
): Promise<{ lotId: number; remaining: number }> {
  const s = normalizeSubject(p.subject);
  const qty = Math.abs(p.quantity);

  // (1) LOT 잠금
  const [lotRows]: any = await conn.execute(
    `SELECT id, quantity, available_quantity, current_quantity, unit, status
       FROM h_inventory_lots
       WHERE id = ? AND tenant_id = ? LIMIT 1 FOR UPDATE`,
    [p.lotId, p.tenantId],
  );
  const lot = (lotRows as any[])[0];
  if (!lot) throw new Error(`LOT#${p.lotId} 를 찾을 수 없습니다 (tenant=${p.tenantId}).`);

  const avail = parseFloat(lot.available_quantity ?? lot.quantity ?? "0") || 0;

  if (p.direction === "decrease") {
    if (avail < qty - EPS && !p.allowNegative) {
      throw new InventoryShortageError(p.lotId, avail, qty);
    }
    // (2) LOT 차감(GREATEST 방어) — 소진 시 status='used'
    await conn.execute(
      `UPDATE h_inventory_lots
         SET quantity = GREATEST(0, quantity - ?),
             available_quantity = GREATEST(0, available_quantity - ?),
             current_quantity = GREATEST(0, COALESCE(current_quantity, quantity) - ?),
             status = CASE WHEN GREATEST(0, available_quantity - ?) <= ? THEN 'used' ELSE status END,
             updated_at = NOW()
         WHERE id = ?`,
      [qty, qty, qty, qty, EPS, p.lotId],
    );
  } else {
    // 증가(반품 복원/입고-기존LOT) — status 를 available 로 되돌림
    await conn.execute(
      `UPDATE h_inventory_lots
         SET quantity = quantity + ?,
             available_quantity = available_quantity + ?,
             current_quantity = COALESCE(current_quantity, quantity) + ?,
             status = CASE WHEN status IN ('used','expired') THEN 'available' ELSE status END,
             updated_at = NOW()
         WHERE id = ?`,
      [qty, qty, qty, p.lotId],
    );
  }

  // (3) 원장 기록 — 양수 quantity, canonical material_id(또는 제품은 NULL)
  await insertLedger(conn, {
    tenantId: p.tenantId,
    lotId: p.lotId,
    materialId: s.materialId,
    transactionType: p.transactionType,
    quantity: qty,
    unit: p.unit,
    unitCost: p.unitCost ?? null,
    reference: p.reference,
    notes: p.notes ?? null,
    createdBy: p.createdBy,
  });

  // (4) 집계 재계산(자가 치유)
  await recomputeAggregateFromLots(conn, { tenantId: p.tenantId, subject: p.subject, unit: p.unit });

  const remaining = p.direction === "decrease" ? Math.max(0, avail - qty) : avail + qty;
  return { lotId: p.lotId, remaining };
}

export interface ReceiveNewLotParams {
  tenantId: number;
  subject: InventorySubject;
  lotNumber: string;
  quantity: number;
  unit: string;
  unitPrice?: number | null;
  receiptDate?: Date | string | null;
  expiryDate?: Date | string | null;
  productionDate?: Date | string | null;
  supplierName?: string | null;
  manufacturerName?: string | null;
  location?: string | null;
  batchId?: number | null;
  reference?: ApplyLotDeltaParams["reference"];
  notes?: string | null;
  createdBy: number;
}

/**
 * 신규 LOT 생성(입고) + receipt 원장 + 집계 재계산 (3 leg 원자).
 * ⚠️ conn 은 호출자의 트랜잭션.
 */
export async function receiveNewLot(
  conn: InvConn,
  p: ReceiveNewLotParams,
): Promise<{ lotId: number; lotNumber: string }> {
  const s = normalizeSubject(p.subject);
  const qty = Math.abs(p.quantity);
  const receipt = toDateStr(p.receiptDate) ?? toDateStr(new Date())!;

  // (1) LOT 생성
  const [lotResult]: any = await conn.execute(
    `INSERT INTO h_inventory_lots
       (tenant_id, lot_number, material_id, product_id, batch_id, quantity,
        available_quantity, current_quantity, unit, unit_price,
        production_date, receipt_date, expiry_date,
        supplier_name, manufacturer_name, location, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'available')`,
    [
      p.tenantId,
      p.lotNumber,
      s.materialId,
      s.productId,
      p.batchId ?? null,
      qty,
      qty,
      qty,
      p.unit,
      p.unitPrice ?? null,
      toDateStr(p.productionDate),
      receipt,
      toDateStr(p.expiryDate),
      p.supplierName ?? null,
      p.manufacturerName ?? null,
      p.location ?? null,
    ],
  );
  const lotId = Number((lotResult as any).insertId);

  // (2) receipt 원장
  await insertLedger(conn, {
    tenantId: p.tenantId,
    lotId,
    materialId: s.materialId,
    transactionType: "receipt",
    quantity: qty,
    unit: p.unit,
    unitCost: p.unitPrice ?? null,
    transactionDate: receipt,
    reference: p.reference ?? { referenceType: "inbound_receipt", referenceId: lotId },
    notes: p.notes ?? null,
    createdBy: p.createdBy,
  });

  // (3) 집계 재계산(자가 치유)
  await recomputeAggregateFromLots(conn, { tenantId: p.tenantId, subject: p.subject, unit: p.unit });

  return { lotId, lotNumber: p.lotNumber };
}

/** 공통 원장 INSERT — 양수 quantity 규약, material_id 는 canonical(제품은 NULL) */
async function insertLedger(
  conn: InvConn,
  a: {
    tenantId: number;
    lotId: number | null;
    materialId: number | null;
    transactionType: string;
    quantity: number;
    unit: string;
    unitCost?: number | null;
    transactionDate?: string | null;
    reference?: ApplyLotDeltaParams["reference"];
    notes?: string | null;
    createdBy: number;
  },
): Promise<number> {
  const r = a.reference ?? {};
  const amount = a.unitCost != null ? Math.round(Math.abs(a.quantity) * a.unitCost * 100) / 100 : null;
  const [res]: any = await conn.execute(
    `INSERT INTO h_inventory_transactions
       (tenant_id, lot_id, material_id, transaction_type, quantity, unit,
        unit_cost, amount, transaction_date,
        reference_type, reference_id, source_type, source_id, source_line_id,
        action_type, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      a.tenantId,
      a.lotId, // NULL 허용(sentinel 0 금지)
      a.materialId,
      a.transactionType,
      Math.abs(a.quantity), // 항상 양수
      a.unit,
      a.unitCost ?? null,
      amount,
      a.transactionDate ?? null,
      r.referenceType ?? null,
      r.referenceId ?? null,
      r.sourceType ?? null,
      r.sourceId ?? null,
      r.sourceLineId ?? null,
      r.actionType ?? null,
      a.notes ?? null,
      a.createdBy,
    ],
  );
  return Number((res as any).insertId);
}

function toDateStr(d?: Date | string | null): string | null {
  if (d == null) return null;
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

/**
 * 트랜잭션이 없는 호출자를 위한 편의 래퍼.
 * 이미 conn/ctx.conn 을 가진 경로는 이걸 쓰지 말고 그 conn 을 직접 넘길 것.
 */
export async function withInventoryTx<T>(
  fn: (conn: PoolConnection) => Promise<T>,
  opName?: string,
): Promise<T> {
  return withTransaction(fn, opName ?? "applyInventoryDelta");
}
