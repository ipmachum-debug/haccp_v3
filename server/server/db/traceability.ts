import { eq, and, inArray } from "drizzle-orm";
import { getDb } from "../db";
import {
  hBatches,
  hBatchInputs,
  hBatchProducts,
  hInventoryLots,
  hMaterials,
  hProductsV2
} from "../../drizzle/schema";

/**
 * LOT 추적성 DB 헬퍼 함수
 */

/**
 * 정방향 추적: 원재료 LOT → 배치 → 완제품
 * 특정 원재료 LOT이 어느 배치에 사용되었고, 어떤 완제품이 생산되었는지 추적
 */
export async function traceLotForward(lotId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 1. 원재료 LOT 정보 조회
  const [lot] = await db
    .select()
    .from(hInventoryLots)
    .where(and(eq(hInventoryLots.tenantId, tenantId), eq(hInventoryLots.id, lotId)));
  if (!lot) {
    throw new Error("LOT을 찾을 수 없습니다.");
  }

  // 2. 해당 LOT이 투입된 배치 조회
  const batchMaterials = await db
    .select({
      batchId: hBatchInputs.batchId,
      quantityUsed: hBatchInputs.actualQuantity,
      uom: hBatchInputs.unit
    })
    .from(hBatchInputs)
    .where(and(eq(hBatchInputs.tenantId, tenantId), eq(hBatchInputs.lotId, lotId)));
  if (batchMaterials.length === 0) {
    return {
      lot,
      batches: [],
      message: "이 LOT은 아직 배치에 투입되지 않았습니다."
    };
  }

  // 3. 배치 정보 조회 (완제품 정보 포함)
  const batchIds = batchMaterials.map((input) => input.batchId);
  const batches = await db
    .select({
      batchId: hBatches.id,
      batchCode: hBatches.batchCode,
      productId: hBatches.productId,
      productName: hProductsV2.productName,
      lotNumber: hBatches.lotNumber,
      status: hBatches.status,
      plannedQuantity: hBatches.plannedQuantity,
      actualQuantity: hBatches.actualQuantity,
      startTime: hBatches.startTime,
      endTime: hBatches.endTime
    })
    .from(hBatches)
    .leftJoin(hProductsV2, eq(hBatches.productId, hProductsV2.id))
    .where(inArray(hBatches.id, batchIds));

  // 4. 각 배치의 완제품 LOT 정보 조회
  const batchProducts = await db
    .select()
    .from(hBatchProducts)
    .where(inArray(hBatchProducts.batchId, batchIds));

  return {
    lot,
    batches: batches.map((batch) => ({
      ...batch,
      inputQuantity: batchMaterials.find((input) => input.batchId === batch.batchId)
        ?.quantityUsed,
      uom: batchMaterials.find((input) => input.batchId === batch.batchId)?.uom,
      products: batchProducts.filter((p) => p.batchId === batch.batchId)
    }))
  };
}

/**
 * 역방향 추적: 완제품 → 배치 → 원재료 LOT
 * 특정 완제품 배치가 어떤 원재료 LOT으로 만들어졌는지 추적
 */
export async function traceLotBackward(batchId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 1. 배치 정보 조회
  const [batch] = await db
    .select({
      batchId: hBatches.id,
      batchCode: hBatches.batchCode,
      productId: hBatches.productId,
      productName: hProductsV2.productName,
      lotNumber: hBatches.lotNumber,
      status: hBatches.status,
      plannedQuantity: hBatches.plannedQuantity,
      actualQuantity: hBatches.actualQuantity,
      startTime: hBatches.startTime,
      endTime: hBatches.endTime
    })
    .from(hBatches)
    .leftJoin(hProductsV2, eq(hBatches.productId, hProductsV2.id))
    .where(eq(hBatches.id, batchId));

  if (!batch) {
    throw new Error("배치를 찾을 수 없습니다.");
  }

  // 2. 배치에 투입된 원재료 LOT 조회
  const materialInputs = await db
    .select({
      materialId: hBatchInputs.materialId,
      materialName: hMaterials.materialName,
      lotId: hBatchInputs.lotId,
      lotNumber: hInventoryLots.lotNumber,
      quantityUsed: hBatchInputs.actualQuantity,
      uom: hBatchInputs.unit,
      expiryDate: hInventoryLots.expiryDate
    })
    .from(hBatchInputs)
    .leftJoin(hMaterials, eq(hBatchInputs.materialId, hMaterials.id))
    .leftJoin(hInventoryLots, eq(hBatchInputs.lotId, hInventoryLots.id))
    .where(eq(hBatchInputs.batchId, batchId));

  // 3. 배치에서 생산된 완제품 LOT 조회
  const batchProducts = await db
    .select()
    .from(hBatchProducts)
    .where(and(eq(hBatchProducts.tenantId, tenantId), eq(hBatchProducts.batchId, batchId)));
  return {
    batch,
    materialInputs,
    products: batchProducts
  };
}

/**
 * 완제품 LOT 번호로 역방향 추적
 * 완제품 LOT 번호로 배치를 찾고, 해당 배치의 원재료 LOT을 추적
 */
export async function traceLotByProductLotNumber(lotNumber: string, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 1. LOT 번호로 배치 조회 (h_batch_products 테이블에서)
  const [batchProduct] = await db
    .select()
    .from(hBatchProducts)
    .where(and(eq(hBatchProducts.tenantId, tenantId), eq(hBatchProducts.lotNumber, lotNumber)));
  if (!batchProduct) {
    throw new Error("해당 LOT 번호의 완제품을 찾을 수 없습니다.");
  }

  // 2. 역방향 추적 실행
  return await traceLotBackward(batchProduct.batchId);
}

/**
 * 원재료 LOT 번호로 정방향 추적
 */
export async function traceLotByMaterialLotNumber(lotNumber: string, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 1. LOT 번호로 원재료 LOT 조회
  const [lot] = await db
    .select()
    .from(hInventoryLots)
    .where(and(eq(hInventoryLots.tenantId, tenantId), eq(hInventoryLots.lotNumber, lotNumber)));
  if (!lot) {
    throw new Error("해당 LOT 번호의 원재료를 찾을 수 없습니다.");
  }

  // 2. 정방향 추적 실행
  return await traceLotForward(lot.id);
}
