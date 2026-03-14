/**
 * 원재료 가격 변동 추이 조회
 */

import { getDb } from "../db";
import { hInventoryLots } from "../../drizzle/schema";
import { eq, desc, and} from "drizzle-orm";

/**
 * 원재료별 가격 변동 추이 조회 (최근 30건)
 * @param materialId 원재료 ID
 * @returns 입고 날짜별 단가 목록
 */
export async function getMaterialPriceHistory(materialId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const lots = await db
    .select({
      receiptDate: hInventoryLots.receiptDate,
      unitPrice: hInventoryLots.unitPrice,
      quantity: hInventoryLots.quantity,
      supplierName: hInventoryLots.supplierName
    })
    .from(hInventoryLots)
    .where(
      tenantId
        ? and(eq(hInventoryLots.materialId, materialId), eq(hInventoryLots.tenantId, tenantId))
        : eq(hInventoryLots.materialId, materialId)
    )
    .orderBy(desc(hInventoryLots.receiptDate))
    .limit(30);

  // 날짜별로 그룹화하여 평균 단가 계산
  const priceHistory = lots
    .filter((lot) => lot.receiptDate && lot.unitPrice)
    .map((lot) => ({
      date: lot.receiptDate!.toISOString().split("T")[0],
      price: parseFloat(lot.unitPrice!),
      quantity: parseFloat(lot.quantity),
      supplierName: lot.supplierName
    }))
    .reverse(); // 오래된 순서로 정렬

  return priceHistory;
}

/**
 * 여러 원재료의 가격 변동 추이 조회
 * @param materialIds 원재료 ID 목록
 */
export async function getMultipleMaterialPriceHistory(materialIds: number[], tenantId?: number) {
  const results = await Promise.all(
    materialIds.map(async (materialId) => {
      const history = await getMaterialPriceHistory(materialId, tenantId);
      return {
        materialId,
        history
      };
    })
  );
  return results;
}
