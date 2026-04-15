/**
 * 재고 ↔ 회계 교차 정합성 검증
 * ═══════════════════════════════════════════════════════════════
 * 검증 항목:
 *   XCHK_PURCHASE_VS_TX        — paid 매입 vs h_inventory_transactions (케이스 무시)
 *   XCHK_PURCHASE_VS_LEDGER    — paid 매입 vs material_ledger_daily
 *   XCHK_CANCELLED_LEFTOVER    — cancelled 매입인데 h_inbound_headers 남음
 *   XCHK_CANCELLED_LEDGER      — cancelled 매입인데 material_ledger_daily 감소 안됨
 *   XCHK_SALE_NO_DEDUCTION     — received 매출인데 h_inventory_transactions 'usage' 없음
 *   XCHK_REF_TYPE_CASE         — ★ reference_type 대소문자 혼재 (buggy)
 *   XCHK_PURCHASE_AMOUNT_MATCH — 매입 총액 vs 재고거래 금액 합
 *   XCHK_LEDGER_VS_TX          — material_ledger_daily vs h_inventory_transactions
 * ═══════════════════════════════════════════════════════════════
 */

import type { Pool } from "mysql2/promise";
import type { Finding } from "./types";

const SAMPLE_LIMIT = 20;
const QTY_TOLERANCE = 0.001;
const AMT_TOLERANCE = 0.01;

/**
 * ★ reference_type 대소문자 혼재 체크
 *
 * 'purchase' (소문자) vs 'PURCHASE' (대문자) 가 섞여 있으면
 * 조인/조회 시 한쪽이 누락됨.
 *
 * SALE / INBOUND / OUTBOUND / DISPOSAL 등 다른 값도 체크.
 */
export async function checkRefTypeCaseMismatch(
  conn: Pool,
  tenantId: number | null,
): Promise<Finding> {
  const tenantFilter = tenantId !== null ? "AND tenant_id = ?" : "";
  const params = tenantId !== null ? [tenantId] : [];

  // 동일한 값의 대/소문자 변형을 모두 집계
  const [rows]: any = await conn.execute(
    `SELECT reference_type, UPPER(reference_type) AS normalized, COUNT(*) AS cnt
     FROM h_inventory_transactions
     WHERE reference_type IS NOT NULL
       ${tenantFilter}
     GROUP BY reference_type, UPPER(reference_type)
     ORDER BY normalized, cnt DESC`,
    params,
  );

  // UPPER 기준으로 그룹핑했을 때 동일 normalized 로 여러 케이스가 존재하면 혼재
  const byNormalized: Record<string, any[]> = {};
  for (const r of rows as any[]) {
    const key = String(r.normalized || "");
    if (!byNormalized[key]) byNormalized[key] = [];
    byNormalized[key].push(r);
  }

  const mixed = Object.entries(byNormalized)
    .filter(([_, variants]) => variants.length > 1)
    .map(([normalized, variants]) => ({
      normalized,
      variants: variants.map((v) => ({
        value: v.reference_type,
        count: Number(v.cnt),
      })),
      total: variants.reduce((acc, v) => acc + Number(v.cnt), 0),
    }));

  const totalMixed = mixed.reduce((acc, m) => acc + m.total, 0);

  return {
    code: "XCHK_REF_TYPE_CASE",
    title: "★ reference_type 대소문자 혼재 (조회/조인 누락 유발)",
    severity: mixed.length > 0 ? "critical" : "info",
    count: totalMixed,
    samples: mixed.slice(0, SAMPLE_LIMIT),
    message:
      mixed.length > 0
        ? "같은 값이 대/소문자로 섞여 있음. 예: 'purchase' vs 'PURCHASE'. 조회 시 한쪽이 누락됨. 표준화 필요."
        : "reference_type 대소문자 혼재 없음.",
  };
}

/**
 * paid 매입 vs h_inventory_transactions 연결 검증 (케이스 무시)
 *
 * status='paid' 인 accounting_purchases 에 대해 h_inventory_transactions 에
 * reference_type='PURCHASE' (또는 'purchase' - UPPER 비교) + source_id=purchase.id
 * 레코드가 있는지 확인.
 */
