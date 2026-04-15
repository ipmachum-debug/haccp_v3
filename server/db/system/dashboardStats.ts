import { getDb } from "../connection";
import { eq, and, or, lte, gte, gt, isNull, desc, asc, sql, lt, inArray, count, isNotNull, sum } from "drizzle-orm";
import { toKSTDate } from "../../utils/timezone";

import {
  hBatches,
  hCcpInstances,
  hCcpRows,
  hBatchInputs,
  hMaterials,
  hInventory,
  hInventoryLots,
  hProductsV2,
  hNotifications,
  hCcpDeviations,
  hSystemSettings,
  hInspectionRecords,
  materialInspectionRecords,
  shippingInspectionRecords,
  hygieneInspectionRecords,
  auditLogs,
} from "../../../drizzle/schema";


async function getLowStockMaterials(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const { hMaterials, hInventoryLots } = await import("../../../drizzle/schema.js");
  const { eq, and, sum, sql, gt } = await import("drizzle-orm");

  // 단일 쿼리: LEFT JOIN + GROUP BY로 원재료별 총 재고를 한번에 집계
  const materialConditions: any[] = [eq(hMaterials.isActive, 1)];
  if (tenantId) {
    materialConditions.push(eq(hMaterials.tenantId, tenantId));
  }

  // LEFT JOIN으로 원재료와 재고 LOT를 결합, GROUP BY로 원재료별 합산
  const lotTenantCondition = tenantId
    ? and(
        eq(hInventoryLots.materialId, hMaterials.id),
        eq(hInventoryLots.tenantId, tenantId)
      )
    : eq(hInventoryLots.materialId, hMaterials.id);

  const results = await db
    .select({
      id: hMaterials.id,
      name: hMaterials.materialName,
      code: hMaterials.materialCode,
      unit: hMaterials.unit,
      safetyStockLevel: hMaterials.safetyStockLevel,
      tenantId: hMaterials.tenantId,
      isActive: hMaterials.isActive,
      categoryId: hMaterials.categoryId,
      totalStock: sum(hInventoryLots.availableQuantity),
    })
    .from(hMaterials)
    .leftJoin(hInventoryLots, lotTenantCondition)
    .where(and(...materialConditions))
    .groupBy(hMaterials.id)
    .having(
      // safetyStockLevel > 0 이고, 총 재고가 안전 재고 미만인 경우만 반환
      and(
        gt(hMaterials.safetyStockLevel, sql`0`),
        sql`COALESCE(${sum(hInventoryLots.availableQuantity)}, 0) < ${hMaterials.safetyStockLevel}`
      )
    );

  return results.map((row) => {
    const totalStock = parseFloat(String(row.totalStock || "0"));
    const safetyLevel = parseFloat(String(row.safetyStockLevel || "0"));
    return {
      id: row.id,
      name: row.name,
      code: row.code,
      unit: row.unit,
      safetyStockLevel: row.safetyStockLevel,
      tenantId: row.tenantId,
      isActive: row.isActive,
      categoryId: row.categoryId,
      currentStock: totalStock,
      shortage: safetyLevel - totalStock,
    };
  });
}

