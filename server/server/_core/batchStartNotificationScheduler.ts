import cron from "node-cron";
import { getDb } from "../db";
import { hBatchSchedules, hBatches, tenants } from "../../drizzle/schema_main";
import { and, gte, lte, isNull, eq } from "drizzle-orm";
import { notifyOwner } from "./notification";

/**
 * 배치 시작 시간 알림 스케줄러
 * 매 10분마다 실행되며, 1시간 이내에 시작 예정인 배치에 대해 사전 알림을 발송합니다.
 * [보안 수정] 테넌트별 격리 처리 적용
 */

export function initBatchStartNotificationScheduler() {
  // 매 10분마다 실행 (*/10 * * * *)
  cron.schedule("*/10 * * * *", async () => {
    try {
      await checkAndNotifyUpcomingBatches();
    } catch (error) {
      console.error("[배치 시작 알림 스케줄러] 실행 중 오류:", error);
    }
  });

  console.log("[Scheduler] 배치 시작 알림 스케줄러 초기화 완료 (매 10분마다 실행)");
}

async function checkAndNotifyUpcomingBatches() {
  const db = await getDb();
  if (!db) {
    console.error("[배치 시작 알림] 데이터베이스 연결 실패");
    return;
  }

  const now = new Date();
  const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000); // 1시간 후

  try {
    // [보안] 활성 테넌트 목록 조회
    const activeTenants = await db
      .select({ id: tenants.id, name: tenants.name })
      .from(tenants)
      .where(eq(tenants.status, "active"));

    for (const tenant of activeTenants) {
      const tenantId = tenant.id;

      // 1시간 이내에 시작 예정인 배치 일정 조회 (테넌트별)
      const upcomingSchedules = await db
        .select({
          scheduleId: hBatchSchedules.id,
          batchId: hBatchSchedules.batchId,
          batchCode: hBatches.batchCode,
          startTime: hBatchSchedules.startTime,
          startNotifiedAt: hBatchSchedules.startNotifiedAt,
        })
        .from(hBatchSchedules)
        .innerJoin(hBatches, eq(hBatchSchedules.batchId, hBatches.id))
        .where(
          and(
            eq(hBatchSchedules.tenantId, tenantId),
            gte(hBatchSchedules.startTime, now),
            lte(hBatchSchedules.startTime, oneHourLater),
            isNull(hBatchSchedules.startNotifiedAt)
          )
        );

      if (upcomingSchedules.length === 0) {
        continue;
      }

      console.log(
        `[배치 시작 알림] [tenant:${tenantId}] ${upcomingSchedules.length}개 배치 시작 알림 발송 시작`
      );

      for (const schedule of upcomingSchedules) {
        try {
          // 알림 발송
          await notifyOwner({
            title: `배치 시작 예정 [${tenant.name}]`,
            content: `배치 ${schedule.batchCode}이(가) 1시간 이내에 시작 예정입니다. 시작 시간: ${schedule.startTime ? schedule.startTime.toLocaleString("ko-KR") : "미정"}`,
          });

          // 알림 발송 시각 기록 (테넌트별)
          await db
            .update(hBatchSchedules)
            .set({
              startNotifiedAt: now,
            })
            .where(
              and(
                eq(hBatchSchedules.id, schedule.scheduleId),
                eq(hBatchSchedules.tenantId, tenantId)
              )
            );

          console.log(
            `[배치 시작 알림] [tenant:${tenantId}] 배치 ${schedule.batchCode} 알림 발송 완료`
          );
        } catch (error) {
          console.error(
            `[배치 시작 알림] [tenant:${tenantId}] 배치 ${schedule.batchCode} 알림 발송 실패:`,
            error
          );
        }
      }
    }

    console.log("[배치 시작 알림] 알림 발송 완료");
  } catch (error) {
    console.error("[배치 시작 알림] 배치 조회 중 오류:", error);
    throw error;
  }
}