export async function checkPaidPurchaseNoInventoryTx(
  conn: Pool,
  tenantId: number | null,
): Promise<Finding> {
  const tenantFilter = tenantId !== null ? "AND p.tenant_id = ?" : "";
  const params = tenantId !== null ? [tenantId] : [];

  const [rows]: any = await conn.execute(
    `SELECT p.id, p.tenant_id, p.transaction_date, p.item_name, p.material_id,
            p.quantity, p.total_amount, p.status, p.posted_at
     FROM accounting_purchases p
     WHERE p.status = 'paid'
       AND NOT EXISTS (
         SELECT 1 FROM h_inventory_transactions tx
         WHERE tx.tenant_id = p.tenant_id
           AND UPPER(tx.reference_type) = 'PURCHASE'
           AND tx.source_id = p.id
       )
       ${tenantFilter}
     ORDER BY p.posted_at DESC
     LIMIT ${SAMPLE_LIMIT}`,
    params,
  );

  const [countRows]: any = await conn.execute(
    `SELECT COUNT(*) AS cnt
     FROM accounting_purchases p
     WHERE p.status = 'paid'
       AND NOT EXISTS (
         SELECT 1 FROM h_inventory_transactions tx
         WHERE tx.tenant_id = p.tenant_id
           AND UPPER(tx.reference_type) = 'PURCHASE'
           AND tx.source_id = p.id
       )
       ${tenantFilter}`,
    params,
  );

  return {
    code: "XCHK_PURCHASE_VS_TX",
    title: "paid 매입인데 재고거래(receipt) 없음",
    severity: "critical",
    count: Number(countRows[0]?.cnt || 0),
    samples: rows,
    message: "매입이 확정됐는데 h_inventory_transactions 에 'receipt' 레코드가 없어 재고/LOT 미연동.",
  };
}

/**
 * paid 매입 vs material_ledger_daily 집계 비교 (material_id 기준)
 *
 * 참고: material_ledger_daily.receiving_qty 는 매입 외에도 배치 생산,
 * Excel 임포트 등 다양한 소스의 입고를 포함합니다.
 * 따라서 purchase_qty < ledger_qty 는 정상이며,
 * purchase_qty > ledger_qty (매입은 있는데 수불 미반영) 만 문제입니다.
 */
export async function checkPurchaseVsLedger(
  conn: Pool,
  tenantId: number | null,
): Promise<Finding> {
  const tenantFilter = tenantId !== null ? "AND p.tenant_id = ?" : "";
  const params = tenantId !== null ? [tenantId] : [];

  // material 별로 paid 매입 수량 합 vs material_ledger_daily.receiving_qty 합
  // purchase_qty > ledger_qty 인 경우만 문제 (매입인데 수불 미반영)
  const [rows]: any = await conn.execute(
    `SELECT
       p.tenant_id,
       p.material_id,
       SUM(p.quantity) AS purchase_qty,
       COALESCE((
         SELECT SUM(mld.receiving_qty)
         FROM material_ledger_daily mld
         WHERE mld.tenant_id = p.tenant_id AND mld.material_id = p.material_id
       ), 0) AS ledger_qty
     FROM accounting_purchases p
     WHERE p.status = 'paid'
       AND p.material_id IS NOT NULL
       ${tenantFilter}
     GROUP BY p.tenant_id, p.material_id
     HAVING purchase_qty > ledger_qty + ${QTY_TOLERANCE}
     ORDER BY (purchase_qty - ledger_qty) DESC
     LIMIT ${SAMPLE_LIMIT}`,
    params,
  );

  const totalDelta = rows.reduce(
    (acc: number, r: any) => acc + Math.abs(Number(r.purchase_qty) - Number(r.ledger_qty)),
    0,
  );

  return {
    code: "XCHK_PURCHASE_VS_LEDGER",
    title: "매입 수량 > 원료수불 receiving_qty (수불 미반영)",
    severity: rows.length > 0 ? "high" : "info",
    count: rows.length,
    samples: rows,
    totalDelta,
    message: "매입은 확정됐는데 material_ledger_daily 에 반영 안 된 수량이 있음. (ledger > purchase 는 정상 — 배치/임포트 포함)",
  };
}

/**
 * cancelled 매입인데 h_inbound_headers 가 남아있음
 */
