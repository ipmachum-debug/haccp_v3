/**
 * 재고 회전율 + 단가 이력 + 알림
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

export async function getProfitabilityTrendByMonth(startDate?: Date, endDate?: Date, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hBatches, hBatchInputs, hMaterials } = await import("../../../drizzle/schema.js");
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
          (SELECT SUM(CAST(bi.quantity AS DECIMAL(15,2)) * CAST(COALESCE(m.unit_price, im.default_unit_price, 0) AS DECIMAL(15,2)))
           FROM h_batch_inputs bi
           LEFT JOIN h_materials m ON bi.material_id = m.id AND m.tenant_id = bi.tenant_id
           LEFT JOIN item_master im ON im.id = bi.material_id AND im.tenant_id = bi.tenant_id AND im.item_type = 'raw_material'
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

  const { hBatches, hBatchInputs, hMaterials } = await import("../../../drizzle/schema.js");
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
          (SELECT SUM(CAST(bi.quantity AS DECIMAL(15,2)) * CAST(COALESCE(m.unit_price, im.default_unit_price, 0) AS DECIMAL(15,2)))
           FROM h_batch_inputs bi
           LEFT JOIN h_materials m ON bi.material_id = m.id AND m.tenant_id = bi.tenant_id
           LEFT JOIN item_master im ON im.id = bi.material_id AND im.tenant_id = bi.tenant_id AND im.item_type = 'raw_material'
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

  const { hMaterialPriceHistory } = await import("../../../drizzle/schema.js");
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

/** @deprecated Use getBatchCostAnalysis from productionAnalytics.ts instead */
export async function getBatchCostAnalysisInventory(params: {
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

  // 2. 배치 전체에 대한 원재료 사용 거래를 단일 쿼리로 로드 (N+1 제거)
  const batchIds = batches.map((b: any) => b.id);
  const quantityByBatch = new Map<number, number>();

  if (batchIds.length > 0) {
    const transactions = await db
      .select({
        referenceId: hInventoryTransactions.referenceId,
        quantity: hInventoryTransactions.quantity,
      })
      .from(hInventoryTransactions)
      .where(
        and(
          eq(hInventoryTransactions.referenceType, "batch"),
          inArray(hInventoryTransactions.referenceId, batchIds),
          eq(hInventoryTransactions.transactionType, "usage")
        )
      );

    for (const t of transactions as any[]) {
      const bid = Number(t.referenceId);
      const qty = Math.abs(Number(t.quantity) || 0);
      quantityByBatch.set(bid, (quantityByBatch.get(bid) || 0) + qty);
    }
  }

  const batchCosts = batches.map((batch: any) => {
    const totalQuantity = quantityByBatch.get(Number(batch.id)) || 0;

    // TODO: 실제 원가 계산은 원재료 단가 정보가 필요함
    const materialCost = totalQuantity * 100; // 임시 단가 100원 사용

    const productionTime = batch.startTime && batch.endTime
      ? (new Date(batch.endTime).getTime() - new Date(batch.startTime).getTime()) / (1000 * 60 * 60)
      : 0;

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
  });

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
  
  const { hMaterialReceivings, hBatchInputs, hMaterials } = await import("../../../drizzle/schema.js");
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
  
  const { hMaterials, hMaterialReceivings, hBatchInputs } = await import("../../../drizzle/schema.js");
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
  
  const { hMaterialReceivings, hMaterials } = await import("../../../drizzle/schema.js");
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

  const { hInventoryTurnoverSettings } = await import("../../../drizzle/schema.js");
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
  
  const { hInventoryTurnoverSettings, hMaterials } = await import("../../../drizzle/schema.js");
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
  
  const { hInventoryTurnoverSettings, hMaterials, hNotifications } = await import("../../../drizzle/schema.js");
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
