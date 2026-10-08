/**
 * 음수 LOT 자동 상쇄 (negativeStockPolicy 의 짝)
 *
 * 음수 허용 모드에서 재고 부족분은 자재의 최근 LOT 에 음수로 쌓인다.
 * 그 뒤 입고가 들어오면 (또는 다음 자동출고 직전에) 양수 LOT 에서 음수를 메꾼다.
 *
 *   음수 LOT  -9.770  ──┐
 *   신규 LOT  +20.000 ──┴─→  음수 LOT 0.000 / 신규 LOT 10.230
 *
 * 재고 마스터(h_inventory) 합계는 변하지 않는다 (LOT 간 이동). 감사 트레일로
 * h_inventory_transactions 에 transaction_type='transfer', action_type='NEGATIVE_RECONCILE'
 * 행을 쌍마다 1건 남긴다: lot_id = 메꾼(양수) LOT, reference_type='lot',
 * reference_id = 메꿔진(음수) LOT, quantity = 메꾼 양.
 *
 * 호출 지점
 *   - 입고: purchasePost / inboundManagement.createInboundReceipt / applyInventoryDelta.receiveNewLot
 *   - 자동출고 직전 (autoMaterialIssue v1/v2): 입고 훅을 안 탄 경로의 안전망 (cron 불필요)
 *
 * ⚠️ conn 은 호출자의 트랜잭션. 실패해도 호출자 흐름을 깨지 않도록 호출측에서 try/catch.
 */

import type { Pool, PoolConnection, Connection } from "mysql2/promise";
import { isNegativeStockAllowed, negativePlaceholderLotNumber } from "./negativeStockPolicy";

export type ReconcileConn = Pick<Pool | PoolConnection | Connection, "execute">;

const EPS = 0.001;

export interface ReconcilePair {
  negativeLotId: number;
  sourceLotId: number;
  quantity: number;
}

export interface ReconcileResult {
  materialId: number;
  pairs: ReconcilePair[];
  covered: number;          // 메꾼 합계
  remainingDebt: number;    // 아직 못 메꾼 음수 합계 (양수로 표현)
  skipped?: string;         // 정책/대상 없음 등으로 건너뛴 사유
}

