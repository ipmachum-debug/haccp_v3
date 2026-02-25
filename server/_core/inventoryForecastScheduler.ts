import cron from "node-cron";
import { checkInventoryForecastAlerts } from "../schedulers/inventoryForecastScheduler";

/**
 * 재고 예측 알림 스케줄러 초기화
 * 매일 오전 9시에 재고 부족 예상을 체크하고 알림을 생성
 */
export function initInventoryForecastScheduler() {
  // 매일 오전 9시에 실행 (0 9 * * *)
  cron.schedule("0 9 * * *", async () => {
    console.log("[Scheduler] 재고 예측 알림 스케줄러 실행");
    try {
      const result = await checkInventoryForecastAlerts();
      if (result.success) {
        console.log(`[Scheduler] 재고 예측 알림 ${result.notificationCount}개 생성 완료`);
      } else {
        console.error("[Scheduler] 재고 예측 알림 생성 실패");
      }
    } catch (error) {
      console.error("[Scheduler] 재고 예측 알림 스케줄러 오류:", error);
    }
  });

  console.log("[Scheduler] 재고 예측 알림 스케줄러 초기화 완료 (매일 오전 9시 실행)");
}
