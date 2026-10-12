/**
 * 재고 조정 데이터베이스 로직
 * 실사 결과에 따른 재고 수량 수동 조정 (증가/감소)
 */

import { getDb } from "../connection";
import { hInventoryLots, hInventoryTransactions, hMaterials } from "../../../drizzle/schema";
import { eq, desc, and, gte } from "drizzle-orm";

// adjustInventory / adjustInventoryQuantity 는 2026-10-12 제거 (v3 5단계 4차).
// 조정은 server/lib/inventory/stockAdjustment.ts (applyInventoryDelta 관문) 로 통일.

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
