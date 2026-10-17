import { getRawConnection } from "../connection";

import { todayKST } from "../../utils/timezone";

/**
 * HACCP 재고 시스템과 회계 시스템 자동 연동
 */

/**
 * 재료 입고 시 매입 거래 자동 생성
 * @param tenantId 테넌트 ID
 * @param transactionId h_inventory_transactions.id
 */
export async function createPurchaseFromReceipt(tenantId: number, transactionId: number, userId = 0) {
  const db = await getRawConnection();

  // tenant_id 필수 검증
  if (!tenantId) {
    throw new Error("tenantId is required");
  }

  // 재고 거래 정보 조회 (tenant 필터 추가)
  const [transactionResult] = await db.execute(
    `SELECT 
      t.id,
      t.lot_id,
      t.quantity,
      t.unit,
      t.notes,
      t.created_at,
      l.material_id,
      l.inbound_line_id,
      l.unit_price,
      l.supplier_name,
      l.receipt_date,
      m.material_name
    FROM h_inventory_transactions t
    JOIN h_inventory_lots l ON t.lot_id = l.id AND l.tenant_id = ?
    LEFT JOIN h_materials m ON l.material_id = m.id AND m.tenant_id = ?
    WHERE t.id = ? AND t.tenant_id = ? AND t.transaction_type = 'receipt' AND l.material_id IS NOT NULL
    LIMIT 1`,
    [tenantId, tenantId, transactionId, tenantId]
  );

  const rows = transactionResult as any[];
  if (!rows || rows.length === 0) {
    throw new Error("재료 입고 거래를 찾을 수 없습니다");
  }

  const transaction = rows[0];

  // ★ 2026-10-17 (Codex #563 검증 R8): 입고 문서로 받은 입고면 그 입고 줄의 전표 (잠금 + '입고 줄당 전표 하나' 키, 승인 = 분개만).
  //   입고 문서 이전 방식(입고 줄 연결 없음) 은 전표를 만들지 않는다 — 이 경로의 전표(source_type='inventory_receipt') 는
  //   승인 때 재고 경로가 새 LOT 을 만들어 한 번 들어온 재고가 다시 늘었다. 이름·번호 추정 연결 없음, 과거 입고 일괄 연결 없음.
  if (transaction.inbound_line_id == null) {
    return { skipped: true, reason: "legacy_receipt" as const, message: "입고 문서 이전 방식의 입고 — 매입전표 자동 생성 안 함 (재고 중복 방지)" };
  }
  const { withTransaction } = await import("../connection");
  const { ensureInboundLineVoucher } = await import("../../lib/inventory/inbound/inboundService");
  const purchaseId = await withTransaction((conn: any) => ensureInboundLineVoucher(conn, {
    tenantId, lineId: Number(transaction.inbound_line_id), userId,
  }), "autoCreatePurchaseFromReceipt");
  const [pr]: any = await db.execute(`SELECT total_amount FROM accounting_purchases WHERE id = ? AND tenant_id = ?`, [purchaseId, tenantId]);
  return { success: true, purchaseId, totalAmount: Number((pr as any[])[0]?.total_amount ?? 0) };
}

/**
 * 제품 출고 시 매출 거래 자동 생성
 * @param tenantId 테넌트 ID
 * @param transactionId h_inventory_transactions.id
 */
export async function createSaleFromUsage(tenantId: number, transactionId: number) {
  if (!tenantId) throw new Error("tenantId is required");
  // ★ 2026-10-17 (Codex #564 검증 S1·S3): 재고 출고 거래 → 매출전표 자동 생성 중단.
  //   이 경로의 전표(source_type='inventory_usage') 는 승인 때 이미 출고한 LOT 을 다시 차감한다 (S1).
  //   구형 INSERT 는 없는 컬럼(partner_name)·created_by 누락으로 늘 실패했다 (S3) — 컬럼을 덧대 살리지 않는다.
  //   판매는 제품 출고(출고와 매출을 한 문서로) 로 등록한다.
  void transactionId;
  return { skipped: true, reason: "usage_sale_disabled" as const, message: "재고 출고 → 매출전표 자동 생성은 중단됨 — 판매는 제품 출고에서 등록" };
}

/**
 * 재고 거래 생성 시 자동으로 매입/매출 거래 생성
 * @param tenantId 테넌트 ID
 * @param transactionId h_inventory_transactions.id
 * @param transactionType 'receipt' | 'usage'
 */
export async function autoCreateAccountingTransaction(
  tenantId: number,
  transactionId: number,
  transactionType: "receipt" | "usage"
) {
  // tenant_id 필수 검증
  if (!tenantId) {
    throw new Error("tenantId is required");
  }

  try {
    if (transactionType === "receipt") {
      return await createPurchaseFromReceipt(tenantId, transactionId);
    } else if (transactionType === "usage") {
      return await createSaleFromUsage(tenantId, transactionId);
    } else {
      return { skipped: true, reason: "Not a receipt or usage transaction" };
    }
  } catch (error: any) {
    console.error(`Failed to auto-create accounting transaction:`, error);
    return { error: true, message: error.message };
  }
}

/**
 * 기존 재고 거래에 대해 일괄 매입/매출 거래 생성 (마이그레이션용)
 * @param tenantId 테넌트 ID
 */
export async function batchCreateAccountingTransactions(tenantId: number) {
  const db = await getRawConnection();

  // tenant_id 필수 검증
  if (!tenantId) {
    throw new Error("tenantId is required");
  }

  const results = {
    purchases: { created: 0, skipped: 0, errors: 0 },
    sales: { created: 0, skipped: 0, errors: 0 }
  };

  // 재료 입고 거래 처리 (tenant 필터 추가)
  const [receiptResult] = await db.execute(
    `SELECT t.id
     FROM h_inventory_transactions t
     JOIN h_inventory_lots l ON t.lot_id = l.id AND l.tenant_id = ?
     WHERE t.tenant_id = ? AND t.transaction_type = 'receipt' AND l.material_id IS NOT NULL`,
    [tenantId, tenantId]
  );

  const receiptRows = receiptResult as any[];
  for (const row of receiptRows) {
    const result: any = await createPurchaseFromReceipt(tenantId, row.id);
    if (result.success) {
      results.purchases.created++;
    } else if (result.alreadyExists || result.skipped) {
      results.purchases.skipped++;
    } else if ('error' in result && result.error) {
      results.purchases.errors++;
    }
  }

  // 제품 출고 거래 처리 (tenant 필터 추가)
  const [usageResult] = await db.execute(
    `SELECT t.id
     FROM h_inventory_transactions t
     JOIN h_inventory_lots l ON t.lot_id = l.id AND l.tenant_id = ?
     WHERE t.tenant_id = ? AND t.transaction_type = 'usage' AND l.product_id IS NOT NULL`,
    [tenantId, tenantId]
  );

  const usageRows = usageResult as any[];
  for (const row of usageRows) {
    const result: any = await createSaleFromUsage(tenantId, row.id);
    if (result.success) {
      results.sales.created++;
    } else if (result.alreadyExists || result.skipped) {
      results.sales.skipped++;
    } else if ('error' in result && result.error) {
      results.sales.errors++;
    }
  }

  return results;
}
