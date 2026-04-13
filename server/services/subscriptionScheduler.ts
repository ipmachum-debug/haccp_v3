import { getDb } from "../db";
import { tenants, subscriptionNotifications } from "../../drizzle/schema/schema_main";
import { eq, and, lte, gte, sql } from "drizzle-orm";

import { formatLocalDate } from "../utils/timezone";

/**
 * 구독 만료 알림 스케줄러
 * 매일 실행되어 만료 예정 테넌트에게 알림 전송
 */
export async function checkSubscriptionExpiry() {
  console.log("[Subscription Scheduler] Starting subscription expiry check...");

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 모든 활성 테난트 조회
    const db = await getDb();
    const activeTenants = await db
      .select()
      .from(tenants)
      .where(sql`${tenants.status} IN ('active', 'trial')`);

    console.log(`[Subscription Scheduler] Found ${activeTenants.length} active tenants`);

    for (const tenant of activeTenants) {
      if (!tenant.subscriptionEndDate) {
        continue;
      }

      const endDate = new Date(tenant.subscriptionEndDate);
      endDate.setHours(0, 0, 0, 0);

      const diffTime = endDate.getTime() - today.getTime();
      const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      console.log(`[Subscription Scheduler] Tenant ${tenant.name} (ID: ${tenant.id}): ${daysRemaining} days remaining`);

      // 7일 전 알림
      if (daysRemaining === 7) {
        await sendNotification(tenant.id, "7_days", 
          `구독이 7일 후 만료됩니다. 구독을 연장해주세요.`);
      }

      // 3일 전 알림
      if (daysRemaining === 3) {
        await sendNotification(tenant.id, "3_days", 
          `구독이 3일 후 만료됩니다. 구독을 연장해주세요.`);
      }

      // 1일 전 알림
      if (daysRemaining === 1) {
        await sendNotification(tenant.id, "1_day", 
          `구독이 내일 만료됩니다. 구독을 연장해주세요.`);
      }

      // 만료일 당일 - 상태 변경 및 유예기간 설정
      if (daysRemaining === 0) {
        const gracePeriodEnd = new Date(endDate);
        gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 7);

        await db
          .update(tenants)
          .set({
            status: "expired",
            isReadOnly: true,
            gracePeriodEndDate: gracePeriodEnd,
          })
          .where(eq(tenants.id, tenant.id));

        await sendNotification(tenant.id, "expired", 
          `구독이 만료되었습니다. 7일 유예기간 동안 읽기 전용 모드로 전환됩니다. 구독을 연장해주세요.`);

        console.log(`[Subscription Scheduler] Tenant ${tenant.name} (ID: ${tenant.id}) expired, grace period until ${formatLocalDate(gracePeriodEnd)}`);
      }

      // 유예기간 종료 - 완전 차단
      if (tenant.gracePeriodEndDate) {
        const gracePeriodEnd = new Date(tenant.gracePeriodEndDate);
        gracePeriodEnd.setHours(0, 0, 0, 0);

        const graceDiffTime = gracePeriodEnd.getTime() - today.getTime();
        const graceDaysRemaining = Math.ceil(graceDiffTime / (1000 * 60 * 60 * 24));

        if (graceDaysRemaining === 0 && tenant.status === "expired") {
          await db
            .update(tenants)
            .set({
              status: "suspended",
            })
            .where(eq(tenants.id, tenant.id));

          await sendNotification(tenant.id, "grace_period_end", 
            `유예기간이 종료되었습니다. 서비스 이용이 중단되었습니다. 구독을 연장해주세요.`);

          console.log(`[Subscription Scheduler] Tenant ${tenant.name} (ID: ${tenant.id}) suspended after grace period`);
        }
      }
    }

    console.log("[Subscription Scheduler] Subscription expiry check completed");
  } catch (error) {
    console.error("[Subscription Scheduler] Error checking subscription expiry:", error);
    throw error;
  }
}

/**
 * 알림 전송 헬퍼 함수
 */
async function sendNotification(
  tenantId: number,
  type: "7_days" | "3_days" | "1_day" | "expired" | "grace_period_end",
  message: string
) {
  try {
    const db = await getDb();
    // 중복 알림 방지: 오늘 이미 같은 타입의 알림이 있는지 확인
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const existingNotifications = await db
      .select()
      .from(subscriptionNotifications)
      .where(
        and(
          eq(subscriptionNotifications.tenantId, tenantId),
          eq(subscriptionNotifications.notificationType, type),
          gte(subscriptionNotifications.notificationDate, today)
        )
      )
      .limit(1);
    
    const existingNotification = existingNotifications[0];

    if (existingNotification) {
      console.log(`[Subscription Scheduler] Notification already sent for tenant ${tenantId}, type ${type}`);
      return;
    }

    // 알림 생성
    await db.insert(subscriptionNotifications).values({
      tenantId,
      notificationType: type,
      message,
      isRead: false,
    });

    console.log(`[Subscription Scheduler] Notification sent to tenant ${tenantId}: ${type}`);
  } catch (error) {
    console.error(`[Subscription Scheduler] Error sending notification to tenant ${tenantId}:`, error);
  }
}

/**
 * 스케줄러 초기화
 * 매일 자정에 실행
 */
export function initSubscriptionScheduler() {
  console.log("[Subscription Scheduler] Initializing subscription scheduler...");

  // 즉시 한 번 실행
  checkSubscriptionExpiry().catch(console.error);

  // 매일 자정에 실행 (24시간마다)
  setInterval(() => {
    checkSubscriptionExpiry().catch(console.error);
  }, 24 * 60 * 60 * 1000);

  console.log("[Subscription Scheduler] Subscription scheduler initialized");
}
