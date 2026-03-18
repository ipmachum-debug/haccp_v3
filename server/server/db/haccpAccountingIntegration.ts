import { getRawConnection } from "../db";

/**
 * HACCP 재고 시스템과 회계 시스템 자동 연동
 */

/**
 * 재료 입고 시 매입 거래 자동 생성
 * @param tenantId 테넌트 ID
 * @param transactionId h_inventory_transactions.id
 */
export async function createPurchaseFromReceipt(tenantId: number, transactionId: number) {
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
      l.unit_price,
      l.supplier_name,
      l.receipt_date,
      m.name as material_name
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

  // 이미 매입 거래가 생성되었는지 확인 (tenant 필터 추가)
  const [existingResult] = await db.execute(
    `SELECT id FROM accounting_purchases 
     WHERE source_type = 'inventory_receipt' AND source_id = ? AND tenant_id = ? LIMIT 1`,
    [transactionId, tenantId]
  );

  if (existingResult && (existingResult as any[]).length > 0) {
    console.log(`매입 거래가 이미 존재합니다 (transaction_id: ${transactionId})`);
    return { alreadyExists: true };
  }

  // 매입 거래 자동 생성 (tenant_id 추가)
  const quantity = parseFloat(transaction.quantity);
  const unitPrice = transaction.unit_price ? parseFloat(transaction.unit_price) : 0;
  const totalAmount = quantity * unitPrice;

  const [insertResult] = await db.execute(
    `INSERT INTO accounting_purchases (
      tenant_id,
      transaction_date,
      partner_name,
      item_name,
      quantity,
      unit_price,
      total_amount,
      status,
      notes,
      source_type,
      source_id,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tenantId,
      transaction.receipt_date || new Date().toISOString().split("T")[0],
      transaction.supplier_name || "미지정 공급업체",
      transaction.material_name || "재료",
      quantity,
      unitPrice,
      totalAmount,
      "completed",
      `재고 입고 자동 생성 (Lot ID: ${transaction.lot_id})${transaction.notes ? ` - ${transaction.notes}` : ""}`,
      "inventory_receipt",
      transactionId,
      new Date(),
    ]
  );

  return {
    success: true,
    purchaseId: (insertResult as any).insertId,
    totalAmount
  };
}

/**
 * 제품 출고 시 매출 거래 자동 생성
 * @param tenantId 테넌트 ID
 * @param transactionId h_inventory_transactions.id
 */
export async function createSaleFromUsage(tenantId: number, transactionId: number) {
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
      l.product_id,
      l.unit_price,
      l.receipt_date,
      p.product_name as product_name
    FROM h_inventory_transactions t
    JOIN h_inventory_lots l ON t.lot_id = l.id AND l.tenant_id = ?
    LEFT JOIN h_products_v2 p ON l.product_id = p.id AND p.tenant_id = ?
    WHERE t.id = ? AND t.tenant_id = ? AND t.transaction_type = 'usage' AND l.product_id IS NOT NULL
    LIMIT 1`,
    [tenantId, tenantId, transactionId, tenantId]
  );

  const rows = transactionResult as any[];
  if (!rows || rows.length === 0) {
    throw new Error("제품 출고 거래를 찾을 수 없습니다");
  }

  const transaction = rows[0];

  // 이미 매출 거래가 생성되었는지 확인 (tenant 필터 추가)
  const [existingResult] = await db.execute(
    `SELECT id FROM accounting_sales 
     WHERE source_type = 'inventory_usage' AND source_id = ? AND tenant_id = ? LIMIT 1`,
    [transactionId, tenantId]
  );

  if (existingResult && (existingResult as any[]).length > 0) {
    console.log(`매출 거래가 이미 존재합니다 (transaction_id: ${transactionId})`);
    return { alreadyExists: true };
  }

  // 매출 거래 자동 생성 (tenant_id 추가)
  const quantity = parseFloat(transaction.quantity);
  const unitPrice = transaction.unit_price ? parseFloat(transaction.unit_price) : 0;
  const totalAmount = quantity * unitPrice;

  const [insertResult] = await db.execute(
    `INSERT INTO accounting_sales (
      tenant_id,
      transaction_date,
      partner_name,
      item_name,
      quantity,
      unit_price,
      total_amount,
      status,
      notes,
      source_type,
      source_id,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tenantId,
      transaction.receipt_date || new Date().toISOString().split("T")[0],
      "고객사", // 기본값 (추후 고객 정보 연동 시 수정)
      transaction.product_name || "제품",
      quantity,
      unitPrice,
      totalAmount,
      "completed",
      `재고 출고 자동 생성 (Lot ID: ${transaction.lot_id})${transaction.notes ? ` - ${transaction.notes}` : ""}`,
      "inventory_usage",
      transactionId,
      new Date(),
    ]
  );

  return {
    success: true,
    saleId: (insertResult as any).insertId,
    totalAmount
  };
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
    const result = await createPurchaseFromReceipt(tenantId, row.id);
    if (result.success) {
      results.purchases.created++;
    } else if (result.alreadyExists) {
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
    const result = await createSaleFromUsage(tenantId, row.id);
    if (result.success) {
      results.sales.created++;
    } else if (result.alreadyExists) {
      results.sales.skipped++;
    } else if ('error' in result && result.error) {
      results.sales.errors++;
    }
  }

  return results;
}
