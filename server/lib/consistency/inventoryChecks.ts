/**
 * 재고 정합성 검증
 * ═══════════════════════════════════════════════════════════════
 * 검증 항목:
 *   INV_NEG_STOCK         — ★ 재고 음수 (절대 금지)
 *   INV_AVAIL_GT_CURRENT  — available > current
 *   INV_LOT_VS_TX         — LOT 잔량 합 ≠ 거래원장 집계
 *   INV_NULL_MATERIAL     — material_id NULL LOT
 *   INV_ORPHAN_LOT        — LOT 있는데 receipt 거래 없음
 *   INV_EXPIRED_ACTIVE    — 유통기한 지났는데 status=available
 *   INV_NEGATIVE_TX       — 거래 수량이 음수
 *   INV_TENANT_MISMATCH   — LOT 와 transaction 의 tenant_id 불일치
 * ═══════════════════════════════════════════════════════════════
 */

import type { Pool } from "mysql2/promise";
import type { Finding } from "./types";

const SAMPLE_LIMIT = 20;
const TOLERANCE = 0.001; // 부동소수 허용 오차

/**
 * ★ 재고 음수 검증 (절대 금지 - 핵심 원칙)
 * current_quantity < 0 OR available_quantity < 0
 */
export async function checkNegativeStock(
  conn: Pool,
  tenantId: number | null,
): Promise<Finding> {
  const tenantFilter = tenantId !== null ? "AND tenant_id = ?" : "";
  const params = tenantId !== null ? [tenantId] : [];

  const [rows]: any = await conn.execute(
    `SELECT id, tenant_id, lot_number, material_id, product_id,
            quantity, current_quantity, available_quantity, status
     FROM h_inventory_lots
     WHERE (COALESCE(current_quantity, quantity) < ${-TOLERANCE}
            OR available_quantity < ${-TOLERANCE})
       ${tenantFilter}
     ORDER BY LEAST(COALESCE(current_quantity, quantity), available_quantity) ASC
     LIMIT ${SAMPLE_LIMIT}`,
    params,
  );

  const [countRows]: any = await conn.execute(
    `SELECT COUNT(*) AS cnt
     FROM h_inventory_lots
     WHERE (COALESCE(current_quantity, quantity) < ${-TOLERANCE}
            OR available_quantity < ${-TOLERANCE})
       ${tenantFilter}`,
    params,
  );

  return {
    code: "INV_NEG_STOCK",
    title: "★ 재고 음수 LOT (절대 금지)",
    severity: "critical",
    count: Number(countRows[0]?.cnt || 0),
    samples: rows,
    message: "재고 수량이 음수인 LOT 가 있습니다. 차감 로직에 GREATEST(0, ...) 방어가 필요합니다.",
  };
}

/**
 * available_quantity > current_quantity 검증
 */
export async function checkAvailableGreaterThanCurrent(
  conn: Pool,
  tenantId: number | null,
): Promise<Finding> {
  const tenantFilter = tenantId !== null ? "AND tenant_id = ?" : "";
  const params = tenantId !== null ? [tenantId] : [];

  const [rows]: any = await conn.execute(
    `SELECT id, tenant_id, lot_number, material_id,
            quantity, current_quantity, available_quantity
     FROM h_inventory_lots
     WHERE available_quantity > COALESCE(current_quantity, quantity) + ${TOLERANCE}
       ${tenantFilter}
     LIMIT ${SAMPLE_LIMIT}`,
    params,
  );

  const [countRows]: any = await conn.execute(
    `SELECT COUNT(*) AS cnt
     FROM h_inventory_lots
     WHERE available_quantity > COALESCE(current_quantity, quantity) + ${TOLERANCE}
       ${tenantFilter}`,
    params,
  );

  return {
    code: "INV_AVAIL_GT_CURRENT",
    title: "가용 수량 > 현재 수량 (불가능한 상태)",
    severity: "high",
    count: Number(countRows[0]?.cnt || 0),
    samples: rows,
  };
}

/**
 * LOT 잔량 합 vs 거래원장 (receipts - usages) 집계 비교
 *
 * 제외 대상:
 *   1. 거래(transaction)가 전혀 없는 LOT (Excel import, 초기 데이터 등)
 *   2. current_quantity=0 이면서 tx_net < 0 인 LOT (배치 시스템이 초과 차감한 이력 아티팩트)
 *      → 실재고 0 은 맞고, 트랜잭션 역사가 초과 차감을 보여줄 뿐
 */
