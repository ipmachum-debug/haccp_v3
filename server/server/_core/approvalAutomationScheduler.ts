import cron from "node-cron";
import { processAutoApprovals, assignReviewers } from "../schedulers/approvalAutomation";

/**
 * 승인 워크플로우 자동화 스케줄러 초기화
 * 매일 오전 10시에 자동 승인 조건 체크 및 검토자 자동 배정
 */
export function initApprovalAutomationScheduler() {
  // 매일 오전 10시에 자동 승인 처리 (0 10 * * *)
  cron.schedule("0 10 * * *", async () => {
    console.log("[Scheduler] 승인 자동화 스케줄러 실행 - 자동 승인 처리");
    try {
      const result = await processAutoApprovals();
      if (result.success) {
        console.log(`[Scheduler] 자동 승인 ${result.processedCount}개 처리 완료`);
      } else {
        console.error("[Scheduler] 자동 승인 처리 실패");
      }
    } catch (error) {
      console.error("[Scheduler] 자동 승인 스케줄러 오류:", error);
    }
  });

  // 매일 오전 9시에 검토자 자동 배정 (0 9 * * *)
  cron.schedule("0 9 * * *", async () => {
    console.log("[Scheduler] 승인 자동화 스케줄러 실행 - 검토자 자동 배정");
    try {
      const result = await assignReviewers();
      if (result.success) {
        console.log(`[Scheduler] 검토자 ${result.assignedCount}개 배정 완료`);
      } else {
        console.error("[Scheduler] 검토자 배정 실패");
      }
    } catch (error) {
      console.error("[Scheduler] 검토자 배정 스케줄러 오류:", error);
    }
  });

  console.log("[Scheduler] 승인 자동화 스케줄러 초기화 완료 (매일 오전 9시/10시 실행)");
}