export async function reconcileNegativeLots(
  conn: ReconcileConn,
  p: {
    materialId: number;
    tenantId: number;
    userId?: number | null;
    /** 거래일 (기본 오늘) */
    transactionDate?: string | null;
    source?: string; // 로그/notes 용 (예: 'purchasePost', 'autoIssue')
  },
): Promise<ReconcileResult> {
  const result: ReconcileResult = { materialId: p.materialId, pairs: [], covered: 0, remainingDebt: 0 };

  if (!isNegativeStockAllowed(p.tenantId)) {
    result.skipped = "policy_off";
    return result;
  }

  // 1. 음수 LOT (오래된 것부터)
  const [negRows] = await conn.execute<any[]>(
    `SELECT id, available_quantity, unit, inventory_id, lot_number
       FROM h_inventory_lots
      WHERE material_id = ? AND tenant_id = ? AND available_quantity < -${EPS}
      ORDER BY id ASC`,
    [p.materialId, p.tenantId],
  );
  const negatives = negRows as any[];
  if (negatives.length === 0) {
    result.skipped = "no_negative";
    return result;
  }

  // 2. 양수 LOT (FEFO: 유통기한 빠른 것부터, 없으면 뒤로)
  const [posRows] = await conn.execute<any[]>(
    `SELECT id, available_quantity, unit, inventory_id
       FROM h_inventory_lots
      WHERE material_id = ? AND tenant_id = ? AND available_quantity > ${EPS}
        AND COALESCE(status, 'available') IN ('available', 'reserved')
      ORDER BY COALESCE(expiry_date, '9999-12-31') ASC, id ASC`,
    [p.materialId, p.tenantId],
  );
  const positives = (posRows as any[]).map((r) => ({ ...r, avail: parseFloat(r.available_quantity) }));

  const txDate = p.transactionDate ?? new Date().toISOString().slice(0, 10);
  const srcTag = p.source ?? "reconcile";

  for (const neg of negatives) {
    let debt = -parseFloat(neg.available_quantity);
    for (const pos of positives) {
      if (debt <= EPS) break;
      if (pos.avail <= EPS) continue;
      const take = Math.min(debt, pos.avail);

      await conn.execute(
        `UPDATE h_inventory_lots
            SET available_quantity = available_quantity - ?,
                current_quantity = COALESCE(current_quantity, quantity) - ?,
                status = CASE WHEN available_quantity - ? <= ${EPS} THEN 'used' ELSE status END,
                updated_at = NOW()
          WHERE id = ? AND tenant_id = ?`,
        [take, take, take, pos.id, p.tenantId],
      );
      await conn.execute(
        `UPDATE h_inventory_lots
            SET available_quantity = available_quantity + ?,
                current_quantity = COALESCE(current_quantity, 0) + ?,
                updated_at = NOW()
          WHERE id = ? AND tenant_id = ?`,
        [take, take, neg.id, p.tenantId],
      );
      await conn.execute(
        `INSERT INTO h_inventory_transactions
           (tenant_id, inventory_id, lot_id, material_id, transaction_type, quantity, unit,
            transaction_date, reference_type, reference_id, action_type, purpose,
            performed_by, created_by, notes)
         VALUES (?, ?, ?, ?, 'transfer', ?, ?, ?, 'lot', ?, 'NEGATIVE_RECONCILE', 'negative_stock', ?, ?, ?)`,
        [
          p.tenantId, pos.inventory_id ?? neg.inventory_id ?? null, pos.id, p.materialId,
          take.toFixed(3), pos.unit || neg.unit || "kg", txDate, neg.id,
          p.userId ?? null, p.userId ?? null,
          `음수 LOT #${neg.id}(${neg.lot_number}) ${take.toFixed(3)} 상쇄 ← LOT #${pos.id} [${srcTag}]`,
        ],
      );

      pos.avail -= take;
      debt -= take;
      result.pairs.push({ negativeLotId: Number(neg.id), sourceLotId: Number(pos.id), quantity: take });
      result.covered += take;
    }

    // 자리표시 LOT (NEG-...) 가 0 이 되면 used 로 닫는다
    if (debt <= EPS && String(neg.lot_number || "").startsWith("NEG-")) {
      await conn.execute(
        `UPDATE h_inventory_lots SET status = 'used', updated_at = NOW() WHERE id = ? AND tenant_id = ?`,
        [neg.id, p.tenantId],
      );
    }
    if (debt > EPS) result.remainingDebt += debt;
  }

  if (result.pairs.length > 0) {
    console.info(
      `[negative-stock] reconcile material=${p.materialId} tenant=${p.tenantId} ` +
      `pairs=${result.pairs.length} covered=${result.covered.toFixed(3)} remaining=${result.remainingDebt.toFixed(3)} src=${srcTag}`,
    );
  }
  return result;
}

/**
 * 음수 허용 모드에서 자재에 LOT 가 하나도 없을 때 만드는 자리표시 LOT.
 * quantity 0 으로 만들고, 호출측이 바로 음수 차감한다. 다음 입고 때 reconcile 이 메꾸고 used 로 닫는다.
 */
export async function createNegativePlaceholderLot(
  conn: ReconcileConn,
  p: { materialId: number; tenantId: number; inventoryId: number | null; unit: string; unitPrice?: number | null; receiptDate?: string | null },
): Promise<{ lotId: number; lotNumber: string }> {
  const lotNumber = negativePlaceholderLotNumber(p.materialId);
  const [res] = await conn.execute<any>(
    `INSERT INTO h_inventory_lots
       (tenant_id, inventory_id, material_id, lot_number, quantity, current_quantity, available_quantity,
        unit, unit_price, receipt_date, supplier_name, status)
     VALUES (?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?, 'available')`,
    [
      p.tenantId, p.inventoryId, p.materialId, lotNumber, p.unit, p.unitPrice ?? null,
      p.receiptDate ?? new Date().toISOString().slice(0, 10),
      "(음수 허용 자리표시 — 입고 전 투입)",
    ],
  );
  console.warn(`[negative-stock] placeholder_lot material=${p.materialId} tenant=${p.tenantId} lot=${lotNumber}`);
  return { lotId: Number((res as any).insertId), lotNumber };
}
