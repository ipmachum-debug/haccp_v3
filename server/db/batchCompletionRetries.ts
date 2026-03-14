import { getDb } from "../db";
import { eq, and, lt } from "drizzle-orm";
import { hBatchCompletionRetries } from "../../drizzle/schema_main";

/**
 * 배치 완료 실패 항목을 재시도 큐에 추가
 */
export async function addRetryTask(data: {
  batchId: number;
  taskType: string;
  errorMessage: string;
  maxRetries?: number;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [retry] = await db.insert(hBatchCompletionRetries).values({
      tenantId,
    batchId: data.batchId,
    taskType: data.taskType,
    errorMessage: data.errorMessage,
    retryCount: 0,
    maxRetries: data.maxRetries || 3,
    status: "pending"
  });

  return retry;
}

/**
 * 재시도 대기 중인 작업 목록 조회
 */
export async function getPendingRetryTasks(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db
    .select()
    .from(hBatchCompletionRetries)
    .where(
      and(eq(hBatchCompletionRetries.tenantId, tenantId) as any, 
        eq(hBatchCompletionRetries.status, "pending"),
        lt(hBatchCompletionRetries.retryCount, hBatchCompletionRetries.maxRetries)
      ) as any
    )
    .orderBy(hBatchCompletionRetries.createdAt);
}

/**
 * 재시도 작업 상태 업데이트
 */
export async function updateRetryTaskStatus(
  id: number,
  status: "retrying" | "success" | "failed",
  errorMessage?: string, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db
    .update(hBatchCompletionRetries)
    .set({
      status,
      errorMessage: errorMessage || undefined,
      lastRetryAt: new Date()
    })
    .where(and(eq(hBatchCompletionRetries.tenantId, tenantId) as any, eq(hBatchCompletionRetries.id, id)) as any);}

/**
 * 재시도 횟수 증가
 */
export async function incrementRetryCount(id: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [retry] = await db
    .select()
    .from(hBatchCompletionRetries)
    .where(and(eq(hBatchCompletionRetries.tenantId, tenantId) as any, eq(hBatchCompletionRetries.id, id)) as any);
  if (!retry) {
    throw new Error(`재시도 작업을 찾을 수 없습니다: ${id}`);
  }

  const newRetryCount = retry.retryCount + 1;
  const newStatus = newRetryCount >= retry.maxRetries ? "failed" : "pending";

  await db
    .update(hBatchCompletionRetries)
    .set({
      retryCount: newRetryCount,
      status: newStatus,
      lastRetryAt: new Date()
    })
    .where(and(eq(hBatchCompletionRetries.tenantId, tenantId) as any, eq(hBatchCompletionRetries.id, id)) as any);
  return newRetryCount >= retry.maxRetries;
}

/**
 * 실패한 작업 목록 조회 (관리자용)
 */
export async function getFailedRetryTasks(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db
    .select()
    .from(hBatchCompletionRetries)
    .where(and(eq(hBatchCompletionRetries.tenantId, tenantId) as any, eq(hBatchCompletionRetries.status, "failed")) as any)    .orderBy(hBatchCompletionRetries.createdAt);
}

/**
 * 재시도 작업 삭제
 */
export async function deleteRetryTask(id: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(hBatchCompletionRetries).where(and(eq(hBatchCompletionRetries.tenantId, tenantId) as any, eq(hBatchCompletionRetries.id, id)) as any);}