export async function checkCancelledPurchaseInboundLeftover(
  conn: Pool,
  tenantId: number | null,
): Promise<Finding> {
  const tenantFilter = tenantId !== null ? "AND p.tenant_id = ?" : "";
  const params = tenantId !== null ? [tenantId] : [];

  const [rows]: any = await conn.execute(
    `SELECT p.id AS purchase_id, p.tenant_id, p.item_name, p.total_amount, p.canceled_at,
            h.id AS inbound_header_id, h.inbound_number, h.status AS inbound_status
     FROM accounting_purchases p
     INNER JOIN h_inbound_headers h
       ON h.tenant_id = p.tenant_id
      AND h.inbound_number = CONCAT('INB-PURCHASE-', p.id)
     WHERE p.status = 'cancelled'
       ${tenantFilter}
     ORDER BY p.canceled_at DESC
     LIMIT ${SAMPLE_LIMIT}`,
    params,
  );

  const [countRows]: any = await conn.execute(
    `SELECT COUNT(*) AS cnt
     FROM accounting_purchases p
     INNER JOIN h_inbound_headers h
       ON h.tenant_id = p.tenant_id
      AND h.inbound_number = CONCAT('INB-PURCHASE-', p.id)
     WHERE p.status = 'cancelled'
       ${tenantFilter}`,
    params,
  );

  return {
    code: "XCHK_CANCELLED_LEFTOVER",
    title: "취소된 매입인데 h_inbound_headers 남아있음 (이중 집계)",
    severity: "high",
    count: Number(countRows[0]?.cnt || 0),
    samples: rows,
    message: "purchaseCancel 이 h_inbound_headers 를 삭제하지 않아 입고 내역에 계속 표시됨.",
  };
}

/**
 * received 매출인데 h_inventory_transactions 'usage' 없음
 */
export async function checkReceivedSaleNoDeduction(
  conn: Pool,
  tenantId: number | null,
): Promise<Finding> {
  const tenantFilter = tenantId !== null ? "AND s.tenant_id = ?" : "";
  const params = tenantId !== null ? [tenantId] : [];

  const [rows]: any = await conn.execute(
    `SELECT s.id, s.tenant_id, s.transaction_date, s.item_name, s.quantity, s.total_amount, s.posted_at
     FROM accounting_sales s
     WHERE s.status = 'received'
       AND NOT EXISTS (
         SELECT 1 FROM h_inventory_transactions tx
         WHERE tx.tenant_id = s.tenant_id
           AND UPPER(tx.reference_type) = 'SALE'
           AND tx.source_id = s.id
       )
       ${tenantFilter}
     ORDER BY s.posted_at DESC
     LIMIT ${SAMPLE_LIMIT}`,
    params,
  );

  const [countRows]: any = await conn.execute(
    `SELECT COUNT(*) AS cnt
     FROM accounting_sales s
     WHERE s.status = 'received'
       AND NOT EXISTS (
         SELECT 1 FROM h_inventory_transactions tx
         WHERE tx.tenant_id = s.tenant_id
           AND UPPER(tx.reference_type) = 'SALE'
           AND tx.source_id = s.id
       )
       ${tenantFilter}`,
    params,
  );

  return {
    code: "XCHK_SALE_NO_DEDUCTION",
    title: "received 매출인데 재고 차감(usage) 없음",
    severity: "critical",
    count: Number(countRows[0]?.cnt || 0),
    samples: rows,
    message: "매출이 확정됐는데 재고 차감 기록이 없음. 재고 실제량 > 시스템 표시량.",
  };
}

/**
 * material_ledger_daily vs h_inventory_transactions 집계 비교 (material 기준)
 *
 * 참고: material_ledger_daily 는 배치 생산/Excel 임포트 등 다양한 소스를
 * 포함하므로, h_inventory_transactions 과 1:1 대응하지 않을 수 있음.
 * 완전 동기화는 Module 1+ 에서 다룸. 여기서는 정보 수준으로 보고.
 */
export async function checkLedgerVsTransactions(
  conn: Pool,
  tenantId: number | null,
): Promise<Finding> {
  const tenantFilter = tenantId !== null ? "AND mld.tenant_id = ?" : "";
  const params = tenantId !== null ? [tenantId] : [];

  const [rows]: any = await conn.execute(
    `SELECT
       mld.tenant_id,
       mld.material_id,
       SUM(mld.receiving_qty) AS ledger_in,
       SUM(mld.usage_qty) AS ledger_out,
       COALESCE((
         SELECT SUM(CASE
           WHEN UPPER(tx.transaction_type) IN ('RECEIPT','INBOUND','RETURN') THEN tx.quantity
           ELSE 0 END)
         FROM h_inventory_transactions tx
         INNER JOIN h_inventory_lots lot ON lot.id = tx.lot_id
         WHERE lot.tenant_id = mld.tenant_id AND lot.material_id = mld.material_id
       ), 0) AS tx_in,
       COALESCE((
         SELECT SUM(CASE
           WHEN UPPER(tx.transaction_type) IN ('USAGE','OUTBOUND','DISPOSAL') THEN tx.quantity
           ELSE 0 END)
         FROM h_inventory_transactions tx
         INNER JOIN h_inventory_lots lot ON lot.id = tx.lot_id
         WHERE lot.tenant_id = mld.tenant_id AND lot.material_id = mld.material_id
       ), 0) AS tx_out
     FROM material_ledger_daily mld
     WHERE 1=1
       ${tenantFilter}
     GROUP BY mld.tenant_id, mld.material_id
     HAVING ABS(ledger_in - tx_in) > ${QTY_TOLERANCE}
         OR ABS(ledger_out - tx_out) > ${QTY_TOLERANCE}
     ORDER BY GREATEST(ABS(ledger_in - tx_in), ABS(ledger_out - tx_out)) DESC
     LIMIT ${SAMPLE_LIMIT}`,
    params,
  );

  return {
    code: "XCHK_LEDGER_VS_TX",
    title: "원료수불 vs 재고거래 집계 불일치 (참고: 배치/임포트 포함)",
    severity: rows.length > 0 ? "medium" : "info",
    count: rows.length,
    samples: rows,
    message: "material_ledger_daily 와 h_inventory_transactions 의 material 별 입출고 합계가 다름. 배치 생산/Excel 임포트 포함으로 불일치는 일부 정상. Module 1+ 에서 정리.",
  };
}

