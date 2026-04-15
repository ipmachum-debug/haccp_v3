/**
 * 원재료별 현재 재고 조회 로직
 * h_inventory 테이블에서 원재료별 총 재고량, 가용 재고량 조회
 */

import { getDb } from "../connection";
import { hInventory, hMaterials, hInventoryLots } from "../../../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";

/** 정제수(purified water) 여부 판별 - 원가 계산에서 제외 대상 */
function isWaterMaterial(materialName: string | null | undefined): boolean {
  if (!materialName) return false;
  const name = materialName.toLowerCase();
  return name.includes("정제수") || name.includes("purified water");
}

/**
 * 모든 원재료의 현재 재고 수량 조회
 * h_materials와 h_inventory를 조인하여 원재료 정보와 재고 정보 함께 반환
 */
export async function getMaterialsWithInventory(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const results = await db
    .select({
      id: hMaterials.id,
      materialCode: hMaterials.materialCode,
      materialName: hMaterials.materialName,
      category: hMaterials.category,
      unit: hMaterials.unit,
      safetyStockLevel: hMaterials.safetyStockLevel,
      unitPrice: hMaterials.unitPrice,
      expiryWarningDays: hMaterials.expiryWarningDays,
      isActive: hMaterials.isActive,
      // 재고 정보
      totalQuantity: hInventory.totalQuantity,
      availableQuantity: hInventory.availableQuantity,
      reservedQuantity: hInventory.reservedQuantity
    })
    .from(hMaterials)
    .leftJoin(hInventory, eq(hMaterials.id, hInventory.materialId));

  // 각 원재료의 평균 단가 계산
  const resultsWithAvgPrice = await Promise.all(
    results.map(async (row) => {
      // 최근 10건의 입고 LOT에서 평균 단가 계산
      const recentLots = await db
        .select()
        .from(hInventoryLots)
        .where(
          and(eq(hInventoryLots.materialId, row.id),
            sql`${hInventoryLots.unitPrice} IS NOT NULL`
          )
        )
        .orderBy(desc(hInventoryLots.receiptDate))
        .limit(10);

      let averagePrice = null;
      if (recentLots.length > 0) {
        const validPrices = recentLots
          .map((lot) => parseFloat(lot.unitPrice || "0"))
          .filter((price) => price > 0);
        
        if (validPrices.length > 0) {
          averagePrice = validPrices.reduce((sum, price) => sum + price, 0) / validPrices.length;
        }
      }

      const isWater = isWaterMaterial(row.materialName);
      return {
        id: row.id,
        materialCode: row.materialCode,
        materialName: row.materialName,
        category: row.category,
        unit: row.unit,
        safetyStockLevel: row.safetyStockLevel ? parseFloat(row.safetyStockLevel) : 0,
        unitPrice: isWater ? 0 : (row.unitPrice ? parseFloat(row.unitPrice) : 0),
        expiryWarningDays: row.expiryWarningDays,
        isActive: row.isActive,
        isWater, // 정제수 여부 플래그 (프론트에서 "원가제외" 표시용)
        // 재고 정보 (없으면 0)
        totalQuantity: row.totalQuantity ? parseFloat(row.totalQuantity) : 0,
        availableQuantity: row.availableQuantity ? parseFloat(row.availableQuantity) : 0,
        reservedQuantity: row.reservedQuantity ? parseFloat(row.reservedQuantity) : 0,
        // 평균 단가 (최근 10건 기준, 정제수는 0)
        averagePrice: isWater ? 0 : (averagePrice ? Math.round(averagePrice) : null)
      };
    })
  );

  return resultsWithAvgPrice;
}

/**
 * 특정 원재료의 현재 재고 수량 조회
 */
export async function getMaterialInventory(materialId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const [result] = await db
    .select()
    .from(hInventory)
    .where(and(eq(hInventory.tenantId, tenantId as any) , eq(hInventory.materialId, materialId)) as any);
  if (!result) {
    return {
      totalQuantity: 0,
      availableQuantity: 0,
      reservedQuantity: 0
    };
  }

  return {
    totalQuantity: parseFloat(result.totalQuantity || "0"),
    availableQuantity: parseFloat(result.availableQuantity || "0"),
    reservedQuantity: parseFloat(result.reservedQuantity || "0")
  };
}