export async function getDashboardStats(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const { hBatches, hCcpInstances } = await import("../../../drizzle/schema.js");
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


/**
 * 검사 통계 조회
 */
async function getInspectionStatistics(filters?: {
  startDate?: string;
  endDate?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

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
export async function getBatchProgress(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const { hBatches } = await import("../../../drizzle/schema");

  // ★ 2026-04-13 버그 수정: h_batches status enum 은
  //   'planned','in_progress','paused','completed','failed','cancelled','shipped','archived'
  //   이전 코드는 'running','finished' 라는 존재하지 않는 값을 조회해서 항상 0 반환 → 빈 차트
  //   클라이언트의 { planned, running, finished, shipped } 키 형식은 유지하되 실제 enum 값으로 매핑.
  const batches = await db
    .select({
      total: sql<number>`COUNT(*)`,
      planned: sql<number>`SUM(CASE WHEN status = 'planned' THEN 1 ELSE 0 END)`,
      running: sql<number>`SUM(CASE WHEN status IN ('in_progress','paused') THEN 1 ELSE 0 END)`,
      finished: sql<number>`SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)`,
      shipped: sql<number>`SUM(CASE WHEN status IN ('shipped','archived') THEN 1 ELSE 0 END)`,
      failed: sql<number>`SUM(CASE WHEN status IN ('failed','cancelled') THEN 1 ELSE 0 END)`,
    })
    .from(hBatches)
    .where(tenantId ? eq(hBatches.tenantId, tenantId) : undefined);

  // MySQL SUM 결과가 string 으로 올 수 있으므로 Number 로 캐스팅
  const row = (batches[0] || {}) as any;
  return {
    total: Number(row.total || 0),
    planned: Number(row.planned || 0),
    running: Number(row.running || 0),
    finished: Number(row.finished || 0),
    shipped: Number(row.shipped || 0),
    failed: Number(row.failed || 0),
  };
}

/**
 * CCP 이탈 알림 조회 (CCP 테이블이 없으므로 빈 배열 반환)
 */
export async function getCcpDeviations(filters?: {
  startDate?: string;
  endDate?: string;
  limit?: number;
}, tenantId?: number) {
  // CCP 테이블이 아직 구현되지 않음
  return [];
}

/**
 * 최근 활동 조회
 */
export async function getRecentActivities(limit: number = 10, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

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
    .where(tenantId ? eq(auditLogs.tenantId, tenantId) : undefined)
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
  if (!db) throw new Error("DB 연결 실패");
  const { hMaterials } = await import("../../../drizzle/schema.js");
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
export async function getInventoryLotById(lotId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const { hInventoryLots } = await import("../../../drizzle/schema.js");
  const { eq, and } = await import("drizzle-orm");

  const conditions: any[] = [eq(hInventoryLots.id, lotId)];
  if (tenantId) conditions.push(eq(hInventoryLots.tenantId, tenantId));

  const [lot] = await db.select().from(hInventoryLots).where(and(...conditions));
  return lot;
}

/**
 * 배치별 원재료 투입 내역 조회
 */
export async function getBatchInputsByBatchId(batchId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const { hBatchInputs, hMaterials, hInventoryLots } = await import("../../../drizzle/schema.js");
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
export async function bulkDeleteCcpInstances(instanceIds: number[], tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const { hCcpInstances, hCcpRows } = await import("../../../drizzle/schema.js");
  const { inArray, and, eq } = await import("drizzle-orm");

  // 1. tenantId 격리: 해당 테넌트의 인스턴스만 필터
  if (tenantId) {
    const validInstances = await db.select({ id: hCcpInstances.id })
      .from(hCcpInstances)
      .where(and(inArray(hCcpInstances.id, instanceIds), eq(hCcpInstances.tenantId, tenantId)));
    const validIds = validInstances.map(i => i.id);
    if (validIds.length === 0) return { deletedCount: 0 };

    await db.delete(hCcpRows).where(inArray(hCcpRows.instanceId, validIds));
    await db.delete(hCcpInstances).where(inArray(hCcpInstances.id, validIds));
    return { deletedCount: validIds.length };
  }

  // fallback (no tenantId)
  await db.delete(hCcpRows).where(inArray(hCcpRows.instanceId, instanceIds));
  await db.delete(hCcpInstances).where(inArray(hCcpInstances.id, instanceIds));
  return { deletedCount: instanceIds.length };
}

/**
 * 제품 CCP 매핑 업데이트
 */
export async function updateProductCcpMapping(productId: number, ccpTypes: string[], tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const { hProductsV2 } = await import("../../../drizzle/schema/schema_main.js");
  const { eq, and } = await import("drizzle-orm");

  const conditions: any[] = [eq(hProductsV2.id, productId)];
  if (tenantId) conditions.push(eq(hProductsV2.tenantId, tenantId));

  await db.update(hProductsV2)
    .set({ defaultCcpTypes: ccpTypes } as any)
    .where(and(...conditions));
}


/**
/**
 * 재고 부족 경고 조회
 */
export async function getLowStockWarnings(tenantId?: number) {
  const db = await getDb();
  if (!db) return [];

  const conditions: any[] = [
    sql`${hInventory.minStockLevel} IS NOT NULL`,
    sql`${hInventory.availableQuantity} < ${hInventory.minStockLevel}`
  ];
  if (tenantId) conditions.push(eq(hInventory.tenantId, tenantId));

  const lowStockItems = await db
    .select({
      id: hInventory.id,
      materialId: hInventory.materialId,
      currentStock: hInventory.availableQuantity,
      minStock: hInventory.minStockLevel,
      unit: hInventory.unit
    })
    .from(hInventory)
    .where(and(...conditions))
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
    expiryDate: lot.expiryDate ? toKSTDate(new Date(lot.expiryDate)) : '',
    quantity: Number(lot.quantity),
    unit: lot.unit
  }));
}

// ============ 대시보드 위젯 데이터 조회 ============
export async function getProductionTrend(days: number = 7, tenantId?: number) {
  const db = await getDb();
  if (!db) return { trend: [], total: 0 };

  const { hBatches } = await import("../../../drizzle/schema.js");
  const { gte, sql, and, eq } = await import("drizzle-orm");

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const conditions: any[] = [gte(hBatches.createdAt, startDate)];
  if (tenantId) conditions.push(eq(hBatches.tenantId, tenantId));

  const batches = await db
    .select({
      date: sql<string>`DATE(${hBatches.createdAt})`.as('date'),
      count: sql<number>`COUNT(*)`.as('count')
    })
    .from(hBatches)
    .where(and(...conditions))
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

export async function getMaterialConsumption(tenantId?: number) {
  const db = await getDb();
  if (!db) return [];

  const { hBatchInputs, hBatches } = await import("../../../drizzle/schema.js");
  const { sql, eq, and } = await import("drizzle-orm");

  // tenantId 격리: hBatchInputs에는 tenantId가 없으므로 hBatches와 조인
  if (tenantId) {
    const consumption = await db
      .select({
        materialId: hBatchInputs.materialId,
        totalQuantity: sql<string>`SUM(${hBatchInputs.actualQuantity})`,
        unit: hBatchInputs.unit
      })
      .from(hBatchInputs)
      .innerJoin(hBatches, eq(hBatchInputs.batchId, hBatches.id))
      .where(eq(hBatches.tenantId, tenantId))
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

  const { hCcpDeviations } = await import("../../../drizzle/schema.js");
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

/**
 * CCP 점검 이력 조회 (export용)
 */
export async function getCcpInspectionHistory(filters?: {
  startDate?: Date;
  endDate?: Date;
  siteId?: number;
  ccpType?: string;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hCcpInstances, hCcpRows, hBatches } = await import("../../../drizzle/schema.js");
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
  if (!db) throw new Error("DB 연결 실패");

  const { hCcpDeviations } = await import("../../../drizzle/schema.js");
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
  if (!db) throw new Error("DB 연결 실패");

  const { hCcpDeviations, hCcpInstances, hProductsV2 } = await import("../../../drizzle/schema.js");
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
  if (!db) throw new Error("DB 연결 실패");

  const { hCcpDeviations, hCcpInstances } = await import("../../../drizzle/schema.js");
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

// 시스템 설정 함수
// ============================================================================

/**
 * 모든 시스템 설정 조회 (테넌트 격리)
 */
export async function getSystemSettings(tenantId: number) {
  const db = await getDb();
  if (!db) return [];
  const { hSystemSettings } = await import("../../../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");
  return await db.select().from(hSystemSettings)
    .where(eq(hSystemSettings.tenantId, tenantId));
}

/**
 * 특정 설정 값 조회 (테넌트 격리)
 */
export async function getSystemSetting(key: string, tenantId?: number) {
  const db = await getDb();
  if (!db) return null;
  const { hSystemSettings } = await import("../../../drizzle/schema.js");
  const { eq, and } = await import("drizzle-orm");

  const conditions = [eq(hSystemSettings.settingKey, key)];
  if (tenantId) conditions.push(eq(hSystemSettings.tenantId, tenantId));

  const results = await db
    .select()
    .from(hSystemSettings)
    .where(and(...conditions))
    .limit(1);
  return results[0] || null;
}

/**
 * 시스템 설정 업데이트 또는 생성 (테넌트 격리)
 */
export async function upsertSystemSetting(
  key: string,
  value: string,
  description: string,
  userId: number,
  tenantId?: number
) {
  const db = await getDb();
  if (!db) return false;
  const { hSystemSettings } = await import("../../../drizzle/schema.js");
  const { eq, and } = await import("drizzle-orm");

  const existing = await getSystemSetting(key, tenantId);

  if (existing) {
    const conditions = [eq(hSystemSettings.settingKey, key)];
    if (tenantId) conditions.push(eq(hSystemSettings.tenantId, tenantId));

    await db
      .update(hSystemSettings)
      .set({
        settingValue: value,
        description,
        updatedBy: userId
      })
      .where(and(...conditions));
  } else {
    await db.insert(hSystemSettings).values({
      settingKey: key,
      settingValue: value,
      description,
      updatedBy: userId,
      ...(tenantId ? { tenantId } : {})
    } as any);
  }

  return true;
}
