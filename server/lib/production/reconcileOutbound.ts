/**
 * 미적용 LOT 정산 — 출고는 기록됐으나 LOT 을 안 깎은 건을 소급 반영 (병③ 보강)
 * ============================================================================
 * 배경 (docs/architecture/10):
 *   제품출고의 레거시 batch 경로(createProductOutbound 의 batchId 분기)는 출고를
 *   기록하되 h_inventory_lots 를 차감하지 않는다 → h_product_outbound.lot_id = NULL.
 *   그 결과 LOT 은 가득 찬 채 남아, LOT 정본(getProductCanonicalStock)이 이 출고분을
 *   과대계상한다. (현장에서 "먼저 출고, 나중 배치입력" 하면 발생)
 *
 * 이 모듈: 출고관리 화면의 "미적용 LOT 정산" 버튼이 호출.
 *   - 대상: lot_id IS NULL, status='confirmed', batch_id 존재하는 출고.
 *   - 매핑: 출고의 batch_id → 그 배치의 available LOT(FEFO) 를 차감.
 *   - 안전: 출고 unit 과 LOT unit 이 같은 경우만 자동 정산(단위 모호분은 skip+flag).
 *   - 3-leg: LOT 차감 + h_inventory_transactions(outbound) 기록 + 출고.lot_id 연결.
 *     (제품 집계 h_inventory(product_id) 는 정본에서 은퇴 → 건드리지 않음)
 *   - 멱등: lot_id 채워진 건은 재처리 안 함.
 */

import { getRawConnection, withTransaction } from "../../db/connection";

const EPS = 0.001;

export interface UnappliedOutboundItem {
  outboundId: number;
  batchId: number | null;
  batchCode: string | null;
  productName: string;
  quantity: number;
  unit: string;
  releaseDate: string | null;
  batchLotAvailable: number; // 같은 배치의 가용 LOT 합(같은 unit 기준)
  reconcilable: boolean; // 같은 unit LOT 로 전량 정산 가능한지
}

export interface UnappliedOutboundSummary {
  count: number;
  totalQuantity: number;
  reconcilableCount: number;
  items: UnappliedOutboundItem[];
}

/** 미적용(lot_id NULL) 출고 목록 + 정산 가능 여부 */
export async function getUnappliedOutbounds(tenantId: number): Promise<UnappliedOutboundSummary> {
  const conn = await getRawConnection();
  const [rows]: any = await conn.execute(
    `SELECT o.id, o.batch_id, o.product_name, o.quantity, o.unit, o.release_date,
            b.batch_code,
            COALESCE((
              SELECT SUM(l.available_quantity) FROM h_inventory_lots l
              WHERE l.batch_id = o.batch_id AND l.tenant_id = o.tenant_id
                AND l.status = 'available' AND TRIM(COALESCE(l.unit,'')) = TRIM(COALESCE(o.unit,''))
            ), 0) AS batch_lot_avail_same_unit
       FROM h_product_outbound o
       LEFT JOIN h_batches b ON b.id = o.batch_id AND b.tenant_id = o.tenant_id
      WHERE o.tenant_id = ?
        AND o.status = 'confirmed'
        AND o.lot_id IS NULL
        AND o.batch_id IS NOT NULL
      ORDER BY o.release_date ASC, o.id ASC`,
    [tenantId],
  );

  const items: UnappliedOutboundItem[] = (rows as any[]).map((r) => {
    const qty = parseFloat(r.quantity || "0");
    const avail = parseFloat(r.batch_lot_avail_same_unit || "0");
    return {
      outboundId: Number(r.id),
      batchId: r.batch_id != null ? Number(r.batch_id) : null,
      batchCode: r.batch_code ?? null,
      productName: r.product_name,
      quantity: qty,
      unit: r.unit || "EA",
      releaseDate: r.release_date ?? null,
      batchLotAvailable: avail,
      reconcilable: avail + EPS >= qty && qty > 0,
    };
  });

  return {
    count: items.length,
    totalQuantity: Math.round(items.reduce((s, i) => s + i.quantity, 0) * 1000) / 1000,
    reconcilableCount: items.filter((i) => i.reconcilable).length,
    items,
  };
}

export interface ReconcileResult {
  applied: Array<{ outboundId: number; lotId: number; quantity: number }>;
  skipped: Array<{ outboundId: number; reason: string }>;
  appliedQuantity: number;
  dryRun: boolean;
}

/**
 * 미적용 출고를 배치 LOT 에 소급 차감(FEFO). 같은 unit LOT 로 전량 정산 가능한 건만.
 * @param outboundIds 지정 시 해당 건만, 없으면 정산 가능한 전체.
 */
