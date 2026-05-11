/**
 * 번들 출고 분해 + FEFO 차감 + LOT 추적 — PR #298 (Phase 5 통합)
 *
 * Phase 1~4 인프라 위에 실제 출고 트랜잭션 통합:
 *   1. parent SKU + 출고 수량 입력
 *   2. sku_bundles 룩업 (child_pieces × child_piece_weight_g 우선, 없으면 default_ratio)
 *   3. 각 child SKU 의 FEFO LOT 차감 (h_inventory_lots)
 *   4. parent LOT 신규 채번 (BLEND-{date}-{seq})
 *   5. bundle_lots INSERT (parent ↔ child LOT 매핑, 회수 시뮬레이션 기반)
 *   6. h_inventory_transactions 기록 (각 child + parent 가상 LOT)
 *
 * 정책:
 *   - child 재고 부족 → 경고 + 부분 차감 허용 (block 아님, 사용자 승인 정책)
 *   - 트랜잭션 보장: 한 child 라도 SQL 실패 시 전체 ROLLBACK
 *   - 멱등성 X (출고는 1회성 이벤트)
 *
 * 사용처:
 *   - accounting_sales INSERT 후 호출 (매출 → 재고 차감)
 *   - Excel 일괄 등록 (PR-B) — 행 단위 호출
 */

import type { PoolConnection } from "mysql2/promise";

export interface DecomposeBundleParams {
  /** parent SKU id (sku_bundles.parent_sku_id) */
  parentSkuId: number;
  /** 출고 parent 단위 수 (예: 100 box) */
  parentQty: number;
  /** 출고 일자 (YYYY-MM-DD) */
  outboundDate: string;
  tenantId: number;
  /** 매출/출고 트랜잭션 참조 (예: accounting_sales.id) — bundle_lots.notes 에 기록 */
  referenceType?: string; // 'sales' | 'shipment' | ...
  referenceId?: number;
  userId: number;
}

export interface ChildDeduction {
  childSkuId: number;
  childSkuCode: string;
  childSkuName: string;
  /** 차감할 kg (parent 1 단위 × ratio/100 × parentQty) */
  requiredKg: number;
  /** 실제 차감된 kg (FEFO LOT 합계 — 부족 시 < requiredKg) */
  deductedKg: number;
  /** 부족분 (부분 출고 허용 정책) */
  shortageKg: number;
  /** 차감된 LOT 들 — bundle_lots INSERT 용 */
  lots: Array<{
    lotId: number;
    lotNumber: string;
    deductedKg: number;
    /** ★ PR-C2 (2026-05-11): COGS 계산용 LOT 단가 (h_inventory_lots.unit_price 시점값) */
    unitCost: number;
    /** ★ PR-C2: deductedKg × unitCost 행 비용 */
    cost: number;
  }>;
  /** ★ PR-C2: 이 child 의 차감 LOT 비용 합 (COGS 누적용) */
  totalCost: number;
}

export interface DecomposeBundleResult {
  parentSkuId: number;
  parentQty: number;
  /** 신규 채번된 parent LOT (BLEND-YYYYMMDD-NNN) */
  parentLot: { id: number; lotNumber: string };
  children: ChildDeduction[];
  totalDeductedKg: number;
  /** ★ PR-C2: 모든 child 의 LOT 단가×kg 합 (COGS 라우팅용) */
  totalCost: number;
  hasShortage: boolean;
  warnings: string[];
}

/**
 * 메인 함수 — 트랜잭션 안에서 호출 (caller 가 BEGIN/COMMIT 관리).
 * conn 은 트랜잭션 시작된 PoolConnection.
 */
