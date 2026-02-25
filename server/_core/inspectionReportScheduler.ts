import cron from "node-cron";
import { generateWeeklyInspectionReport, generateMonthlyInspectionReport } from "../schedulers/inspectionReportScheduler";

/**
 * 검사 리포트 스케줄러 초기화
 * 주간 리포트: 매주 월요일 오전 9시
 * 월간 리포트: 매월 1일 오전 9시
 */
export function initInspectionReportScheduler() {
  // 매주 월요일 오전 9시에 주간 리포트 생성 (0 9 * * 1)
  cron.schedule("0 9 * * 1", async () => {
    console.log("[Scheduler] 검사 리포트 스케줄러 실행 - 주간 리포트 생성");
    try {
      const result = await generateWeeklyInspectionReport();
      if (result.success) {
        console.log("[Scheduler] 주간 검사 리포트 생성 완료");
      } else {
        console.error("[Scheduler] 주간 검사 리포트 생성 실패");
      }
    } catch (error) {
      console.error("[Scheduler] 주간 검사 리포트 스케줄러 오류:", error);
    }
  });

  // 매월 1일 오전 9시에 월간 리포트 생성 (0 9 1 * *)
  cron.schedule("0 9 1 * *", async () => {
    console.log("[Scheduler] 검사 리포트 스케줄러 실행 - 월간 리포트 생성");
    try {
      const result = await generateMonthlyInspectionReport();
      if (result.success) {
        console.log("[Scheduler] 월간 검사 리포트 생성 완료");
      } else {
        console.error("[Scheduler] 월간 검사 리포트 생성 실패");
      }
    } catch (error) {
      console.error("[Scheduler] 월간 검사 리포트 스케줄러 오류:", error);
    }
  });

  console.log("[Scheduler] 검사 리포트 스케줄러 초기화 완료 (주간: 월요일 오전 9시, 월간: 매월 1일 오전 9시)");
}
