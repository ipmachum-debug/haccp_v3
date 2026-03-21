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

  // LOT 수량 확인
  const currentLotQuantity = parseFloat(lot.quantity);
  if (currentLotQuantity < params.quantity) {
    throw new Error(
      `LOT 수량이 부족합니다. 현재 수량: ${currentLotQuantity}, 요청 수량: ${params.quantity}`
    );
  }

  // LOT 수량 차감
  const newLotQuantity = currentLotQuantity - params.quantity;
  await db
    .update(hInventoryLots)
    .set({
      quantity: newLotQuantity.toString()
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
        b.batch_number AS lotNumber,
        m.material_name AS materialName,
        ROUND(COALESCE(bi.actual_quantity, bi.planned_quantity), 3) AS quantity,
        COALESCE(bi.unit, m.unit, 'kg') AS unit,
        'batch' AS referenceType,
        bi.batch_id AS referenceId,
        'BATCH' AS sourceType,
        bi.batch_id AS sourceId,
        CONCAT('배치 ', COALESCE(b.batch_number, b.id), ' 투입') AS notes,
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