export async function decomposeBundleOutbound(
  conn: PoolConnection,
  params: DecomposeBundleParams,
): Promise<DecomposeBundleResult> {
  const { parentSkuId, parentQty, outboundDate, tenantId, referenceType, referenceId, userId } = params;
  if (!tenantId) throw new Error("[P0 보안] tenantId 누락");
  if (!parentSkuId) throw new Error("parentSkuId 누락");
  if (!parentQty || parentQty <= 0) throw new Error("parentQty > 0 필요");

  const warnings: string[] = [];

  // ─────────────────────────────────────────────────────
  // 1. 번들 구성 조회 (child_pieces × piece_weight 우선)
  // ─────────────────────────────────────────────────────
  const [bundleRows]: any = await conn.execute(
    `SELECT
       sb.child_sku_id, sb.default_ratio, sb.child_pieces, sb.child_piece_weight_g,
       ps.sku_code AS child_sku_code, ps.sku_name AS child_sku_name,
       ps.kg_per_sales_unit AS child_kg_per_unit
     FROM sku_bundles sb
     JOIN product_skus ps ON ps.id = sb.child_sku_id
     WHERE sb.tenant_id = ? AND sb.parent_sku_id = ?
     ORDER BY sb.sort_order, sb.id`,
    [tenantId, parentSkuId],
  );
  if ((bundleRows as any[]).length === 0) {
    throw new Error(`SKU ${parentSkuId} 는 번들 구성이 없습니다 — 단일 SKU 차감 경로 사용`);
  }

  // parent SKU 의 1 단위 kg (BLEND LOT 채번용)
  const [parentRows]: any = await conn.execute(
    `SELECT kg_per_sales_unit, sku_code, sku_name FROM product_skus WHERE id = ? AND tenant_id = ?`,
    [parentSkuId, tenantId],
  );
  const parentInfo = (parentRows as any[])[0];
  if (!parentInfo) throw new Error(`parent SKU ${parentSkuId} 를 찾을 수 없습니다`);
  const parentKg = Number(parentInfo.kg_per_sales_unit || 1);

  // ─────────────────────────────────────────────────────
  // 2. parent LOT 신규 채번 (BLEND-YYYYMMDD-NNN)
  // ─────────────────────────────────────────────────────
  const dateKey = outboundDate.replace(/-/g, "");
  const [seqRows]: any = await conn.execute(
    `SELECT COUNT(*) AS cnt FROM h_inventory_lots
       WHERE tenant_id = ? AND lot_number LIKE ?`,
    [tenantId, `BLEND-${dateKey}-%`],
  );
  const seq = Number((seqRows as any[])[0]?.cnt ?? 0) + 1;
  const parentLotNumber = `BLEND-${dateKey}-${String(seq).padStart(3, "0")}`;
  const totalParentKg = parentKg * parentQty;

  const [parentLotInsert]: any = await conn.execute(
    `INSERT INTO h_inventory_lots
       (tenant_id, lot_number, sku_id, sku_name, quantity, current_quantity, available_quantity, unit, production_date, receipt_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'kg', ?, ?)`,
    [
      tenantId,
      parentLotNumber,
      parentSkuId,
      parentInfo.sku_name,
      totalParentKg,
      0, // 즉시 출고: current = 0
      0,
      outboundDate,
      outboundDate,
    ],
  );
  const parentLotId = Number((parentLotInsert as any).insertId);

  // ─────────────────────────────────────────────────────
  // 3. 각 child 차감 — piece 기반 우선, 없으면 ratio
  // ─────────────────────────────────────────────────────
  const children: ChildDeduction[] = [];
  let totalDeductedKg = 0;

  for (const b of (bundleRows as any[])) {
    const childSkuId = Number(b.child_sku_id);
    const ratio = Number(b.default_ratio) || 0;
    const pieces = b.child_pieces ? Number(b.child_pieces) : null;
    const pieceG = b.child_piece_weight_g ? Number(b.child_piece_weight_g) : null;

    // 차감량 계산 — piece × weight 우선, 없으면 ratio × parentKg
    let requiredKgPerParent: number;
    if (pieces && pieceG) {
      requiredKgPerParent = (pieces * pieceG) / 1000; // g → kg
    } else {
      requiredKgPerParent = (parentKg * ratio) / 100;
    }
    const requiredKg = requiredKgPerParent * parentQty;

    // FEFO 차감: expiry_date 빠른 LOT 우선
    // ★ PR-C2 (2026-05-11): unit_price 함께 SELECT — COGS 계산용
    const [lots]: any = await conn.execute(
      `SELECT id, lot_number, available_quantity, expiry_date, unit_price
         FROM h_inventory_lots
         WHERE tenant_id = ?
           AND sku_id = ?
           AND COALESCE(available_quantity, 0) > 0
         ORDER BY expiry_date ASC, id ASC`,
      [tenantId, childSkuId],
    );

    let remaining = requiredKg;
    const usedLots: ChildDeduction["lots"] = [];
    let childTotalCost = 0;

    for (const lot of (lots as any[])) {
      if (remaining <= 0.001) break;
      const avail = Number(lot.available_quantity) || 0;
      const take = Math.min(avail, remaining);
      if (take > 0) {
        const lotUnitCost = Number(lot.unit_price || 0);
        const lotCost = take * lotUnitCost;
        await conn.execute(
          `UPDATE h_inventory_lots
             SET available_quantity = GREATEST(available_quantity - ?, 0),
                 current_quantity = GREATEST(current_quantity - ?, 0)
             WHERE id = ? AND tenant_id = ?`,
          [take, take, lot.id, tenantId],
        );
        // h_inventory_transactions 기록 — ★ PR-C2: unit_cost/amount 추가
        await conn.execute(
          `INSERT INTO h_inventory_transactions
             (tenant_id, lot_id, transaction_type, quantity, unit, transaction_date,
              source_type, source_id, action_type, purpose, unit_cost, amount,
              performed_by, created_by)
           VALUES (?, ?, 'usage', ?, 'kg', ?, 'BUNDLE_OUTBOUND', ?, 'POST', 'sales_decompose', ?, ?, ?, ?)`,
          [
            tenantId, lot.id, take, outboundDate, parentLotId,
            lotUnitCost, lotCost, userId, userId,
          ],
        );
        // bundle_lots 매핑 INSERT
        await conn.execute(
          `INSERT INTO bundle_lots (tenant_id, parent_lot_id, child_lot_id, deducted_qty_kg, mapped_at, notes)
           VALUES (?, ?, ?, ?, NOW(), ?)`,
          [
            tenantId,
            parentLotId,
            lot.id,
            take,
            referenceType && referenceId
              ? `${referenceType}:${referenceId}`
              : null,
          ],
        );
        usedLots.push({
          lotId: Number(lot.id),
          lotNumber: String(lot.lot_number),
          deductedKg: Math.round(take * 1000) / 1000,
          unitCost: lotUnitCost,
          cost: Math.round(lotCost * 100) / 100,
        });
        childTotalCost += lotCost;
        remaining -= take;
      }
    }

    const deductedKg = requiredKg - remaining;
    const shortageKg = Math.max(0, remaining);
    if (shortageKg > 0.001) {
      warnings.push(
        `${b.child_sku_name}: 부족 ${shortageKg.toFixed(3)} kg (요청 ${requiredKg.toFixed(3)}kg, 차감 ${deductedKg.toFixed(3)}kg)`,
      );
    }

    children.push({
      childSkuId,
      childSkuCode: String(b.child_sku_code),
      childSkuName: String(b.child_sku_name),
      requiredKg: Math.round(requiredKg * 1000) / 1000,
      deductedKg: Math.round(deductedKg * 1000) / 1000,
      shortageKg: Math.round(shortageKg * 1000) / 1000,
      lots: usedLots,
      totalCost: Math.round(childTotalCost * 100) / 100,
    });
    totalDeductedKg += deductedKg;
  }

  const grandTotalCost = children.reduce((s, c) => s + c.totalCost, 0);

  return {
    parentSkuId,
    parentQty,
    parentLot: { id: parentLotId, lotNumber: parentLotNumber },
    children,
    totalDeductedKg: Math.round(totalDeductedKg * 1000) / 1000,
    totalCost: Math.round(grandTotalCost * 100) / 100,
    hasShortage: warnings.length > 0,
    warnings,
  };
}
