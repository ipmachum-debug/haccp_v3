/**
 * 출고 관리 데이터베이스 로직
 * 배치 생산 시 원재료 출고 기록 및 h_inventory 재고 자동 차감
 */

import { getDb, getRawConnection } from "../db";
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
 * 출고 이력 조회
 */
export async function getOutboundHistory(params?: {
  limit?: number;
  materialId?: number;
  batchId?: number;
  startDate?: Date;
  endDate?: Date;
}, tenantId: number) {
  // 1. h_inventory_transactions 기반 소모 이력 (새 completeBatch가 생성하는 데이터)
  // 2. h_batch_inputs 기반 소모 이력 (기존 백업 데이터 포함 전체 배치 투입)
  // 두 소스를 UNION하여 전체 소모 이력을 반환
  const pool = await getRawConnection();
  if (!pool) {
    // fallback to drizzle
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    return [];
  }

  const queryParams: any[] = [tenantId];
  let dateFilter = '';
  let materialFilter = '';
  let batchFilter = '';

  if (params?.startDate) {
    dateFilter += ' AND consumption_date >= ?';
    const sd = params.startDate instanceof Date ? params.startDate.toISOString().split('T')[0] : params.startDate;
    queryParams.push(sd);
  }
  if (params?.endDate) {
    dateFilter += ' AND consumption_date <= ?';
    const ed = params.endDate instanceof Date ? params.endDate.toISOString().split('T')[0] : params.endDate;
    queryParams.push(ed);
  }
  if (params?.materialId) {
    materialFilter = ' AND material_id = ?';
    queryParams.push(params.materialId);
  }
  if (params?.batchId) {
    batchFilter = ' AND batch_id = ?';
    queryParams.push(params.batchId);
  }

  const limitVal = params?.limit || 50;
  queryParams.push(limitVal);

  // h_batch_inputs 기반 - 완료된 배치의 전체 투입 이력 (가장 정확)
  const query = `
    SELECT 
      bi.id,
      bi.batch_id as referenceId,
      b.batch_code as lotNumber,
      m.material_name as materialName,
      ROUND(COALESCE(bi.actual_quantity, bi.planned_quantity), 3) as quantity,
      COALESCE(bi.unit, m.unit, 'kg') as unit,
      'batch' as referenceType,
      CONCAT('배치 ', b.batch_code, ' 투입') as notes,
      COALESCE(b.completed_at, b.end_time, b.start_time) as consumption_date,
      bi.material_id
    FROM h_batch_inputs bi
    JOIN h_batches b ON bi.batch_id = b.id AND b.tenant_id = ?
    JOIN h_materials m ON bi.material_id = m.id
    WHERE b.status = 'completed'
      AND bi.inventory_deducted = 1
      ${dateFilter}
      ${materialFilter}
      ${batchFilter}
    ORDER BY consumption_date DESC, bi.id DESC
    LIMIT ?
  `;

  try {
    const [rows]: any = await pool.execute(query, queryParams);
    return (rows as any[]).map((row: any) => ({
      id: row.id,
      lotId: row.referenceId,
      lotNumber: row.lotNumber,
      materialName: row.materialName,
      quantity: parseFloat(row.quantity || '0'),
      unit: row.unit || 'kg',
      referenceType: row.referenceType,
      referenceId: row.referenceId,
      notes: row.notes,
      createdAt: row.consumption_date
    }));
  } catch (err) {
    console.error('[getOutboundHistory] Error:', err);
    return [];
  }
}
