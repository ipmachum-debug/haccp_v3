/**
 * 출고 관리 데이터베이스 로직
 * 배치 생산 시 원재료 출고 기록 및 h_inventory 재고 자동 차감
 */

import { getDb } from "../db";
import { hInventoryLots, hInventoryTransactions, hMaterials, hInventory } from "../../drizzle/schema";
import { eq, desc, and, gte, sql } from "drizzle-orm";

/**
 * h_inventory 테이블 재고량 차감
 * 출고 시 총 재고량과 가용 재고량 감소
 */
async function decreaseInventoryQuantity(params: {
  db: any;
  materialId: number;
  quantityChange: number;
  tenantId?: number;
}) {
  // 기존 재고 레코드 조회
  const conditions: any[] = [eq(hInventory.materialId, params.materialId)];
  if (params.tenantId) conditions.push(eq(hInventory.tenantId, params.tenantId));
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
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 원재료 정보 조회
  const [material] = await db
    .select()
    .from(hMaterials)
    .where(and(
      ...(tenantId ? [eq(hMaterials.tenantId, tenantId)] : []),
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
    lotId: params.lotId,
    transactionType: "usage",
    quantity: params.quantity.toString(),
    unit: params.unit,
    referenceType: params.batchId ? "batch" : "outbound",
    referenceId: params.batchId || null,
    notes: params.notes || null,
    createdBy: params.createdBy
  });

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
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const conditions = [eq(hInventoryTransactions.transactionType, "usage")];
  // tenantId 필터: hInventoryTransactions에 tenant_id 없음 → hMaterials.tenantId 사용
  if (tenantId) {
    conditions.push(eq(hMaterials.tenantId, tenantId));
  }

  if (params?.materialId) {
    // materialId로 필터링하려면 LOT를 조인해야 함
    // 간단하게 하기 위해 여기서는 생략하고, 필요 시 추가 구현
  }

  if (params?.batchId) {
    conditions.push(eq(hInventoryTransactions.referenceId, params.batchId));
  }

  if (params?.startDate) {
    conditions.push(gte(hInventoryTransactions.createdAt, params.startDate));
  }

  if (params?.endDate) {
    conditions.push(gte(hInventoryTransactions.createdAt, params.endDate));
  }

  const results = await db
    .select({
      id: hInventoryTransactions.id,
      lotId: hInventoryTransactions.lotId,
      lotNumber: hInventoryLots.lotNumber,
      materialName: hMaterials.materialName,
      quantity: hInventoryTransactions.quantity,
      unit: hInventoryTransactions.unit,
      referenceType: hInventoryTransactions.referenceType,
      referenceId: hInventoryTransactions.referenceId,
      notes: hInventoryTransactions.notes,
      createdAt: hInventoryTransactions.createdAt
    })
    .from(hInventoryTransactions)
    .leftJoin(hInventoryLots, eq(hInventoryTransactions.lotId, hInventoryLots.id))
    .leftJoin(hMaterials, eq(hInventoryLots.materialId, hMaterials.id))
    .where(and(...conditions))
    .orderBy(desc(hInventoryTransactions.createdAt))
    .limit(params?.limit || 50);

  return results.map((row) => ({
    id: row.id,
    lotId: row.lotId,
    lotNumber: row.lotNumber,
    materialName: row.materialName,
    quantity: parseFloat(row.quantity),
    unit: row.unit,
    referenceType: row.referenceType,
    referenceId: row.referenceId,
    notes: row.notes,
    createdAt: row.createdAt
  }));
}
