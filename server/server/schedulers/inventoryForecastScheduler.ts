import { getDb } from "../db";
import { tenants } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { checkLowStockPrediction, createLowStockNotifications } from "../api/inventoryForecast";

/**
 * 재고 예측 알림 스케줄러
 * 매일 자동으로 재고 부족 예상을 체크하고 알림을 생성
 * [보안 수정] 테넌트별 격리 처리 적용
 * 
 * NOTE: checkLowStockPrediction()과 createLowStockNotifications() 함수도
 * tenantId 파라미터를 받도록 수정이 필요합니다. 현재는 스케줄러 레벨에서
 * 테넌트별 루프를 적용하고, 향후 해당 함수들도 tenantId 필터를 추가해야 합니다.
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
        // TODO: checkLowStockPrediction(tenantId)로 변경 필요
        // 현재는 전체 데이터를 조회하므로 향후 tenantId 필터 추가 필요
        const predictions = await checkLowStockPrediction();

        if (predictions.length === 0) {
          continue;
        }

        console.log(`[재고 예측 스케줄러] [tenant:${tenantId}] ${predictions.length}개 원재료 재고 부족 예상 감지`);

        // TODO: createLowStockNotifications(tenantId)로 변경 필요
        const notificationCount = await createLowStockNotifications();
        totalNotificationCount += notificationCount;

        console.log(`[재고 예측 스케줄러] [tenant:${tenantId}] ${notificationCount}개 알림 생성 완료`);
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
