import { getDb } from "../connection";

/**
 * 일별 생산 실적 조회
 * ✅ 멀티테넌시 격리: tenantId 필터 적용
 */
export async function getDailyProduction(date: string, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  
  const { hBatches, hProductsV2 } = await import("../../../drizzle/schema/schema_main");
  const { eq, and, gte, lte, sql } = await import("drizzle-orm");

  // planned_date 기준 조회 (배치 예정일 = 실제 작업일)
  // createdAt은 DB INSERT 시점이라 임포트 데이터 등에서 오류 발생
  const conditions: any[] = [
    eq(sql`DATE(${hBatches.plannedDate})`, date)
  ];
  if (tenantId) conditions.push(eq(hBatches.tenantId, tenantId));

  const batches = await db
    .select({
      batchId: hBatches.id,
      batchCode: hBatches.batchCode,
      productId: hBatches.productId,
      productName: hProductsV2.productName,
      plannedQuantity: hBatches.plannedQuantity,
      actualQuantity: hBatches.actualQuantity,
      status: hBatches.status,
      startTime: hBatches.startTime,
      endTime: hBatches.endTime,
      createdAt: hBatches.createdAt
    })
    .from(hBatches)
    .leftJoin(hProductsV2, eq(hBatches.productId, hProductsV2.id))
    .where(and(...conditions))
    .orderBy(hBatches.createdAt);
  
  return batches;
}

/**
 * 일별 CCP 기록 조회
 */
export async function getDailyCcpRecords(date: string, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  
  const { hCcpInstances, hCcpRows, hBatches } = await import("../../../drizzle/schema/schema_main");
  const { eq, and, gte, lte, sql } = await import("drizzle-orm");
  
  const startDate = new Date(date);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(date);
  endDate.setHours(23, 59, 59, 999);
  
  const conditions: any[] = [
    gte(hCcpRows.measuredAt, startDate),
    lte(hCcpRows.measuredAt, endDate)
  ];
  if (tenantId) conditions.push(eq(hCcpRows.tenantId, tenantId));
  
  const ccpRecords = await db
    .select({
      ccpInstanceId: hCcpInstances.id,
      batchId: hCcpInstances.batchId,
      batchCode: hBatches.batchCode,
      ccpType: hCcpInstances.ccpType,
      status: hCcpInstances.status,
      createdAt: hCcpInstances.createdAt,
      rowId: hCcpRows.id,
      result: hCcpRows.result,
      measuredAt: hCcpRows.measuredAt,
      note: hCcpRows.note
    })
    .from(hCcpInstances)
    .leftJoin(hBatches, eq(hCcpInstances.batchId, hBatches.id))
    .leftJoin(hCcpRows, eq(hCcpRows.instanceId, hCcpInstances.id))
    .where(and(...conditions))
    .orderBy(hCcpRows.measuredAt);
  
  return ccpRecords;
}

/**
 * 일별 이상 사항 조회 (CCP FAIL 건)
 */
export async function getDailyIssues(date: string, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  
  const { hCcpInstances, hCcpRows, hBatches, hProductsV2 } = await import("../../../drizzle/schema/schema_main");
  const { eq, and, gte, lte, sql } = await import("drizzle-orm");

  const startDate = new Date(date);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(date);
  endDate.setHours(23, 59, 59, 999);

  const conditions: any[] = [
    eq(hCcpRows.result, "FAIL"),
    gte(hCcpRows.measuredAt, startDate),
    lte(hCcpRows.measuredAt, endDate)
  ];
  if (tenantId) conditions.push(eq(hCcpRows.tenantId, tenantId));

  const issues = await db
    .select({
      rowId: hCcpRows.id,
      batchId: hBatches.id,
      batchCode: hBatches.batchCode,
      productName: hProductsV2.productName,
      ccpType: hCcpInstances.ccpType,
      result: hCcpRows.result,
      measuredAt: hCcpRows.measuredAt,
      note: hCcpRows.note
    })
    .from(hCcpRows)
    .leftJoin(hCcpInstances, eq(hCcpRows.instanceId, hCcpInstances.id))
    .leftJoin(hBatches, eq(hCcpInstances.batchId, hBatches.id))
    .leftJoin(hProductsV2, eq(hBatches.productId, hProductsV2.id))
    .where(and(...conditions))
    .orderBy(hCcpRows.measuredAt);
  
  return issues;
}

/**
 * 일별 요약 통계
 */
export async function getDailySummary(date: string, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  
  const { hBatches, hCcpRows } = await import("../../../drizzle/schema/schema_main");
  const { and, gte, lte, eq, count, sum, sql } = await import("drizzle-orm");
  
  // planned_date 기준 (createdAt은 INSERT 시점이라 과거 임포트 시 오류)
  const startDate = new Date(date);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(date);
  endDate.setHours(23, 59, 59, 999);

  const batchConditions: any[] = [
    eq(sql`DATE(${hBatches.plannedDate})`, date)
  ];
  if (tenantId) batchConditions.push(eq(hBatches.tenantId, tenantId));
  
  const [batchStats] = await db
    .select({
      totalBatches: count(),
      completedBatches: sql<number>`SUM(CASE WHEN ${hBatches.status} = 'completed' THEN 1 ELSE 0 END)`,
      inProgressBatches: sql<number>`SUM(CASE WHEN ${hBatches.status} = 'in_progress' THEN 1 ELSE 0 END)`
    })
    .from(hBatches)
    .where(and(...batchConditions));
  
  const ccpConditions: any[] = [
    gte(hCcpRows.measuredAt, startDate),
    lte(hCcpRows.measuredAt, endDate)
  ];
  if (tenantId) ccpConditions.push(eq(hCcpRows.tenantId, tenantId));
  
  const [ccpStats] = await db
    .select({
      totalCcpRecords: count(),
      deviationCount: sql<number>`SUM(CASE WHEN ${hCcpRows.result} = 'FAIL' THEN 1 ELSE 0 END)`
    })
    .from(hCcpRows)
    .where(and(...ccpConditions));
  
  return {
    date,
    batches: {
      total: batchStats?.totalBatches || 0,
      completed: batchStats?.completedBatches || 0,
      inProgress: batchStats?.inProgressBatches || 0
    },
    ccp: {
      totalRecords: ccpStats?.totalCcpRecords || 0,
      deviations: ccpStats?.deviationCount || 0,
      complianceRate: ccpStats?.totalCcpRecords
        ? ((ccpStats.totalCcpRecords - (ccpStats.deviationCount || 0)) / ccpStats.totalCcpRecords * 100).toFixed(2)
        : "0.00"
    }
  };
}
