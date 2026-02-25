/**
 * 검사 기록 자동 알림 스케줄러 초기화
 */

import cron from "node-cron";
import { notifyUpcomingInspections, notifyOverdueInspections } from "../schedulers/inspectionNotification";

export function initInspectionNotificationScheduler() {
  // 매일 오전 9시에 검사 기한 임박 알림 실행
  cron.schedule("0 9 * * *", async () => {
    await notifyUpcomingInspections();
  });

  // 매일 오후 6시에 미완료 검사 알림 실행
  cron.schedule("0 18 * * *", async () => {
    await notifyOverdueInspections();
  });

  console.log("[검사 알림 스케줄러] 초기화 완료");
}
