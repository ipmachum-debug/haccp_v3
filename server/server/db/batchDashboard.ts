import { getDb } from "../db";
import { hBatches, hBatchApprovals } from "../../drizzle/schema";
import { eq, and, inArray, sql } from "drizzle-orm";

/**
 * 배치 상태별 집계
 */
export async function getBatchStatusSummary(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const summary = await db
    .select({
      status: hBatches.status,
      count: sql<number>`COUNT(*)`
    })
    .from(hBatches).where(eq(hBatches.tenantId, tenantId)).groupBy(hBatches.status);

  return summary;
}

/**
 * 진행 중인 배치 목록
 */
export async function getInProgressBatches(limit: number = 10, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const batches = await db
    .select()
    .from(hBatches)
    .where(and(eq(hBatches.tenantId, tenantId), eq(hBatches.status, "in_progress")))    .orderBy(sql`${hBatches.createdAt} DESC`)
    .limit(limit);

  return batches;
}

/**
 * 완료된 배치 목록
 */
export async function getCompletedBatches(limit: number = 10, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const batches = await db
    .select()
    .from(hBatches)
    .where(and(eq(hBatches.tenantId, tenantId), eq(hBatches.status, "completed")))    .orderBy(sql`${hBatches.createdAt} DESC`)
    .limit(limit);

  return batches;
}

/**
 * 승인 대기 중인 배치 목록
 */
export async function getPendingApprovalBatches(limit: number = 10, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 완료 상태이면서 승인 이력이 없거나 pending 상태인 배치
  const batches = await db
    .select({
      id: hBatches.id,
      batchCode: hBatches.batchCode,
      productId: hBatches.productId,
      plannedQuantity: hBatches.plannedQuantity,
      actualQuantity: hBatches.actualQuantity,
      status: hBatches.status,
      createdAt: hBatches.createdAt,
      updatedAt: hBatches.updatedAt
    })
    .from(hBatches)
    .leftJoin(hBatchApprovals, eq(hBatchApprovals.batchId, hBatches.id))
    .where(
      and(
        eq(hBatches.status, "completed"),
        sql`(${hBatchApprovals.status} IS NULL OR ${hBatchApprovals.status} = 'pending')`
      )
    )
    .orderBy(sql`${hBatches.createdAt} DESC`)
    .limit(limit);

  return batches;
}

/**
 * 배치 생산 대시보드 전체 데이터
 */
export async function getBatchDashboardData(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [summary, inProgress, completed, pendingApproval] = await Promise.all([
    getBatchStatusSummary(),
    getInProgressBatches(5),
    getCompletedBatches(5),
    getPendingApprovalBatches(5),
  ]);

  return {
    summary,
    inProgress,
    completed,
    pendingApproval
  };
}
