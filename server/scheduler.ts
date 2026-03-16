import cron from "node-cron";
import {
  checkAndCreateTurnoverAlerts,
  checkAndCreateInspectionFailureAlerts,
  checkAndCreateReorderAlerts
} from "./db.js";
import { initBatchCompletionRetryScheduler } from "./schedulers/batchCompletionRetryScheduler";
import { checkCcpInspectionReminders, checkOverdueCcpInspections } from "./schedulers/ccpNotifications";
import { initChecklistScheduler } from "./checklistScheduler";
import { checkHealthCertificateReminders, resetExpiredCertificateReminders } from "./schedulers/healthCertificateReminder";

/**
 * 재고 회전율 알림 스케줄러
 * 매일 오전 9시에 자동으로 실행되어 임계값 이하의 회전율을 가진 원재료에 대해 알림을 생성합니다.
 */
export function initScheduler() {
  // 매일 오전 9시에 실행 (cron: 0 9 * * *)
  cron.schedule("0 9 * * *", async () => {
    const timestamp = new Date().toISOString();
    console.log(`[Scheduler] ${timestamp} - 재고 회전율 알림 체크 시작`);
    
    try {
      const result = await checkAndCreateTurnoverAlerts();
      console.log(`[Scheduler] ${timestamp} - 재고 회전율 알림 체크 완료:`, result);
    } catch (error) {
      console.error(`[Scheduler] ${timestamp} - 재고 회전율 알림 체크 실패:`, error);
    }

    // 유통기한 임박 및 재고 부족 알림
    console.log(`[Scheduler] ${timestamp} - 재고 알림 체크 시작`);
    try {
      const { checkExpiryReminders, checkLowStockAlerts } = await import("./schedulers/inventoryNotifications");
      await checkExpiryReminders();
      await checkLowStockAlerts();
      console.log(`[Scheduler] ${timestamp} - 재고 알림 체크 완료`);
    } catch (error) {
      console.error(`[Scheduler] ${timestamp} - 재고 알림 체크 실패:`, error);
    }

    // 소비기한 만료 알람 자동 생성
    console.log(`[Scheduler] ${timestamp} - 소비기한 만료 알람 생성 시작`);
    try {
      const { generateExpiredAlerts } = await import("./lib/expiryAlertGenerator");
      await generateExpiredAlerts();
      console.log(`[Scheduler] ${timestamp} - 소비기한 만료 알람 생성 완료`);
    } catch (error) {
      console.error(`[Scheduler] ${timestamp} - 소비기한 만료 알람 생성 실패:`, error);
    }
  });

  // 매일 오후 1시에 검사 부적합 알림 자동 생성
  cron.schedule("0 13 * * *", async () => {
    const timestamp = new Date().toISOString();
    console.log(`[Scheduler] ${timestamp} - 검사 부적합 알림 체크 시작`);
    
    try {
      const result = await checkAndCreateInspectionFailureAlerts();
      console.log(`[Scheduler] ${timestamp} - 검사 부적합 알림 체크 완료:`, result);
    } catch (error) {
      console.error(`[Scheduler] ${timestamp} - 검사 부적합 알림 체크 실패:`, error);
    }
  });

  // 매일 오전 10시에 재고 예측 및 자동 발주 알림 자동 생성
  cron.schedule("0 10 * * *", async () => {
    const timestamp = new Date().toISOString();
    console.log(`[Scheduler] ${timestamp} - 재고 예측 및 자동 발주 알림 체크 시작`);
    
    try {
      const result = await checkAndCreateReorderAlerts();
      console.log(`[Scheduler] ${timestamp} - 재고 예측 및 자동 발주 알림 체크 완료:`, result);
    } catch (error) {
      console.error(`[Scheduler] ${timestamp} - 재고 예측 및 자동 발주 알림 체크 실패:`, error);
    }
  });

  // CCP 점검 시간 알림 (매 10분마다 체크)
  cron.schedule("*/10 * * * *", async () => {
    try {
      const result = await checkCcpInspectionReminders();
      if (result.notificationCount > 0) {
        console.log(`[Scheduler] CCP 점검 알림 전송 완료: ${result.notificationCount}건`);
      }
    } catch (error) {
      console.error("[Scheduler] CCP 점검 알림 실패:", error);
    }
  });

  // 미작성 CCP 점검 알림 (매 30분마다 체크)
  cron.schedule("*/30 * * * *", async () => {
    try {
      const result = await checkOverdueCcpInspections();
      if (result.alertCount > 0) {
        console.log(`[Scheduler] 미작성 CCP 경고 전송 완료: ${result.alertCount}건`);
      }
    } catch (error) {
      console.error("[Scheduler] 미작성 CCP 경고 실패:", error);
    }
  });

  console.log("[Scheduler] 재고 회전율 알림 스케줄러 초기화 완료 (매일 오전 9시 실행)");
  console.log("[Scheduler] 검사 부적합 알림 스케줄러 초기화 완료 (매일 오후 1시 실행)");
  console.log("[Scheduler] 재고 예측 및 자동 발주 알림 스케줄러 초기화 완료 (매일 오전 10시 실행)");
  console.log("[Scheduler] 소비기한 알람 스케줄러 초기화 완료 (매일 오전 9시 실행)");
  console.log("[Scheduler] CCP 점검 알림 스케줄러 초기화 완료 (매 10분마다 실행)");
  console.log("[Scheduler] 미작성 CCP 경고 스케줄러 초기화 완료 (매 30분마다 실행)");
  
  // 배치 완료 재시도 스케줄러 초기화
  initBatchCompletionRetryScheduler();

  // 체크리스트 자동 생성 스케줄러 초기화 (비활성화 - 테이블 없음)
  // initChecklistScheduler();

  // 건강진단서 만료 알림 (매일 오전 8시)
  cron.schedule("0 8 * * *", async () => {
    const timestamp = new Date().toISOString();
    console.log(`[Scheduler] ${timestamp} - 건강진단서 만료 알림 체크 시작`);
    
    try {
      const result = await checkHealthCertificateReminders();
      console.log(`[Scheduler] ${timestamp} - 건강진단서 만료 알림 완료: ${result.notificationCount}건`);
    } catch (error) {
      console.error(`[Scheduler] ${timestamp} - 건강진단서 만료 알림 실패:`, error);
    }
  });

  // 건강진단서 알림 플래그 초기화 (매주 월요일 오전 1시)
  cron.schedule("0 1 * * 1", async () => {
    const timestamp = new Date().toISOString();
    console.log(`[Scheduler] ${timestamp} - 건강진단서 알림 플래그 초기화 시작`);
    
    try {
      await resetExpiredCertificateReminders();
      console.log(`[Scheduler] ${timestamp} - 건강진단서 알림 플래그 초기화 완료`);
    } catch (error) {
      console.error(`[Scheduler] ${timestamp} - 건강진단서 알림 플래그 초기화 실패:`, error);
    }
  });

  console.log("[Scheduler] 건강진단서 만료 알림 스케줄러 초기화 완료 (매일 오전 8시 실행)");
  console.log("[Scheduler] 건강진단서 알림 플래그 초기화 스케줄러 초기화 완료 (매주 월요일 오전 1시 실행)");

  // ===== 원료수불부 일일 마감 자동 업데이트 (매일 오후 11시 30분) =====
  cron.schedule("30 23 * * *", async () => {
    const timestamp = new Date().toISOString();
    console.log(`[원료수불부 스케줄러] ${timestamp} - 일일 마감 자동 업데이트 시작`);
    
    try {
      const { autoUpdateFromDailyClose } = await import("./db/materialLedger");
      const { tenants } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) {
        console.error("[원료수불부 스케줄러] DB 연결 실패");
        return;
      }
      
      // 활성 테넌트 목록 조회
      const activeTenants = await db
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.status, "active"));
      
      const today = new Date().toISOString().split("T")[0];
      
      for (const tenant of activeTenants) {
        try {
          const result = await autoUpdateFromDailyClose(today, tenant.id);
          console.log(`[원료수불부 스케줄러] 테넌트 ${tenant.id}: 입고=${result.receivingCount}건, 사용=${result.usageCount}건`);
        } catch (tenantError) {
          console.error(`[원료수불부 스케줄러] 테넌트 ${tenant.id} 처리 실패:`, tenantError);
        }
      }
      
      console.log(`[원료수불부 스케줄러] ${timestamp} - 일일 마감 자동 업데이트 완료 (${activeTenants.length}개 테넌트)`);
    } catch (error) {
      console.error(`[원료수불부 스케줄러] ${timestamp} - 일일 마감 자동 업데이트 실패:`, error);
    }
  });
  console.log("[Scheduler] 원료수불부 일일 마감 스케줄러 초기화 완료 (매일 오후 11시 30분 실행)");

  // ===== AI 규칙엔진 자동 평가 (매일 오전 7시, 오후 2시) =====
  const runAIRuleEvaluation = async () => {
    const timestamp = new Date().toISOString();
    console.log(`[AI Scheduler] ${timestamp} - AI 규칙 평가 시작`);

    try {
      const { evaluateAllRules, saveAlerts } = await import("./db/rulesEngine");
      const { tenants } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) {
        console.error("[AI Scheduler] DB 연결 실패");
        return;
      }

      // 활성 테넌트 목록 조회
      const activeTenants = await db
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.status, "active"));

      let totalAlerts = 0;
      for (const tenant of activeTenants) {
        try {
          const results = await evaluateAllRules(tenant.id);
          const triggered = results.filter(r => r.triggered);
          if (triggered.length > 0) {
            const saved = await saveAlerts(tenant.id, triggered);
            totalAlerts += saved;
            console.log(`[AI Scheduler] 테넌트 ${tenant.id}: ${triggered.length}건 탐지, ${saved}건 저장`);
          }
        } catch (tenantError) {
          console.error(`[AI Scheduler] 테넌트 ${tenant.id} 처리 실패:`, tenantError);
        }
      }

      console.log(`[AI Scheduler] ${timestamp} - AI 규칙 평가 완료 (${activeTenants.length}개 테넌트, ${totalAlerts}건 알림)`);
    } catch (error) {
      console.error(`[AI Scheduler] ${timestamp} - AI 규칙 평가 실패:`, error);
    }
  };

  // 매일 오전 7시
  cron.schedule("0 7 * * *", runAIRuleEvaluation);
  // 매일 오후 2시
  cron.schedule("0 14 * * *", runAIRuleEvaluation);
  console.log("[Scheduler] AI 규칙엔진 자동 평가 스케줄러 초기화 완료 (매일 오전 7시, 오후 2시 실행)");

}
