import { getDb } from "../connection";
import { eq, and, lt } from "drizzle-orm";
import { hBatchCompletionRetries } from "../../../drizzle/schema/schema_main";

/**
 * 모든 함수는 회사 번호가 필수다 (2026-10-21). 이전에는 선택 인자라 큐에 넣을 때 빠져 DB 기본값(1)으로 저장되고,
 * 상태 갱신은 `tenant_id = undefined` 조건이 되어 재시도가 제대로 돌지 않았다.
 */
function assertTenant(tenantId: number): void {
  if (!Number.isInteger(tenantId) || tenantId <= 0) throw new Error("[보안] tenantId 가 필요합니다 (배치 완료 재시도 큐)");
}

/**
 * 배치 완료 실패 항목을 재시도 큐에 추가
 */
export async function addRetryTask(data: {
  batchId: number;
  taskType: string;
  errorMessage: string;
  maxRetries?: number;
}, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  assertTenant(tenantId);

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
export async function getPendingRetryTasks(tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  assertTenant(tenantId);
  
  return await db
    .select()
    .from(hBatchCompletionRetries)
    .where(
      and(
        eq(hBatchCompletionRetries.tenantId, tenantId),
        eq(hBatchCompletionRetries.status, "pending"),
        lt(hBatchCompletionRetries.retryCount, hBatchCompletionRetries.maxRetries)
      )
    )
    .orderBy(hBatchCompletionRetries.createdAt);
}

/**
 * 재시도 작업 상태 업데이트
 */
export async function updateRetryTaskStatus(
  id: number,
  status: "retrying" | "success" | "failed",
  errorMessage: string | undefined, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  assertTenant(tenantId);
  
  await db
    .update(hBatchCompletionRetries)
    .set({
      status,
      errorMessage: errorMessage || undefined,
      lastRetryAt: new Date()
    })
    .where(and(eq(hBatchCompletionRetries.tenantId, tenantId), eq(hBatchCompletionRetries.id, id)));}

/**
 * 재시도 횟수 증가
 */
export async function incrementRetryCount(id: number, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  assertTenant(tenantId);
  
  const [retry] = await db
    .select()
    .from(hBatchCompletionRetries)
    .where(and(eq(hBatchCompletionRetries.tenantId, tenantId), eq(hBatchCompletionRetries.id, id)));
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
    .where(and(eq(hBatchCompletionRetries.tenantId, tenantId), eq(hBatchCompletionRetries.id, id)));
  return newRetryCount >= retry.maxRetries;
}

/**
 * 실패한 작업 목록 조회 (관리자용)
 */
export async function getFailedRetryTasks(tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  assertTenant(tenantId);
  
  return await db
    .select()
    .from(hBatchCompletionRetries)
    .where(and(eq(hBatchCompletionRetries.tenantId, tenantId), eq(hBatchCompletionRetries.status, "failed")))    .orderBy(hBatchCompletionRetries.createdAt);
}

/**
 * 재시도 작업 삭제
 */
export async function deleteRetryTask(id: number, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  assertTenant(tenantId);
  
  await db.delete(hBatchCompletionRetries).where(and(eq(hBatchCompletionRetries.tenantId, tenantId), eq(hBatchCompletionRetries.id, id)));}
