/**
 * 배치 원가 계산 로직
 * 배치에 투입된 원재료의 LOT별 단가를 기반으로 원가 계산
 */

import { getDb } from "../db";
import { hBatches, hBatchMaterials, hInventoryLots, hProductsV2 } from "../../drizzle/schema";
import { eq, and} from "drizzle-orm";

/**
 * 배치별 원가 계산
 * @param batchId 배치 ID
 * @returns 총 원재료 비용, 제품 판매가, 원가율
 */
export async function calculateBatchCost(batchId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 배치 정보 조회
  const [batch] = await db
    .select()
    .from(hBatches)
    .where(and(eq(hBatches.tenantId, tenantId), eq(hBatches.id, batchId)));
  if (!batch) {
    throw new Error(`Batch not found: ${batchId}`);
  }

  // 배치에 투입된 원재료 목록 조회
  const batchMaterials = await db
    .select()
    .from(hBatchMaterials)
    .where(and(eq(hBatchMaterials.tenantId, tenantId), eq(hBatchMaterials.batchId, batchId)));
  // 각 원재료의 LOT별 단가 조회 및 비용 계산
  let totalMaterialCost = 0;

  for (const material of batchMaterials) {
    if (material.lotId) {
      // LOT 정보 조회
      const [lot] = await db
        .select()
        .from(hInventoryLots)
        .where(eq(hInventoryLots.id, material.lotId));
      if (lot && lot.unitPrice) {
        const unitPrice = parseFloat(lot.unitPrice);
        const quantityUsed = parseFloat(material.quantityUsed);
        totalMaterialCost += unitPrice * quantityUsed;
      }
    }
  }

  // 제품 정보 조회 (판매가)
  let productPrice = 0;
  if (batch.productId) {
    const [product] = await db
      .select()
      .from(hProductsV2)
      .where(and(eq(hProductsV2.tenantId, tenantId), eq(hProductsV2.id, batch.productId)));
    if (product && product.unitPrice) {
      productPrice = parseFloat(product.unitPrice);
    }
  }

  // 원가율 계산 (원재료 비용 / 제품 판매가 × 100)
  const costRate = productPrice > 0 ? (totalMaterialCost / productPrice) * 100 : 0;

  return {
    batchId,
    totalMaterialCost: Math.round(totalMaterialCost),
    productPrice: Math.round(productPrice),
    costRate: Math.round(costRate * 100) / 100, // 소수점 2자리
    materialCount: batchMaterials.length
  };
}

/**
 * 여러 배치의 원가 일괄 계산
 * @param batchIds 배치 ID 목록
 */
export async function calculateBatchCosts(batchIds: number[], tenantId?: number) {
  const results = await Promise.all(
    batchIds.map((batchId) => calculateBatchCost(batchId))
  );
  return results;
}

/**
 * 모든 배치의 원가 계산 (최근 100건)
 */
export async function calculateAllBatchCosts(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const batches = await db
    .select()
    .from(hBatches).where(eq(hBatches.tenantId, tenantId)).limit(100);

  const batchIds = batches.map((batch) => batch.id);
  return await calculateBatchCosts(batchIds);
}
