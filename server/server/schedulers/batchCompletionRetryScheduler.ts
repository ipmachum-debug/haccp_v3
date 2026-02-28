import * as cron from "node-cron";
import { getDb } from "../db";
import { tenants } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import {
  getPendingRetryTasks,
  updateRetryTaskStatus,
  incrementRetryCount,
} from "../db/batchCompletionRetries";
import { notifyOwner } from "../_core/notification";

/**
 * 배치 완료 재시도 작업 실행
 * [보안 수정] 테넌트별 격리 처리 적용
 */
async function processBatchCompletionRetries() {
  console.log("[Scheduler] 배치 완료 재시도 작업 시작");

  try {
    const db = await getDb();
    if (!db) {
      console.error("[Scheduler] Database connection failed");
      return;
    }

    // [보안] 활성 테넌트 목록 조회
    const activeTenants = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.status, "active"));

    for (const tenant of activeTenants) {
      const tenantId = tenant.id;

      const pendingTasks = await getPendingRetryTasks(tenantId);

      if (pendingTasks.length === 0) {
        continue;
      }

      console.log(`[Scheduler] [tenant:${tenantId}] ${pendingTasks.length}개의 재시도 작업 발견`);

      for (const task of pendingTasks) {
        try {
          // 재시도 상태로 변경
          await updateRetryTaskStatus(task.id, "retrying");

          // 작업 유형에 따라 재시도
          if (task.taskType === "pdf_generation") {
            await retryPdfGeneration(task.batchId);
          } else if (task.taskType === "notification") {
            await retryNotification(task.batchId);
          }

          // 성공 시 상태 업데이트
          await updateRetryTaskStatus(task.id, "success");
          console.log(`[Scheduler] [tenant:${tenantId}] 재시도 성공: Task ID ${task.id}, Type ${task.taskType}`);
        } catch (error) {
          console.error(`[Scheduler] [tenant:${tenantId}] 재시도 실패: Task ID ${task.id}`, error);

          // 재시도 횟수 증가
          const maxRetriesReached = await incrementRetryCount(task.id);

          if (maxRetriesReached) {
            try {
              await notifyOwner({
                title: "배치 완료 작업 재시도 실패",
                content: `배치 ID ${task.batchId}의 ${task.taskType} 작업이 최대 재시도 횟수(${task.maxRetries}회)를 초과했습니다. 관리자 화면에서 확인해주세요.`,
              });
            } catch (notifyError) {
              console.error("[Scheduler] 관리자 알림 전송 실패:", notifyError);
            }
          } else {
            await updateRetryTaskStatus(
              task.id,
              "failed",
              error instanceof Error ? error.message : "재시도 실패"
            );
          }
        }
      }
    }

    console.log("[Scheduler] 배치 완료 재시도 작업 완료");
  } catch (error) {
    console.error("[Scheduler] 배치 완료 재시도 작업 오류:", error);
  }
}

/**
 * PDF 생성 재시도
 */
async function retryPdfGeneration(batchId: number) {
  const { generateHaccpReportPdf } = await import("../lib/generateHaccpReport");
  await generateHaccpReportPdf(batchId);
}

/**
 * 알림 전송 재시도
 */
async function retryNotification(batchId: number) {
  await notifyOwner({
    title: "배치 생산 완료",
    content: `배치 ID ${batchId}가 완료되었습니다. (재시도)`,
  });
}

/**
 * 배치 완료 재시도 스케줄러 초기화
 * 매 10분마다 실행
 */
export function initBatchCompletionRetryScheduler() {
  const job = cron.schedule(
    "*/10 * * * *", // 매 10분마다 (분 시 일 월 요일)
    processBatchCompletionRetries,
    {
      timezone: "Asia/Seoul",
    }
  );

  console.log("[Scheduler] 배치 완료 재시도 스케줄러 초기화 완료 (매 10분마다 실행)");
  return job;
}
