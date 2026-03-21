/**
 * 출고 관리 데이터베이스 로직
 * 배치 생산 시 원재료 출고 기록 및 h_inventory 재고 자동 차감
 */

import { getDb } from "../db";
import { hInventoryLots, hInventoryTransactions, hMaterials, hInventory } from "../../drizzle/schema";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";

/**
 * h_inventory 테이블 재고량 차감
 * 출고 시 총 재고량과 가용 재고량 감소
 */
async function decreaseInventoryQuantity(params: {
  db: any;
  materialId: number;
  quantityChange: number;
  tenantId: number;
}) {
  // 기존 재고 레코드 조회
  const conditions: any[] = [eq(hInventory.materialId, params.materialId), eq(hInventory.tenantId, params.tenantId)];
  const [existingInventory] = await params.db
    .select()
    .from(hInventory)
    .where(and(...conditions));
  if (!existingInventory) {
    throw new Error("재고가 존재하지 않습니다.");
  }

  const currentTotal = parseFloat(existingInventory.totalQuantity);
  const currentAvailable = parseFloat(existingInventory.availableQuantity);

  // 재고 부족 확인
  if (currentAvailable < params.quantityChange) {
    throw new Error(
      `재고가 부족합니다. 현재 가용 재고: ${currentAvailable}, 요청 수량: ${params.quantityChange}`
    );
  }

  // 재고 차감
  const newTotalQuantity = currentTotal - params.quantityChange;
  const newAvailableQuantity = currentAvailable - params.quantityChange;

  await params.db
    .update(hInventory)
    .set({
      totalQuantity: newTotalQuantity.toString(),
      availableQuantity: newAvailableQuantity.toString(),
      lastUpdated: new Date()
    })
    .where(eq(hInventory.id, existingInventory.id));
}

/**
 * 출고 등록 (LOT 차감 + 재고 반영)
 * 배치 생산 시 원재료 출고 기록
 */
export async function createOutboundRecord(params: {
  materialId: number;
  lotId: number;
  quantity: number;
  unit: string;
  batchId?: number;
  notes?: string;
  createdBy: number;
}, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 원재료 정보 조회
  const [material] = await db
    .select()
    .from(hMaterials)
    .where(and(
      eq(hMaterials.tenantId, tenantId),
      eq(hMaterials.id, params.materialId)
    ));
  if (!material) {
    throw new Error("원재료를 찾을 수 없습니다.");
  }

  // LOT 정보 조회
  const [lot] = await db
    .select()
    .from(hInventoryLots)
    .where(eq(hInventoryLots.id, params.lotId));
  if (!lot) {
    throw new Error("LOT를 찾을 수 없습니다.");
  }

  // LOT 수량 확인 (available_quantity 기준)
  const currentAvailQty = parseFloat(lot.availableQuantity || lot.quantity);
  if (currentAvailQty < params.quantity) {
    throw new Error(
      `LOT 수량이 부족합니다. 현재 가용 수량: ${currentAvailQty}, 요청 수량: ${params.quantity}`
    );
  }

  // LOT 수량 차감 (quantity + available_quantity 모두 차감)
  const newQty = parseFloat(lot.quantity) - params.quantity;
  const newAvailQty = currentAvailQty - params.quantity;
  await db
    .update(hInventoryLots)
    .set({
      quantity: newQty.toString(),
      availableQuantity: newAvailQty.toString()
    })
    .where(eq(hInventoryLots.id, params.lotId));
  // 재고 거래 내역 기록
  await db.insert(hInventoryTransactions).values({
    tenantId: tenantId!,
    lotId: params.lotId,
    transactionType: "usage",
    quantity: params.quantity.toString(),
    unit: params.unit,
    referenceType: params.batchId ? "batch" : "outbound",
    referenceId: params.batchId || null,
    notes: params.notes || null,
    createdBy: params.createdBy
  } as any);

  // h_inventory 테이블 재고 차감
  await decreaseInventoryQuantity({
    db,
    materialId: params.materialId,
    quantityChange: params.quantity,
    tenantId
  });

  return {
    lotId: params.lotId,
    lotNumber: lot.lotNumber,
    materialName: material.materialName,
    quantity: params.quantity,
    unit: params.unit,
    remainingQuantity: newLotQuantity
  };
}

