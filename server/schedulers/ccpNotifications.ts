import { getDb } from "../db";
import { hCcpInstances, hBatches, users, tenants } from "../../drizzle/schema";
import { eq, and, lte, gte } from "drizzle-orm";
import { createNotification } from "../db";

/**
 * CCP 점검 시간 알림 스케줄러
 * 수동배치 모드에서 CCP 점검 시간이 되면 작업자에게 알림 전송
 * [보안 수정] 테넌트별 격리 처리 적용
 */
export async function checkCcpInspectionReminders() {
  const db = await getDb();
  if (!db) {
    console.error("[CCP Scheduler] Database connection failed");
    return { notificationCount: 0 };
  }

  const now = new Date();
  const reminderWindow = 30; // 30분 전 알림

  try {
    // [보안] 활성 테넌트 목록 조회
    const activeTenants = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.status, "active"));

    let totalNotificationCount = 0;

    for (const tenant of activeTenants) {
      const tenantId = tenant.id;

      // 1. 진행 중인 배치 조회 (수동배치 모드만, 테넌트별)
      const activeBatches = await db
        .select()
        .from(hBatches)
        .where(
          and(
            eq(hBatches.tenantId, tenantId),
            eq(hBatches.status, "in_progress"),
            eq(hBatches.mode, "manual")
          )
        );

      let notificationCount = 0;

      for (const batch of activeBatches) {
        // 2. 배치의 CCP 인스턴스 조회 (테넌트별)
        const ccpInstances = await db
          .select()
          .from(hCcpInstances)
          .where(
            and(
              eq(hCcpInstances.tenantId, tenantId),
              eq(hCcpInstances.batchId, batch.id),
              eq(hCcpInstances.status, "draft")
            )
          );

        for (const instance of ccpInstances) {
          // 3. manualStartTime이 있고, 현재 시간이 점검 시간 30분 전인지 확인
          if (batch.manualStartTime) {
            const inspectionTime = new Date(batch.manualStartTime);
            const reminderTime = new Date(inspectionTime.getTime() - reminderWindow * 60 * 1000);

            // 알림 시간이 되었는지 확인 (±5분 오차 허용)
            const timeDiff = Math.abs(now.getTime() - reminderTime.getTime());
            const tolerance = 5 * 60 * 1000; // 5분

            if (timeDiff <= tolerance) {
              // 4. 해당 테넌트의 사용자에게만 알림 생성
              const tenantUsers = await db
                .select()
                .from(users)
                .where(eq(users.tenantId, tenantId));

              for (const user of tenantUsers) {
                await createNotification({
                  tenantId,
                  userId: user.id,
                  notificationType: "ccp_reminder",
                  title: `CCP 점검 시간 알림: ${batch.batchCode}`,
                  message: `${batch.batchCode} 배치의 CCP 점검 시간이 ${reminderWindow}분 후입니다. 준비해주세요.`,
                  priority: "high",
                  actionUrl: `/batch/${batch.id}`,
                  metadata: JSON.stringify({
                    batchId: batch.id,
                    batchCode: batch.batchCode,
                    ccpInstanceId: instance.id,
                    inspectionTime: inspectionTime.toISOString(),
                  }),
                });
              }

              notificationCount++;
              console.log(`[CCP Scheduler] [tenant:${tenantId}] Reminder sent for batch ${batch.batchCode}`);
            }
          }
        }
      }

      totalNotificationCount += notificationCount;
    }

    return { notificationCount: totalNotificationCount };
  } catch (error) {
    console.error("[CCP Scheduler] Error checking CCP reminders:", error);
    return { notificationCount: 0 };
  }
}

/**
 * 미작성 CCP 점검 알림 (배치 종료 시간 기준)
 * [보안 수정] 테넌트별 격리 처리 적용
 */
export async function checkOverdueCcpInspections() {
  const db = await getDb();
  if (!db) {
    console.error("[CCP Scheduler] Database connection failed");
    return { alertCount: 0 };
  }

  const now = new Date();

  try {
    // [보안] 활성 테넌트 목록 조회
    const activeTenants = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.status, "active"));

    let totalAlertCount = 0;

    for (const tenant of activeTenants) {
      const tenantId = tenant.id;

      // 1. 진행 중인 배치 중 종료 시간이 지난 배치 조회 (테넌트별)
      const overdueBatches = await db
        .select()
        .from(hBatches)
        .where(
          and(
            eq(hBatches.tenantId, tenantId),
            eq(hBatches.status, "in_progress"),
            lte(hBatches.endTime, now)
          )
        );

      let alertCount = 0;

      for (const batch of overdueBatches) {
        // 2. 미작성 CCP 인스턴스 조회 (테넌트별)
        const pendingCcpInstances = await db
          .select()
          .from(hCcpInstances)
          .where(
            and(
              eq(hCcpInstances.tenantId, tenantId),
              eq(hCcpInstances.batchId, batch.id),
              eq(hCcpInstances.status, "draft")
            )
          );

        if (pendingCcpInstances.length > 0) {
          // 3. 해당 테넌트의 사용자에게만 긴급 알림 생성
          const tenantUsers = await db
            .select()
            .from(users)
            .where(eq(users.tenantId, tenantId));

          for (const user of tenantUsers) {
            await createNotification({
              tenantId,
              userId: user.id,
              notificationType: "ccp_overdue",
              title: `⚠️ CCP 점검 누락: ${batch.batchCode}`,
              message: `${batch.batchCode} 배치의 CCP 점검이 완료되지 않았습니다. (미작성: ${pendingCcpInstances.length}건)`,
              priority: "urgent",
              actionUrl: `/batch/${batch.id}`,
              metadata: JSON.stringify({
                batchId: batch.id,
                batchCode: batch.batchCode,
                pendingCount: pendingCcpInstances.length,
                endTime: batch.endTime,
              }),
            });
          }

          alertCount++;
          console.log(`[CCP Scheduler] [tenant:${tenantId}] Overdue alert sent for batch ${batch.batchCode}`);
        }
      }

      totalAlertCount += alertCount;
    }

    return { alertCount: totalAlertCount };
  } catch (error) {
    console.error("[CCP Scheduler] Error checking overdue CCP inspections:", error);
    return { alertCount: 0 };
  }
}
