import { getDb } from "../db";
import { hInventoryTransactions, hMaterials, hInventory } from "../../drizzle/schema_main";
import { hInventoryLots } from "../../drizzle/schema/part2";
import { eq, and, gte, sql } from "drizzle-orm";

/**
 * 원재료별 재고 회전율 분석
 * @param periodDays 분석 기간 (일)
 */
export async function getInventoryTurnoverAnalysis(periodDays: number = 90, tenantId?: number) {
  const dbInstance = await getDb();
  if (!dbInstance) throw new Error("Database connection failed");
  const db = dbInstance;
  
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - periodDays);

  // 원재료별 입고/출고 통계 조회
  const transactions = await db
    .select({
      materialId: hInventoryLots.materialId,
      materialCode: hMaterials.materialCode,
      materialName: hMaterials.materialName,
      unit: hMaterials.unit,
      transactionType: hInventoryTransactions.transactionType,
      quantity: sql<number>`SUM(${hInventoryTransactions.quantity})`,
      transactionCount: sql<number>`COUNT(*)`
    })
    .from(hInventoryTransactions)
    .leftJoin(hInventoryLots, eq(hInventoryTransactions.lotId, hInventoryLots.id))
    .leftJoin(hMaterials, eq(hInventoryLots.materialId, hMaterials.id))
    .where(gte(hInventoryTransactions.createdAt, startDate))
    .groupBy(
      hInventoryLots.materialId,
      hMaterials.materialCode,
      hMaterials.materialName,
      hMaterials.unit,
      hInventoryTransactions.transactionType
    );

  // 현재 재고 조회
  const currentInventory = await db
    .select({
      materialId: hInventory.materialId,
      totalQuantity: hInventory.totalQuantity,
      availableQuantity: hInventory.availableQuantity
    })
    .from(hInventory).where(eq(hInventory.tenantId, tenantId as any) );

  // 원재료별 데이터 집계
  const materialMap = new Map<number, any>();

  transactions.forEach((tx: any) => {
    if (!materialMap.has(tx.materialId)) {
      materialMap.set(tx.materialId, {
        materialId: tx.materialId,
        materialCode: tx.materialCode,
        materialName: tx.materialName,
        unit: tx.unit,
        inboundQuantity: 0,
        outboundQuantity: 0,
        inboundCount: 0,
        outboundCount: 0,
        currentStock: 0,
        turnoverRate: 0,
        averageHoldingDays: 0
      });
    }

    const material = materialMap.get(tx.materialId);
    if (tx.transactionType === "receipt") {
      material.inboundQuantity += tx.quantity;
      material.inboundCount += tx.transactionCount;
    } else if (tx.transactionType === "usage") {
      material.outboundQuantity += tx.quantity;
      material.outboundCount += tx.transactionCount;
    }
  });

  // 현재 재고 정보 추가
  currentInventory.forEach((inv: any) => {
    const material = materialMap.get(inv.materialId);
    if (material) {
      material.currentStock = inv.availableQuantity || 0;
    }
  });

  // 재고 회전율 및 평균 보유 기간 계산
  materialMap.forEach((material) => {
    // 재고 회전율 = (출고량 / 평균 재고량) * (365 / 분석 기간)
    const avgStock = (material.inboundQuantity + material.currentStock) / 2;
    if (avgStock > 0) {
      material.turnoverRate = (material.outboundQuantity / avgStock) * (365 / periodDays);
    }

    // 평균 보유 기간 = 분석 기간 / 재고 회전율
    if (material.turnoverRate > 0) {
      material.averageHoldingDays = periodDays / material.turnoverRate;
    }
  });

  return Array.from(materialMap.values()).sort(
    (a, b) => b.turnoverRate - a.turnoverRate
  );
}
