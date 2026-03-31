/**
 * 운영 모니터링 시스템
 *
 * 1. 트랜잭션 실패 추적 - withTransaction 실패를 구조적으로 기록
 * 2. 에러 집계 - 최근 N분 내 에러율 모니터링
 * 3. 알림 트리거 - 임계치 초과 시 h_notifications에 자동 알림
 * 4. 헬스체크 상세 - DB 연결 + 최근 에러율 포함
 */
import { logError, logWarn, logInfo } from "./logger";

// ─── 에러 집계 (인메모리 링버퍼) ───

interface ErrorEntry {
  timestamp: number;
  operation: string;
  message: string;
  tenantId?: number;
}

const ERROR_BUFFER_SIZE = 500;
const ERROR_WINDOW_MS = 5 * 60 * 1000; // 5분
const errorBuffer: ErrorEntry[] = [];
let totalRequests = 0;
let totalErrors = 0;

/** 요청 카운트 증가 */
export function trackRequest(): void {
  totalRequests++;
}

/** 에러 기록 */
export function trackError(operation: string, error: unknown, tenantId?: number): void {
  totalErrors++;
  const entry: ErrorEntry = {
    timestamp: Date.now(),
    operation,
    message: error instanceof Error ? error.message : String(error),
    tenantId,
  };

  errorBuffer.push(entry);
  if (errorBuffer.length > ERROR_BUFFER_SIZE) {
    errorBuffer.shift();
  }

  logError(`[Monitor] ${operation} 실패`, error, { tenantId, operation });
}

/** 트랜잭션 실패 기록 (withTransaction 래퍼에서 호출) */
export function trackTransactionFailure(operation: string, error: unknown, tenantId?: number): void {
  trackError(`TXN:${operation}`, error, tenantId);
}

/** 최근 N분 내 에러 목록 */
export function getRecentErrors(windowMs: number = ERROR_WINDOW_MS): ErrorEntry[] {
  const cutoff = Date.now() - windowMs;
  return errorBuffer.filter(e => e.timestamp > cutoff);
}

/** 에러율 계산 (최근 N분 기준) */
export function getErrorRate(windowMs: number = ERROR_WINDOW_MS): {
  recentErrors: number;
  totalRequests: number;
  totalErrors: number;
  errorRate: string;
} {
  const recent = getRecentErrors(windowMs);
  return {
    recentErrors: recent.length,
    totalRequests,
    totalErrors,
    errorRate: totalRequests > 0 ? (totalErrors / totalRequests * 100).toFixed(2) + "%" : "0%",
  };
}

// ─── 알림 트리거 ───

const ALERT_THRESHOLD = 10; // 5분 내 에러 10건 이상이면 알림
let lastAlertTime = 0;
const ALERT_COOLDOWN_MS = 30 * 60 * 1000; // 30분 쿨다운

/** 에러 임계치 초과 시 관리자 알림 생성 */
export async function checkAndAlert(): Promise<void> {
  const recent = getRecentErrors();
  if (recent.length < ALERT_THRESHOLD) return;
  if (Date.now() - lastAlertTime < ALERT_COOLDOWN_MS) return;

  lastAlertTime = Date.now();

  // 에러 요약
  const opCounts: Record<string, number> = {};
  for (const e of recent) {
    opCounts[e.operation] = (opCounts[e.operation] || 0) + 1;
  }
  const topOps = Object.entries(opCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([op, cnt]) => `${op}(${cnt}건)`)
    .join(", ");

  logWarn(`[Monitor] 에러 임계치 초과: 최근 5분 ${recent.length}건`, {
    operation: "error_threshold_alert",
    topOperations: topOps,
  });

  // DB 알림 생성 시도
  try {
    const { getDb } = await import("../db");
    const { sql } = await import("drizzle-orm");
    const db = await getDb();
    if (!db) return;

    // 모든 admin 사용자에게 알림
    await db.execute(sql`
      INSERT INTO h_notifications (tenant_id, user_id, notification_type, title, message, priority, created_at)
      SELECT u.tenant_id, u.id, 'system_alert',
        ${`[운영경고] 에러 ${recent.length}건 감지`},
        ${`최근 5분 내 에러 ${recent.length}건 발생. 주요: ${topOps}`},
        'urgent', NOW()
      FROM users u WHERE u.role = 'admin' AND u.is_active = 1
      LIMIT 10
    `);
  } catch (alertErr) {
    logError("[Monitor] 알림 생성 실패", alertErr);
  }
}

// ─── 상세 헬스체크 ───

export async function getDetailedHealth(): Promise<{
  status: "healthy" | "degraded" | "unhealthy";
  db: { connected: boolean; latencyMs: number };
  errors: { recent5min: number; totalErrors: number; errorRate: string };
  uptime: number;
  memory: { heapUsed: string; heapTotal: string; rss: string };
}> {
  // DB 연결 체크
  let dbConnected = false;
  let dbLatency = 0;
  try {
    const { getRawConnection } = await import("../db");
    const pool = await getRawConnection();
    const start = Date.now();
    await pool.execute("SELECT 1");
    dbLatency = Date.now() - start;
    dbConnected = true;
  } catch {
    dbConnected = false;
  }

  const errorStats = getErrorRate();
  const mem = process.memoryUsage();

  const status = !dbConnected ? "unhealthy"
    : errorStats.recentErrors > ALERT_THRESHOLD ? "degraded"
    : "healthy";

  return {
    status,
    db: { connected: dbConnected, latencyMs: dbLatency },
    errors: {
      recent5min: errorStats.recentErrors,
      totalErrors: errorStats.totalErrors,
      errorRate: errorStats.errorRate,
    },
    uptime: process.uptime(),
    memory: {
      heapUsed: (mem.heapUsed / 1024 / 1024).toFixed(1) + "MB",
      heapTotal: (mem.heapTotal / 1024 / 1024).toFixed(1) + "MB",
      rss: (mem.rss / 1024 / 1024).toFixed(1) + "MB",
    },
  };
}
