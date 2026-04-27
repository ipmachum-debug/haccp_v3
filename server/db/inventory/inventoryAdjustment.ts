/**
 * 재고 조정 데이터베이스 로직
 * 실사 결과에 따른 재고 수량 수동 조정 (증가/감소)
 */

import { getDb } from "../connection";
import { hInventoryLots, hInventoryTransactions, hMaterials, hInventory } from "../../../drizzle/schema";
import { eq, desc, and, gte } from "drizzle-orm";

/**
 * h_inventory 테이블 재고량 조정
 * 실사 결과에 따라 재고 수량 증가 또는 감소
 */
async function adjustInventoryQuantity(params: {
  db: any;
  materialId: number;
  quantityChange: number; // 양수: 증가, 음수: 감소
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

  // 재고 감소 시 부족 확인
  if (params.quantityChange < 0 && currentAvailable < Math.abs(params.quantityChange)) {
    throw new Error(
      `재고가 부족합니다. 현재 가용 재고: ${currentAvailable}, 조정 수량: ${params.quantityChange}`
    );
  }

  // 재고 조정
  const newTotalQuantity = currentTotal + params.quantityChange;
  const newAvailableQuantity = currentAvailable + params.quantityChange;

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
 * 재고 조정 등록
 * 실사 결과에 따른 재고 수량 수동 조정 (LOT 단위)
 */
export async function adjustInventory(params: {
  materialId: number;
  lotId: number; // LOT 필수
  quantityChange: number; // 양수: 증가, 음수: 감소
  unit: string;
  reason: string; // 조정 사유 (필수)
  notes?: string;
  createdBy: number;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  if (!params.reason || params.reason.trim() === "") {
    throw new Error("조정 사유를 입력해주세요.");
  }

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

  const lotNumber = lot.lotNumber;

  // LOT 수량 조정
  const currentLotQuantity = parseFloat(lot.quantity);
  const newLotQuantity = currentLotQuantity + params.quantityChange;

  if (newLotQuantity < 0) {
    throw new Error(`LOT 수량이 음수가 될 수 없습니다. 현재 수량: ${currentLotQuantity}`);
  }

  await db
    .update(hInventoryLots)
    .set({
      quantity: newLotQuantity.toString()
    })
    .where(eq(hInventoryLots.id, params.lotId));
  // 재고 거래 내역 기록
  // PR-§5.2-2: material_id 직접 작성
  await db.insert(hInventoryTransactions).values({
    lotId: params.lotId,
    materialId: params.materialId,
    transactionType: "adjustment",
    quantity: Math.abs(params.quantityChange).toString(),
    unit: params.unit,
    referenceType: "adjustment",
    referenceId: null,
    notes: `${params.reason}${params.notes ? ` | ${params.notes}` : ""}`,
    createdBy: params.createdBy
  } as any);

  // h_inventory 테이블 재고 조정
  await adjustInventoryQuantity({
    db,
    materialId: params.materialId,
    quantityChange: params.quantityChange,
    tenantId
  });

  return {
    materialId: params.materialId,
    materialName: material.materialName,
    lotNumber,
    quantityChange: params.quantityChange,
    unit: params.unit,
    reason: params.reason
  };
}

/**
 * 재고 조정 이력 조회
 */
export async function getAdjustmentHistory(params?: {
  limit?: number;
  materialId?: number;
  startDate?: Date;
  endDate?: Date;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const conditions: any[] = [eq(hInventoryTransactions.transactionType, "adjustment")];
  // tenantId 필터: hInventoryTransactions에 tenant_id 없음 → hMaterials.tenantId 사용
  if (tenantId) {
    conditions.push(eq(hMaterials.tenantId, tenantId));
  }

  if (params?.materialId) {
    // materialId로 필터링하려면 LOT를 조인해야 함
    // 간단하게 하기 위해 여기서는 생략하고, 필요 시 추가 구현
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
    notes: row.notes,
    createdAt: row.createdAt
  }));
}
