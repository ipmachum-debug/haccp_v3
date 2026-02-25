import cron from "node-cron";
import { getDb } from "../db";
import { hSystemSettings, hSchedulerLogs, tenants } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

/**
 * 알림 보관 정책 설정값 조회
 */
async function getNotificationRetentionDays(): Promise<number> {
  try {
    const db = await getDb();
    if (!db) {
      console.warn("[Scheduler] Database connection failed, using default retention days: 30");
      return 30;
    }
    
    const [setting] = await db
      .select()
      .from(hSystemSettings)
      .where(eq(hSystemSettings.settingKey, "notification_retention_days"));
    
    const days = setting ? parseInt(setting.settingValue || "30", 10) : 30;
    console.log(`[Scheduler] 알림 보관 기간 설정값: ${days}일`);
    return days;
  } catch (error) {
    console.error("[Scheduler] Failed to get retention days, using default: 30", error);
    return 30;
  }
}

/**
 * 활성 테넌트 목록 조회
 */
async function getActiveTenants() {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.isActive, 1));
}

/**
 * 알림 센터 자동 삭제 스케줄러 초기화
 * 매일 자정(00:00)에 설정된 기간 이상 경과한 읽은 알림을 테넌트별로 자동 삭제
 */
export function initNotificationScheduler() {
  // 매일 자정(00:00)에 실행
  cron.schedule("0 0 * * *", async () => {
    const executionTime = new Date();
    let status = "success";
    let resultMessage = "";
    let totalDeletedCount = 0;

    try {
      console.log("[Scheduler] 알림 자동 삭제 스케줄러 실행 시작");
      
      // 설정값 동적 로드
      const retentionDays = await getNotificationRetentionDays();
      
      // 활성 테넌트 목록 조회
      const activeTenants = await getActiveTenants();
      
      // 테넌트별 삭제 처리
      const { deleteOldReadNotifications } = await import("../db");
      
      for (const tenant of activeTenants) {
        try {
          const result = await deleteOldReadNotifications(retentionDays, tenant.id);
          totalDeletedCount += result.deletedCount;
          if (result.deletedCount > 0) {
            console.log(`[Scheduler] 테넌트 ${tenant.id}: ${result.deletedCount}개 알림 삭제`);
          }
        } catch (tenantError) {
          console.error(`[Scheduler] 테넌트 ${tenant.id} 알림 삭제 오류:`, tenantError);
        }
      }
      
      resultMessage = `${totalDeletedCount}개 삭제 완료 (기준: ${retentionDays}일, 테넌트: ${activeTenants.length}개)`;
      console.log(`[Scheduler] 알림 자동 삭제 완료: ${resultMessage}`);
    } catch (error) {
      status = "error";
      resultMessage = error instanceof Error ? error.message : String(error);
      console.error("[Scheduler] 알림 자동 삭제 스케줄러 오류:", error);
    } finally {
      // 실행 이력 저장
      try {
        const db = await getDb();
        if (db) {
          await db.insert(hSchedulerLogs).values({
            schedulerName: "notification_cleanup",
            executionTime,
            status,
            resultMessage,
            deletedCount: totalDeletedCount,
          });
        }
      } catch (logError) {
        console.error("[Scheduler] 실행 이력 저장 실패:", logError);
      }
    }
  });

  console.log("[Scheduler] 알림 자동 삭제 스케줄러 초기화 완료 (매일 자정 실행, 테넌트별 격리)");
}