/**
 * 출고/소모 이력 조회
 *
 * 두 가지 데이터 소스를 UNION하여 전체 소모 이력 반환:
 * 1. h_inventory_transactions (transaction_type='usage') - 실제 LOT 차감 기록 + 수동 출고
 * 2. h_batch_inputs (inventory_deducted=1) - 배치 투입 기록 (트랜잭션 미생성 건 포함)
 *
 * 중복 방지: h_inventory_transactions에 이미 source_id/source_line_id로 기록된
 * h_batch_inputs는 제외 (NOT EXISTS)
 */
export async function getOutboundHistory(params?: {
  limit?: number;
  materialId?: number;
  batchId?: number;
  startDate?: Date;
  endDate?: Date;
}, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 날짜 파라미터 전처리
  const startDateStr = params?.startDate
    ? (params.startDate instanceof Date ? params.startDate.toISOString().split('T')[0] : params.startDate)
    : null;
  const endDateStr = params?.endDate
    ? (params.endDate instanceof Date ? params.endDate.toISOString().split('T')[0] : params.endDate)
    : null;

  // 조건 빌드
  const txnConditions: string[] = [
    `t.transaction_type = 'usage'`,
    `t.tenant_id = ${tenantId}`
  ];
  const biConditions: string[] = [
    `b.tenant_id = ${tenantId}`,
    `b.status IN ('in_progress', 'completed')`,
    `bi.inventory_deducted = 1`
  ];

  if (params?.materialId) {
    txnConditions.push(`COALESCE(l.material_id, inv.material_id) = ${params.materialId}`);
    biConditions.push(`bi.material_id = ${params.materialId}`);
  }

  if (params?.batchId) {
    txnConditions.push(`t.source_id = ${params.batchId}`);
    biConditions.push(`bi.batch_id = ${params.batchId}`);
  }

  if (startDateStr) {
    txnConditions.push(`COALESCE(t.transaction_date, t.created_at) >= '${startDateStr}'`);
    biConditions.push(`COALESCE(bi.input_time, b.start_time, b.created_at) >= '${startDateStr}'`);
  }

  if (endDateStr) {
    txnConditions.push(`COALESCE(t.transaction_date, t.created_at) <= '${endDateStr}'`);
    biConditions.push(`COALESCE(bi.input_time, b.start_time, b.created_at) <= '${endDateStr}'`);
  }

  const limit = params?.limit || 50;

  // UNION ALL: h_inventory_transactions + h_batch_inputs (중복 제외)
  const [rows]: any = await db.execute(sql.raw(`
    (
      SELECT
        t.id,
        t.lot_id AS lotId,
        l.lot_number AS lotNumber,
        COALESCE(m1.material_name, m2.material_name) AS materialName,
        ABS(t.quantity) AS quantity,
        t.unit,
        t.reference_type AS referenceType,
        COALESCE(t.reference_id, t.source_id) AS referenceId,
        t.source_type AS sourceType,
        t.source_id AS sourceId,
        t.notes,
        COALESCE(t.transaction_date, t.created_at) AS transactionDate,
        t.created_at AS createdAt,
        'transaction' AS dataSource
      FROM h_inventory_transactions t
      LEFT JOIN h_inventory_lots l ON l.id = t.lot_id AND t.lot_id > 0
      LEFT JOIN h_materials m1 ON m1.id = l.material_id
      LEFT JOIN h_inventory inv ON inv.id = t.inventory_id
      LEFT JOIN h_materials m2 ON m2.id = inv.material_id
      WHERE ${txnConditions.join(' AND ')}
    )
    UNION ALL
    (
      SELECT
        bi.id + 10000000 AS id,
        0 AS lotId,
        b.batch_code AS lotNumber,
        m.material_name AS materialName,
        ROUND(COALESCE(bi.actual_quantity, bi.planned_quantity), 3) AS quantity,
        COALESCE(bi.unit, m.unit, 'kg') AS unit,
        'batch' AS referenceType,
        bi.batch_id AS referenceId,
        'BATCH' AS sourceType,
        bi.batch_id AS sourceId,
        CONCAT('배치 ', COALESCE(b.batch_code, b.id), ' 투입') AS notes,
        COALESCE(bi.input_time, b.start_time, b.created_at) AS transactionDate,
        bi.created_at AS createdAt,
        'batch_input' AS dataSource
      FROM h_batch_inputs bi
      JOIN h_batches b ON bi.batch_id = b.id AND b.tenant_id = bi.tenant_id
      JOIN h_materials m ON bi.material_id = m.id
      WHERE ${biConditions.join(' AND ')}
        AND NOT EXISTS (
          SELECT 1 FROM h_inventory_transactions tx
          WHERE tx.source_type = 'BATCH'
            AND tx.source_id = bi.batch_id
            AND tx.source_line_id = bi.id
            AND tx.transaction_type = 'usage'
            AND tx.tenant_id = ${tenantId}
        )
    )
    ORDER BY transactionDate DESC, createdAt DESC
    LIMIT ${limit}
  `));

  return (rows as any[]).map((row: any) => ({
    id: row.id,
    lotId: row.lotId,
    lotNumber: row.lotNumber || null,
    materialName: row.materialName || null,
    quantity: parseFloat(row.quantity || "0"),
    unit: row.unit,
    referenceType: row.referenceType,
    referenceId: row.referenceId,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    notes: row.notes,
    transactionDate: row.transactionDate,
    createdAt: row.createdAt,
    dataSource: row.dataSource
  }));
}

