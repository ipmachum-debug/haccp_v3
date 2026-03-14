/**
 * 제품 출고 관리 데이터베이스 로직
 * 
 * ★ 핵심 변경: 배치 직접 차감 → 제품 재고(h_inventory_lots.product_id) 기반 차감
 * 
 * 흐름: 생산완료(배치) → 배치 완료 시 제품 LOT 자동생성(h_inventory_lots.productId)
 *       → 제품 재고 LOT 기반 출고 → 매출전표(accounting_sales) 자동 생성
 * 
 * 회계 분개:
 *   차변: 매출채권(1310) / 대변: 매출(4110)  — 매출 인식
 *   차변: 매출원가(5110) / 대변: 제품재고(1140)  — 원가 인식
 */

import { getDb, getRawConnection } from "../db";
import { hInventoryLots, hInventoryTransactions } from "../../drizzle/schema";
import { eq, desc, and, sql } from "drizzle-orm";

/* ───────── 테이블 자동 생성 ───────── */
let tableEnsured = false;
export async function ensureProductOutboundTable() {
  if (tableEnsured) return;
  const conn = await getRawConnection();
  // lot_id 컬럼 추가 (기존 테이블 호환)
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS h_product_outbound (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT NOT NULL DEFAULT 1,
      batch_id BIGINT NULL,
      lot_id BIGINT NULL,
      product_name VARCHAR(255) NOT NULL,
      quantity DECIMAL(10,3) NOT NULL,
      unit VARCHAR(20) NOT NULL DEFAULT 'EA',
      unit_price DECIMAL(15,2) NOT NULL DEFAULT 0,
      total_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
      partner_id BIGINT NULL,
      partner_name VARCHAR(255) NULL,
      release_date VARCHAR(10) NOT NULL,
      release_type ENUM('sale','delivery','sample','return','other') NOT NULL DEFAULT 'sale',
      lot_number VARCHAR(100) NULL,
      notes TEXT NULL,
      status ENUM('confirmed','cancelled') NOT NULL DEFAULT 'confirmed',
      created_by BIGINT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_tenant (tenant_id),
      INDEX idx_batch (batch_id),
      INDEX idx_lot (lot_id),
      INDEX idx_release_date (release_date),
      INDEX idx_partner (partner_id),
      INDEX idx_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  // 기존 테이블에 lot_id 컬럼이 없으면 추가
  try {
    await conn.execute(`ALTER TABLE h_product_outbound ADD COLUMN lot_id BIGINT NULL AFTER batch_id`);
  } catch { /* 이미 존재 */ }
  try {
    await conn.execute(`ALTER TABLE h_product_outbound MODIFY COLUMN batch_id BIGINT NULL`);
  } catch { /* 이미 NULL 허용 */ }
  tableEnsured = true;
}

/* ───────── 배치 완료 시 제품 LOT 자동 생성 ───────── */
export async function createProductLotFromBatch(params: {
  batchId: number;
  batchCode: string;
  productId: number;
  productName: string;
  quantity: number;
  unit: string;
  lotNumber: string;
  expiryDate?: string;
  userId: number;
  skuId?: number;
  skuName?: string;
}, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 이미 이 배치(+SKU)에서 생성된 제품 LOT가 있는지 확인
  const conditions = [
    eq(hInventoryLots.tenantId, tenantId),
    eq(hInventoryLots.batchId, params.batchId),
  ];
  const existing = await db.select().from(hInventoryLots).where(and(...conditions));
  
  // SKU 지정이 있으면 해당 SKU LOT만 매칭
  const matchingLot = params.skuId
    ? existing.find((l: any) => l.skuId === params.skuId)
    : existing[0];

  if (matchingLot) {
    await db.update(hInventoryLots)
      .set({
        quantity: params.quantity.toString(),
        availableQuantity: params.quantity.toString(),
      })
      .where(eq(hInventoryLots.id, matchingLot.id));
    return { lotId: matchingLot.id, lotNumber: matchingLot.lotNumber, isNew: false };
  }

  // 새 제품 LOT 생성 (SKU 정보 포함)
  const lotNumber = params.lotNumber || `PROD-${params.batchCode}`;
  const insertResult = await db.insert(hInventoryLots).values({
    tenantId,
    batchId: params.batchId,
    productId: params.productId,
    skuId: params.skuId || null,
    skuName: params.skuName || null,
    lotNumber,
    quantity: params.quantity.toString(),
    availableQuantity: params.quantity.toString(),
    unit: params.unit || "kg",
    productionDate: new Date().toISOString().slice(0, 10),
    expiryDate: params.expiryDate || null,
    status: "available",
  } as any);

  const lotId = (insertResult as any)[0]?.insertId || (insertResult as any).insertId;

  // 입고 트랜잭션 기록
  await db.insert(hInventoryTransactions).values({
    tenantId,
    lotId,
    transactionType: "inbound",
    quantity: params.quantity.toString(),
    unit: params.unit || "kg",
    notes: `생산 완료 입고 (배치: ${params.batchCode}, 제품: ${params.productName}${params.skuName ? `, SKU: ${params.skuName}` : ''})`,
    createdBy: params.userId,
    performedBy: params.userId,
    transactionDate: new Date().toISOString().slice(0, 10),
  } as any);

  return { lotId, lotNumber, isNew: true };
}

/* ───────── 제품 출고 가능 재고 조회 (LOT 기반, FEFO) ───────── */
export async function getProductAvailableForRelease(tenantId: number) {
  await ensureProductOutboundTable();
  const conn = await getRawConnection();

  // 1차: h_inventory_lots에서 productId가 있는 가용 LOT 조회 (SKU 정보 포함)
  const [lotRows] = await conn.execute(
    `SELECT 
      l.id as lot_id, l.lot_number, l.product_id, l.batch_id,
      l.sku_id, l.sku_name,
      l.quantity as produced_quantity,
      l.available_quantity,
      l.unit, l.unit_price, l.expiry_date, l.production_date, l.status,
      COALESCE(p.product_name, im.item_name, CONCAT('제품#', l.product_id)) as product_name,
      b.batch_code, b.end_time as completed_at,
      ps.sku_code, ps.sales_unit
     FROM h_inventory_lots l
     LEFT JOIN h_products_v2 p ON l.product_id = p.id AND p.tenant_id = ?
     LEFT JOIN item_master im ON im.legacy_product_id = l.product_id AND im.item_type = 'own_product'
     LEFT JOIN h_batches b ON l.batch_id = b.id
     LEFT JOIN product_skus ps ON l.sku_id = ps.id
     WHERE l.tenant_id = ? 
       AND l.product_id IS NOT NULL 
       AND l.status = 'available'
       AND CAST(l.available_quantity AS DECIMAL(10,3)) > 0
     ORDER BY l.expiry_date ASC, l.production_date ASC, l.id ASC`,
    [tenantId, tenantId]
  );

  const lotResults = (lotRows as any[]).map(r => ({
    lotId: r.lot_id,
    batchId: r.batch_id,
    batchCode: r.batch_code || null,
    productId: r.product_id,
    skuId: r.sku_id || null,
    skuName: r.sku_name || null,
    skuCode: r.sku_code || null,
    lotNumber: r.lot_number,
    producedQuantity: parseFloat(r.produced_quantity || "0"),
    availableQuantity: parseFloat(r.available_quantity || "0"),
    unit: r.unit || "kg",
    unitPrice: parseFloat(r.unit_price || "0"),
    expiryDate: r.expiry_date,
    completedAt: r.completed_at,
    productName: r.sku_name ? `${r.product_name} [${r.sku_name}]` : (r.product_name || "제품"),
    source: "lot" as const
  }));

  // 2차: 아직 LOT가 생성되지 않은 완료 배치도 가져오기 (하위 호환)
  const lotBatchIds = new Set(lotResults.filter(r => r.batchId).map(r => r.batchId));
  const [batchRows] = await conn.execute(
    `SELECT 
      b.id as batch_id, b.batch_code, b.product_id, b.lot_number, b.status,
      COALESCE(b.actual_quantity, b.planned_quantity) as produced_quantity,
      COALESCE(shipped.total_shipped, 0) as total_shipped,
      CAST(COALESCE(b.actual_quantity, b.planned_quantity) - COALESCE(shipped.total_shipped, 0) AS DECIMAL(10,2)) as available_quantity,
      b.expiry_date, b.end_time as completed_at, b.unit,
      COALESCE(p.product_name, CONCAT('제품#', b.product_id)) as product_name
     FROM h_batches b
     LEFT JOIN (
       SELECT batch_id, SUM(quantity) as total_shipped
       FROM h_product_outbound 
       WHERE tenant_id = ? AND status != 'cancelled'
       GROUP BY batch_id
     ) shipped ON b.id = shipped.batch_id
     LEFT JOIN h_products_v2 p ON b.product_id = p.id AND p.tenant_id = ?
     WHERE b.tenant_id = ? AND b.status IN ('completed', 'shipped')
     HAVING available_quantity > 0
     ORDER BY b.end_time ASC`,
    [tenantId, tenantId, tenantId]
  );

  const batchResults = (batchRows as any[])
    .filter(r => !lotBatchIds.has(r.batch_id))
    .map(r => ({
      lotId: null as number | null,
      batchId: r.batch_id,
      batchCode: r.batch_code,
      productId: r.product_id,
      lotNumber: r.lot_number || r.batch_code,
      producedQuantity: parseFloat(r.produced_quantity || "0"),
      availableQuantity: parseFloat(r.available_quantity || "0"),
      unit: r.unit || "EA",
      unitPrice: 0,
      expiryDate: r.expiry_date,
      completedAt: r.completed_at,
      productName: r.product_name || "제품",
      source: "batch" as const
    }));

  return [...lotResults, ...batchResults];
}

/* ───────── 제품 출고 등록 (LOT 차감 + 매출전표) ───────── */
export async function createProductOutbound(params: {
  lotId?: number;
  batchId?: number;
  productName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  partnerId?: number;
  partnerName?: string;
  releaseDate: string;
  releaseType: string;
  lotNumber?: string;
  notes?: string;
  createdBy: number;
  skuId?: number;
  skuName?: string;
}, tenantId: number) {
  await ensureProductOutboundTable();
  const conn = await getRawConnection();
  const db = await getDb();

  let lotNumber = params.lotNumber || "";
  let batchCode = "";
  let lot: any = null;

  // LOT 기반 출고 (우선)
  if (params.lotId) {
    // LOT 가용 재고 확인 (SKU 정보 포함)
    const [lotResult] = await conn.execute(
      `SELECT id, lot_number, available_quantity, batch_id, product_id, unit, sku_id, sku_name
       FROM h_inventory_lots WHERE id = ? AND tenant_id = ? AND status = 'available'`,
      [params.lotId, tenantId]
    );
    const lots = lotResult as any[];
    if (!lots.length) throw new Error("제품 LOT를 찾을 수 없습니다.");
    lot = lots[0];
    const avail = parseFloat(lot.available_quantity || "0");
    if (params.quantity > avail) {
      throw new Error(`출고 가능 수량 초과. 가용: ${avail.toFixed(2)}, 요청: ${params.quantity}`);
    }

    lotNumber = lot.lot_number;
    
    // LOT 재고 차감
    const newAvail = Math.max(0, avail - params.quantity);
    await conn.execute(
      `UPDATE h_inventory_lots SET available_quantity = ?, 
       status = IF(? <= 0, 'used', 'available'),
       updated_at = NOW()
       WHERE id = ? AND tenant_id = ?`,
      [newAvail.toString(), newAvail, params.lotId, tenantId]
    );

    // 출고 트랜잭션 기록
    if (db) {
      await db.insert(hInventoryTransactions).values({
        tenantId,
        lotId: params.lotId,
        transactionType: "outbound",
        quantity: params.quantity.toString(),
        unit: lot.unit || params.unit,
        notes: `제품출고 (${params.releaseType === "sale" ? "판매" : params.releaseType === "delivery" ? "납품" : params.releaseType})${params.partnerName ? ` → ${params.partnerName}` : ""}`,
        createdBy: params.createdBy,
        performedBy: params.createdBy,
        transactionDate: params.releaseDate,
      } as any);
    }

    // 배치 코드 조회
    if (lot.batch_id) {
      const [batchResult] = await conn.execute(`SELECT batch_code FROM h_batches WHERE id = ?`, [lot.batch_id]);
      batchCode = (batchResult as any[])[0]?.batch_code || "";
    }
  }
  // 레거시: 배치 기반 (LOT 미생성 배치)
  else if (params.batchId) {
    const [batchResult] = await conn.execute(
      `SELECT id, batch_code, product_id, actual_quantity, planned_quantity, status, lot_number
       FROM h_batches WHERE id = ? AND tenant_id = ?`,
      [params.batchId, tenantId]
    );
    const batches = batchResult as any[];
    if (!batches.length) throw new Error("배치를 찾을 수 없습니다.");
    const batch = batches[0];
    if (batch.status !== "completed" && batch.status !== "shipped") {
      throw new Error("완료된 배치만 출고할 수 있습니다.");
    }

    const [outboundResult] = await conn.execute(
      `SELECT COALESCE(SUM(quantity), 0) as total_shipped
       FROM h_product_outbound WHERE batch_id = ? AND tenant_id = ? AND status != 'cancelled'`,
      [params.batchId, tenantId]
    );
    const totalShipped = parseFloat((outboundResult as any[])[0]?.total_shipped || "0");
    const availableQty = parseFloat(batch.actual_quantity || batch.planned_quantity || "0") - totalShipped;
    if (params.quantity > availableQty && availableQty > 0) {
      throw new Error(`출고 가능 수량 초과. 가용: ${availableQty.toFixed(2)}, 요청: ${params.quantity}`);
    }

    batchCode = batch.batch_code;
    lotNumber = params.lotNumber || batch.lot_number || batch.batch_code;

    // 전량 출고 시 배치 상태 변경
    const newTotalShipped = totalShipped + params.quantity;
    const totalProduced = parseFloat(batch.actual_quantity || batch.planned_quantity || "0");
    if (newTotalShipped >= totalProduced) {
      await conn.execute(
        `UPDATE h_batches SET status = 'shipped' WHERE id = ? AND tenant_id = ?`,
        [params.batchId, tenantId]
      );
    }
  } else {
    throw new Error("lotId 또는 batchId가 필요합니다.");
  }

  const totalAmount = params.quantity * params.unitPrice;

  // 출고 시 SKU 정보 결정: 파라미터 > LOT에서 읽은 값
  const outboundSkuId = params.skuId || (params.lotId && lot ? lot.sku_id : null);
  const outboundSkuName = params.skuName || (params.lotId && lot ? lot.sku_name : null);
  const displayItemName = outboundSkuName ? `${params.productName} [${outboundSkuName}]` : params.productName;

  // 출고 레코드 생성 (SKU 정보 포함)
  const [insertResult] = await conn.execute(
    `INSERT INTO h_product_outbound (
      tenant_id, batch_id, lot_id, sku_id, sku_name, product_name, quantity, unit, unit_price, total_amount,
      partner_id, partner_name, release_date, release_type, lot_number, notes, status, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, NOW())`,
    [
      tenantId, params.batchId || null, params.lotId || null,
      outboundSkuId || null, outboundSkuName || null,
      params.productName, params.quantity, params.unit,
      params.unitPrice, totalAmount,
      params.partnerId || null, params.partnerName || null,
      params.releaseDate, params.releaseType,
      lotNumber, params.notes || null, params.createdBy
    ]
  );
  const outboundId = (insertResult as any).insertId;

  // 회계 연동 — 매출전표 자동 생성 (sale/delivery만, SKU 명칭 반영)
  let accountingSaleCreated = false;
  if (params.releaseType === "sale" || params.releaseType === "delivery") {
    try {
      await conn.execute(
        `INSERT INTO accounting_sales (
          tenant_id, transaction_date, partner_id, item_name, quantity, unit, unit_price,
          total_amount, status, notes, source_type, source_id, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, 'product_outbound', ?, ?, NOW())`,
        [
          tenantId, params.releaseDate,
          params.partnerId || null,
          displayItemName,
          params.quantity, params.unit, params.unitPrice,
          totalAmount,
          `제품출고 자동생성 (LOT: ${lotNumber}${batchCode ? `, 배치: ${batchCode}` : ""}${outboundSkuName ? `, SKU: ${outboundSkuName}` : ""}${params.partnerName ? `, 거래처: ${params.partnerName}` : ""})`,
          outboundId,
          params.createdBy
        ]
      );
      accountingSaleCreated = true;
    } catch (err) {
      console.error('[createProductOutbound] 매출전표 생성 실패:', err);
    }
  }

  return {
    outboundId,
    batchCode,
    lotNumber,
    productName: params.productName,
    quantity: params.quantity,
    totalAmount,
    accountingSaleCreated
  };
}

/* ───────── 제품 출고 이력 조회 ───────── */
export async function getProductOutboundHistory(params: {
  limit?: number;
  batchId?: number;
  partnerId?: number;
  releaseType?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}, tenantId: number) {
  await ensureProductOutboundTable();
  const conn = await getRawConnection();

  let where = `WHERE o.tenant_id = ?`;
  const values: any[] = [tenantId];

  if (params.batchId) { where += ` AND o.batch_id = ?`; values.push(params.batchId); }
  if (params.partnerId) { where += ` AND o.partner_id = ?`; values.push(params.partnerId); }
  if (params.releaseType) { where += ` AND o.release_type = ?`; values.push(params.releaseType); }
  if (params.startDate) { where += ` AND o.release_date >= ?`; values.push(params.startDate); }
  if (params.endDate) { where += ` AND o.release_date <= ?`; values.push(params.endDate); }
  if (params.search) { where += ` AND (o.product_name LIKE ? OR o.partner_name LIKE ? OR o.lot_number LIKE ?)`; const s = `%${params.search}%`; values.push(s, s, s); }

  const limit = params.limit || 50;
  values.push(limit);

  const [rows] = await conn.execute(
    `SELECT o.id, o.batch_id, o.lot_id, o.product_name, o.quantity, o.unit, o.unit_price, o.total_amount,
            o.partner_id, o.partner_name, o.release_date, o.release_type, o.lot_number,
            o.notes, o.status, o.created_at,
            b.batch_code, b.product_id
     FROM h_product_outbound o
     LEFT JOIN h_batches b ON o.batch_id = b.id
     ${where}
     ORDER BY o.release_date DESC, o.created_at DESC
     LIMIT ?`,
    values
  );

  return (rows as any[]).map(r => ({
    id: r.id,
    batchId: r.batch_id,
    lotId: r.lot_id,
    batchCode: r.batch_code,
    productId: r.product_id,
    productName: r.product_name,
    quantity: parseFloat(r.quantity),
    unit: r.unit,
    unitPrice: parseFloat(r.unit_price || "0"),
    totalAmount: parseFloat(r.total_amount || "0"),
    partnerId: r.partner_id,
    partnerName: r.partner_name,
    releaseDate: r.release_date,
    releaseType: r.release_type,
    lotNumber: r.lot_number,
    notes: r.notes,
    status: r.status,
    createdAt: r.created_at
  }));
}

/* ───────── 제품 출고 취소 (LOT 복원 + 매출전표 취소) ───────── */
export async function cancelProductOutbound(outboundId: number, userId: number, tenantId: number) {
  await ensureProductOutboundTable();
  const conn = await getRawConnection();

  const [records] = await conn.execute(
    `SELECT id, status, batch_id, lot_id, quantity FROM h_product_outbound WHERE id = ? AND tenant_id = ?`,
    [outboundId, tenantId]
  );
  const record = (records as any[])[0];
  if (!record) throw new Error("출고 기록을 찾을 수 없습니다.");
  if (record.status === "cancelled") throw new Error("이미 취소된 출고입니다.");

  // 출고 취소
  await conn.execute(
    `UPDATE h_product_outbound SET status = 'cancelled', updated_at = NOW() WHERE id = ? AND tenant_id = ?`,
    [outboundId, tenantId]
  );

  // 연결된 매출 전표도 취소
  await conn.execute(
    `UPDATE accounting_sales SET status = 'cancelled' WHERE source_type = 'product_outbound' AND source_id = ? AND tenant_id = ?`,
    [outboundId, tenantId]
  );

  // LOT 재고 복원
  if (record.lot_id) {
    const qty = parseFloat(record.quantity || "0");
    await conn.execute(
      `UPDATE h_inventory_lots 
       SET available_quantity = CAST(available_quantity AS DECIMAL(10,3)) + ?,
           status = 'available',
           updated_at = NOW()
       WHERE id = ? AND tenant_id = ?`,
      [qty, record.lot_id, tenantId]
    );

    // 복원 트랜잭션 기록
    const db = await getDb();
    if (db) {
      await db.insert(hInventoryTransactions).values({
        tenantId,
        lotId: record.lot_id,
        transactionType: "return",
        quantity: qty.toString(),
        unit: "EA",
        notes: `출고 취소 복원 (outboundId: ${outboundId})`,
        createdBy: userId,
        performedBy: userId,
        transactionDate: new Date().toISOString().slice(0, 10),
      } as any);
    }
  }
  // 레거시: 배치 상태 복원
  else if (record.batch_id) {
    await conn.execute(
      `UPDATE h_batches SET status = 'completed' WHERE id = ? AND tenant_id = ? AND status = 'shipped'`,
      [record.batch_id, tenantId]
    );
  }

  return { success: true, message: "출고가 취소되었습니다. (재고 복원됨)" };
}

/* ───────── 제품 출고 추이 (일별) ───────── */
export async function getProductOutboundTrend(params: {
  startDate: string;
  endDate: string;
}, tenantId: number) {
  await ensureProductOutboundTable();
  const conn = await getRawConnection();

  const [rows] = await conn.execute(
    `SELECT 
      DATE(o.release_date) as date,
      SUM(CASE WHEN o.release_type IN ('sale', 'delivery') THEN o.quantity ELSE 0 END) as sale_quantity,
      SUM(CASE WHEN o.release_type = 'sample' THEN o.quantity ELSE 0 END) as sample_quantity,
      SUM(CASE WHEN o.release_type = 'return' THEN o.quantity ELSE 0 END) as return_quantity,
      SUM(o.total_amount) as total_amount,
      COUNT(*) as transaction_count
     FROM h_product_outbound o
     WHERE o.tenant_id = ? AND o.status != 'cancelled'
       AND o.release_date >= ? AND o.release_date <= ?
     GROUP BY DATE(o.release_date)
     ORDER BY DATE(o.release_date)`,
    [tenantId, params.startDate, params.endDate]
  );

  return (rows as any[]).map(r => ({
    date: r.date,
    saleQuantity: parseFloat(r.sale_quantity || "0"),
    sampleQuantity: parseFloat(r.sample_quantity || "0"),
    returnQuantity: parseFloat(r.return_quantity || "0"),
    totalAmount: parseFloat(r.total_amount || "0"),
    transactionCount: Number(r.transaction_count)
  }));
}

/* ───────── 제품 재고 회전율 ───────── */
export async function getProductTurnoverAnalysis(params: {
  startDate: string;
  endDate: string;
}, tenantId: number) {
  await ensureProductOutboundTable();
  const conn = await getRawConnection();

  const [rows] = await conn.execute(
    `SELECT 
      b.product_id,
      COALESCE(im.item_name, p.product_name, CONCAT('제품#', b.product_id)) as product_name,
      COALESCE(im.item_code, '') as product_code,
      
      COALESCE(SUM(CASE 
        WHEN b.status IN ('completed','shipped') AND b.end_time >= ? AND b.end_time <= ?
        THEN COALESCE(b.actual_quantity, b.planned_quantity)
        ELSE 0
      END), 0) as production_quantity,
      
      COALESCE(outbound.total_outbound, 0) as outbound_quantity,
      
      COALESCE(SUM(CASE WHEN b.status IN ('completed','shipped') 
        THEN COALESCE(b.actual_quantity, b.planned_quantity)
        ELSE 0
      END), 0) - COALESCE(outbound.all_outbound, 0) as current_stock
      
     FROM h_batches b
     LEFT JOIN h_products_v2 p ON b.product_id = p.id AND p.tenant_id = ?
     LEFT JOIN item_master im ON im.legacy_product_id = b.product_id AND im.item_type = 'own_product'
     LEFT JOIN (
       SELECT o2.batch_id,
              SUM(CASE WHEN o2.release_date >= ? AND o2.release_date <= ? THEN o2.quantity ELSE 0 END) as total_outbound,
              SUM(o2.quantity) as all_outbound
       FROM h_product_outbound o2
       WHERE o2.tenant_id = ? AND o2.status != 'cancelled'
       GROUP BY o2.batch_id
     ) outbound ON b.id = outbound.batch_id
     WHERE b.tenant_id = ? AND b.status IN ('completed', 'shipped')
     GROUP BY b.product_id, im.item_name, p.product_name, im.item_code, outbound.total_outbound, outbound.all_outbound
     ORDER BY outbound_quantity DESC`,
    [params.startDate, params.endDate, params.startDate, params.endDate, tenantId, tenantId, tenantId]
  );

  return (rows as any[]).map(r => {
    const outbound = parseFloat(r.outbound_quantity || "0");
    const currentStock = Math.max(0, parseFloat(r.current_stock || "0"));
    const avgInventory = currentStock > 0 ? currentStock : 1;
    const turnoverRate = outbound / avgInventory;
    const holdingPeriod = turnoverRate > 0 ? 30 / turnoverRate : 999;
    const efficiency = turnoverRate >= 2 ? "양호" : turnoverRate >= 0.5 ? "적정" : "과잉";

    return {
      productId: r.product_id,
      productName: r.product_name,
      productCode: r.product_code,
      productionQuantity: parseFloat(r.production_quantity || "0"),
      outboundQuantity: outbound,
      currentStock,
      turnoverRate,
      averageHoldingPeriod: holdingPeriod,
      efficiency
    };
  });
}

/* ───────── 제품 출고 대시보드 통계 ───────── */
export async function getProductOutboundStats(tenantId: number) {
  await ensureProductOutboundTable();
  const conn = await getRawConnection();

  const [rows] = await conn.execute(
    `SELECT 
      COUNT(*) as total_outbounds,
      COALESCE(SUM(CASE WHEN status != 'cancelled' THEN quantity ELSE 0 END), 0) as total_quantity,
      COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total_amount ELSE 0 END), 0) as total_amount,
      COALESCE(SUM(CASE WHEN release_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) AND status != 'cancelled' THEN quantity ELSE 0 END), 0) as month_quantity,
      COALESCE(SUM(CASE WHEN release_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) AND status != 'cancelled' THEN total_amount ELSE 0 END), 0) as month_amount,
      COUNT(DISTINCT partner_id) as partner_count
     FROM h_product_outbound
     WHERE tenant_id = ?`,
    [tenantId]
  );

  const stats = (rows as any[])[0];
  return {
    totalOutbounds: Number(stats.total_outbounds),
    totalQuantity: parseFloat(stats.total_quantity || "0"),
    totalAmount: parseFloat(stats.total_amount || "0"),
    monthQuantity: parseFloat(stats.month_quantity || "0"),
    monthAmount: parseFloat(stats.month_amount || "0"),
    partnerCount: Number(stats.partner_count)
  };
}
