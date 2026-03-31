import { getDb } from "../db";
import { eq, and, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";

// 임시 테이블 정의 (Drizzle 스키마에 추가 필요)
import { mysqlTable, bigint, mysqlEnum, text, timestamp } from "drizzle-orm/mysql-core";
import { hBatchCompletionRetries } from "../../drizzle/schema_main";

// TODO: h_batch_pdf_logs 테이블에 tenant_id 컬럼 추가 마이그레이션 필요
// 현재 batchId를 통한 간접 격리에 의존 (batch는 tenant-scoped)
export const hBatchPdfLogs = mysqlTable("h_batch_pdf_logs", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  batchId: bigint("batch_id", { mode: "number" }).notNull(),
  status: mysqlEnum("status", ["success", "failed"]).notNull(),
  fileUrl: text("file_url"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow()
});

export type PdfLogRecord = typeof hBatchPdfLogs.$inferSelect;

/**
 * PDF 생성 성공 로그 저장
 * Note: batchId를 통한 간접 tenant 격리 (batch 자체가 tenant-scoped)
 */
export async function logPdfSuccess(batchId: number, fileUrl: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  await db.insert(hBatchPdfLogs).values({
    batchId,
    status: "success",
    fileUrl,
    errorMessage: null
  });
}

/**
 * PDF 생성 실패 로그 저장
 */
export async function logPdfFailure(batchId: number, errorMessage: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  await db.insert(hBatchPdfLogs).values({
    batchId,
    status: "failed",
    fileUrl: null,
    errorMessage
  });
}

/**
 * 배치별 PDF 로그 조회
 */
export async function getPdfLogsByBatchId(batchId: number): Promise<PdfLogRecord[]> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  return await db
    .select()
    .from(hBatchPdfLogs)
    .where(eq(hBatchPdfLogs.batchId, batchId))
    .orderBy(desc(hBatchPdfLogs.createdAt));
}

/**
 * 배치의 최신 성공 PDF URL 조회
 */
export async function getLatestSuccessPdfUrl(batchId: number): Promise<string | null> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const result = await db
    .select({ fileUrl: hBatchPdfLogs.fileUrl })
    .from(hBatchPdfLogs)
    .where(
      and(
        eq(hBatchPdfLogs.batchId, batchId),
        eq(hBatchPdfLogs.status, "success")
      )
    )
    .orderBy(desc(hBatchPdfLogs.createdAt))
    .limit(1);

  return result.length > 0 ? result[0].fileUrl : null;
}

// h_batch_completion_retries 테이블은 drizzle/schema/scheduler.ts에 정의됨

export type RetryTaskRecord = typeof hBatchCompletionRetries.$inferSelect;

/**
 * 실패 작업 목록 조회
 */
export async function getFailedTasks(tenantId: number): Promise<RetryTaskRecord[]> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  return await db
    .select()
    .from(hBatchCompletionRetries)
    .where(and(eq(hBatchCompletionRetries.tenantId, tenantId), eq(hBatchCompletionRetries.status, "failed")))
    .orderBy(desc(hBatchCompletionRetries.createdAt));
}

/**
 * 실패 작업 재시도
 */
export async function retryFailedTask(taskId: number, tenantId: number): Promise<{ success: boolean; message: string }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 작업 조회
  const task = await db
    .select()
    .from(hBatchCompletionRetries)
    .where(and(eq(hBatchCompletionRetries.tenantId, tenantId), eq(hBatchCompletionRetries.id, taskId)))
    .limit(1);

  if (task.length === 0) {
    throw new Error("작업을 찾을 수 없습니다");
  }

  // 재시도 횟수 증가 및 상태 업데이트
  await db
    .update(hBatchCompletionRetries)
    .set({
      retryCount: sql`${hBatchCompletionRetries.retryCount} + 1`,
      status: "retrying",
      lastRetryAt: new Date()
    })
    .where(and(eq(hBatchCompletionRetries.tenantId, tenantId), eq(hBatchCompletionRetries.id, taskId)));

  // TODO: 실제 재시도 로직 구현 (PDF 생성, 알림 전송 등)
  // 현재는 상태만 업데이트

  return {
    success: true,
    message: "작업이 재시도 큐에 추가되었습니다"
  };
}

/**
 * 실패 작업 삭제
 */
export async function deleteFailedTask(taskId: number, tenantId: number): Promise<{ success: boolean; message: string }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  await db
    .delete(hBatchCompletionRetries)
    .where(and(eq(hBatchCompletionRetries.tenantId, tenantId), eq(hBatchCompletionRetries.id, taskId)));

  return {
    success: true,
    message: "작업이 삭제되었습니다"
  };
}