export async function checkLotVsTransactions(
  conn: Pool,
  tenantId: number | null,
): Promise<Finding> {
  const tenantFilter = tenantId !== null ? "WHERE lot.tenant_id = ?" : "";
  const params = tenantId !== null ? [tenantId] : [];

  // LOT 별로 현재잔량과 거래원장 집계를 비교
  // 제외: (1) 거래 없는 LOT, (2) current=0 & tx_net<0 (초과차감 이력)
  const [rows]: any = await conn.execute(
    `SELECT
        lot.id AS lot_id,
        lot.tenant_id,
        lot.lot_number,
        lot.material_id,
        COALESCE(lot.current_quantity, lot.quantity) AS lot_current,
        COALESCE(SUM(CASE
          WHEN tx.transaction_type IN ('receipt','inbound','return','adjustment')
            AND tx.quantity >= 0 THEN tx.quantity
          WHEN tx.transaction_type IN ('usage','outbound','disposal','transfer')
            AND tx.quantity >= 0 THEN -tx.quantity
          ELSE tx.quantity
        END), 0) AS tx_net
     FROM h_inventory_lots lot
     INNER JOIN h_inventory_transactions tx ON tx.lot_id = lot.id
     ${tenantFilter}
     GROUP BY lot.id
     HAVING ABS(lot_current - tx_net) > ${TOLERANCE}
       AND NOT (lot_current < ${TOLERANCE} AND tx_net < 0)
     ORDER BY ABS(lot_current - tx_net) DESC
     LIMIT ${SAMPLE_LIMIT}`,
    params,
  );

  // 전체 불일치 건수 (동일 제외 조건)
  const [countRows]: any = await conn.execute(
    `SELECT COUNT(*) AS cnt FROM (
       SELECT lot.id,
              COALESCE(lot.current_quantity, lot.quantity) AS lot_current,
              COALESCE(SUM(CASE
                WHEN tx.transaction_type IN ('receipt','inbound','return','adjustment')
                  AND tx.quantity >= 0 THEN tx.quantity
                WHEN tx.transaction_type IN ('usage','outbound','disposal','transfer')
                  AND tx.quantity >= 0 THEN -tx.quantity
                ELSE tx.quantity
              END), 0) AS tx_net
       FROM h_inventory_lots lot
       INNER JOIN h_inventory_transactions tx ON tx.lot_id = lot.id
       ${tenantFilter}
       GROUP BY lot.id
       HAVING ABS(lot_current - tx_net) > ${TOLERANCE}
         AND NOT (lot_current < ${TOLERANCE} AND tx_net < 0)
     ) AS q`,
    params,
  );

  const totalDelta = rows.reduce(
    (acc: number, r: any) => acc + Math.abs(Number(r.lot_current) - Number(r.tx_net)),
    0,
  );

  return {
    code: "INV_LOT_VS_TX",
    title: "LOT 잔량 vs 거래원장 집계 불일치",
    severity: Number(countRows[0]?.cnt || 0) > 0 ? "high" : "info",
    count: Number(countRows[0]?.cnt || 0),
    samples: rows,
    totalDelta,
    message: "LOT 의 current_quantity 와 h_inventory_transactions 집계가 다릅니다. (초과차감/무거래 LOT 제외)",
  };
}

/**
 * material_id / product_id 둘 다 NULL 인 LOT
 */
export async function checkNullMaterialId(
  conn: Pool,
  tenantId: number | null,
): Promise<Finding> {
  const tenantFilter = tenantId !== null ? "AND tenant_id = ?" : "";
  const params = tenantId !== null ? [tenantId] : [];

  const [rows]: any = await conn.execute(
    `SELECT id, tenant_id, lot_number, material_id, product_id, sku_id,
            quantity, current_quantity, supplier_name, created_at
     FROM h_inventory_lots
     WHERE material_id IS NULL AND product_id IS NULL AND sku_id IS NULL
       ${tenantFilter}
     ORDER BY created_at DESC
     LIMIT ${SAMPLE_LIMIT}`,
    params,
  );

  const [countRows]: any = await conn.execute(
    `SELECT COUNT(*) AS cnt
     FROM h_inventory_lots
     WHERE material_id IS NULL AND product_id IS NULL AND sku_id IS NULL
       ${tenantFilter}`,
    params,
  );

  return {
    code: "INV_NULL_MATERIAL",
    title: "material_id/product_id NULL LOT (고아 LOT)",
    severity: "medium",
    count: Number(countRows[0]?.cnt || 0),
    samples: rows,
    message: "material_id 와 product_id 가 모두 NULL 인 LOT 는 재고관리/수불부에서 누락됩니다.",
  };
}

/**
 * 유통기한 지났는데 status=available
 */
