// ═══════════════════════════════════════════════════════════════
// costAnalysis.ts - 원가 분석 DB 함수
// 배치 원가, 수익성, 재고 회전율, 단가 이력,
// 수익성 예측(지수 평활법), 재고 소진 예측, 발주 알림
// ═══════════════════════════════════════════════════════════════
import { getDb } from "./connection";
import { eq, and, or, lte, gte, gt, desc, asc, sql, lt, inArray, count, isNotNull, sum } from "drizzle-orm";
import { toKSTDate, todayKST } from "../utils/timezone";

import {
  hBatches,
  hBatchInputs,
  hMaterials,
  hInventoryLots,
  hInventoryTransactions,
  hProductsV2,
  hMaterialPriceHistory,
} from "../../drizzle/schema";

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
export async function getBatchCost(batchId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hBatchInputs, hMaterials } = await import("../../drizzle/schema.js");
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
export async function getBatchCostSummary(batchIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hBatchInputs, hMaterials } = await import("../../drizzle/schema.js");
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
export async function getBatchProfitability(batchId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hBatches } = await import("../../drizzle/schema.js");
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

  const { hBatches, hProductsV2 } = await import("../../drizzle/schema.js");
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
export async function updateBatchRevenue(batchId: number, revenue: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hBatches } = await import("../../drizzle/schema.js");
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

  const { hMaterials, hMaterialPriceHistory } = await import("../../drizzle/schema.js");
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
export async function getProfitabilityTrendByMonth(startDate?: Date, endDate?: Date, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hBatches, hBatchInputs, hMaterials } = await import("../../drizzle/schema.js");
  const { sql, gte, lte, and, isNotNull, eq } = await import("drizzle-orm");

  let conditions: any[] = [isNotNull(hBatches.revenue)];
  if (tenantId) {
    conditions.push(eq(hBatches.tenantId, tenantId));
  }
  if (startDate) {
    conditions.push(gte(hBatches.plannedDate, startDate));
  }
  if (endDate) {
    conditions.push(lte(hBatches.plannedDate, endDate));
  }

  // 월별 매출 및 비용 집계
  const monthlyTrend = await db
    .select({
      month: sql<string>`DATE_FORMAT(${hBatches.plannedDate}, '%Y-%m')`,
      totalRevenue: sql<number>`SUM(CAST(${hBatches.revenue} AS DECIMAL(15,2)))`,
      totalCost: sql<number>`
        COALESCE(SUM(
          (SELECT SUM(CAST(bi.quantity AS DECIMAL(15,2)) * CAST(m.unit_price AS DECIMAL(15,2)))
           FROM h_batch_inputs bi
           JOIN h_materials m ON bi.material_id = m.id
           WHERE bi.batch_id = ${hBatches.id})
        ), 0)
      `,
      batchCount: sql<number>`COUNT(*)`
    })
    .from(hBatches)
    .where(and(...conditions))
    .groupBy(sql`DATE_FORMAT(${hBatches.plannedDate}, '%Y-%m')`)
    .orderBy(sql`DATE_FORMAT(${hBatches.plannedDate}, '%Y-%m')`);

  // 이익률 계산
  const result = monthlyTrend.map(row => ({
    ...row,
    profitMargin: row.totalRevenue > 0
      ? ((row.totalRevenue - row.totalCost) / row.totalRevenue) * 100
      : 0
  }));

  return result;
}

// 분기별 수익률 추이 조회
export async function getProfitabilityTrendByQuarter(startDate?: Date, endDate?: Date, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hBatches, hBatchInputs, hMaterials } = await import("../../drizzle/schema.js");
  const { sql, gte, lte, and, isNotNull, eq } = await import("drizzle-orm");

  let conditions: any[] = [isNotNull(hBatches.revenue)];
  if (tenantId) {
    conditions.push(eq(hBatches.tenantId, tenantId));
  }
  if (startDate) {
    conditions.push(gte(hBatches.plannedDate, startDate));
  }
  if (endDate) {
    conditions.push(lte(hBatches.plannedDate, endDate));
  }

  // 분기별 매출 및 비용 집계
  const quarterlyTrend = await db
    .select({
      quarter: sql<string>`CONCAT(YEAR(${hBatches.plannedDate}), '-Q', QUARTER(${hBatches.plannedDate}))`,
      totalRevenue: sql<number>`SUM(CAST(${hBatches.revenue} AS DECIMAL(15,2)))`,
      totalCost: sql<number>`
        COALESCE(SUM(
          (SELECT SUM(CAST(bi.quantity AS DECIMAL(15,2)) * CAST(m.unit_price AS DECIMAL(15,2)))
           FROM h_batch_inputs bi
           JOIN h_materials m ON bi.material_id = m.id
           WHERE bi.batch_id = ${hBatches.id})
        ), 0)
      `,
      batchCount: sql<number>`COUNT(*)`
    })
    .from(hBatches)
    .where(and(...conditions))
    .groupBy(sql`CONCAT(YEAR(${hBatches.plannedDate}), '-Q', QUARTER(${hBatches.plannedDate}))`)
    .orderBy(sql`CONCAT(YEAR(${hBatches.plannedDate}), '-Q', QUARTER(${hBatches.plannedDate}))`);

  // 이익률 계산
  const result = quarterlyTrend.map(row => ({
    ...row,
    profitMargin: row.totalRevenue > 0
      ? ((row.totalRevenue - row.totalCost) / row.totalRevenue) * 100
      : 0
  }));

  return result;
}

