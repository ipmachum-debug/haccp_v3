/**
 * 배치 생산 예측 DB 함수
 * 과거 생산 데이터 기반 소요 시간 및 원재료 소비량 예측
 */

import { getDb } from "../db";
import { hBatches, hBatchMaterials, hMaterials } from "../../drizzle/schema";
import { eq, and, gte, sql, desc } from "drizzle-orm";

import { formatLocalDate } from "../utils/timezone";

/**
 * 배치 생산 예측 데이터 조회
 */
export async function getProductionPredictionData(productId?: number, tenantId?: number) {
  const db = await getDb();
  if (!db) {
    throw new Error("DB 연결 실패");
  }

  // 지난 30일간의 완료된 배치 데이터 조회
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const batches = await db
    .select()
    .from(hBatches)
    .where(
      and(eq(hBatches.tenantId, tenantId as any) , 
        eq(hBatches.status, "completed"),
        gte(hBatches.plannedDate, thirtyDaysAgo),
        productId ? eq(hBatches.productId, productId) : sql`1=1`
      ) as any
    )
    .orderBy(desc(hBatches.plannedDate));

  // 평균 생산 시간 계산
  let totalProductionTime = 0;
  let validBatchCount = 0;

  const productionTimeChart: Array<{ date: string; actual: number; predicted: number }> = [];

  for (const batch of batches) {
    if (batch.startTime && batch.endTime) {
      const productionTime = (batch.endTime.getTime() - batch.startTime.getTime()) / (1000 * 60 * 60); // 시간 단위
      totalProductionTime += productionTime;
      validBatchCount++;

      productionTimeChart.push({
        date: formatLocalDate(batch.plannedDate),
        actual: Math.round(productionTime * 10) / 10,
        predicted: 0, // 예측값은 나중에 계산
      });
    }
  }

  const averageProductionTime = validBatchCount > 0 ? Math.round((totalProductionTime / validBatchCount) * 10) / 10 : 0;

  // 예측 생산 시간 (평균 + 10% 여유)
  const predictedProductionTime = Math.round(averageProductionTime * 1.1 * 10) / 10;

  // 예측값을 차트에 추가
  productionTimeChart.forEach((item) => {
    item.predicted = predictedProductionTime;
  });

  // 원재료 소비량 분석
  const materialConsumption = await db
    .select({
      materialId: hBatchMaterials.materialId,
      materialName: hMaterials.materialName,
      totalQuantity: sql<number>`SUM(CAST(${hBatchMaterials.quantityUsed} AS DECIMAL(10,2)))`,
      batchCount: sql<number>`COUNT(DISTINCT ${hBatchMaterials.batchId})`
    })
    .from(hBatchMaterials)
    .innerJoin(hBatches, eq(hBatchMaterials.batchId, hBatches.id))
    .innerJoin(hMaterials, eq(hBatchMaterials.materialId, hMaterials.id))
    .where(
      and(
        eq(hBatches.status, "completed"),
        gte(hBatches.plannedDate, thirtyDaysAgo),
        productId ? eq(hBatches.productId, productId) : sql`1=1`
      )
    )
    .groupBy(hBatchMaterials.materialId, hMaterials.materialName);

  const materialConsumptionChart = materialConsumption.map((item) => ({
    material: item.materialName,
    average: Math.round((item.totalQuantity / item.batchCount) * 10) / 10,
    predicted: Math.round((item.totalQuantity / item.batchCount) * 1.05 * 10) / 10, // 5% 여유
  }));

  const averageMaterialConsumption = materialConsumption.reduce((sum, item) => sum + (item.totalQuantity / item.batchCount), 0);

  // 예측 정확도 (임시로 85%로 설정, 실제로는 과거 예측과 실제 결과 비교 필요)
  const predictionAccuracy = 85;

  const accuracyChart = batches.slice(0, 10).map((batch) => ({
    date: formatLocalDate(batch.plannedDate),
    accuracy: Math.round((Math.random() * 20 + 75)), // 임시 데이터 (75-95%)
  }));

  return {
    averageProductionTime,
    predictedProductionTime,
    averageMaterialConsumption: Math.round(averageMaterialConsumption * 10) / 10,
    predictionAccuracy,
    productionTimeChart: productionTimeChart.slice(0, 15).reverse(), // 최근 15개 데이터
    materialConsumptionChart,
    accuracyChart: accuracyChart.reverse()
  };
}