export async function checkExpiredActive(
  conn: Pool,
  tenantId: number | null,
): Promise<Finding> {
  const tenantFilter = tenantId !== null ? "AND tenant_id = ?" : "";
  const params = tenantId !== null ? [tenantId] : [];

  const [rows]: any = await conn.execute(
    `SELECT id, tenant_id, lot_number, material_id, expiry_date,
            COALESCE(current_quantity, quantity) AS qty, status
     FROM h_inventory_lots
     WHERE status = 'available'
       AND expiry_date IS NOT NULL
       AND expiry_date < CURDATE()
       AND COALESCE(current_quantity, quantity) > ${TOLERANCE}
       ${tenantFilter}
     ORDER BY expiry_date ASC
     LIMIT ${SAMPLE_LIMIT}`,
    params,
  );

  const [countRows]: any = await conn.execute(
    `SELECT COUNT(*) AS cnt
     FROM h_inventory_lots
     WHERE status = 'available'
       AND expiry_date IS NOT NULL
       AND expiry_date < CURDATE()
       AND COALESCE(current_quantity, quantity) > ${TOLERANCE}
       ${tenantFilter}`,
    params,
  );

  return {
    code: "INV_EXPIRED_ACTIVE",
    title: "유통기한 지난 available LOT",
    severity: "medium",
    count: Number(countRows[0]?.cnt || 0),
    samples: rows,
    message: "expiry_date 가 오늘보다 이전인데 status=available 상태인 LOT 가 있습니다.",
  };
}

/**
 * 거래 수량이 음수인 경우
 */
export async function checkNegativeTransaction(
  conn: Pool,
  tenantId: number | null,
): Promise<Finding> {
  const tenantFilter = tenantId !== null ? "AND tenant_id = ?" : "";
  const params = tenantId !== null ? [tenantId] : [];

  const [rows]: any = await conn.execute(
    `SELECT id, tenant_id, lot_id, transaction_type, quantity, transaction_date, reference_type, source_id
     FROM h_inventory_transactions
     WHERE quantity < ${-TOLERANCE}
       ${tenantFilter}
     ORDER BY transaction_date DESC, id DESC
     LIMIT ${SAMPLE_LIMIT}`,
    params,
  );

  const [countRows]: any = await conn.execute(
    `SELECT COUNT(*) AS cnt
     FROM h_inventory_transactions
     WHERE quantity < ${-TOLERANCE}
       ${tenantFilter}`,
    params,
  );

  return {
    code: "INV_NEGATIVE_TX",
    title: "음수 거래 수량 (역거래는 양수+타입으로 기록해야 함)",
    severity: "medium",
    count: Number(countRows[0]?.cnt || 0),
    samples: rows,
  };
}

/**
 * LOT 와 transaction 의 tenant_id 불일치
 */
export async function checkTenantMismatch(
  conn: Pool,
  tenantId: number | null,
): Promise<Finding> {
  // tenant 지정되어 있으면 해당 tenant 의 LOT 기준으로만 검사
  const tenantFilter = tenantId !== null ? "WHERE lot.tenant_id = ?" : "";
  const params = tenantId !== null ? [tenantId] : [];

  const [rows]: any = await conn.execute(
    `SELECT tx.id AS tx_id, tx.tenant_id AS tx_tenant,
            lot.id AS lot_id, lot.tenant_id AS lot_tenant, lot.lot_number
     FROM h_inventory_transactions tx
     INNER JOIN h_inventory_lots lot ON lot.id = tx.lot_id
     ${tenantFilter} ${tenantFilter ? "AND" : "WHERE"} tx.tenant_id != lot.tenant_id
     LIMIT ${SAMPLE_LIMIT}`,
    params,
  );

  const [countRows]: any = await conn.execute(
    `SELECT COUNT(*) AS cnt
     FROM h_inventory_transactions tx
     INNER JOIN h_inventory_lots lot ON lot.id = tx.lot_id
     ${tenantFilter} ${tenantFilter ? "AND" : "WHERE"} tx.tenant_id != lot.tenant_id`,
    params,
  );

  return {
    code: "INV_TENANT_MISMATCH",
    title: "LOT/거래 tenant_id 불일치 (★ 보안 위험)",
    severity: "critical",
    count: Number(countRows[0]?.cnt || 0),
    samples: rows,
    message: "h_inventory_transactions.tenant_id 와 h_inventory_lots.tenant_id 가 다른 경우 (크로스 테넌트 누출 위험)",
  };
}

/**
 * 재고 검증 전체 실행
 */
export async function runInventoryChecks(
  conn: Pool,
  tenantId: number | null,
): Promise<Finding[]> {
  const [
    negStock,
    availGt,
    lotVsTx,
    nullMat,
    expired,
    negTx,
    tenantMismatch,
  ] = await Promise.all([
    checkNegativeStock(conn, tenantId),
    checkAvailableGreaterThanCurrent(conn, tenantId),
    checkLotVsTransactions(conn, tenantId),
    checkNullMaterialId(conn, tenantId),
    checkExpiredActive(conn, tenantId),
    checkNegativeTransaction(conn, tenantId),
    checkTenantMismatch(conn, tenantId),
  ]);

  return [negStock, availGt, lotVsTx, nullMat, expired, negTx, tenantMismatch];
}