/** 원재료 단가 이력 조회 */
export async function getMaterialPriceHistory(materialId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hMaterialPriceHistory } = await import("../../drizzle/schema.js");
  const { eq, desc } = await import("drizzle-orm");

  const history = await db
    .select()
    .from(hMaterialPriceHistory)
    .where(eq(hMaterialPriceHistory.materialId, materialId))
    .orderBy(desc(hMaterialPriceHistory.changedAt));

  return history;
}

// ═══════════════════════════════════════════════════════════════
// 배치별 원가 분석 (기간 내 완료 배치 비용 집계)
// ═══════════════════════════════════════════════════════════════

/** 배치별 원가 분석 (완료된 배치의 원재료 비용 + 생산시간 + 단위원가) */
export async function getBatchCostAnalysis(params: {
  startDate?: string;
  endDate?: string;
  siteId?: number;
  productId?: number;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 기본값 설정 (최근 30일)
  const endDate = params.endDate || todayKST();
  const startDate = params.startDate || toKSTDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

  // 1. 기간 내 완료된 배치 조회
  const conditions = [
    sql`${hBatches.startTime} >= ${startDate}`,
    sql`${hBatches.endTime} <= ${endDate}`,
    eq(hBatches.status, "completed")
  ];
  if (params.tenantId) {
    conditions.push(eq(hBatches.tenantId, params.tenantId));
  }
  const batches = await db
    .select({
      id: hBatches.id,
      batchCode: hBatches.batchCode,
      productId: hBatches.productId,
      productName: hProductsV2.productName,
      plannedQuantity: hBatches.plannedQuantity,
      actualQuantity: hBatches.actualQuantity,
      startTime: hBatches.startTime,
      endTime: hBatches.endTime,
      plannedCost: hBatches.plannedCost,
      actualCost: hBatches.actualCost
    })
    .from(hBatches)
    .leftJoin(hProductsV2, eq(hBatches.productId, hProductsV2.id))
    .where(and(...conditions))
    .orderBy(hBatches.startTime);

  // 2. 각 배치별 원재료 비용 계산
  const batchCosts = await Promise.all(
    batches.map(async (batch: any) => {
      // 배치에 사용된 원재료 거래 내역 조회 (referenceType = 'batch', referenceId = batchId)
      const transactions = await db
        .select({
          quantity: hInventoryTransactions.quantity,
          materialId: hInventoryLots.materialId
        })
        .from(hInventoryTransactions)
        .leftJoin(hInventoryLots, eq(hInventoryTransactions.lotId, hInventoryLots.id))
        .where(
          and(
            eq(hInventoryTransactions.referenceType, "batch"),
            eq(hInventoryTransactions.referenceId, batch.id),
            eq(hInventoryTransactions.transactionType, "usage")
          )
        );

      // 원가 계산 (간소화: 수량만 합산)
      const totalQuantity = transactions.reduce(
        (sum: number, t: any) => sum + Math.abs(Number(t.quantity) || 0),
        0
      );

      // TODO: 실제 원가 계산은 원재료 단가 정보가 필요함
      const materialCost = totalQuantity * 100; // 임시 단가 100원 사용

      // 생산 시간 계산 (시간 단위)
      const productionTime = batch.startTime && batch.endTime
        ? (new Date(batch.endTime).getTime() - new Date(batch.startTime).getTime()) / (1000 * 60 * 60)
        : 0;

      // 단위당 원가 계산
      const unitCost = batch.actualQuantity > 0
        ? materialCost / batch.actualQuantity
        : 0;

      return {
        batchId: batch.id,
        batchCode: batch.batchCode,
    dayBatchGroup: batch.dayBatchGroup || null,
    batchOrder: batch.batchOrder ?? null,
        productName: batch.productName,
        plannedQuantity: batch.plannedQuantity,
        actualQuantity: batch.actualQuantity,
        plannedCost: Number(batch.plannedCost || 0),
        actualCost: Number(batch.actualCost || 0),
        materialCost: Number(materialCost.toFixed(2)),
        unitCost: Number(unitCost.toFixed(2)),
        productionTime: Number(productionTime.toFixed(2))
      };
    })
  );

  return batchCosts;
}

// ═══════════════════════════════════════════════════════════════
// 원재료 거래 이력 및 재고 회전율
// ═══════════════════════════════════════════════════════════════

/** 원재료 입출고 거래 이력 조회 */
export async function getMaterialTransactionHistory(materialId: number, filters?: {
  startDate?: Date;
  endDate?: Date;
  tenantId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  
  const { hMaterialReceivings, hBatchInputs, hMaterials } = await import("../../drizzle/schema.js");
  const { and, gte, lte, eq, sql } = await import("drizzle-orm");
  
  // 입고 이력 (Material Receivings)
  const conditions = [eq(hMaterialReceivings.materialId, materialId)];
  if (filters?.startDate) {
    conditions.push(gte(hMaterialReceivings.createdAt, filters.startDate));
  }
  if (filters?.endDate) {
    conditions.push(lte(hMaterialReceivings.createdAt, filters.endDate));
  }
  
  const inboundHistory = await db
    .select({
      date: hMaterialReceivings.createdAt,
      type: sql<string>`'inbound'`,
      quantity: sql<number>`CAST(${hMaterialReceivings.quantity} AS DECIMAL(10,2))`,
      lotNumber: hMaterialReceivings.lotNumber
    })
    .from(hMaterialReceivings)
    .where(and(...conditions));
  
  // 출고 이력 (배치 투입)
  const outboundConditions = [eq(hBatchInputs.materialId, materialId)];
  if (filters?.startDate) {
    outboundConditions.push(gte(hBatchInputs.createdAt, filters.startDate));
  }
  if (filters?.endDate) {
    outboundConditions.push(lte(hBatchInputs.createdAt, filters.endDate));
  }
  
  const outboundHistory = await db
    .select({
      date: hBatchInputs.createdAt,
      type: sql<string>`'outbound'`,
      quantity: sql<number>`CAST(${hBatchInputs.actualQuantity} AS DECIMAL(10,2))`,
      batchId: hBatchInputs.batchId
    })
    .from(hBatchInputs)
    .where(and(...outboundConditions));
  
  return {
    inbound: inboundHistory,
    outbound: outboundHistory
  };
}

/**
 * 재고 회전율 계산
 */
export async function getInventoryTurnoverRate(filters?: {
  startDate?: Date;
  endDate?: Date;
  tenantId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  
  const { hMaterials, hMaterialReceivings, hBatchInputs } = await import("../../drizzle/schema.js");
  const { and, gte, lte, eq, sql } = await import("drizzle-orm");
  
  // 모든 원재료 조회
  const materials = await db.select().from(hMaterials);
  
  const result = [];
  for (const material of materials) {
    // 기간 내 입고량
    const inboundConditions = [eq(hMaterialReceivings.materialId, material.id)];
    if (filters?.startDate) {
      inboundConditions.push(gte(hMaterialReceivings.createdAt, filters.startDate));
    }
    if (filters?.endDate) {
      inboundConditions.push(lte(hMaterialReceivings.createdAt, filters.endDate));
    }
    
    const inboundResult = await db
      .select({
        totalInbound: sql<number>`COALESCE(SUM(CAST(quantity AS DECIMAL(10,2))), 0)`
      })
      .from(hMaterialReceivings)
      .where(and(...inboundConditions));
    
    // 기간 내 출고량
    const outboundConditions = [eq(hBatchInputs.materialId, material.id)];
    if (filters?.startDate) {
      outboundConditions.push(gte(hBatchInputs.createdAt, filters.startDate));
    }
    if (filters?.endDate) {
      outboundConditions.push(lte(hBatchInputs.createdAt, filters.endDate));
    }
    
    const outboundResult = await db
      .select({
        totalOutbound: sql<number>`COALESCE(SUM(CAST(actual_quantity AS DECIMAL(10,2))), 0)`
      })
      .from(hBatchInputs)
      .where(and(...outboundConditions));
    
    // 현재 재고량 (총 입고 - 총 출고)
    const totalInboundAll = await db
      .select({
        total: sql<number>`COALESCE(SUM(CAST(quantity AS DECIMAL(10,2))), 0)`
      })
      .from(hMaterialReceivings)
      .where(eq(hMaterialReceivings.materialId, material.id));
    
    const totalOutboundAll = await db
      .select({
        total: sql<number>`COALESCE(SUM(CAST(actual_quantity AS DECIMAL(10,2))), 0)`
      })
      .from(hBatchInputs)
      .where(eq(hBatchInputs.materialId, material.id));
    
    const totalInbound = inboundResult[0]?.totalInbound || 0;
    const totalOutbound = outboundResult[0]?.totalOutbound || 0;
    const currentStock = (totalInboundAll[0]?.total || 0) - (totalOutboundAll[0]?.total || 0);
    
    // 평균 재고 = (기초 재고 + 기말 재고) / 2
    // 기초 재고 = 현재 재고 + 출고량 - 입고량
    const beginningStock = currentStock + totalOutbound - totalInbound;
    const avgStock = (beginningStock + currentStock) / 2;
    
    // 회전율 = 출고량 / 평균 재고
    const turnoverRate = avgStock > 0 ? totalOutbound / avgStock : 0;
    
    // 회전 일수 = 기간 일수 / 회전율
    const periodDays = filters?.startDate && filters?.endDate
      ? Math.ceil((filters.endDate.getTime() - filters.startDate.getTime()) / (1000 * 60 * 60 * 24))
      : 365;
    const turnoverDays = turnoverRate > 0 ? periodDays / turnoverRate : 0;
    
    result.push({
      materialId: material.id,
      materialName: material.materialName,
      currentStock: parseFloat(currentStock.toString()),
      totalInbound: parseFloat(totalInbound.toString()),
      totalOutbound: parseFloat(totalOutbound.toString()),
      avgStock: parseFloat(avgStock.toFixed(1)),
      turnoverRate: parseFloat(turnoverRate.toFixed(2)),
      turnoverDays: parseFloat(turnoverDays.toFixed(1))
    });
  }
  
  return result.sort((a, b) => b.turnoverRate - a.turnoverRate);
}

/**
 * 장기 재고 항목 식별
 */
export async function getSlowMovingItems(thresholdDays: number = 90, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  
  const { hMaterialReceivings, hMaterials } = await import("../../drizzle/schema.js");
  const { eq, sql, and, gt } = await import("drizzle-orm");
  
  // 현재 날짜 기준으로 thresholdDays 이상 경과한 입고 조회
  const slowMovingItems = await db
    .select({
      lotId: hMaterialReceivings.id,
      lotNumber: hMaterialReceivings.lotNumber,
      materialId: hMaterialReceivings.materialId,
      materialName: hMaterials.materialName,
      currentQuantity: sql<number>`CAST(${hMaterialReceivings.quantity} AS DECIMAL(10,2))`,
      createdAt: hMaterialReceivings.createdAt,
      daysSinceCreation: sql<number>`DATEDIFF(NOW(), ${hMaterialReceivings.createdAt})`
    })
    .from(hMaterialReceivings)
    .leftJoin(hMaterials, eq(hMaterialReceivings.materialId, hMaterials.id))
    .where(
      and(
        sql`CAST(${hMaterialReceivings.quantity} AS DECIMAL(10,2)) > 0`,
        sql`DATEDIFF(NOW(), ${hMaterialReceivings.createdAt}) >= ${thresholdDays}`
      )
    )
    .orderBy(sql`DATEDIFF(NOW(), ${hMaterialReceivings.createdAt}) DESC`);
  
  return slowMovingItems;
}

// 재고 회전율 임계값 설정
export async function setInventoryTurnoverThreshold(materialId: number, thresholdRate: number, alertEnabled: boolean) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hInventoryTurnoverSettings } = await import("../../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");
  
  // 기존 설정 확인
  const [existing] = await db
    .select()
    .from(hInventoryTurnoverSettings)
    .where(eq(hInventoryTurnoverSettings.materialId, materialId));
  
  if (existing) {
    // 업데이트
    await db
      .update(hInventoryTurnoverSettings)
      .set({ 
        thresholdRate: thresholdRate.toString(),
        alertEnabled: alertEnabled ? 1 : 0
      })
      .where(eq(hInventoryTurnoverSettings.materialId, materialId));
  } else {
    // 신규 생성
    await db.insert(hInventoryTurnoverSettings).values({
      materialId,
      thresholdRate: thresholdRate.toString(),
      alertEnabled: alertEnabled ? 1 : 0
    });
  }
  
  return { success: true };
}

// 재고 회전율 임계값 조회
export async function getInventoryTurnoverSettings(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  
  const { hInventoryTurnoverSettings, hMaterials } = await import("../../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");
  
  const settings = await db
    .select({
      id: hInventoryTurnoverSettings.id,
      materialId: hInventoryTurnoverSettings.materialId,
      materialName: hMaterials.materialName,
      thresholdRate: hInventoryTurnoverSettings.thresholdRate,
      alertEnabled: hInventoryTurnoverSettings.alertEnabled
    })
    .from(hInventoryTurnoverSettings)
    .leftJoin(hMaterials, eq(hInventoryTurnoverSettings.materialId, hMaterials.id));
  
  return settings;
}

// ═══════════════════════════════════════════════════════════════
// 수익성 예측 (지수 평활법 + 트렌드)
// ═══════════════════════════════════════════════════════════════

/**
 * 지수 평활법 (Exponential Smoothing) 계산
 * @param data 과거 데이터 배열
 * @param alpha 평활 계수 (0~1, 기본값 0.3)
 * @returns 예측값
 */
function exponentialSmoothing(data: number[], alpha: number = 0.3): number {
  if (data.length === 0) return 0;
  if (data.length === 1) return data[0];
  
  let smoothed = data[0];
  for (let i = 1; i < data.length; i++) {
    smoothed = alpha * data[i] + (1 - alpha) * smoothed;
  }
  
  return smoothed;
}

/**
 * 트렌드 계산 (선형 회귀)
 * @param data 과거 데이터 배열
 * @returns 트렌드 기울기
 */
function calculateTrend(data: number[]): number {
  if (data.length < 2) return 0;
  
  const n = data.length;
  const sumX = (n * (n - 1)) / 2; // 0 + 1 + 2 + ... + (n-1)
  const sumY = data.reduce((sum, val) => sum + val, 0);
  const sumXY = data.reduce((sum, val, idx) => sum + idx * val, 0);
  const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6; // 0^2 + 1^2 + 2^2 + ... + (n-1)^2
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  return slope;
}

// 배치 수익성 예측 (지수 평활법 + 트렌드 기반)
export async function getProfitabilityForecast(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { and: drizzleAnd, eq: drizzleEq } = await import("drizzle-orm");

  // 과거 3개월 데이터 조회
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  const conditions: any[] = [
    sql`${hBatches.plannedDate} >= ${formatLocalDate(threeMonthsAgo)}`
  ];
  if (tenantId) {
    conditions.push(drizzleEq(hBatches.tenantId, tenantId));
  }

  const batches = await db
    .select()
    .from(hBatches)
    .where(drizzleAnd(...conditions))
    .orderBy(hBatches.plannedDate);
  
  if (batches.length === 0) {
    return { forecast: null, historicalData: [] };
  }
  
  // 월별 수익률 계산
  const monthlyData: { [key: string]: { totalRevenue: number; totalCost: number; count: number } } = {};
  
  for (const batch of batches) {
    const month = batch.plannedDate.toISOString().substring(0, 7); // YYYY-MM
    const revenue = batch.revenue ? parseFloat(batch.revenue) : 0;
    
    // 배치 비용 계산
    const inputs = await db
      .select({
        quantity: sql<string>`CAST(${hBatchInputs.actualQuantity} AS CHAR)`,
        unitPrice: hMaterials.unitPrice
      })
      .from(hBatchInputs)
      .leftJoin(hMaterials, eq(hBatchInputs.materialId, hMaterials.id))
      .where(eq(hBatchInputs.batchId, batch.id));
    
    const cost = inputs.reduce((sum, input) => {
      const qty = parseFloat(input.quantity || "0");
      const price = input.unitPrice ? parseFloat(input.unitPrice) : 0;
      return sum + (qty * price);
    }, 0);
    
    if (!monthlyData[month]) {
      monthlyData[month] = { totalRevenue: 0, totalCost: 0, count: 0 };
    }
    
    monthlyData[month].totalRevenue += revenue;
    monthlyData[month].totalCost += cost;
    monthlyData[month].count += 1;
  }
  
  // 월별 수익률 계산
  const historicalData = Object.entries(monthlyData).map(([month, data]) => {
    const profitMargin = data.totalCost > 0
      ? ((data.totalRevenue - data.totalCost) / data.totalRevenue) * 100
      : 0;
    return {
      month,
      totalRevenue: data.totalRevenue,
      totalCost: data.totalCost,
      profitMargin: Math.round(profitMargin * 100) / 100,
      batchCount: data.count
    };
  });
  
  // 지수 평활법 + 트렌드 기반 예측
  const revenueData = historicalData.map(d => d.totalRevenue);
  const costData = historicalData.map(d => d.totalCost);
  const profitMarginData = historicalData.map(d => d.profitMargin);
  
  // 지수 평활법 적용 (alpha = 0.3)
  const smoothedRevenue = exponentialSmoothing(revenueData, 0.3);
  const smoothedCost = exponentialSmoothing(costData, 0.3);
  const smoothedProfitMargin = exponentialSmoothing(profitMarginData, 0.3);
  
  // 트렌드 계산
  const revenueTrend = calculateTrend(revenueData);
  const costTrend = calculateTrend(costData);
  const profitMarginTrend = calculateTrend(profitMarginData);
  
  // 예측값 = 평활값 + 트렌드
  const predictedRevenue = smoothedRevenue + revenueTrend;
  const predictedCost = smoothedCost + costTrend;
  const predictedProfitMargin = smoothedProfitMargin + profitMarginTrend;
  
  // 다음 달 예측
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const forecastMonth = nextMonth.toISOString().substring(0, 7);
  
  return {
    forecast: {
      month: forecastMonth,
      predictedRevenue: Math.round(predictedRevenue),
      predictedCost: Math.round(predictedCost),
      predictedProfitMargin: Math.round(predictedProfitMargin * 100) / 100
    },
    historicalData
  };
}

// 재고 회전율 임계값 기반 자동 알림 생성
export async function checkAndCreateTurnoverAlerts(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  
  const { hInventoryTurnoverSettings, hMaterials, hNotifications } = await import("../../drizzle/schema.js");
  const { eq, and, sql } = await import("drizzle-orm");
  
  // alertEnabled가 활성화된 설정만 조회
  const settings = await db
    .select({
      materialId: hInventoryTurnoverSettings.materialId,
      materialName: hMaterials.materialName,
      thresholdRate: hInventoryTurnoverSettings.thresholdRate
    })
    .from(hInventoryTurnoverSettings)
    .leftJoin(hMaterials, eq(hInventoryTurnoverSettings.materialId, hMaterials.id))
    .where(eq(hInventoryTurnoverSettings.alertEnabled, 1));
  
  const alertsCreated: Array<{ materialId: number; materialName: string; turnoverRate: number; threshold: number }> = [];
  
  for (const setting of settings) {
    if (!setting.materialId || !setting.thresholdRate) continue;
    
    const threshold = parseFloat(setting.thresholdRate);
    
    // 해당 원재료의 회전율 계산
    const turnoverDataList = await getInventoryTurnoverRate();
    const turnoverData = turnoverDataList.find(item => item.materialId === setting.materialId);
    
    if (!turnoverData || turnoverData.turnoverRate === null) continue;
    
    // 회전율이 임계값보다 낮으면 (장기 재고) 알림 생성
    if (turnoverData.turnoverRate < threshold) {
      // 중복 알림 방지: 최근 24시간 이내에 동일한 원재료에 대한 알림이 있는지 확인
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);
      
      const [recentAlert] = await db
        .select()
        .from(hNotifications)
        .where(
          and(
            eq(hNotifications.notificationType, "inventory_turnover"),
            sql`${hNotifications.message} LIKE ${`%${setting.materialName}%`}`,
            sql`${hNotifications.createdAt} >= ${formatLocalDate(oneDayAgo)}`
          )
        );
      
      if (!recentAlert) {
        // 알림 생성
        await db.insert(hNotifications).values({
          userId: 1, // 시스템 알림 (관리자에게 전송)
          notificationType: "inventory_turnover",
          title: "재고 회전율 임계값 경고",
          message: `원재료 "${setting.materialName}"의 회전율(${turnoverData.turnoverRate.toFixed(1)}회)이 임계값(${threshold}회)보다 낮습니다. 장기 재고 관리가 필요합니다.`,
          referenceType: "material",
          referenceId: setting.materialId,
          priority: "high",
          actionUrl: `/materials?materialId=${setting.materialId}`,
          isRead: 0
        } as any);
        
        alertsCreated.push({
          materialId: setting.materialId,
          materialName: setting.materialName || "알 수 없음",
          turnoverRate: turnoverData.turnoverRate,
          threshold
        });
      }
    }
  }
  
  return {
    success: true,
    alertsCreated: alertsCreated.length,
    details: alertsCreated
  };
}

