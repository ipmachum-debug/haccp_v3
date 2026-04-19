/**
 * 배치 원가 + 수익성
 */
// ═══════════════════════════════════════════════════════════════
// costAnalysis.ts - 원가 분석 DB 함수
// 배치 원가, 수익성, 재고 회전율, 단가 이력,
// 수익성 예측(지수 평활법), 재고 소진 예측, 발주 알림
// ═══════════════════════════════════════════════════════════════
import { getDb } from "../connection";
import { eq, and, or, lte, gte, gt, desc, asc, sql, lt, inArray, count, isNotNull, sum } from "drizzle-orm";
import { toKSTDate, todayKST, formatLocalDate } from "../../utils/timezone";
import { createNotification } from "../system/notificationFunctions";

import {
  hBatches,
  hBatchInputs,
  hMaterials,
  hInventoryLots,
  hInventoryTransactions,
  hProductsV2,
  hMaterialPriceHistory,
} from "../../../drizzle/schema";

// ═══════════════════════════════════════════════════════════════
// 배치 원가 계산
// ═══════════════════════════════════════════════════════════════

/** 정제수(purified water) 여부 판별 - 가격/재고 계산에서 제외 대상 */
function isWaterMaterial(materialName: string | null | undefined): boolean {
  if (!materialName) return false;
  const name = materialName.toLowerCase();
  return name.includes("정제수") || name.includes("purified water");
}

/**
 * 배치별 원재료 투입 비용 계산
 * 정제수는 투입량 표시는 하되 가격 계산에서 제외
 */

export async function getBatchCost(batchId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hBatchInputs, hMaterials } = await import("../../../drizzle/schema.js");
  const { eq, sql } = await import("drizzle-orm");

  // 배치 원재료 투입 내역 조회 (원재료 정보 포함)
  const inputs = await db
    .select({
      input: hBatchInputs,
      material: hMaterials
    })
    .from(hBatchInputs)
    .leftJoin(hMaterials, eq(hBatchInputs.materialId, hMaterials.id))
    .where(eq(hBatchInputs.batchId, batchId));

  // 각 원재료별 비용 계산
  // 우선순위: ① h_batch_inputs.unitPrice (FEFO LOT 실제단가) → ② h_materials.unitPrice (마스터 단가)
  // 정제수는 비용 0으로 처리
  const materialCosts = inputs.map((item) => {
    const quantity = parseFloat(String(item.input.actualQuantity || item.input.plannedQuantity));
    const water = isWaterMaterial(item.material?.materialName);

    // h_batch_inputs에 FEFO 할당 시 저장된 실제단가 우선 사용
    const batchInputUnitPrice = item.input.unitPrice ? parseFloat(String(item.input.unitPrice)) : null;
    const masterUnitPrice = item.material?.unitPrice ? parseFloat(String(item.material.unitPrice)) : 0;
    const unitPrice = water ? 0 : (batchInputUnitPrice ?? masterUnitPrice);

    // total_price가 있으면 직접 사용 (FEFO 가중평균 기반), 없으면 수량×단가
    const batchInputTotalPrice = item.input.totalPrice ? parseFloat(String(item.input.totalPrice)) : null;
    const cost = water ? 0 : (batchInputTotalPrice ?? quantity * unitPrice);

    return {
      materialId: item.input.materialId,
      materialName: item.material?.materialName || "Unknown",
      quantity,
      unit: item.input.unit,
      unitPrice,
      totalCost: cost,
      isWater: water,
      priceSource: water ? "excluded" : (batchInputUnitPrice !== null ? "lot" : "master")
    };
  });

  // 총 비용 계산 (정제수 제외)
  const totalCost = materialCosts.reduce((sum, item) => sum + item.totalCost, 0);

  return {
    batchId,
    materialCosts,
    totalCost
  };
}

/**
 * 여러 배치의 비용 조회 (배치 목록 페이지용)
 * 단가 우선순위: ① h_batch_inputs.total_price (FEFO LOT 실제원가) → ② 수량 × h_materials.unit_price (마스터 단가)
 * 정제수는 비용 합계에서 제외
 */
