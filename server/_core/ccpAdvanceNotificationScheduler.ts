import cron from "node-cron";
import { getDb } from "../db";
import { hCcpInspectionAlerts } from "../../drizzle/schema/part2";
import { tenants } from "../../drizzle/schema_main";
import { and, eq, lte, gte, isNull } from "drizzle-orm";

/**
 * CCP 점검 사전 알림 스케줄러
 * 매 10분마다 실행하여 30분 이내에 점검 예정인 CCP에 대해 사전 알림 발송
 * [보안 수정] 테넌트별 격리 처리 적용
 */
export function initCcpAdvanceNotificationScheduler() {
  // 매 10분마다 실행 (0, 10, 20, 30, 40, 50분)
  cron.schedule("*/10 * * * *", async () => {
    try {
      console.log("[CCP 사전 알림 스케줄러] 실행 시작:", new Date().toISOString());
      
      const db = await getDb();
      if (!db) {
        console.error("[CCP 사전 알림 스케줄러] 데이터베이스 연결 실패");
        return;
      }
      
      const now = new Date();
      const advanceTime = new Date(now.getTime() + 30 * 60 * 1000); // 30분 후
      
      // [보안] 활성 테넌트 목록 조회
      const activeTenants = await db
        .select({ id: tenants.id, name: tenants.name })
        .from(tenants)
        .where(eq(tenants.status, "active"));

      for (const tenant of activeTenants) {
        const tenantId = tenant.id;

        // 30분 이내에 점검 예정이고, 아직 사전 알림을 보내지 않은 알림 조회 (테넌트별)
        const pendingAlerts = await db
          .select()
          .from(hCcpInspectionAlerts)
          .where(
            and(
              eq(hCcpInspectionAlerts.tenantId, tenantId),
              eq(hCcpInspectionAlerts.status, "pending"),
              eq(hCcpInspectionAlerts.isAdvanceNotification, 0),
              lte(hCcpInspectionAlerts.scheduledTime, advanceTime),
              gte(hCcpInspectionAlerts.scheduledTime, now),
              isNull(hCcpInspectionAlerts.advanceNotifiedAt)
            )
          );
        
        if (pendingAlerts.length === 0) {
          continue;
        }
        
        console.log(`[CCP 사전 알림 스케줄러] [tenant:${tenantId}] ${pendingAlerts.length}개의 사전 알림 발송 시작`);
        
        // 각 알림에 대해 사전 알림 발송
        for (const alert of pendingAlerts) {
          try {
            // 1. 알림 생성 (notifyOwner 호출)
            const { notifyOwner } = await import("../_core/notification");
            const { hCcpInstances } = await import("../../drizzle/schema_main");
            
            // CCP 인스턴스 정보 조회 (테넌트별)
            const instance = await db
              .select()
              .from(hCcpInstances)
              .where(
                and(
                  eq(hCcpInstances.id, alert.instanceId),
                  eq(hCcpInstances.tenantId, tenantId)
                )
              )
              .limit(1);
            
            if (instance.length === 0) {
              console.error(`[CCP 사전 알림 스케줄러] [tenant:${tenantId}] CCP 인스턴스 ${alert.instanceId} 조회 실패`);
              continue;
            }
            
            const instanceData = instance[0];
            const scheduledTime = new Date(alert.scheduledTime);
            const timeStr = scheduledTime.toLocaleString('ko-KR', {
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            });
            
            await notifyOwner({
              title: `CCP 점검 예정 알림 [${tenant.name}]`,
              content: `${timeStr}에 CCP 점검이 예정되어 있습니다. (배치 ID: ${instanceData.batchId}, CCP 유형: ${instanceData.ccpType})`,
            });
            
            // 2. 사전 알림 발송 시각 기록 (테넌트별)
            await db
              .update(hCcpInspectionAlerts)
              .set({ advanceNotifiedAt: now })
              .where(
                and(
                  eq(hCcpInspectionAlerts.id, alert.id),
                  eq(hCcpInspectionAlerts.tenantId, tenantId)
                )
              );
            
            console.log(`[CCP 사전 알림 스케줄러] [tenant:${tenantId}] 알림 ID ${alert.id} 사전 알림 발송 완료`);
          } catch (error) {
            console.error(`[CCP 사전 알림 스케줄러] [tenant:${tenantId}] 알림 ID ${alert.id} 발송 실패:`, error);
          }
        }
      }
      
      console.log(`[CCP 사전 알림 스케줄러] 실행 완료`);
    } catch (error) {
      console.error("[CCP 사전 알림 스케줄러] 실행 중 오류:", error);
    }
  });
  
  console.log("[Scheduler] CCP 점검 사전 알림 스케줄러 초기화 완료 (매 10분마다 실행)");
}
