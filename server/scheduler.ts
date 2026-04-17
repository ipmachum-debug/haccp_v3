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

import { todayKST } from "./utils/timezone";

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
      const { generateExpiredAlerts } = await import("./lib/inventory/expiryAlertGenerator");
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
      const { autoUpdateFromDailyClose } = await import("./db/accounting/materialLedger");
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
      
      const today = todayKST();
      
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
      const { evaluateAllRules, saveAlerts } = await import("./db/ai/rulesEngine");
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

  // ===== ERP AI: 비용 이상탐지 + AP 결제 알림 =====
  const runERPAIChecks = async () => {
    const timestamp = new Date().toISOString();
    console.log(`[ERP AI Scheduler] ${timestamp} - ERP AI 점검 시작`);

    try {
      const { checkUpcomingPayments, runDailyExpenseAnomalyScan } = await import("./db/accounting/accountingEventTriggers");
      const { tenants } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) {
        console.error("[ERP AI Scheduler] DB 연결 실패");
        return;
      }

      const activeTenants = await db
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.status, "active"));

      let totalAlerts = 0;
      for (const tenant of activeTenants) {
        try {
          const [paymentAlerts, anomalyAlerts] = await Promise.all([
            checkUpcomingPayments(tenant.id),
            runDailyExpenseAnomalyScan(tenant.id),
          ]);
          totalAlerts += paymentAlerts + anomalyAlerts;
          if (paymentAlerts + anomalyAlerts > 0) {
            console.log(`[ERP AI Scheduler] 테넌트 ${tenant.id}: 결제알림 ${paymentAlerts}건, 이상탐지 ${anomalyAlerts}건`);
          }
        } catch (tenantError) {
          console.error(`[ERP AI Scheduler] 테넌트 ${tenant.id} 처리 실패:`, tenantError);
        }
      }

      console.log(`[ERP AI Scheduler] ${timestamp} - 완료 (${activeTenants.length}개 테넌트, ${totalAlerts}건 알림)`);
    } catch (error) {
      console.error(`[ERP AI Scheduler] ${timestamp} - 실패:`, error);
    }
  };

  // 매일 오전 9시: 비용 이상탐지 스캔
  cron.schedule("0 9 * * *", runERPAIChecks);
  // 매일 오후 4시: AP 결제 기한 점검
  cron.schedule("0 16 * * *", runERPAIChecks);
  console.log("[Scheduler] ERP AI 비용 이상탐지/결제 알림 스케줄러 초기화 완료 (매일 오전 9시, 오후 4시 실행)");

  // ===== ERP AI: 주간 현금흐름 경고 + 분개 검증 (매주 월요일 오전 8시) =====
  cron.schedule("0 8 * * 1", async () => {
    const timestamp = new Date().toISOString();
    console.log(`[ERP AI Weekly] ${timestamp} - 주간 현금흐름/분개 점검 시작`);

    try {
      const { forecastCashFlow } = await import("./db/ai/aiCashFlowForecast");
      const { validateJournalEntries } = await import("./db/ai/aiJournalValidation");
      const { saveAlerts } = await import("./db/ai/rulesEngine");
      const { tenants } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) return;

      const activeTenants = await db
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.status, "active"));

      for (const tenant of activeTenants) {
        try {
          // 현금흐름 경고
          const forecast = await forecastCashFlow(tenant.id, 30);
          if (forecast.summary.dangerDays > 0) {
            await saveAlerts(tenant.id, [{
              ruleId: 0,
              ruleCode: "ERP_CASHFLOW_WARNING",
              triggered: true,
              severity: forecast.summary.dangerDays > 7 ? "critical" as const : "high" as const,
              title: `현금흐름 위험 - ${forecast.summary.dangerDays}일 잔고 부족 예상`,
              message: forecast.recommendations[0] || "",
              entityType: "accounting",
              entityCode: "cashflow",
              contextData: forecast.summary,
            }]);
          }

          // 분개 검증
          const validation = await validateJournalEntries(tenant.id);
          if (validation.stats.criticalCount > 0) {
            await saveAlerts(tenant.id, [{
              ruleId: 0,
              ruleCode: "ERP_JOURNAL_ISSUE",
              triggered: true,
              severity: "critical" as const,
              title: `분개 검증 이슈 ${validation.stats.issueCount}건 (위험 ${validation.stats.criticalCount}건)`,
              message: validation.issues[0]?.description || "",
              entityType: "accounting",
              entityCode: "journal",
              contextData: validation.stats,
            }]);
          }
        } catch (e) {
          console.error(`[ERP AI Weekly] 테넌트 ${tenant.id} 실패:`, e);
        }
      }

      console.log(`[ERP AI Weekly] ${timestamp} - 완료`);
    } catch (error) {
      console.error(`[ERP AI Weekly] ${timestamp} - 실패:`, error);
    }
  });
  console.log("[Scheduler] ERP AI 주간 현금흐름/분개 점검 스케줄러 초기화 완료 (매주 월요일 오전 8시)");

  // ===== 원료수불 주간 보고서 자동 생성 (매주 월요일 오전 6시) =====
  // 지난 주(월~일) 데이터로 보고서를 자동 생성하고 검토 요청 상태로 등록
  cron.schedule("0 6 * * 1", async () => {
    const timestamp = new Date().toISOString();
    console.log(`[원료수불] ${timestamp} - 주간 보고서 자동 생성 시작`);
    try {
      const { tenants } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) return;

      const activeTenants = await db
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.status, "active"));

      const { autoGenerateLastWeekReport } = await import("./db/accounting/materialUsageReport");
      let success = 0;
      let failed = 0;
      for (const t of activeTenants) {
        try {
          await autoGenerateLastWeekReport(t.id, 1);
          success++;
        } catch (e) {
          failed++;
          console.error(`[원료수불] tenant=${t.id} 자동생성 실패:`, e);
        }
      }
      console.log(`[원료수불] ${timestamp} - 주간 보고서 자동 생성 완료 (성공 ${success}, 실패 ${failed})`);
    } catch (error) {
      console.error(`[원료수불] ${timestamp} - 자동 생성 실패:`, error);
    }
  });
  console.log("[Scheduler] 원료수불 주간 보고서 자동 생성 스케줄러 초기화 완료 (매주 월요일 오전 6시)");

  // ===== 자동 백업 (매일 새벽 2시) =====
  cron.schedule("0 2 * * *", async () => {
    const timestamp = new Date().toISOString();
    console.log(`[Backup Scheduler] ${timestamp} - 자동 백업 시작`);

    try {
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);
      const path = await import("path");
      const fs = await import("fs");

      const backupDir = path.resolve("/home/ubuntu/haccp_v3/backups");
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      const dateStr = todayKST().replace(/-/g, "");
      const backupFile = path.join(backupDir, `haccp_backup_${dateStr}.sql.gz`);

      // mysqldump + gzip
      const dbUrl = process.env.DATABASE_URL;
      if (!dbUrl) {
        console.error("[Backup Scheduler] DATABASE_URL 미설정");
        return;
      }

      const url = new URL(dbUrl);
      const dumpCmd = `mysqldump -h ${url.hostname} -P ${url.port || 3306} -u ${url.username} -p'${decodeURIComponent(url.password)}' ${url.pathname.slice(1)} --single-transaction --routines --triggers | gzip > ${backupFile}`;

      await execAsync(dumpCmd, { timeout: 300000 }); // 5분 타임아웃

      // 파일 크기 확인
      const stats = fs.statSync(backupFile);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(1);

      // DB에 백업 이력 기록 (시스템 백업이므로 첫 번째 테넌트 사용)
      const { getDb } = await import("./db");
      const { sql: sqlTag } = await import("drizzle-orm");
      const db = await getDb();
      if (db) {
        const [tenantRows] = await db.execute(sqlTag`SELECT id FROM tenants ORDER BY id ASC LIMIT 1`) as any;
        const systemTenantId = tenantRows?.[0]?.id || 1;
        await db.execute(sqlTag`
          INSERT INTO h_backups (tenant_id, file_name, file_size, backup_type, status, created_by, created_at)
          VALUES (${systemTenantId}, ${`haccp_backup_${dateStr}.sql.gz`}, ${stats.size}, 'local', 'completed', 0, NOW())
        `);
      }

      console.log(`[Backup Scheduler] ${timestamp} - 백업 완료: ${backupFile} (${sizeMB}MB)`);

      // 30일 이상 된 백업 자동 정리
      const files = fs.readdirSync(backupDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30);

      for (const file of files) {
        if (!file.startsWith("haccp_backup_")) continue;
        const filePath = path.join(backupDir, file);
        const fileStat = fs.statSync(filePath);
        if (fileStat.mtime < cutoffDate) {
          fs.unlinkSync(filePath);
          console.log(`[Backup Scheduler] 오래된 백업 삭제: ${file}`);
        }
      }
    } catch (error) {
      console.error(`[Backup Scheduler] ${timestamp} - 백업 실패:`, error);

      // 실패 시 관리자 알림
      try {
        const { getDb } = await import("./db");
        const { sql: sqlTag } = await import("drizzle-orm");
        const db = await getDb();
        if (db) {
          await db.execute(sqlTag`
            INSERT INTO h_notifications (tenant_id, user_id, notification_type, title, message, priority, created_at)
            SELECT u.tenant_id, u.id, 'system_alert',
              '[백업실패] 자동 백업이 실패했습니다',
              ${`백업 실패: ${error instanceof Error ? error.message : String(error)}`},
              'urgent', NOW()
            FROM users u WHERE u.role = 'admin' AND u.is_active = 1
            LIMIT 5
          `);
        }
      } catch { /* 알림 실패 무시 */ }
    }
  });
  console.log("[Scheduler] 자동 백업 스케줄러 초기화 완료 (매일 새벽 2시, 30일 보관)");

  // ===== 모니터링 알림 체크 (매 5분) =====
  cron.schedule("*/5 * * * *", async () => {
    try {
      const { checkAndAlert } = await import("./utils/operationMonitor");
      await checkAndAlert();
    } catch { /* 무시 */ }
  });
  console.log("[Scheduler] 운영 모니터링 알림 스케줄러 초기화 완료 (매 5분 체크)");

  // ===== 근태 자동마감 (매일 00:05 — 전날 퇴근 미기록자 자동 처리) =====
  cron.schedule("5 0 * * *", async () => {
    const timestamp = new Date().toISOString();
    console.log(`[HR Auto-Close] ${timestamp} - 전날 근태 자동마감 시작`);
    try {
      const { getPool } = await import("./db/pool");
      const pool = getPool();
      // 어제 날짜
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth()+1).padStart(2,"0")}-${String(yesterday.getDate()).padStart(2,"0")}`;

      // 모든 테넌트의 퇴근 미기록자 자동 마감
      const [result]: any = await pool.execute(
        `UPDATE attendance_records
         SET clock_out = TIME_FORMAT(ADDTIME(clock_in, '09:00:00'), '%H:%i:%s'),
             work_hours = 8.0,
             notes = CONCAT(COALESCE(notes, ''), ' [시스템자동마감: 24시초과]')
         WHERE work_date = ? AND clock_out IS NULL`,
        [yesterdayStr],
      );
      console.log(`[HR Auto-Close] ${yesterdayStr} 자동마감 완료: ${result.affectedRows}명`);
    } catch (err: any) {
      console.error("[HR Auto-Close] 자동마감 실패:", err.message?.substring(0, 100));
    }
  });
  console.log("[Scheduler] 근태 자동마감 스케줄러 초기화 완료 (매일 00:05 전날 미퇴근자 처리)");

}