/**
 * 소모 현황 월별 요약 조회
 *
 * 월 단위로 전체 소모 이력을 일별 그룹화 + 원재료별 소계 + 총합계 반환
 * limit 없이 해당 월의 모든 데이터를 반환
 */
export async function getConsumptionSummary(params: {
  year: number;
  month: number;  // 1-12
}, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const startDate = `${params.year}-${String(params.month).padStart(2, '0')}-01`;
  const endMonth = params.month === 12 ? 1 : params.month + 1;
  const endYear = params.month === 12 ? params.year + 1 : params.year;
  const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;

  // UNION ALL: h_inventory_transactions (usage) + h_batch_inputs (중복 제외)
  const [rows]: any = await db.execute(sql.raw(`
    (
      SELECT
        DATE(COALESCE(t.transaction_date, t.created_at)) AS txDate,
        COALESCE(m1.material_name, m2.material_name) AS materialName,
        COALESCE(m1.id, m2.id) AS materialId,
        ABS(t.quantity) AS quantity,
        t.unit,
        COALESCE(t.unit_cost, 0) AS unitCost,
        ABS(t.amount) AS amount,
        t.source_type AS sourceType,
        t.source_id AS sourceId,
        l.lot_number AS lotNumber,
        t.notes,
        'transaction' AS dataSource
      FROM h_inventory_transactions t
      LEFT JOIN h_inventory_lots l ON l.id = t.lot_id AND t.lot_id > 0
      LEFT JOIN h_materials m1 ON m1.id = l.material_id
      LEFT JOIN h_inventory inv ON inv.id = t.inventory_id
      LEFT JOIN h_materials m2 ON m2.id = inv.material_id
      WHERE t.transaction_type = 'usage'
        AND t.tenant_id = ${tenantId}
        AND COALESCE(t.transaction_date, t.created_at) >= '${startDate}'
        AND COALESCE(t.transaction_date, t.created_at) < '${endDate}'
    )
    UNION ALL
    (
      SELECT
        DATE(COALESCE(bi.input_time, b.start_time, b.created_at)) AS txDate,
        m.material_name AS materialName,
        bi.material_id AS materialId,
        ROUND(COALESCE(bi.actual_quantity, bi.planned_quantity), 3) AS quantity,
        COALESCE(bi.unit, m.unit, 'kg') AS unit,
        COALESCE(bi.unit_price, 0) AS unitCost,
        ROUND(COALESCE(bi.total_price, COALESCE(bi.actual_quantity, bi.planned_quantity) * COALESCE(bi.unit_price, 0)), 0) AS amount,
        'BATCH' AS sourceType,
        bi.batch_id AS sourceId,
        b.batch_code AS lotNumber,
        CONCAT('배치 ', COALESCE(b.batch_code, b.id), ' 투입') AS notes,
        'batch_input' AS dataSource
      FROM h_batch_inputs bi
      JOIN h_batches b ON bi.batch_id = b.id AND b.tenant_id = bi.tenant_id
      JOIN h_materials m ON bi.material_id = m.id
      WHERE bi.tenant_id = ${tenantId}
        AND b.status IN ('in_progress', 'completed')
        AND bi.inventory_deducted = 1
        AND COALESCE(bi.input_time, b.start_time, b.created_at) >= '${startDate}'
        AND COALESCE(bi.input_time, b.start_time, b.created_at) < '${endDate}'
        AND NOT EXISTS (
          SELECT 1 FROM h_inventory_transactions tx
          WHERE tx.source_type = 'BATCH'
            AND tx.source_id = bi.batch_id
            AND tx.source_line_id = bi.id
            AND tx.transaction_type = 'usage'
            AND tx.tenant_id = ${tenantId}
        )
    )
    ORDER BY txDate DESC, materialName ASC
  `));

  // 일별 그룹화 + 원재료별 소계
  const dailyMap = new Map<string, {
    date: string;
    items: Array<{
      materialId: number;
      materialName: string;
      quantity: number;
      unit: string;
      amount: number;
      sourceType: string;
      sourceId: number | null;
      lotNumber: string | null;
      notes: string | null;
    }>;
    totalQuantity: number;
    totalAmount: number;
  }>();

  // 원재료별 월간 합계
  const materialTotals = new Map<number, {
    materialId: number;
    materialName: string;
    totalQuantity: number;
    totalAmount: number;
    unit: string;
    count: number;
  }>();

  let grandTotalQuantity = 0;
  let grandTotalAmount = 0;
  let totalRecords = 0;

  for (const row of (rows as any[])) {
    const dateStr = row.txDate ? (row.txDate instanceof Date
      ? row.txDate.toISOString().split('T')[0]
      : String(row.txDate).split('T')[0]) : 'unknown';
    const qty = parseFloat(row.quantity || "0");
    const amt = parseFloat(row.amount || "0");
    const matId = Number(row.materialId || 0);

    // 일별 그룹
    if (!dailyMap.has(dateStr)) {
      dailyMap.set(dateStr, { date: dateStr, items: [], totalQuantity: 0, totalAmount: 0 });
    }
    const dayGroup = dailyMap.get(dateStr)!;
    dayGroup.items.push({
      materialId: matId,
      materialName: row.materialName || '알 수 없음',
      quantity: qty,
      unit: row.unit || 'kg',
      amount: amt,
      sourceType: row.sourceType || '',
      sourceId: row.sourceId ? Number(row.sourceId) : null,
      lotNumber: row.lotNumber || null,
      notes: row.notes || null,
    });
    dayGroup.totalQuantity += qty;
    dayGroup.totalAmount += amt;

    // 원재료별 합계
    if (matId > 0) {
      if (!materialTotals.has(matId)) {
        materialTotals.set(matId, {
          materialId: matId,
          materialName: row.materialName || '알 수 없음',
          totalQuantity: 0,
          totalAmount: 0,
          unit: row.unit || 'kg',
          count: 0,
        });
      }
      const mt = materialTotals.get(matId)!;
      mt.totalQuantity += qty;
      mt.totalAmount += amt;
      mt.count++;
    }

    grandTotalQuantity += qty;
    grandTotalAmount += amt;
    totalRecords++;
  }

  // 일별 그룹 내에서 원재료별로 소계 집계
  const dailyGroups = Array.from(dailyMap.values()).map(day => {
    // 원재료별 소계
    const matSubtotals = new Map<number, {
      materialId: number;
      materialName: string;
      subtotalQty: number;
      subtotalAmt: number;
      unit: string;
      items: typeof day.items;
    }>();

    for (const item of day.items) {
      if (!matSubtotals.has(item.materialId)) {
        matSubtotals.set(item.materialId, {
          materialId: item.materialId,
          materialName: item.materialName,
          subtotalQty: 0,
          subtotalAmt: 0,
          unit: item.unit,
          items: [],
        });
      }
      const sub = matSubtotals.get(item.materialId)!;
      sub.subtotalQty += item.quantity;
      sub.subtotalAmt += item.amount;
      sub.items.push(item);
    }

    return {
      date: day.date,
      totalQuantity: day.totalQuantity,
      totalAmount: day.totalAmount,
      recordCount: day.items.length,
      materialGroups: Array.from(matSubtotals.values()),
    };
  });

  return {
    year: params.year,
    month: params.month,
    dailyGroups,
    materialTotals: Array.from(materialTotals.values()).sort((a, b) => b.totalQuantity - a.totalQuantity),
    grandTotalQuantity,
    grandTotalAmount,
    totalRecords,
  };
}