// 배치 수익성 예측값 저장
export async function saveProfitabilityForecast(data: {
  targetMonth: string;
  predictedRevenue: number;
  predictedCost: number;
  predictedProfitMargin: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  
  const { hProfitabilityForecasts } = await import("../../drizzle/schema.js");
  
  await db.insert(hProfitabilityForecasts).values({
    forecastDate: new Date(),
    targetMonth: data.targetMonth,
    predictedRevenue: data.predictedRevenue.toString(),
    predictedCost: data.predictedCost.toString(),
    predictedProfitMargin: data.predictedProfitMargin.toString()
  } as any);
  
  return { success: true };
}

// 과거 예측값 조회 (실제값과 비교)
export async function getProfitabilityForecastHistory(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hProfitabilityForecasts } = await import("../../drizzle/schema.js");
  const { desc, eq: drizzleEq } = await import("drizzle-orm");

  let query = db
    .select()
    .from(hProfitabilityForecasts);

  if (tenantId) {
    query = query.where(drizzleEq(hProfitabilityForecasts.tenantId, tenantId)) as any;
  }

  const forecasts = await query
    .orderBy(desc(hProfitabilityForecasts.targetMonth))
    .limit(12); // 최근 12개월
  
  return forecasts.map(f => ({
    targetMonth: f.targetMonth,
    predictedRevenue: parseFloat(f.predictedRevenue),
    predictedCost: parseFloat(f.predictedCost),
    predictedProfitMargin: parseFloat(f.predictedProfitMargin),
    actualRevenue: f.actualRevenue ? parseFloat(f.actualRevenue) : null,
    actualCost: f.actualCost ? parseFloat(f.actualCost) : null,
    actualProfitMargin: f.actualProfitMargin ? parseFloat(f.actualProfitMargin) : null,
    forecastDate: f.forecastDate
  }));
}