export async function getBatchCostSummary(batchIds: number[], tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hBatchInputs, hMaterials } = await import("../../../drizzle/schema.js");
  const { inArray, eq, sql, and } = await import("drizzle-orm");

  if (batchIds.length === 0) return [];

  // 각 배치별 총 비용 계산 (정제수 제외)
  // COALESCE: h_batch_inputs.total_price (LOT 실제원가) > actual_qty × h_batch_inputs.unit_price > actual_qty × h_materials.unit_price
  const result = await db
    .select({
      batchId: hBatchInputs.batchId,
      totalCost: sql<string>`SUM(
        COALESCE(
          ${hBatchInputs.totalPrice},
          COALESCE(${hBatchInputs.actualQuantity}, ${hBatchInputs.plannedQuantity})
            * COALESCE(${hBatchInputs.unitPrice}, ${hMaterials.unitPrice}, 0)
        )
      )`
    })
    .from(hBatchInputs)
    .leftJoin(hMaterials, eq(hBatchInputs.materialId, hMaterials.id))
    .where(and(
      inArray(hBatchInputs.batchId, batchIds),
      sql`${hMaterials.materialName} NOT LIKE '%정제수%'`
    ))
    .groupBy(hBatchInputs.batchId);

  return result.map((r) => ({
    batchId: Number(r.batchId),
    totalCost: parseFloat(r.totalCost || "0")
  }));
}


// ═══════════════════════════════════════════════════════════════
// 배치 수익성 분석 (매출, 비용, 수익률)
// ═══════════════════════════════════════════════════════════════

/**
 * 배치 수익성 조회 (원가, 매출, 수익률)
 */
export async function getBatchProfitability(batchId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hBatches } = await import("../../../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");

  // 배치 정보 조회
  const batch = await db.select().from(hBatches).where(eq(hBatches.id, batchId)).limit(1);
  if (batch.length === 0) {
    return null;
  }

  // 배치 비용 조회
  const costResult = await getBatchCost(batchId);
  if (!costResult) {
    return null;
  }

  const revenue = batch[0].revenue ? parseFloat(batch[0].revenue) : 0;
  const cost = costResult.totalCost;
  const profit = revenue - cost;
  const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0;

  return {
    batchId,
    batchCode: batch[0].batchCode,
    productId: batch[0].productId,
    revenue,
    cost,
    profit,
    profitMargin,
    materialCosts: costResult.materialCosts
  };
}

/**
 * 제품별 수익성 통계 조회
 */
export async function getProfitabilityByProduct(filters?: {
  startDate?: Date;
  endDate?: Date;
  tenantId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hBatches, hProductsV2 } = await import("../../../drizzle/schema.js");
  const { and, gte, lte, eq, sql, isNotNull } = await import("drizzle-orm");

  const conditions: any[] = [isNotNull(hBatches.revenue)];
  if (filters?.tenantId) {
    conditions.push(eq(hBatches.tenantId, filters.tenantId));
  }
  if (filters?.startDate) {
    conditions.push(gte(hBatches.plannedDate, filters.startDate));
  }
  if (filters?.endDate) {
    conditions.push(lte(hBatches.plannedDate, filters.endDate));
  }

  const stats = await db
    .select({
      productId: hBatches.productId,
      productName: hProductsV2.productName,
      batchCount: sql<number>`COUNT(*)`,
      totalRevenue: sql<number>`SUM(${hBatches.revenue})`,
      avgRevenue: sql<number>`AVG(${hBatches.revenue})`
    })
    .from(hBatches)
    .leftJoin(hProductsV2, eq(hBatches.productId, hProductsV2.id))
    .where(and(...conditions))
    .groupBy(hBatches.productId, hProductsV2.productName)
    .orderBy(sql`SUM(${hBatches.revenue}) DESC`);

  // 각 제품의 평균 비용 계산
  const result = [];
  for (const stat of stats) {
    // 해당 제품의 모든 배치 비용 조회
    const batchConditions: any[] = [
      eq(hBatches.productId, stat.productId),
      isNotNull(hBatches.revenue),
    ];
    if (filters?.tenantId) {
      batchConditions.push(eq(hBatches.tenantId, filters.tenantId));
    }
    if (filters?.startDate) {
      batchConditions.push(gte(hBatches.plannedDate, filters.startDate));
    }
    if (filters?.endDate) {
      batchConditions.push(lte(hBatches.plannedDate, filters.endDate));
    }

    const batches = await db
      .select({ id: hBatches.id })
      .from(hBatches)
      .where(and(...batchConditions));

    let totalCost = 0;
    for (const batch of batches) {
      const costResult = await getBatchCost(batch.id);
      if (costResult) {
        totalCost += costResult.totalCost;
      }
    }

    const avgCost = batches.length > 0 ? totalCost / batches.length : 0;
    const totalProfit = stat.totalRevenue - totalCost;
    const avgProfit = stat.avgRevenue - avgCost;
    const profitMargin = stat.avgRevenue > 0 ? (avgProfit / stat.avgRevenue) * 100 : 0;

    result.push({
      productId: stat.productId,
      productName: stat.productName,
      batchCount: stat.batchCount,
      totalRevenue: stat.totalRevenue,
      avgRevenue: stat.avgRevenue,
      avgCost,
      avgProfit,
      profitMargin,
      totalProfit
    });
  }

  return result;
}

