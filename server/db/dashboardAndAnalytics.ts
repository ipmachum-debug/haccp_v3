import { getDb, getRawConnection } from "./connection";
import { createNotification } from "./notificationFunctions";
import { eq, and, or, lte, gte, gt, isNull, desc, asc, sql, lt, inArray, count, isNotNull, sum } from "drizzle-orm";
import {
  hBatches,
  hCcpInstances,
  hCcpRows,
  hBatchInputs,
  hMaterials,
  hInventory,
  hInventoryLots,
  hInventoryTransactions,
  hProductsV2,
  hNotifications,
  hCcpDeviations,
  hProducts,
  hSuppliers,
  materialInspectionRecords,
  shippingInspectionRecords,
  hygieneInspectionRecords,
  auditLogs,
  hPurchaseOrders,
  hPurchaseOrderItems,
  hMaterialReceivings,
  hSystemSettings,
  hMaterialPriceHistory,
  hInventoryTurnoverSettings,
  hProfitabilityForecasts,
  hInspectionRecords,
  users,
  recipes,
  recipeLines,
} from "../../drizzle/schema";

async function getLowStockMaterials(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { hMaterials, hInventoryLots } = await import("../../drizzle/schema.js");
  const { eq, and, sum, sql } = await import("drizzle-orm");
  
  // 테넌트 필터 적용
  const materialWhere = tenantId
    ? and(eq(hMaterials.isActive, 1), eq(hMaterials.tenantId, tenantId))
    : eq(hMaterials.isActive, 1);
  const materials = await db.select().from(hMaterials).where(materialWhere);
  
  const lowStockMaterials = [];
  
  for (const material of materials) {
    // 해당 원재료의 총 가용 재고 계산 (테넌트 격리)
    const lotWhere = tenantId
      ? and(eq(hInventoryLots.materialId, material.id), eq(hInventoryLots.tenantId, tenantId))
      : eq(hInventoryLots.materialId, material.id);
    const stockResult = await db
      .select({
        totalStock: sum(hInventoryLots.availableQuantity)
      })
      .from(hInventoryLots)
      .where(lotWhere);
    
    const totalStock = parseFloat(stockResult[0]?.totalStock || "0");
    const safetyLevel = parseFloat(material.safetyStockLevel || "0");
    
    // 안전 재고 수준 이하인 경우
    if (totalStock < safetyLevel) {
      lowStockMaterials.push({
        ...material,
        currentStock: totalStock,
        shortage: safetyLevel - totalStock
      });
    }
  }
  
  return lowStockMaterials;
}

export async function getDashboardStats(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { hBatches, hCcpInstances } = await import("../../drizzle/schema.js");
  const { eq, count, and, gte, lte } = await import("drizzle-orm");
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  
  // 진행 중인 배치 수 (테넌트 격리)
  const batchTenantCond = tenantId ? eq(hBatches.tenantId, tenantId) : undefined;
  const [inProgressResult] = await db
    .select({ count: count() })
    .from(hBatches)
    .where(batchTenantCond ? and(eq(hBatches.status, "in_progress"), batchTenantCond) : eq(hBatches.status, "in_progress"));
  
  // 오늘 완료된 배치 수 (테넌트 격리)
  const todayConditions = [eq(hBatches.status, "completed"), gte(hBatches.endTime, today), lte(hBatches.endTime, tomorrow)];
  if (batchTenantCond) todayConditions.push(batchTenantCond);
  const [completedTodayResult] = await db
    .select({ count: count() })
    .from(hBatches)
    .where(and(...todayConditions));
  
  // 이번 주 완료된 배치 수 (테넌트 격리)
  const weekConditions = [eq(hBatches.status, "completed"), gte(hBatches.endTime, weekStart)];
  if (batchTenantCond) weekConditions.push(batchTenantCond);
  const [completedWeekResult] = await db
    .select({ count: count() })
    .from(hBatches)
    .where(and(...weekConditions));
  
  // 이번 달 완료된 배치 수 (테넌트 격리)
  const monthConditions = [eq(hBatches.status, "completed"), gte(hBatches.endTime, monthStart)];
  if (batchTenantCond) monthConditions.push(batchTenantCond);
  const [completedMonthResult] = await db
    .select({ count: count() })
    .from(hBatches)
    .where(and(...monthConditions));
  
  // CCP 점검 현황
  const [ccpTotalResult] = await db
    .select({ count: count() })
    .from(hCcpInstances);
  
  const [ccpCompletedResult] = await db
    .select({ count: count() })
    .from(hCcpInstances)
    .where(eq(hCcpInstances.status, "submitted"));
  
  // 재고 부족 원재료 수
  const lowStockMaterials = await getLowStockMaterials(tenantId);
  
  return {
    inProgressBatches: inProgressResult.count,
    completedToday: completedTodayResult.count,
    completedWeek: completedWeekResult.count,
    completedMonth: completedMonthResult.count,
    ccpTotal: ccpTotalResult.count,
    ccpCompleted: ccpCompletedResult.count,
    ccpPending: ccpTotalResult.count - ccpCompletedResult.count,
    lowStockCount: lowStockMaterials.length
  };
}

// 대시보드 통계
// ============================================================================

/**
 * 검사 통계 조회
 */
async function getInspectionStatistics(filters?: {
  startDate?: string;
  endDate?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  // 원재료 검사 통계
  const materialInspections = await db
    .select({
      total: sql<number>`COUNT(*)`,
      pending: sql<number>`SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END)`,
      completed: sql<number>`SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)`,
      rejected: sql<number>`SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END)`,
      pass: sql<number>`SUM(CASE WHEN inspection_result = 'pass' THEN 1 ELSE 0 END)`,
      fail: sql<number>`SUM(CASE WHEN inspection_result = 'fail' THEN 1 ELSE 0 END)`
    })
    .from(materialInspectionRecords);
  
  // 출하 검사 통계
  const shippingInspections = await db
    .select({
      total: sql<number>`COUNT(*)`,
      pending: sql<number>`SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END)`,
      completed: sql<number>`SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)`,
      rejected: sql<number>`SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END)`,
      pass: sql<number>`SUM(CASE WHEN inspection_result = 'pass' THEN 1 ELSE 0 END)`,
      fail: sql<number>`SUM(CASE WHEN inspection_result = 'fail' THEN 1 ELSE 0 END)`
    })
    .from(shippingInspectionRecords);
  
  // 위생 검사 통계
  const hygieneInspections = await db
    .select({
      total: sql<number>`COUNT(*)`,
      pending: sql<number>`SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END)`,
      completed: sql<number>`SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)`,
      action_required: sql<number>`SUM(CASE WHEN status = 'action_required' THEN 1 ELSE 0 END)`,
      good: sql<number>`SUM(CASE WHEN result = 'good' THEN 1 ELSE 0 END)`,
      fair: sql<number>`SUM(CASE WHEN result = 'fair' THEN 1 ELSE 0 END)`,
      poor: sql<number>`SUM(CASE WHEN result = 'poor' THEN 1 ELSE 0 END)`
    })
    .from(hygieneInspectionRecords);
  
  return {
    material: materialInspections[0],
    shipping: shippingInspections[0],
    hygiene: hygieneInspections[0]
  };
}

/**
 * 배치 진행 현황 조회
 */
export async function getBatchProgress() {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const { hBatches } = await import("../../drizzle/schema");
  
  const batches = await db
    .select({
      total: sql<number>`COUNT(*)`,
      planned: sql<number>`SUM(CASE WHEN status = 'planned' THEN 1 ELSE 0 END)`,
      running: sql<number>`SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END)`,
      finished: sql<number>`SUM(CASE WHEN status = 'finished' THEN 1 ELSE 0 END)`,
      shipped: sql<number>`SUM(CASE WHEN status = 'shipped' THEN 1 ELSE 0 END)`
    })
    .from(hBatches);
  
  return batches[0];
}

/**
 * CCP 이탈 알림 조회 (CCP 테이블이 없으므로 빈 배열 반환)
 */
export async function getCcpDeviations(filters?: {
  startDate?: string;
  endDate?: string;
  limit?: number;
}) {
  // CCP 테이블이 아직 구현되지 않음
  return [];
}

/**
 * 최근 활동 조회
 */
export async function getRecentActivities(limit: number = 10) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const activities = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      userId: auditLogs.userId,
      userEmail: auditLogs.userEmail,
      description: auditLogs.description,
      createdAt: auditLogs.createdAt
    })
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
  
  return activities;
}