// 실제값 업데이트 (월 마감 후)
export async function updateActualProfitability(data: {
  targetMonth: string;
  actualRevenue: number;
  actualCost: number;
  actualProfitMargin: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  
  const { hProfitabilityForecasts } = await import("../../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");
  
  await db
    .update(hProfitabilityForecasts)
    .set({
      actualRevenue: data.actualRevenue.toString(),
      actualCost: data.actualCost.toString(),
      actualProfitMargin: data.actualProfitMargin.toString()
    })
    .where(eq(hProfitabilityForecasts.targetMonth, data.targetMonth));
  
  return { success: true };
}

// ═══════════════════════════════════════════════════════════════
// 재고 소진 예측 및 발주 알림
// ═══════════════════════════════════════════════════════════════

/**
 * 재고 소비 패턴 분석 (과거 30일 기준)
 */
export async function getInventoryConsumptionPattern(materialId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  
  const { sql } = await import("drizzle-orm");
  
  // 과거 30일간의 재고 변화 데이터 조회
  const consumptionData = await db.execute(sql`
    SELECT 
      DATE(created_at) as date,
      SUM(CASE WHEN transaction_type = 'outbound' THEN ABS(quantity) ELSE 0 END) as dailyConsumption
    FROM h_inventory_transactions
    WHERE lot_id IN (SELECT id FROM h_inventory_lots WHERE material_id = ${materialId})
      AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    GROUP BY DATE(created_at)
    ORDER BY date DESC
  `);
  
  const consumptions = consumptionData.map((row: any) => Number(row.dailyConsumption || 0));
  
  if (consumptions.length === 0) {
    return { averageDailyConsumption: 0, trend: 0 };
  }
  
  // 평균 일일 소비량 계산
  const averageDailyConsumption = consumptions.reduce((a, b) => a + b, 0) / consumptions.length;
  
  // 트렌드 계산 (최근 7일 vs 이전 23일)
  const recent7Days = consumptions.slice(0, 7);
  const previous23Days = consumptions.slice(7);
  
  const recent7DaysAvg = recent7Days.length > 0 
    ? recent7Days.reduce((a, b) => a + b, 0) / recent7Days.length 
    : 0;
  const previous23DaysAvg = previous23Days.length > 0 
    ? previous23Days.reduce((a, b) => a + b, 0) / previous23Days.length 
    : 0;
  
  const trend = previous23DaysAvg > 0 
    ? ((recent7DaysAvg - previous23DaysAvg) / previous23DaysAvg) * 100 
    : 0;
  
  return { averageDailyConsumption, trend };
}

/**
 * 재고 소진 예측
 */
export async function predictInventoryDepletion(materialId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  
  const { sql } = await import("drizzle-orm");
  
  // 현재 재고 수량 조회
  const currentStockRaw = await db.execute(sql`
    SELECT 
      COALESCE(inv.available_quantity, 0) as currentStock,
      COALESCE(mat.safety_stock_level, 0) as safetyStock,
      COALESCE(inv.reorder_point, inv.min_stock_level, 0) as reorderPoint
    FROM h_materials mat
    LEFT JOIN h_inventory inv ON inv.material_id = mat.id
    WHERE mat.id = ${materialId}
    LIMIT 1
  `);
  
  if ((currentStockRaw as any[]).length === 0) {
    throw new Error("Material not found");
  }
  
  const row = currentStockRaw[0] as any;
  const currentStock = Number(row.currentStock || 0);
  const safetyStock = Number(row.safetyStock || 0);
  const reorderPoint = Number(row.reorderPoint || 0);
  
  // 소비 패턴 분석
  const { averageDailyConsumption, trend } = await getInventoryConsumptionPattern(materialId);
  
  if (averageDailyConsumption === 0) {
    return {
      currentStock,
      safetyStock,
      reorderPoint,
      averageDailyConsumption: 0,
      predictedDepletionDays: null,
      shouldReorder: false,
      urgencyLevel: "normal"
    };
  }
  
  // 트렌드를 반영한 예상 일일 소비량 계산
  const adjustedDailyConsumption = averageDailyConsumption * (1 + trend / 100);
  
  // 예상 소진 일수 계산
  const predictedDepletionDays = Math.floor(currentStock / adjustedDailyConsumption);
  
  // 발주 필요 여부 판단
  const shouldReorder = currentStock <= reorderPoint;
  
  // 긴급도 판단
  let urgencyLevel = "normal";
  if (currentStock <= safetyStock) {
    urgencyLevel = "urgent";
  } else if (currentStock <= reorderPoint) {
    urgencyLevel = "high";
  } else if (predictedDepletionDays <= 7) {
    urgencyLevel = "medium";
  }
  
  return {
    currentStock,
    safetyStock,
    reorderPoint,
    averageDailyConsumption: adjustedDailyConsumption,
    predictedDepletionDays,
    shouldReorder,
    urgencyLevel
  };
}

/**
 * 재고 예측 기반 자동 발주 알림 생성
 */
export async function checkAndCreateReorderAlerts() {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  
  const { sql } = await import("drizzle-orm");
  
  // 모든 원재료 조회
  const materialsRaw = await db.execute(sql`
    SELECT id, material_name
    FROM h_materials
    WHERE is_active = 1
  `);
  // db.execute returns [rows, fields] in mysql2 - extract rows
  const materials = Array.isArray(materialsRaw) && Array.isArray(materialsRaw[0]) ? materialsRaw[0] : materialsRaw;
  
  let alertCount = 0;
  
  for (const material of materials as any[]) {
    try {
      const materialId = material.id;
      const materialName = material.material_name;
      
      if (!materialId) {
        console.error('Material ID is undefined:', material);
        continue;
      }
      
      const prediction = await predictInventoryDepletion(materialId);
      
      // 발주 필요 시 알림 생성
      if (prediction.shouldReorder) {
        // 중복 알림 방지 (24시간 이내)
        const existingAlertsRaw = await db.execute(sql`
          SELECT id
          FROM h_notifications
          WHERE notification_type = 'reorder'
            AND JSON_EXTRACT(metadata, '$.materialId') = ${materialId}
            AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
        `);
        const existingAlerts = Array.isArray(existingAlertsRaw) && Array.isArray(existingAlertsRaw[0]) ? existingAlertsRaw[0] : existingAlertsRaw;
        
        if ((existingAlerts as any[]).length === 0) {
          // 모든 사용자에게 알림 생성
          const usersRaw = await db.execute(sql`SELECT id FROM users`);
          const usersList = Array.isArray(usersRaw) && Array.isArray(usersRaw[0]) ? usersRaw[0] : usersRaw;
          
          for (const user of usersList as any[]) {
            await createNotification({
              tenantId: 1,
              userId: user.id,
              notificationType: "reorder",
              title: `재고 발주 필요: ${materialName}`,
              message: `현재 재고: ${prediction.currentStock}, 안전 재고: ${prediction.safetyStock}, 예상 소진: ${prediction.predictedDepletionDays}일 후`,
              priority: prediction.urgencyLevel === "urgent" ? "urgent" : prediction.urgencyLevel === "high" ? "high" : "medium",
              actionUrl: `/materials?materialId=${materialId}`,
              metadata: JSON.stringify({
                materialId: materialId,
                materialName: materialName,
                currentStock: prediction.currentStock,
                predictedDepletionDays: prediction.predictedDepletionDays
              })
            });
          }
          
          alertCount++;
        }
      }
    } catch (error) {
      console.error(`재고 예측 실패 (materialId: ${material?.id}):`, error);
    }
  }
  
  return { alertCount };
}
