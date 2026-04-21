import { getDb } from "../db";
import { tenants } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { checkLowStockPrediction, createLowStockNotifications } from "../db/inventory/inventoryForecastAPI";

/**
 * 재고 예측 알림 스케줄러
 * 매일 자동으로 재고 부족 예상을 체크하고 알림을 생성
 * [보안 수정] 테넌트별 격리 처리 적용
 * 
 * checkLowStockPrediction()과 createLowStockNotifications() 함수에
 * tenantId 파라미터를 전달하여 테넌트별 격리 처리를 완료합니다.
 */
export async function checkInventoryForecastAlerts() {
  const db = await getDb();
  if (!db) {
    console.error("[재고 예측 스케줄러] Database connection failed");
    return { success: false, notificationCount: 0 };
  }

  try {
    console.log("[재고 예측 스케줄러] 재고 부족 예상 체크 시작");

    // [보안] 활성 테넌트 목록 조회
    const activeTenants = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.status, "active"));

    let totalNotificationCount = 0;

    for (const tenant of activeTenants) {
      const tenantId = tenant.id;

      try {
        const predictions = await checkLowStockPrediction(tenantId);

        if (predictions.length === 0) {
          continue;
        }

        console.log(`[재고 예측 스케줄러] [tenant:${tenantId}] ${predictions.length}개 원재료 재고 부족 예상 감지`);

        const notificationResult = await createLowStockNotifications(tenantId);
        totalNotificationCount += notificationResult.count;

        console.log(`[재고 예측 스케줄러] [tenant:${tenantId}] ${notificationResult.count}개 알림 생성 완료`);
      } catch (tenantError) {
        console.error(`[재고 예측 스케줄러] [tenant:${tenantId}] 처리 오류:`, tenantError);
      }
    }

    console.log(`[재고 예측 스케줄러] 전체 ${totalNotificationCount}개 알림 생성 완료`);
    return { success: true, notificationCount: totalNotificationCount };
  } catch (error) {
    console.error("[재고 예측 스케줄러] Error:", error);
    return { success: false, notificationCount: 0 };
  }
}
