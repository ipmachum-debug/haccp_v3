import { eq, and, gte, sql } from "drizzle-orm";
import { getDb } from "../db";
import { hInventory, hInventoryTransactions, hInventoryLots, hMaterials } from "../../drizzle/schema";

/**
 * 재고 예측: 과거 사용 패턴 분석하여 소진 예상 시점 계산
 */
export async function getInventoryForecast(days: number = 30, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - days);

  // 원재료별 현재 재고 조회
  const materials = await db
    .select()
    .from(hInventory)
    .leftJoin(hMaterials, eq(hInventory.materialId, hMaterials.id))
    .where(eq(hInventory.tenantId, tenantId));

  const forecasts = await Promise.all(
    materials.map(async (row) => {
      const material = row.h_inventory;
      const materialInfo = row.h_materials;
      
      if (!material || !materialInfo || !material.materialId) return null;

      // 과거 N일간 사용량 조회 (hInventoryTransactions의 usage 타입)
      const usageRecords = await db
        .select()
        .from(hInventoryTransactions)
        .leftJoin(hInventoryLots, eq(hInventoryTransactions.lotId, hInventoryLots.id))
        .where(
          and(
            eq(hInventoryTransactions.transactionType, "usage"),
            eq(hInventoryLots.materialId, material.materialId),
            eq(hInventoryLots.tenantId, tenantId),
            gte(hInventoryTransactions.createdAt, pastDate)
          )
        );

      // 총 사용량 계산
      const totalUsed = usageRecords.reduce(
        (sum, record) => sum + Number(record.h_inventory_transactions.quantity || 0),
        0
      );

      // 일평균 사용량 계산
      const avgDailyUsage = totalUsed / days;

      // 소진 예상 일수 계산
      const daysUntilDepletion =
        avgDailyUsage > 0
          ? Math.floor(Number(material.totalQuantity) / avgDailyUsage)
          : 999;

      // 소진 예상 날짜
      const depletionDate = new Date();
      depletionDate.setDate(depletionDate.getDate() + daysUntilDepletion);

      return {
        materialId: material.materialId,
        materialName: materialInfo.materialName,
        currentStock: Number(material.totalQuantity),
        safetyStock: Number(materialInfo.safetyStockLevel || 0),
        unit: materialInfo.unit,
        avgDailyUsage: Math.round(avgDailyUsage * 100) / 100,
        daysUntilDepletion,
        depletionDate: daysUntilDepletion < 999 ? depletionDate : null,
        status:
          daysUntilDepletion <= 7
            ? "critical"
            : daysUntilDepletion <= 14
            ? "warning"
            : "normal"
      };
    })
  );

  return forecasts
    .filter((f) => f !== null)
    .sort((a, b) => a!.daysUntilDepletion - b!.daysUntilDepletion);
}

/**
 * 발주 제안: 재고 부족 예상 원재료에 대한 발주 제안
 */
export async function getPurchaseRecommendations(tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const forecasts = await getInventoryForecast(30, tenantId);

  // 14일 이내 소진 예상 또는 안전 재고 이하인 원재료
  const recommendations = forecasts
    .filter(
      (f) =>
        f && (f.daysUntilDepletion <= 14 || f.currentStock <= f.safetyStock)
    )
    .map((f) => {
      if (!f) return null;
      
      // 발주 권장 수량: 30일치 사용량 + 안전 재고
      const recommendedQuantity = Math.ceil(
        f.avgDailyUsage * 30 + f.safetyStock - f.currentStock
      );

      // 우선순위 결정: 소진 예상일 기준
      let priority: "high" | "medium" | "low";
      if (f.currentStock <= f.safetyStock || f.daysUntilDepletion <= 7) {
        priority = "high";
      } else if (f.daysUntilDepletion <= 14) {
        priority = "medium";
      } else {
        priority = "low";
      }

      return {
        ...f,
        recommendedQuantity: Math.max(0, recommendedQuantity),
        reason:
          f.currentStock <= f.safetyStock
            ? "안전 재고 이하"
            : `${f.daysUntilDepletion}일 후 소진 예상`,
        priority
      };
    })
    .filter((r) => r !== null);

  return recommendations;
}