// ============================================================================
// 테스트용 헬퍼 함수
// ============================================================================

/**
 * 원재료 생성 (테스트용)
 */
export async function createMaterial(data: {
  materialCode: string;
  materialName: string;
  category?: string;
  categoryId?: number; // 카테고리 ID
  unit?: string;
  safetyStock?: number;
  expiryWarningDays?: number;
  isActive?: number;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { hMaterials } = await import("../../drizzle/schema.js");
  const values: any = {
    materialCode: data.materialCode,
    materialName: data.materialName,
    category: data.category,
    categoryId: data.categoryId, // 카테고리 ID
    unit: data.unit || "KG",
    safetyStockLevel: data.safetyStock?.toString(),
    expiryWarningDays: data.expiryWarningDays,
    isActive: data.isActive !== undefined ? data.isActive : 1
  };
  if (data.tenantId) values.tenantId = data.tenantId;
  const result = await db.insert(hMaterials).values(values);
  return { id: Number(result[0].insertId) };
}

/**
 * 재고 LOT 조회 (ID로)
 */
export async function getInventoryLotById(lotId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { hInventoryLots } = await import("../../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");
  
  const [lot] = await db.select().from(hInventoryLots).where(eq(hInventoryLots.id, lotId));
  return lot;
}

/**
 * 배치별 원재료 투입 내역 조회
 */
export async function getBatchInputsByBatchId(batchId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { hBatchInputs, hMaterials, hInventoryLots } = await import("../../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");
  
  const inputs = await db
    .select({
      input: hBatchInputs,
      material: hMaterials,
      lot: hInventoryLots
    })
    .from(hBatchInputs)
    .leftJoin(hMaterials, eq(hBatchInputs.materialId, hMaterials.id))
    .leftJoin(hInventoryLots, eq(hBatchInputs.lotId, hInventoryLots.id))
    .where(eq(hBatchInputs.batchId, batchId));
  
  return inputs;
}

/**
 * CCP 인스턴스 일괄 삭제
 */
export async function bulkDeleteCcpInstances(instanceIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { hCcpInstances, hCcpRows } = await import("../../drizzle/schema.js");
  const { inArray } = await import("drizzle-orm");
  
  // 1. CCP 행 삭제
  await db.delete(hCcpRows).where(inArray(hCcpRows.instanceId, instanceIds));
  
  // 2. CCP 인스턴스 삭제
  const result = await db.delete(hCcpInstances).where(inArray(hCcpInstances.id, instanceIds));
  
  return {
    deletedCount: instanceIds.length
  };
}

/**
 * 제품 CCP 매핑 업데이트
 */
export async function updateProductCcpMapping(productId: number, ccpTypes: string[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { hProducts } = await import("../../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");
  
  await db.update(hProducts)
    .set({ defaultCcpTypes: ccpTypes as any })
    .where(eq(hProducts.id, productId));
}


// ============================================
// 대시보드 위젯 데이터 조회
// ============================================



/**
/**
 * 재고 부족 경고 조회
 */
export async function getLowStockWarnings() {
  const db = await getDb();
  if (!db) return [];
  
  const lowStockItems = await db
    .select({
      id: hInventory.id,
      materialId: hInventory.materialId,
      currentStock: hInventory.availableQuantity,
      minStock: hInventory.minStockLevel,
      unit: hInventory.unit
    })
    .from(hInventory)
    .where(
      and(
        sql`${hInventory.minStockLevel} IS NOT NULL`,
        sql`${hInventory.availableQuantity} < ${hInventory.minStockLevel}`
      )
    )
    .limit(10);
  
  return lowStockItems.map((item) => ({
    id: Number(item.id),
    materialName: `재료 ID: ${item.materialId}`,
    currentStock: Number(item.currentStock),
    minStock: Number(item.minStock),
    unit: item.unit
  }));
}

/**
 * 유통기한 임박 원재료 조회 (7일 이내)
 */
export async function getExpiringMaterials(tenantId?: number) {
  const db = await getDb();
  if (!db) return [];
  
  const today = new Date();
  const sevenDaysLater = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  
  const expiringLots = await db
    .select({
      id: hInventoryLots.id,
      lotNumber: hInventoryLots.lotNumber,
      materialId: hInventoryLots.materialId,
      quantity: hInventoryLots.availableQuantity,
      unit: hInventoryLots.unit,
      expiryDate: hInventoryLots.expiryDate,
      materialName: hMaterials.materialName
    })
    .from(hInventoryLots)
    .leftJoin(hMaterials, eq(hInventoryLots.materialId, hMaterials.id))
    .where(
      and(
        sql`${hInventoryLots.expiryDate} IS NOT NULL`,
        lte(hInventoryLots.expiryDate, sevenDaysLater),
        gte(hInventoryLots.expiryDate, today),
        tenantId ? eq(hMaterials.tenantId, tenantId) : undefined
      )
    )
    .orderBy(hInventoryLots.expiryDate)
    .limit(10);
  
  return expiringLots.map((lot) => ({
    materialName: lot.materialName || `재료 ID: ${lot.materialId}`,
    lotNumber: lot.lotNumber,
    expiryDate: lot.expiryDate ? new Date(lot.expiryDate).toISOString().split('T')[0] : '',
    quantity: Number(lot.quantity),
    unit: lot.unit
  }));
}

// ============================================================================

// ============ 대시보드 위젯 데이터 조회 ============
export async function getProductionTrend(days: number = 7) {
  const db = await getDb();
  if (!db) return { trend: [], total: 0 };
  
  const { hBatches } = await import("../../drizzle/schema.js");
  const { gte, sql } = await import("drizzle-orm");
  
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const batches = await db
    .select({
      date: sql<string>`DATE(${hBatches.createdAt})`.as('date'),
      count: sql<number>`COUNT(*)`.as('count')
    })
    .from(hBatches)
    .where(gte(hBatches.createdAt, startDate))
    .groupBy(sql`DATE(${hBatches.createdAt})`)
    .orderBy(sql`DATE(${hBatches.createdAt})`) as any;
  
  const total = batches.reduce((sum: number, b: any) => sum + Number(b.count), 0);
  
  return {
    trend: batches.map((b: any) => ({
      date: b.date,
      count: Number(b.count)
    })),
    total
  };
}

export async function getMaterialConsumption() {
  const db = await getDb();
  if (!db) return [];
  
  const { hBatchInputs } = await import("../../drizzle/schema.js");
  const { sql } = await import("drizzle-orm");
  
  const consumption = await db
    .select({
      materialId: hBatchInputs.materialId,
      totalQuantity: sql<string>`SUM(${hBatchInputs.actualQuantity})`,
      unit: hBatchInputs.unit
    })
    .from(hBatchInputs)
    .groupBy(hBatchInputs.materialId, hBatchInputs.unit)
    .orderBy(sql`SUM(${hBatchInputs.actualQuantity}) DESC`)
    .limit(10);
  
  return consumption.map((c) => ({
    materialId: Number(c.materialId),
    materialName: `원재료 ID: ${c.materialId}`,
    totalQuantity: parseFloat(c.totalQuantity || "0"),
    unit: c.unit
  }));
}

async function getMonthlyCcpDeviationRate(days: number = 30) {
  const db = await getDb();
  if (!db) return { total: 0, deviations: 0, rate: 0 };
  
  const { hCcpDeviations } = await import("../../drizzle/schema.js");
  const { gte, sql } = await import("drizzle-orm");
  
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);
  
  const deviations = await db
    .select({
      count: sql<number>`COUNT(*)`
    })
    .from(hCcpDeviations)
    .where(gte(hCcpDeviations.createdAt, startDate));
  
  const deviationCount = Number(deviations[0]?.count || 0);
  
  // CCP 점검 총 횟수는 임시로 100으로 가정 (실제로는 hCcpInstances 또는 hCcpRecords에서 조회)
  const totalInspections = 100;
  const rate = totalInspections > 0 ? (deviationCount / totalInspections) * 100 : 0;
  
  return {
    total: totalInspections,
    deviations: deviationCount,
    rate: parseFloat(rate.toFixed(2))
  };
}


// 배치 비용 계산
// ============================================================================

/**
 * 배치별 원재료 투입 비용 계산
 */
export async function getBatchCost(batchId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
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
  const materialCosts = inputs.map((item) => {
    const quantity = parseFloat(String(item.input.actualQuantity || item.input.plannedQuantity));
    const unitPrice = item.material?.unitPrice ? parseFloat(String(item.material.unitPrice)) : 0;
    const cost = quantity * unitPrice;
    
    return {
      materialId: item.input.materialId,
      materialName: item.material?.materialName || "Unknown",
      quantity,
      unit: item.input.unit,
      unitPrice,
      totalCost: cost
    };
  });
  
  // 총 비용 계산
  const totalCost = materialCosts.reduce((sum, item) => sum + item.totalCost, 0);
  
  return {
    batchId,
    materialCosts,
    totalCost
  };
}

/**
 * 여러 배치의 비용 조회 (배치 목록 페이지용)
 */
export async function getBatchCostSummary(batchIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { hBatchInputs, hMaterials } = await import("../../drizzle/schema.js");
  const { inArray, eq, sql } = await import("drizzle-orm");
  
  if (batchIds.length === 0) return [];
  
  // 각 배치별 총 비용 계산
  const result = await db
    .select({
      batchId: hBatchInputs.batchId,
      totalCost: sql<string>`SUM(${hBatchInputs.actualQuantity} * ${hMaterials.unitPrice})`
    })
    .from(hBatchInputs)
    .leftJoin(hMaterials, eq(hBatchInputs.materialId, hMaterials.id))
    .where(inArray(hBatchInputs.batchId, batchIds))
    .groupBy(hBatchInputs.batchId);
  
  return result.map((r) => ({
    batchId: Number(r.batchId),
    totalCost: parseFloat(r.totalCost || "0")
  }));
}


// 데이터 export용 조회 함수
// ============================================================================

/**
 * CCP 점검 이력 조회 (export용)
 */
export async function getCcpInspectionHistory(filters?: {
  startDate?: Date;
  endDate?: Date;
  siteId?: number;
  ccpType?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { hCcpInstances, hCcpRows, hBatches } = await import("../../drizzle/schema.js");
  const { and, gte, lte, eq, desc } = await import("drizzle-orm");
  
  const conditions = [];
  if (filters?.startDate) {
    conditions.push(gte(hCcpRows.createdAt, filters.startDate));
  }
  if (filters?.endDate) {
    conditions.push(lte(hCcpRows.createdAt, filters.endDate));
  }
  if (filters?.siteId) {
    conditions.push(eq(hCcpInstances.siteId, filters.siteId));
  }
  if (filters?.ccpType) {
    conditions.push(eq(hCcpInstances.ccpType, filters.ccpType));
  }
  
  const rows = await db
    .select({
      rowId: hCcpRows.id,
      instanceId: hCcpInstances.id,
      batchCode: hBatches.batchCode,
      ccpType: hCcpInstances.ccpType,
      productName: hCcpInstances.productName,
      workDate: hCcpInstances.workDate,
      tempC: hCcpRows.tempC,
      durationMin: hCcpRows.durationMin,
      pressureBar: hCcpRows.pressureBar,
      result: hCcpRows.result,
      note: hCcpRows.note,
      measuredAt: hCcpRows.measuredAt,
      checkedAt: hCcpRows.createdAt
    })
    .from(hCcpRows)
    .leftJoin(hCcpInstances, eq(hCcpRows.instanceId, hCcpInstances.id))
    .leftJoin(hBatches, eq(hCcpInstances.batchId, hBatches.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(hCcpRows.createdAt));
  
  return rows;
}

// TODO: 거래처 평가 테이블 구현 후 추가 예정

// TODO: 승인 워크플로우 테이블 구현 후 추가 예정

// ============================================================================
// CCP 이탈 통계 조회 함수

// CCP 이탈 통계 조회 함수
// ============================================================================

/**
 * 월별 CCP 이탈 통계 조회
 */
async function getCcpDeviationStatsByMonth(filters?: {
  startDate?: Date;
  endDate?: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { hCcpDeviations } = await import("../../drizzle/schema.js");
  const { and, gte, lte, sql } = await import("drizzle-orm");
  
  const conditions = [];
  if (filters?.startDate) {
    conditions.push(gte(hCcpDeviations.deviationDate, filters.startDate));
  }
  if (filters?.endDate) {
    conditions.push(lte(hCcpDeviations.deviationDate, filters.endDate));
  }
  
  const stats = await db
    .select({
      month: sql<string>`DATE_FORMAT(${hCcpDeviations.deviationDate}, '%Y-%m')`,
      totalCount: sql<number>`COUNT(*)`,
      highSeverityCount: sql<number>`SUM(CASE WHEN ${hCcpDeviations.severity} = 'high' THEN 1 ELSE 0 END)`,
      mediumSeverityCount: sql<number>`SUM(CASE WHEN ${hCcpDeviations.severity} = 'medium' THEN 1 ELSE 0 END)`,
      lowSeverityCount: sql<number>`SUM(CASE WHEN ${hCcpDeviations.severity} = 'low' THEN 1 ELSE 0 END)`
    })
    .from(hCcpDeviations)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(sql`DATE_FORMAT(${hCcpDeviations.deviationDate}, '%Y-%m')`)
    .orderBy(sql`DATE_FORMAT(${hCcpDeviations.deviationDate}, '%Y-%m')`);
  
  return stats;
}

/**
 * 제품별 CCP 이탈 통계 조회
 */
async function getCcpDeviationStatsByProduct(filters?: {
  startDate?: Date;
  endDate?: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { hCcpDeviations, hCcpInstances, hProductsV2 } = await import("../../drizzle/schema.js");
  const { and, gte, lte, eq, sql } = await import("drizzle-orm");
  
  const conditions = [];
  if (filters?.startDate) {
    conditions.push(gte(hCcpDeviations.deviationDate, filters.startDate));
  }
  if (filters?.endDate) {
    conditions.push(lte(hCcpDeviations.deviationDate, filters.endDate));
  }
  
  const stats = await db
    .select({
      productId: hCcpInstances.productId,
      productName: hCcpInstances.productName,
      totalCount: sql<number>`COUNT(*)`,
      highSeverityCount: sql<number>`SUM(CASE WHEN ${hCcpDeviations.severity} = 'high' THEN 1 ELSE 0 END)`,
      mediumSeverityCount: sql<number>`SUM(CASE WHEN ${hCcpDeviations.severity} = 'medium' THEN 1 ELSE 0 END)`,
      lowSeverityCount: sql<number>`SUM(CASE WHEN ${hCcpDeviations.severity} = 'low' THEN 1 ELSE 0 END)`
    })
    .from(hCcpDeviations)
    .leftJoin(hCcpInstances, eq(hCcpDeviations.ccpInstanceId, hCcpInstances.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(hCcpInstances.productId, hCcpInstances.productName)
    .orderBy(sql`COUNT(*) DESC`);
  
  return stats;
}

/**
 * CCP 유형별 이탈 통계 조회
 */
async function getCcpDeviationStatsByCcpType(filters?: {
  startDate?: Date;
  endDate?: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { hCcpDeviations, hCcpInstances } = await import("../../drizzle/schema.js");
  const { and, gte, lte, eq, sql } = await import("drizzle-orm");
  
  const conditions = [];
  if (filters?.startDate) {
    conditions.push(gte(hCcpDeviations.deviationDate, filters.startDate));
  }
  if (filters?.endDate) {
    conditions.push(lte(hCcpDeviations.deviationDate, filters.endDate));
  }
  
  const stats = await db
    .select({
      ccpType: hCcpInstances.ccpType,
      totalCount: sql<number>`COUNT(*)`,
      highSeverityCount: sql<number>`SUM(CASE WHEN ${hCcpDeviations.severity} = 'high' THEN 1 ELSE 0 END)`,
      mediumSeverityCount: sql<number>`SUM(CASE WHEN ${hCcpDeviations.severity} = 'medium' THEN 1 ELSE 0 END)`,
      lowSeverityCount: sql<number>`SUM(CASE WHEN ${hCcpDeviations.severity} = 'low' THEN 1 ELSE 0 END)`
    })
    .from(hCcpDeviations)
    .leftJoin(hCcpInstances, eq(hCcpDeviations.ccpInstanceId, hCcpInstances.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(hCcpInstances.ccpType)
    .orderBy(sql`COUNT(*) DESC`);
  
  return stats;
}


// 배치 수익성 분석 함수
// ============================================================================

/**
 * 배치 수익성 조회 (원가, 매출, 수익률)
 */
export async function getBatchProfitability(batchId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
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
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { hBatches, hProductsV2 } = await import("../../drizzle/schema.js");
  const { and, gte, lte, eq, sql, isNotNull } = await import("drizzle-orm");
  
  const conditions = [isNotNull(hBatches.revenue)];
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
    const batches = await db
      .select({ id: hBatches.id })
      .from(hBatches)
      .where(
        and(
          eq(hBatches.productId, stat.productId),
          isNotNull(hBatches.revenue),
          filters?.startDate ? gte(hBatches.plannedDate, filters.startDate) : undefined,
          filters?.endDate ? lte(hBatches.plannedDate, filters.endDate) : undefined
        )
      );
    
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
  if (!db) throw new Error("Database not available");
  
  const { hBatches } = await import("../../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");
  
  await db
    .update(hBatches)
    .set({ revenue: revenue.toString() })
    .where(eq(hBatches.id, batchId));
  
  return true;
}


// 시스템 설정 함수
// ============================================================================

/**
 * 모든 시스템 설정 조회
 */
export async function getSystemSettings() {
  const db = await getDb();
  if (!db) return [];
  const { hSystemSettings } = await import("../../drizzle/schema.js");
  return await db.select().from(hSystemSettings);
}

/**
 * 특정 설정 값 조회
 */
export async function getSystemSetting(key: string) {
  const db = await getDb();
  if (!db) return null;
  const { hSystemSettings } = await import("../../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");
  const results = await db
    .select()
    .from(hSystemSettings)
    .where(eq(hSystemSettings.settingKey, key))
    .limit(1);
  return results[0] || null;
}

/**
 * 시스템 설정 업데이트 또는 생성
 */
export async function upsertSystemSetting(
  key: string,
  value: string,
  description: string,
  userId: number
) {
  const db = await getDb();
  if (!db) return false;
  const { hSystemSettings } = await import("../../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");
  
  const existing = await getSystemSetting(key);
  
  if (existing) {
    await db
      .update(hSystemSettings)
      .set({
        settingValue: value,
        description,
        updatedBy: userId
      })
      .where(eq(hSystemSettings.settingKey, key));
  } else {
    await db.insert(hSystemSettings).values({
      settingKey: key,
      settingValue: value,
      description,
      updatedBy: userId
    } as any);
  }
  
  return true;
}


// ============================================================================
// 재고 회전율 분석 함수
// ============================================================================

/**
 * 원재료별 입출고 이력 조회
 */
export async function getMaterialTransactionHistory(materialId: number, filters?: {
  startDate?: Date;
  endDate?: Date;
  tenantId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
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
  if (!db) throw new Error("Database not available");
  
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
  if (!db) throw new Error("Database not available");
  
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

// 원재료 단가 업데이트 (이력 자동 저장)

// 원재료 단가 업데이트 (이력 자동 저장)
async function updateMaterialPrice(id: number, unitPrice: number, changedBy?: number, reason?: string, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
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

// 재고 회전율 알림 생성
export async function createInventoryTurnoverAlert(materialId: number, turnoverRate: number, thresholdRate: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { hNotifications, hMaterials } = await import("../../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");
  
  // 원재료 정보 조회
  const material = await db
    .select()
    .from(hMaterials)
    .where(eq(hMaterials.id, materialId))
    .limit(1);
  
  if (material.length === 0) {
    return { success: false, message: "원재료를 찾을 수 없습니다." };
  }
  
  const materialName = material[0].materialName;
  
  // 알림 생성 (관리자에게 userId=1로 가정)
  await db.insert(hNotifications).values({
    userId: 1,
    notificationType: "inventory_turnover",
    title: `재고 회전율 경고: ${materialName}`,
    message: `원재료 "${materialName}"의 회전율이 ${turnoverRate.toFixed(2)}회로, 설정된 임계값 ${thresholdRate}회 이하입니다. 재고 최적화가 필요합니다.`,
    priority: "high",
    isRead: 0
  } as any);
  
  return { success: true };
}

// 월별 수익률 추이 조회
export async function getProfitabilityTrendByMonth(startDate?: Date, endDate?: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { hBatches, hBatchInputs, hMaterials } = await import("../../drizzle/schema.js");
  const { sql, gte, lte, and, isNotNull, eq } = await import("drizzle-orm");
  
  let conditions = [isNotNull(hBatches.revenue)];
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
export async function getProfitabilityTrendByQuarter(startDate?: Date, endDate?: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { hBatches, hBatchInputs, hMaterials } = await import("../../drizzle/schema.js");
  const { sql, gte, lte, and, isNotNull, eq } = await import("drizzle-orm");
  
  let conditions = [isNotNull(hBatches.revenue)];
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

// 원재료 단가 이력 조회
export async function getMaterialPriceHistory(materialId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { hMaterialPriceHistory } = await import("../../drizzle/schema.js");
  const { eq, desc } = await import("drizzle-orm");
  
  const history = await db
    .select()
    .from(hMaterialPriceHistory)
    .where(eq(hMaterialPriceHistory.materialId, materialId))
    .orderBy(desc(hMaterialPriceHistory.changedAt));
  
  return history;
}

// 재고 회전율 임계값 설정
export async function setInventoryTurnoverThreshold(materialId: number, thresholdRate: number, alertEnabled: boolean = true, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
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
  if (!db) throw new Error("Database not available");
  
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
export async function getProfitabilityForecast() {
  const db = await getDb();
  if (!db) throw new Error("Database connection not available");
  
  // 과거 3개월 데이터 조회
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  
  const batches = await db
    .select()
    .from(hBatches)
    .where(sql`${hBatches.plannedDate} >= ${threeMonthsAgo.toISOString().split('T')[0]}`)
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
  if (!db) throw new Error("Database not available");
  
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
            sql`${hNotifications.createdAt} >= ${oneDayAgo.toISOString().split('T')[0]}`
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
  if (!db) throw new Error("Database not available");
  
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
export async function getProfitabilityForecastHistory() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { hProfitabilityForecasts } = await import("../../drizzle/schema.js");
  const { desc } = await import("drizzle-orm");
  
  const forecasts = await db
    .select()
    .from(hProfitabilityForecasts)
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
  if (!db) throw new Error("Database not available");
  
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

/**
 * 재고 소비 패턴 분석 (과거 30일 기준)
 */
export async function getInventoryConsumptionPattern(materialId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const { sql } = await import("drizzle-orm");
  
  // 과거 30일간의 재고 변화 데이터 조회
  const consumptionData = await db.execute(sql`
    SELECT 
      DATE(createdAt) as date,
      SUM(CASE WHEN changeType = 'out' THEN ABS(changeQuantity) ELSE 0 END) as dailyConsumption
    FROM hInventoryTransactions
    WHERE id = ${materialId}
      AND createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    GROUP BY DATE(createdAt)
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
  if (!db) throw new Error("Database connection failed");
  
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
  if (!db) throw new Error("Database connection failed");
  
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

// 원가 분석 관련 함수
// ============================================================================

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
  
  // 원재료별 원가 집계
  const result = await db
    .select({
      materialId: hBatchInputs.materialId,
      materialName: hMaterials.materialName,
      totalCost: sql<number>`SUM(${hBatchInputs.totalPrice})`.as('total_cost'),
      count: sql<number>`COUNT(*)`.as('count')
    })
    .from(hBatchInputs)
    .innerJoin(hMaterials, eq(hBatchInputs.materialId, hMaterials.id))
    .where(sql`${hBatchInputs.batchId} IN (${sql.join(batchIds.map((id: any) => sql`${id}`), sql`, `)})`)
    .groupBy(hBatchInputs.materialId, hMaterials.materialName)
    .orderBy(desc(sql`SUM(${hBatchInputs.totalPrice})`));
  
  return result;
}

async function calculateMaterialRequirements(batchId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const { hBatches, recipes, recipeLines, hMaterials, hInventoryLots } = await import("../../drizzle/schema");
  const { eq, and, sql } = await import("drizzle-orm");
  
  // 1. 배치 정보 조회 (tenantId가 있으면 격리 적용)
  const batchConditions = [eq(hBatches.id, batchId)];
  if (tenantId) {
    batchConditions.push(eq(hBatches.tenantId, tenantId));
  }
  const [batch] = await db
    .select()
    .from(hBatches)
    .where(and(...batchConditions))
    .limit(1);
  
  if (!batch) throw new Error("배치를 찾을 수 없습니다");
  
  // 2. 제품의 레시피 조회
  const [recipe] = await db
    .select()
    .from(recipes)
    .where(and(
      eq(recipes.productId, batch.productId),
      eq(recipes.isActive, 1)
    ))
    .limit(1);
  
  if (!recipe) {
    return {
      batchId,
      plannedQuantity: batch.plannedQuantity,
      materials: [],
      totalCost: 0
    };
  }
  
  // 3. 레시피 라인 조회 (원재료 목록)
  const recipeLinesData = await db
    .select({
      recipeLine: recipeLines,
      material: hMaterials
    })
    .from(recipeLines)
    .leftJoin(hMaterials, eq(recipeLines.materialId, hMaterials.id))
    .where(eq(recipeLines.recipeId, recipe.id));
  
  // 4. 각 원재료별 필요 수량 및 재고 현황 계산
  const materialRequirements = await Promise.all(
    recipeLinesData.map(async (line) => {
      const material = line.material;
      const recipeLine = line.recipeLine;
      
      if (!material || !recipeLine) return null;
      
      // 필요 수량 계산 (배치 수량 * 레시피 비율)
      const requiredQuantity = parseFloat(batch.plannedQuantity) * parseFloat(recipeLine.quantity);
      
      // 현재 재고 조회 (가용 수량 합계)
      const [stockResult] = await db
        .select({
          totalStock: sql<number>`SUM(${hInventoryLots.availableQuantity})`
        })
        .from(hInventoryLots)
        .where(and(
          eq(hInventoryLots.materialId, material.id),
          eq(hInventoryLots.status, "available")
        ));
      
      const currentStock = stockResult?.totalStock || 0;
      const shortage = Math.max(0, requiredQuantity - currentStock);
      
      // 비용 계산
      const unitPrice = parseFloat(material.unitPrice || "0");
      const totalCost = requiredQuantity * unitPrice;
      
      return {
        materialId: material.id,
        materialName: material.materialName,
        materialCode: material.materialCode,
        requiredQuantity,
        currentStock,
        shortage,
        unit: recipeLine.unit,
        unitPrice,
        totalCost,
        isShortage: shortage > 0
      };
    })
  );
  
  const validMaterials = materialRequirements.filter((m) => m !== null);
  const totalCost = validMaterials.reduce((sum, m) => sum + (m?.totalCost || 0), 0);
  
  return {
    batchId,
    plannedQuantity: batch.plannedQuantity,
    materials: validMaterials,
    totalCost
  };
}

async function getInventoryTrend(params: {
  startDate?: string;
  endDate?: string;
  siteId?: number;
  materialId?: number;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  // 기본값 설정 (최근 30일)
  const endDate = params.endDate || new Date().toISOString().split('T')[0];
  const startDate = params.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  const { hInventoryTransactions, hInventoryLots } = await import("../../drizzle/schema");
  const { sql, and, eq } = await import("drizzle-orm");
  
  const conditions = [
    sql`DATE(${hInventoryTransactions.createdAt}) >= ${startDate}`,
    sql`DATE(${hInventoryTransactions.createdAt}) <= ${endDate}`,
  ];
  
  if (params.materialId) {
    conditions.push(eq(hInventoryLots.materialId, params.materialId));
  }
  
  // hInventoryLots → hMaterials JOIN으로 tenantId 필터링 (별도 서브쿼리)
  if (params.tenantId) {
    const { hMaterials } = await import("../../drizzle/schema");
    conditions.push(sql`${hInventoryLots.materialId} IN (SELECT id FROM h_materials WHERE tenant_id = ${params.tenantId})`);
  }
  
  const trend = await db
    .select({
      date: sql<string>`DATE(${hInventoryTransactions.createdAt})`,
      receiptQuantity: sql<number>`SUM(CASE WHEN ${hInventoryTransactions.transactionType} = 'receipt' THEN ${hInventoryTransactions.quantity} ELSE 0 END)`,
      usageQuantity: sql<number>`SUM(CASE WHEN ${hInventoryTransactions.transactionType} = 'usage' THEN ${hInventoryTransactions.quantity} ELSE 0 END)`,
      adjustmentQuantity: sql<number>`SUM(CASE WHEN ${hInventoryTransactions.transactionType} = 'adjustment' THEN ${hInventoryTransactions.quantity} ELSE 0 END)`,
      transactionCount: sql<number>`COUNT(*)`
    })
    .from(hInventoryTransactions)
    .leftJoin(hInventoryLots, eq(hInventoryTransactions.lotId, hInventoryLots.id))
    .where(and(...conditions))
    .groupBy(sql`DATE(${hInventoryTransactions.createdAt})`)
    .orderBy(sql`DATE(${hInventoryTransactions.createdAt})`);
  
  return trend.map((row) => ({
    date: row.date,
    receiptQuantity: row.receiptQuantity || 0,
    usageQuantity: row.usageQuantity || 0,
    adjustmentQuantity: row.adjustmentQuantity || 0,
    netChange: (row.receiptQuantity || 0) - (row.usageQuantity || 0) + (row.adjustmentQuantity || 0),
    transactionCount: row.transactionCount || 0
  }));
}

async function getInventoryTurnoverAnalysis(params: {
  startDate?: string;
  endDate?: string;
  siteId?: number;
  materialId?: number;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  // 기본값 설정 (최근 30일)
  const endDate = params.endDate || new Date().toISOString().split('T')[0];
  const startDate = params.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  const { hInventoryTransactions, hMaterials, hInventoryLots } = await import("../../drizzle/schema");
  const { sql, and, eq } = await import("drizzle-orm");
  
  // 1. 기간 내 사용량 조회 (lotId를 통해 materialId 얻기)
  const usageData = await db
    .select({
      materialId: hInventoryLots.materialId,
      totalUsage: sql<number>`SUM(${hInventoryTransactions.quantity})`
    })
    .from(hInventoryTransactions)
    .leftJoin(hInventoryLots, eq(hInventoryTransactions.lotId, hInventoryLots.id))
    .where(and(
      eq(hInventoryTransactions.transactionType, "usage"),
      sql`DATE(${hInventoryTransactions.createdAt}) >= ${startDate}`,
      sql`DATE(${hInventoryTransactions.createdAt}) <= ${endDate}`,
      params.tenantId ? sql`${hInventoryLots.materialId} IN (SELECT id FROM h_materials WHERE tenant_id = ${params.tenantId})` : undefined
    ))
    .groupBy(hInventoryLots.materialId);
  
  // 2. 현재 재고 조회
  const currentStock = await db
    .select({
      materialId: hInventoryLots.materialId,
      totalStock: sql<number>`SUM(${hInventoryLots.availableQuantity})`
    })
    .from(hInventoryLots)
    .where(and(
      eq(hInventoryLots.status, "available"),
      params.tenantId ? sql`${hInventoryLots.materialId} IN (SELECT id FROM h_materials WHERE tenant_id = ${params.tenantId})` : undefined
    ))
    .groupBy(hInventoryLots.materialId);
  
  // 3. 원재료 정보와 결합 (tenantId 필터 포함)
  const materials = await db.select().from(hMaterials).where(
    params.tenantId ? eq(hMaterials.tenantId, params.tenantId) : undefined
  );
  
  // 4. 회전율 계산
  const turnoverRates = materials.map((material) => {
    const usage = usageData.find((u) => u.materialId === material.id);
    const stock = currentStock.find((s) => s.materialId === material.id);
    
    const totalUsage = usage?.totalUsage || 0;
    const totalStock = stock?.totalStock || 0;
    
    // 회전율 = 사용량 / 평균 재고 (간단히 현재 재고로 근사)
    const turnoverRate = totalStock > 0 ? totalUsage / totalStock : 0;
    
    // 재고 일수 = 재고 / (일평균 사용량)
    const daysDiff = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24));
    const avgDailyUsage = daysDiff > 0 ? totalUsage / daysDiff : 0;
    const daysOfStock = avgDailyUsage > 0 ? totalStock / avgDailyUsage : 0;
    
    return {
      materialId: material.id,
      materialName: material.materialName,
      materialCode: material.materialCode,
      totalUsage,
      totalStock,
      turnoverRate: turnoverRate.toFixed(2),
      daysOfStock: Math.ceil(daysOfStock),
      avgDailyUsage: avgDailyUsage.toFixed(2)
    };
  });
  
  return turnoverRates.sort((a, b) => parseFloat(b.turnoverRate) - parseFloat(a.turnoverRate));
}

export async function optimizeProductionSchedule(params: {
  startDate: string;
  endDate: string;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 1. 기간 내 계획된 배치 조회 (★ hProductsV2 사용)
  const batches = await db
    .select({
      id: hBatches.id,
      batchCode: hBatches.batchCode,
      productId: hBatches.productId,
      productName: hProductsV2.productName,
      plannedDate: hBatches.plannedDate,
      plannedQuantity: hBatches.plannedQuantity,
      status: hBatches.status
    })
    .from(hBatches)
    .leftJoin(hProductsV2, eq(hBatches.productId, hProductsV2.id))
    .where(
      and(
        eq(hBatches.tenantId, params.tenantId),
        sql`${hBatches.plannedDate} >= ${params.startDate}`,
        sql`${hBatches.plannedDate} <= ${params.endDate}`,
        sql`${hBatches.status} IN ('planned', 'running')`
      )
    )
    .orderBy(hBatches.plannedDate);

  // 2. 각 배치별 필요한 원재료 조회
  const batchMaterials = await Promise.all(
    batches.map(async (batch: any) => {
      try {
        const materials = await calculateMaterialRequirements(batch.id);
        return {
          batchId: batch.id,
          batchCode: batch.batchCode,
    dayBatchGroup: batch.dayBatchGroup || null,
    batchOrder: batch.batchOrder ?? null,
          productName: batch.productName,
          plannedDate: batch.plannedDate,
          materials: materials.materials.filter((m: any) => m.shortage > 0)
        };
      } catch (error) {
        // 레시피가 없는 경우 빈 배열 반환
        return {
          batchId: batch.id,
          batchCode: batch.batchCode,
    dayBatchGroup: batch.dayBatchGroup || null,
    batchOrder: batch.batchOrder ?? null,
          productName: batch.productName,
          plannedDate: batch.plannedDate,
          materials: []
        };
      }
    })
  );

  // 3. 재고 부족이 있는 배치 필터링
  const batchesWithShortage = batchMaterials.filter((b: any) => b.materials.length > 0);

  // 4. LLM API를 사용하여 최적화 제안 생성
  let suggestions: any[] = [];
  
  if (batchesWithShortage.length > 0) {
    try {
      const { invokeLLM } = await import("../_core/llm");
      
      // LLM에 전달할 배치 정보 준비
      const batchInfo = batchesWithShortage.map((batch: any) => ({
        batchCode: batch.batchCode,
    dayBatchGroup: batch.dayBatchGroup || null,
    batchOrder: batch.batchOrder ?? null,
        productName: batch.productName,
        plannedDate: batch.plannedDate,
        shortages: batch.materials.map((m: any) => ({
          material: m.materialName,
          shortage: `${m.shortage.toFixed(2)} ${m.unit}`,
          currentStock: `${m.currentStock.toFixed(2)} ${m.unit}`
        }))
      }));
      
      const prompt = `다음은 HACCP 식품 제조 공장의 생산 일정과 재고 부족 현황입니다.

배치 정보:
${JSON.stringify(batchInfo, null, 2)}

각 배치에 대해 다음 사항을 분석하고 제안해주세요:
1. 재고 부족 문제의 심각성 평가
2. 최적의 해결 방안 (일정 조정, 긴급 발주, 대체 원재료 사용 등)
3. 우선순위 (high/medium/low)

JSON 형식으로 응답해주세요:
{
  "suggestions": [
    {
      "batchCode": "배치 코드",
      "issue": "문제 설명",
      "suggestion": "구체적인 해결 방안",
      "priority": "high/medium/low"
    }
  ]
}`;
      
      const response = await invokeLLM({
        messages: [
          { role: "system", content: "당신은 HACCP 식품 제조 공장의 생산 계획 최적화 전문가입니다." },
          { role: "user", content: prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "production_optimization",
            strict: true,
            schema: {
              type: "object",
              properties: {
                suggestions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      batchCode: { type: "string" },
                      issue: { type: "string" },
                      suggestion: { type: "string" },
                      priority: { type: "string", enum: ["high", "medium", "low"] }
                    },
                    required: ["batchCode", "issue", "suggestion", "priority"],
                    additionalProperties: false
                  }
                }
              },
              required: ["suggestions"],
              additionalProperties: false
            }
          }
        }
      });
      
      const content = response.choices[0].message.content;
      const llmResult = JSON.parse(typeof content === "string" ? content : "{}");
      
      // LLM 결과를 기존 배치 정보와 결합
      suggestions = batchesWithShortage.map((batch: any) => {
        const llmSuggestion = llmResult.suggestions?.find(
          (s: any) => s.batchCode === batch.batchCode
        );
        
        return {
          batchId: batch.batchId,
          batchCode: batch.batchCode,
    dayBatchGroup: batch.dayBatchGroup || null,
    batchOrder: batch.batchOrder ?? null,
          productName: batch.productName,
          currentDate: batch.plannedDate,
          issue: llmSuggestion?.issue || `재고 부족 (${batch.materials.length}건)`,
          suggestion: llmSuggestion?.suggestion || "일정 연기 또는 원재료 긴급 발주 필요",
          priority: (llmSuggestion?.priority || "high") as "high" | "medium" | "low"
        };
      });
    } catch (error) {
      console.error("LLM API 호출 실패, 기본 제안 사용:", error);
      
      // LLM API 실패 시 기본 제안 사용
      suggestions = batchesWithShortage.map((batch: any) => {
        const shortageList = batch.materials
          .map((m: any) => `${m.materialName}: ${m.shortage.toFixed(2)} ${m.unit} 부족`)
          .join(", ");

        return {
          batchId: batch.batchId,
          batchCode: batch.batchCode,
    dayBatchGroup: batch.dayBatchGroup || null,
    batchOrder: batch.batchOrder ?? null,
          productName: batch.productName,
          currentDate: batch.plannedDate,
          issue: `재고 부족 (${shortageList})`,
          suggestion: "일정 연기 또는 원재료 긴급 발주 필요",
          priority: "high" as const
        };
      });
    }
  }

  return {
    totalBatches: batches.length,
    batchesWithIssues: suggestions.length,
    suggestions
  };
}

/**
 * 최적화 제안 적용 (배치 일정 변경)
 */
export async function applyScheduleOptimization(params: {
  batchId: number;
  newPlannedDate: string;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db
    .update(hBatches)
    .set({
      plannedDate: new Date(params.newPlannedDate)
    })
    .where(and(eq(hBatches.id, params.batchId), eq(hBatches.tenantId, params.tenantId)));

  return { success: true };
}

/**
 * 재고 예측 분석 (과거 사용 패턴 기반)
 */
export async function predictInventoryShortage(params: {
  materialId: number;
  days: number; // 예측 기간 (일)
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 1. 과거 30일간 재고 거래 내역 조회
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const transactions = await db
    .select({
      createdAt: hInventoryTransactions.createdAt,
      quantity: hInventoryTransactions.quantity,
      transactionType: hInventoryTransactions.transactionType
    })
    .from(hInventoryTransactions)
    .innerJoin(hInventoryLots, eq(hInventoryTransactions.lotId, hInventoryLots.id))
    .where(
      and(
        eq(hInventoryLots.materialId, params.materialId),
        sql`${hInventoryTransactions.createdAt} >= ${thirtyDaysAgo.toISOString().split('T')[0]}`,
        params.tenantId ? sql`${hInventoryLots.materialId} IN (SELECT id FROM h_materials WHERE tenant_id = ${params.tenantId})` : undefined
      )
    )
    .orderBy(hInventoryTransactions.createdAt);
  
  // 2. 일평균 사용량 계산 (사용 거래만)
  const usageTransactions = transactions.filter(t => t.transactionType === "usage");
  const totalUsage = usageTransactions.reduce((sum, t) => sum + Math.abs(Number(t.quantity)), 0);
  const dailyAverageUsage = usageTransactions.length > 0 ? totalUsage / 30 : 0;
  
  // 3. 현재 재고 조회
  const currentStock = await db
    .select({
      totalQuantity: sql<number>`COALESCE(SUM(${hInventoryLots.quantity}), 0)`
    })
    .from(hInventoryLots)
    .where(
      and(
        eq(hInventoryLots.materialId, params.materialId),
        sql`${hInventoryLots.status} = 'available'`,
        params.tenantId ? sql`${hInventoryLots.materialId} IN (SELECT id FROM h_materials WHERE tenant_id = ${params.tenantId})` : undefined
      )
    );
  
  const currentQuantity = Number(currentStock[0]?.totalQuantity || 0);
  
  // 4. 예측: 재고 부족 예상 일자 계산
  const daysUntilShortage = dailyAverageUsage > 0 ? Math.floor(currentQuantity / dailyAverageUsage) : 999;
  const shortageDate = new Date();
  shortageDate.setDate(shortageDate.getDate() + daysUntilShortage);
  
  // 5. 권장 발주량 계산 (예측 기간 동안 필요한 수량)
  const recommendedOrderQuantity = dailyAverageUsage * params.days;
  
  return {
    materialId: params.materialId,
    currentStock: currentQuantity,
    dailyAverageUsage: dailyAverageUsage,
    daysUntilShortage: daysUntilShortage,
    shortageDate: daysUntilShortage < 999 ? shortageDate.toISOString().split('T')[0] : null,
    recommendedOrderQuantity: Math.ceil(recommendedOrderQuantity),
    isUrgent: daysUntilShortage <= 7
  };
}

/**
 * 모든 원재료 재고 부족 예측
 */
export async function predictAllInventoryShortage(days: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 1. 모든 원재료 조회 (tenantId 필터 포함)
  const materials = await db
    .select({
      id: hMaterials.id,
      materialCode: hMaterials.materialCode,
      materialName: hMaterials.materialName,
      unit: hMaterials.unit
    })
    .from(hMaterials)
    .where(tenantId ? eq(hMaterials.tenantId, tenantId) : undefined);
  
  // 2. 각 원재료별로 재고 부족 예측
  const predictions = await Promise.all(
    materials.map(async (material) => {
      try {
        const prediction = await predictInventoryShortage({
          materialId: material.id,
          days,
          tenantId: tenantId!
        });
        return {
          ...prediction,
          materialCode: material.materialCode,
          materialName: material.materialName,
          unit: material.unit
        };
      } catch (error) {
        console.error(`Failed to predict shortage for material ${material.id}:`, error);
        return null;
      }
    })
  );
  
  // 3. null 제거 및 부족 예상 원재료만 필터링
  return predictions
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .filter((p) => p.daysUntilShortage < 999)
    .sort((a, b) => a.daysUntilShortage - b.daysUntilShortage);
}

/**
 * 자동 발주 제안 생성 (모든 원재료 대상)
 */
export async function generatePurchaseOrderSuggestions(params: {
  days: number; // 예측 기간 (일)
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 1. 모든 활성 원재료 조회 (tenantId 필터 포함)
  const conditions: any[] = [eq(hMaterials.isActive, 1)];
  if (params.tenantId) {
    conditions.push(eq(hMaterials.tenantId, params.tenantId));
  }
  const materials = await db
    .select({
      id: hMaterials.id,
      materialCode: hMaterials.materialCode,
      materialName: hMaterials.materialName,
      unit: hMaterials.unit,
      safetyStockLevel: hMaterials.safetyStockLevel
    })
    .from(hMaterials)
    .where(and(...conditions));
  
  // 2. 각 원재료별 재고 예측 분석
  const suggestions = await Promise.all(
    materials.map(async (material: any) => {
      const prediction = await predictInventoryShortage({
        materialId: material.id,
        days: params.days,
        tenantId: params.tenantId
      });
      
      const safetyStock = Number(material.safetyStockLevel || 0);
      const leadTime = 7; // 기본 리드타임 7일
      
      // 안전 재고 미달 또는 리드타임 내 부족 예상 시 발주 제안
      const needsOrder = 
        prediction.currentStock < safetyStock ||
        prediction.daysUntilShortage <= leadTime;
      
      if (!needsOrder) return null;
      
      return {
        materialId: material.id,
        materialCode: material.materialCode,
        materialName: material.materialName,
        unit: material.unit,
        currentStock: prediction.currentStock,
        safetyStockLevel: safetyStock,
        dailyUsage: prediction.dailyAverageUsage,
        daysUntilShortage: prediction.daysUntilShortage,
        shortageDate: prediction.shortageDate,
        recommendedOrderQuantity: prediction.recommendedOrderQuantity,
        leadTimeDays: leadTime,
        priority: prediction.isUrgent ? "urgent" as const : "normal" as const,
        reason: prediction.currentStock < safetyStock
          ? "안전 재고 미달"
          : `${prediction.daysUntilShortage}일 내 재고 부족 예상`
      };
    })
  );
  
  return suggestions.filter((s): s is NonNullable<typeof s> => s !== null);
}


/**
 * 모든 원재료 재고 부족 예측 (UI용)
 */
export async function predictAllMaterialsShortage(params: {
  days: number; // 예측 기간 (일)
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 1. 모든 활성 원재료 조회 (tenantId 필터 포함)
  const conditions: any[] = [eq(hMaterials.isActive, 1)];
  if (params.tenantId) {
    conditions.push(eq(hMaterials.tenantId, params.tenantId));
  }
  const materials = await db
    .select({
      id: hMaterials.id,
      materialCode: hMaterials.materialCode,
      materialName: hMaterials.materialName,
      unit: hMaterials.unit
    })
    .from(hMaterials)
    .where(and(...conditions));
  
  // 2. 각 원재료별 재고 예측
  const predictions = await Promise.all(
    materials.map(async (material: any) => {
      const prediction = await predictInventoryShortage({
        materialId: material.id,
        days: params.days,
        tenantId: params.tenantId
      });
      
      // 예측 기간 내 부족이 예상되는 경우만 반환
      if (prediction.daysUntilShortage > params.days) {
        return null;
      }
      
      return {
        materialId: material.id,
        materialCode: material.materialCode,
        materialName: material.materialName,
        unit: material.unit,
        currentStock: prediction.currentStock,
        avgDailyUsage: prediction.dailyAverageUsage,
        predictedShortageDate: prediction.shortageDate,
        daysUntilShortage: prediction.daysUntilShortage
      };
    })
  );
  
  return predictions
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .sort((a, b) => a.daysUntilShortage - b.daysUntilShortage);
}

/**
 * 배치별 원가 분석
 */
export async function getBatchCostAnalysis(params: {
  startDate?: string;
  endDate?: string;
  siteId?: number;
  productId?: number;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 기본값 설정 (최근 30일)
  const endDate = params.endDate || new Date().toISOString().split('T')[0];
  const startDate = params.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
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

/**
 * 생산 시간 추이 분석
 */
export async function getProductionTimeAnalysis(params: {
  startDate?: string;
  endDate?: string;
  siteId?: number;
  productId?: number;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 기본값 설정 (최근 30일)
  const endDate = params.endDate || new Date().toISOString().split('T')[0];
  const startDate = params.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  // sql 템플릿으로 전체 쿼리 작성 (ONLY_FULL_GROUP_BY 모드 호환)
  const tenantFilter = params.tenantId ? sql`AND tenant_id = ${params.tenantId}` : sql``;
  const result = await db.execute<{
    date: string;
    avgProductionTime: number;
    totalBatches: number;
  }>(sql`
    SELECT 
      DATE(start_time) as date,
      AVG(TIMESTAMPDIFF(HOUR, start_time, end_time)) as avgProductionTime,
      COUNT(*) as totalBatches
    FROM h_batches
    WHERE start_time >= ${startDate}
      AND end_time <= ${endDate}
      AND status = 'completed'
      ${tenantFilter}
    GROUP BY DATE(start_time)
    ORDER BY DATE(start_time)
  `);
  
  return result.map((r: any) => ({
    date: r.date,
    avgProductionTime: Number(r.avgProductionTime) || 0,
    totalBatches: Number(r.totalBatches) || 0
  }));
}

/**
 * 불량률 분석
 */
export async function getDefectRateAnalysis(params: {
  startDate?: string;
  endDate?: string;
  siteId?: number;
  productId?: number;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 기본값 설정 (최근 30일)
  const endDate = params.endDate || new Date().toISOString().split('T')[0];
  const startDate = params.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  const conditions = [
    sql`${hBatches.startTime} >= ${startDate}`,
    sql`${hBatches.endTime} <= ${endDate}`,
    eq(hBatches.status, "completed")
  ];
  if (params.tenantId) {
    conditions.push(eq(hBatches.tenantId, params.tenantId));
  }
  const result = await db
    .select({
      productId: hBatches.productId,
      productName: hProductsV2.productName,
      totalPlanned: sql<number>`SUM(${hBatches.plannedQuantity})`,
      totalActual: sql<number>`SUM(${hBatches.actualQuantity})`,
      batchCount: sql<number>`COUNT(*)`
    })
    .from(hBatches)
    .leftJoin(hProductsV2, eq(hBatches.productId, hProductsV2.id))
    .where(and(...conditions))
    .groupBy(hBatches.productId, hProductsV2.productName);
  
  return result.map((r: any) => {
    const totalPlanned = Number(r.totalPlanned || 0);
    const totalActual = Number(r.totalActual || 0);
    const defectRate = totalPlanned > 0
      ? ((totalPlanned - totalActual) / totalPlanned) * 100
      : 0;
    
    return {
      productId: r.productId,
      productName: r.productName,
      totalPlanned,
      totalActual,
      defectRate: Number(defectRate.toFixed(2)),
      batchCount: Number(r.batchCount || 0)
    };
  });
}

// ============================================================================
// Phase 123: 발주 제안 승인/거부 워크플로우
// ============================================================================

/**
 * 발주 제안 승인 및 자동 발주 주문 생성
 */
export async function approvePurchaseOrderSuggestion(params: {
  materialId: number;
  quantity: number;
  approvedBy: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  // 1. 원재료 정보 조회
  const [material] = await db
    .select()
    .from(hMaterials)
    .where(eq(hMaterials.id, params.materialId));
  
  if (!material) {
    throw new Error("원재료를 찾을 수 없습니다");
  }
  
  // 2. 발주 주문 생성 (간소화: 발주 테이블이 없으므로 재고 거래로 기록)
  const now = new Date();
  
  // 3. LOT 생성 (발주 승인 = 입고 예정)
  const [newLot] = await db
    .insert(hInventoryLots)
    .values({
      materialId: params.materialId,
      lotNumber: `PO-${Date.now()}`,
      quantity: params.quantity.toString(),
      availableQuantity: params.quantity.toString(),
      unit: material.unit || "kg",
      expiryDate: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000), // 90일 후 유통기한
      receiptDate: now,
      status: "available"
    } as any)
    .$returningId();
  
  // 4. 거래 내역 기록
  await db.insert(hInventoryTransactions).values({
    lotId: newLot.id,
    transactionType: "receipt",
    quantity: params.quantity.toString(),
    unit: material.unit || "kg",
    createdBy: params.approvedBy,
    notes: `발주 제안 승인 - 자동 생성`
  } as any);
  
  return {
    success: true,
    lotId: newLot.id,
    message: "발주 제안이 승인되었으며, 입고 예정 LOT가 생성되었습니다"
  };
}

/**
 * 발주 제안 거부
 */
export async function rejectPurchaseOrderSuggestion(params: {
  materialId: number;
  rejectedBy: number;
  reason?: string;
}) {
  // 간소화: 거부 내역은 로그로만 기록
  console.log(`[발주 제안 거부] 원재료 ID: ${params.materialId}, 거부자: ${params.rejectedBy}, 사유: ${params.reason || "없음"}`);
  
  return {
    success: true,
    message: "발주 제안이 거부되었습니다"
  };
}

/**
 * 발주 제안 이력 조회
 */
export async function getPurchaseProposalHistory(params: {
  startDate?: string;
  endDate?: string;
  status?: "draft" | "submitted" | "approved" | "received" | "cancelled";
  materialId?: number;
  tenantId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const { hPurchaseOrders, hPurchaseOrderItems, hMaterials, hSuppliers } = await import("../../drizzle/schema");
  const { and, eq, gte, lte, sql } = await import("drizzle-orm");
  
  const conditions = [];
  
  if (params.startDate) {
    conditions.push(gte(hPurchaseOrders.orderDate, new Date(params.startDate)));
  }
  if (params.endDate) {
    conditions.push(lte(hPurchaseOrders.orderDate, new Date(params.endDate)));
  }
  if (params.status) {
    conditions.push(eq(hPurchaseOrders.status, params.status));
  }
  
  // 발주 주문 조회
  const orders = await db
    .select({
      id: hPurchaseOrders.id,
      poNumber: hPurchaseOrders.poNumber,
      orderDate: hPurchaseOrders.orderDate,
      expectedDeliveryDate: hPurchaseOrders.expectedDeliveryDate,
      totalAmount: hPurchaseOrders.totalAmount,
      status: hPurchaseOrders.status,
      notes: hPurchaseOrders.notes,
      createdAt: hPurchaseOrders.createdAt,
      supplierId: hPurchaseOrders.supplierId
    })
    .from(hPurchaseOrders)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(sql`${hPurchaseOrders.orderDate} DESC`);
  
  // 각 발주 주문의 항목 조회
  const ordersWithItems = await Promise.all(
    orders.map(async (order) => {
      const items = await db
        .select({
          id: hPurchaseOrderItems.id,
          materialId: hPurchaseOrderItems.materialId,
          materialName: hMaterials.materialName,
          materialCode: hMaterials.materialCode,
          quantity: hPurchaseOrderItems.quantity,
          unit: hPurchaseOrderItems.unit,
          unitPrice: hPurchaseOrderItems.unitPrice,
          totalPrice: hPurchaseOrderItems.totalPrice,
          notes: hPurchaseOrderItems.notes
        })
        .from(hPurchaseOrderItems)
        .leftJoin(hMaterials, eq(hPurchaseOrderItems.materialId, hMaterials.id))
        .where(eq(hPurchaseOrderItems.poId, order.id));
      
      // 원재료 필터링
      const filteredItems = params.materialId
        ? items.filter((item) => item.materialId === params.materialId)
        : items;
      
      // 원재료 필터링 후 항목이 없으면 해당 주문 제외
      if (params.materialId && filteredItems.length === 0) {
        return null;
      }
      
      // 공급업체 정보 조회
      const [supplier] = await db
        .select({
          supplierName: hSuppliers.supplierName
        })
        .from(hSuppliers)
        .where(eq(hSuppliers.id, order.supplierId));
      
      return {
        ...order,
        supplierName: supplier?.supplierName || "알 수 없음",
        items: filteredItems
      };
    })
  );
  
  // null 제거 (원재료 필터링으로 제외된 경우)
  return ordersWithItems.filter((order) => order !== null);
}


// ============================================================
// 통합 대시보드 탭별 API (Phase 134)
// ============================================================

/**
 * 생산 효율성 탭 통합 데이터 조회
 * - 배치별 원가 분석
 * - 생산 시간 추이
 * - 불량률 분석
 */
export async function getProductionEfficiencyData(params: {
  siteId: number;
  startDate?: string;
  endDate?: string;
  productId?: number;
  tenantId: number;
}) {
  const [costAnalysis, timeAnalysis, defectAnalysis] = await Promise.all([
    getBatchCostAnalysis(params),
    getProductionTimeAnalysis(params),
    getDefectRateAnalysis(params),
  ]);

  return {
    costAnalysis,
    timeAnalysis,
    defectAnalysis
  };
}

/**
 * 재고 추이 탭 통합 데이터 조회
 * - 재고 추이
 * - 재고 회전율
 * - 유통기한 임박 원재료
 */
export async function getInventoryTrendData(params: {
  siteId: number;
  startDate?: string;
  endDate?: string;
  materialId?: number;
  tenantId: number;
}) {
  const [inventoryTrend, turnoverAnalysis, expiringMaterials] = await Promise.all([
    getInventoryTrend(params),
    getInventoryTurnoverAnalysis(params),
    getExpiringMaterials(params.tenantId),
  ]);

  return {
    inventoryTrend,
    turnoverAnalysis,
    expiringMaterials
  };
}