export async function reconcileUnappliedOutbounds(
  tenantId: number,
  userId: number,
  opts?: { outboundIds?: number[]; dryRun?: boolean },
): Promise<ReconcileResult> {
  const dryRun = !!opts?.dryRun;
  const summary = await getUnappliedOutbounds(tenantId);
  const targetSet = opts?.outboundIds && opts.outboundIds.length > 0 ? new Set(opts.outboundIds) : null;

  const applied: ReconcileResult["applied"] = [];
  const skipped: ReconcileResult["skipped"] = [];

  for (const item of summary.items) {
    if (targetSet && !targetSet.has(item.outboundId)) continue;
    if (item.quantity <= 0) { skipped.push({ outboundId: item.outboundId, reason: "수량 0" }); continue; }
    if (!item.batchId) { skipped.push({ outboundId: item.outboundId, reason: "batch 연결 없음" }); continue; }
    if (!item.reconcilable) {
      skipped.push({ outboundId: item.outboundId, reason: `같은 단위(${item.unit}) 배치 LOT 가용 부족(${item.batchLotAvailable}/${item.quantity}) — 수동 확인` });
      continue;
    }

    if (dryRun) {
      applied.push({ outboundId: item.outboundId, lotId: 0, quantity: item.quantity });
      continue;
    }

    try {
      const usedLotId = await withTransaction(async (conn) => {
        // 멱등 재검증: 아직 lot_id NULL 인지 잠금 확인
        const [oRows]: any = await conn.execute(
          `SELECT lot_id, batch_id, quantity, unit FROM h_product_outbound
             WHERE id = ? AND tenant_id = ? FOR UPDATE`,
          [item.outboundId, tenantId],
        );
        const o = (oRows as any[])[0];
        if (!o || o.lot_id != null) return null; // 이미 처리됨
        const qty = parseFloat(o.quantity || "0");
        const unit = o.unit || item.unit;

        // 배치의 같은 unit available LOT FEFO 잠금
        const [lotRows]: any = await conn.execute(
          `SELECT id, available_quantity, current_quantity, quantity FROM h_inventory_lots
             WHERE batch_id = ? AND tenant_id = ? AND status = 'available'
               AND available_quantity > ? AND TRIM(COALESCE(unit,'')) = TRIM(?)
             ORDER BY CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END, expiry_date ASC, id ASC
             FOR UPDATE`,
          [o.batch_id, tenantId, EPS, unit],
        );
        const lots = lotRows as any[];
        const totalAvail = lots.reduce((s, l) => s + parseFloat(l.available_quantity || "0"), 0);
        if (totalAvail + EPS < qty) return null; // 정산 불가(경합으로 줄었을 수 있음)

        let remaining = qty;
        let firstLotId = 0;
        for (const lot of lots) {
          if (remaining <= EPS) break;
          const avail = parseFloat(lot.available_quantity || "0");
          const take = Math.min(avail, remaining);
          if (take <= 0) continue;
          await conn.execute(
            `UPDATE h_inventory_lots
               SET available_quantity = GREATEST(0, available_quantity - ?),
                   current_quantity = GREATEST(0, COALESCE(current_quantity, quantity) - ?),
                   status = CASE WHEN GREATEST(0, available_quantity - ?) <= ? THEN 'used' ELSE status END,
                   updated_at = NOW()
             WHERE id = ? AND tenant_id = ?`,
            [take, take, take, EPS, lot.id, tenantId],
          );
          // 원장 기록 (제품 출고, 양수 quantity)
          await conn.execute(
            `INSERT INTO h_inventory_transactions
               (tenant_id, lot_id, transaction_type, quantity, unit, transaction_date,
                reference_type, source_type, source_id, action_type, notes, created_by)
             VALUES (?, ?, 'outbound', ?, ?, CURDATE(),
                     'OUTBOUND_RECONCILE', 'OUTBOUND_RECONCILE', ?, 'reconciled',
                     ?, ?)`,
            [tenantId, lot.id, take, unit, item.outboundId,
             `[미적용 LOT 정산] 출고#${item.outboundId} 소급 차감`, userId],
          );
          if (!firstLotId) firstLotId = Number(lot.id);
          remaining -= take;
        }

        if (firstLotId) {
          await conn.execute(
            `UPDATE h_product_outbound SET lot_id = ? WHERE id = ? AND tenant_id = ?`,
            [firstLotId, item.outboundId, tenantId],
          );
        }
        return firstLotId || null;
      }, `reconcileOutbound:${item.outboundId}`);

      if (usedLotId) {
        applied.push({ outboundId: item.outboundId, lotId: usedLotId, quantity: item.quantity });
      } else {
        skipped.push({ outboundId: item.outboundId, reason: "이미 처리됐거나 경합으로 가용 부족" });
      }
    } catch (err: any) {
      skipped.push({ outboundId: item.outboundId, reason: `오류: ${String(err?.message || err).slice(0, 80)}` });
    }
  }

  return {
    applied,
    skipped,
    appliedQuantity: Math.round(applied.reduce((s, a) => s + a.quantity, 0) * 1000) / 1000,
    dryRun,
  };
}