/**
 * ★ PURCHASE 타입 재고거래인데 source_id NULL (역추적 불가)
 *
 * 재고 트랜잭션이 어느 매입전표에서 왔는지 연결되지 않아
 * 매입 취소 시 어떤 LOT 를 복구해야 할지 알 수 없음.
 */
export async function checkPurchaseTxSourceIdNull(
  conn: Pool,
  tenantId: number | null,
): Promise<Finding> {
  const tenantFilter = tenantId !== null ? "AND tenant_id = ?" : "";
  const params = tenantId !== null ? [tenantId] : [];

  const [rows]: any = await conn.execute(
    `SELECT id, tenant_id, lot_id, transaction_type, reference_type, source_id,
            quantity, transaction_date, created_at
     FROM h_inventory_transactions
     WHERE UPPER(reference_type) = 'PURCHASE'
       AND source_id IS NULL
       ${tenantFilter}
     ORDER BY created_at DESC
     LIMIT ${SAMPLE_LIMIT}`,
    params,
  );

  const [countRows]: any = await conn.execute(
    `SELECT COUNT(*) AS cnt
     FROM h_inventory_transactions
     WHERE UPPER(reference_type) = 'PURCHASE'
       AND source_id IS NULL
       ${tenantFilter}`,
    params,
  );

  return {
    code: "XCHK_PURCHASE_TX_NO_SOURCE",
    title: "★ PURCHASE 재고거래인데 source_id NULL (매입전표 역추적 불가)",
    severity: "critical",
    count: Number(countRows[0]?.cnt || 0),
    samples: rows,
    message:
      "PURCHASE 타입 재고 트랜잭션에 source_id 가 없어 어느 매입전표에서 왔는지 모름. 취소 시 LOT 복구 불가.",
  };
}

/**
 * ★ 매입전표가 approved 상태인데 오래됨 (post 가 한 번도 실행 안 됨)
 *
 * 비즈니스 정책상 approved 는 post 대기 상태여야 하는데,
 * 한달 넘게 approved 로 남아있으면 post 경로가 막혀있을 가능성.
 */
export async function checkStaleApprovedPurchases(
  conn: Pool,
  tenantId: number | null,
): Promise<Finding> {
  const tenantFilter = tenantId !== null ? "AND tenant_id = ?" : "";
  const params = tenantId !== null ? [tenantId] : [];

  const [rows]: any = await conn.execute(
    `SELECT id, tenant_id, transaction_date, item_name, total_amount, status, created_at
     FROM accounting_purchases
     WHERE status = 'approved'
       AND created_at < DATE_SUB(CURDATE(), INTERVAL 7 DAY)
       ${tenantFilter}
     ORDER BY created_at ASC
     LIMIT ${SAMPLE_LIMIT}`,
    params,
  );

  const [countRows]: any = await conn.execute(
    `SELECT COUNT(*) AS cnt
     FROM accounting_purchases
     WHERE status = 'approved'
       AND created_at < DATE_SUB(CURDATE(), INTERVAL 7 DAY)
       ${tenantFilter}`,
    params,
  );

  // approved 전체 건수도 같이
  const [allApprovedRows]: any = await conn.execute(
    `SELECT COUNT(*) AS cnt FROM accounting_purchases WHERE status='approved' ${tenantFilter}`,
    params,
  );
  const [paidRows]: any = await conn.execute(
    `SELECT COUNT(*) AS cnt FROM accounting_purchases WHERE status='paid' ${tenantFilter}`,
    params,
  );

  return {
    code: "XCHK_STALE_APPROVED",
    title: "★ 오래된 approved 매입전표 (post 미실행)",
    severity: "critical",
    count: Number(countRows[0]?.cnt || 0),
    samples: rows,
    message:
      `전체 approved: ${allApprovedRows[0]?.cnt || 0}건, 전체 paid: ${paidRows[0]?.cnt || 0}건. ` +
      `approved 가 많고 paid 가 적으면 postPurchase() 가 호출 안 되고 있음 = 회계 분개 누락.`,
  };
}