/**
 * 배치 매출액 업데이트
 */
export async function updateBatchRevenue(batchId: number, revenue: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hBatches } = await import("../../../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");

  await db
    .update(hBatches)
    .set({ revenue: revenue.toString() })
    .where(eq(hBatches.id, batchId));

  return true;
}


/**
 * 원재료별 원가 비중 집계
 */
export async function getMaterialCostBreakdown(params: {
  siteId: number;
  startDate?: Date;
  endDate?: Date;
  productId?: number;
  status?: string;
}) {
  const { siteId, startDate, endDate, productId, status } = params;

  // 배치 필터 조건 구성
  const batchConditions = [eq(hBatches.siteId, siteId)];

  if (startDate) {
    batchConditions.push(gte(hBatches.plannedDate, startDate));
  }

  if (endDate) {
    batchConditions.push(lte(hBatches.plannedDate, endDate));
  }

  if (productId) {
    batchConditions.push(eq(hBatches.productId, productId));
  }

  if (status) {
    batchConditions.push(eq(hBatches.status, status as any));
  }

  // 배치 목록 조회
  const db = await getDb();
  if (!db) {
    throw new Error("데이터베이스 연결에 실패했습니다.");
  }

  const batches = await db
    .select({ id: hBatches.id })
    .from(hBatches)
    .where(and(...batchConditions));

  if (batches.length === 0) {
    return [];
  }

  const batchIds = batches.map((b: any) => b.id);

  // 원재료별 원가 집계 (정제수 제외)
  const result = await db
    .select({
      materialId: hBatchInputs.materialId,
      materialName: hMaterials.materialName,
      totalCost: sql<number>`SUM(${hBatchInputs.totalPrice})`.as('total_cost'),
      count: sql<number>`COUNT(*)`.as('count')
    })
    .from(hBatchInputs)
    .innerJoin(hMaterials, eq(hBatchInputs.materialId, hMaterials.id))
    .where(and(
      sql`${hBatchInputs.batchId} IN (${sql.join(batchIds.map((id: any) => sql`${id}`), sql`, `)})`,
      sql`${hMaterials.materialName} NOT LIKE '%정제수%'`
    ))
    .groupBy(hBatchInputs.materialId, hMaterials.materialName)
    .orderBy(desc(sql`SUM(${hBatchInputs.totalPrice})`));

  return result;
}

// ═══════════════════════════════════════════════════════════════
// 원재료 단가 관리 및 이력
// ═══════════════════════════════════════════════════════════════

/** 원재료 단가 업데이트 (이전 단가 → 이력 자동 저장) */
async function updateMaterialPrice(id: number, unitPrice: number, changedBy?: number, reason?: string, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hMaterials, hMaterialPriceHistory } = await import("../../../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");

  // 기존 단가 조회
  const [material] = await db
    .select({ unitPrice: hMaterials.unitPrice })
    .from(hMaterials)
    .where(eq(hMaterials.id, id));

  const oldPrice = material?.unitPrice ? parseFloat(material.unitPrice) : null;

  // 단가 업데이트
  await db
    .update(hMaterials)
    .set({ unitPrice: unitPrice.toString() })
    .where(eq(hMaterials.id, id));

  // 이력 저장
  await db.insert(hMaterialPriceHistory).values({
    materialId: id,
    oldPrice: oldPrice?.toString(),
    newPrice: unitPrice.toString(),
    changedBy: changedBy || null,
    reason: reason || null
  });

  return { success: true };
}

// ═══════════════════════════════════════════════════════════════
// 수익률 추이 (월별/분기별)
// ═══════════════════════════════════════════════════════════════

/** 월별 수익률 추이 조회 */