/**
 * paid 매입 총액 vs INVENTORY_RAW 차변 합 비교
 */
export async function checkPurchaseTotalVsJournal(
  conn: Pool,
  tenantId: number | null,
): Promise<Finding> {
  const tenantFilter = tenantId !== null ? "AND p.tenant_id = ?" : "";
  const params = tenantId !== null ? [tenantId] : [];

  const [purchaseRows]: any = await conn.execute(
    `SELECT p.tenant_id,
            SUM(p.total_amount - COALESCE(p.tax_amount, 0)) AS purchase_supply,
            SUM(COALESCE(p.tax_amount, 0)) AS purchase_tax,
            COUNT(*) AS purchase_count
     FROM accounting_purchases p
     WHERE p.status = 'paid'
       ${tenantFilter}
     GROUP BY p.tenant_id`,
    params,
  );

  const [journalRows]: any = await conn.execute(
    `SELECT l.tenant_id,
            SUM(l.debit_amount) AS journal_debit
     FROM expense_journal_lines l
     INNER JOIN accounting_accounts a ON a.id = l.account_id
     INNER JOIN expense_journal_entries e ON e.id = l.journal_entry_id
     WHERE (a.system_code = 'INVENTORY_RAW' OR a.code = '1410' OR a.code LIKE '1410%')
       AND e.description LIKE '%PURCHASE-%'
       ${tenantFilter ? "AND l.tenant_id = ?" : ""}
     GROUP BY l.tenant_id`,
    params,
  );

  const purchaseMap = new Map<number, any>();
  for (const r of purchaseRows as any[]) purchaseMap.set(r.tenant_id, r);

  const journalMap = new Map<number, number>();
  for (const r of journalRows as any[]) journalMap.set(r.tenant_id, Number(r.journal_debit));

  const discrepancies: any[] = [];
  for (const [tid, p] of purchaseMap) {
    const j = journalMap.get(tid) || 0;
    const diff = Math.abs(Number(p.purchase_supply) - j);
    if (diff > AMT_TOLERANCE) {
      discrepancies.push({
        tenant_id: tid,
        purchase_count: Number(p.purchase_count),
        purchase_supply: Number(p.purchase_supply),
        journal_debit: j,
        diff,
      });
    }
  }

  return {
    code: "XCHK_PURCHASE_AMOUNT_MATCH",
    title: "매입 공급가 합 vs INVENTORY_RAW 차변 합 불일치",
    severity: discrepancies.length > 0 ? "high" : "info",
    count: discrepancies.length,
    samples: discrepancies,
    totalDelta: discrepancies.reduce((a, d) => a + d.diff, 0),
    message: "paid 매입의 공급가 합계와 원재료 차변 분개 합계가 다름.",
  };
}

/**
 * 교차 검증 전체 실행
 */
export async function runCrossChecks(
  conn: Pool,
  tenantId: number | null,
): Promise<Finding[]> {
  const [
    caseMismatch,
    paidNoTx,
    purchaseVsLedger,
    cancelledLeftover,
    saleNoDeduction,
    ledgerVsTx,
    purchaseTxNoSource,
    staleApproved,
    purchaseAmountMatch,
  ] = await Promise.all([
    checkRefTypeCaseMismatch(conn, tenantId),
    checkPaidPurchaseNoInventoryTx(conn, tenantId),
    checkPurchaseVsLedger(conn, tenantId),
    checkCancelledPurchaseInboundLeftover(conn, tenantId),
    checkReceivedSaleNoDeduction(conn, tenantId),
    checkLedgerVsTransactions(conn, tenantId),
    checkPurchaseTxSourceIdNull(conn, tenantId),
    checkStaleApprovedPurchases(conn, tenantId),
    checkPurchaseTotalVsJournal(conn, tenantId),
  ]);

  return [
    caseMismatch,
    paidNoTx,
    purchaseVsLedger,
    cancelledLeftover,
    saleNoDeduction,
    ledgerVsTx,
    purchaseTxNoSource,
    staleApproved,
    purchaseAmountMatch,
  ];
}
