/**
 * 스케줄러 cluster lock — 다중 인스턴스 환경에서 cron 중복 실행 방지
 *
 * ============================================================================
 * 배경 (2026-04-28, 근본 작업 E):
 *   ecosystem.config.cjs 가 fork mode + instances:1 인 상태. 배포 시 502
 *   윈도우 (PR #108 wait_ready 로 1~2초로 단축, nginx retry 로 0초 가능).
 *
 *   진짜 zero-downtime 은 cluster mode (instances:2) 가 정답이지만,
 *   현재 단일 인스턴스 가정으로 작동하는 cron 스케줄러들이 있음.
 *
 *   - server/scheduler.ts: 매일 9시/13시/10시/8시 + 매 10분/30분
 *   - server/schedulers/batchCompletionRetryScheduler.ts
 *   - server/schedulers/inventoryNotifications.ts
 *   - server/schedulers/healthCertificateReminder.ts
 *
 *   cluster mode 전환 시 instances 별로 동시 cron 실행 → 중복 알림/처리 발생.
 *
 * ============================================================================
 * 해결:
 *   MySQL GET_LOCK() 으로 분산 lock. 여러 인스턴스 / 여러 서버 환경에서도 동일.
 *
 *   사용:
 *     cron.schedule("0 9 * * *", () =>
 *       withSchedulerLock("turnover_alerts", async () => {
 *         // 기존 작업
 *       })
 *     );
 *
 *   동작:
 *     - GET_LOCK(name, 0): 즉시 시도. 다른 worker 가 가지고 있으면 0 반환.
 *     - lock 획득 시: fn() 실행 → finally 에서 RELEASE_LOCK
 *     - lock 미획득 시: skip (다른 worker 가 처리 중) — 정상
 *
 *   안전성:
 *     - MySQL connection 종료 시 lock 자동 해제 (좀비 lock 없음)
 *     - tenant_id 무관 — 글로벌 lock (스케줄러는 cron 시점에 모든 tenant 처리)
 *     - 재진입 안전 — 동일 worker 가 동일 name 으로 다시 호출 시 0 반환 → skip
 *
 * ============================================================================
 * 도입 시점:
 *   현재 단일 인스턴스라 lock 효과는 미발휘 (항상 획득 성공).
 *   cluster mode 전환 (instances:2) 시점에 즉시 효과 발휘.
 *
 *   다단계 도입:
 *     1. (이 PR) 헬퍼 작성 + scheduler.ts 의 6개 cron 에 wrapper 적용
 *     2. (다음 PR) 다른 스케줄러 모듈들 (batchCompletionRetry 등) wrapper 적용
 *     3. (다음 PR) ecosystem.config.cjs 를 cluster mode + instances:2 로 전환
 *     4. (다음 PR) 운영 검증 + 모니터링
 *
 * ============================================================================
 */
import { getDb } from "../db";
import { sql } from "drizzle-orm";

const LOCK_PREFIX = "scheduler_";

/**
 * Cluster lock 으로 감싸진 스케줄러 작업 실행.
 * Lock 획득 실패 시 fn 미실행 (다른 worker 가 처리 중) — skip.
 *
 * @param name 스케줄러 식별자 (예: "turnover_alerts", "ccp_reminders")
 * @param fn 실행할 작업 (async)
 * @returns 실제 실행 여부 (true: 실행됨, false: skip)
 */
export async function withSchedulerLock(
  name: string,
  fn: () => Promise<void>
): Promise<boolean> {
  const db = await getDb();
  if (!db) {
    console.error(`[SchedulerLock] DB 연결 실패 — ${name} 스킵`);
    return false;
  }

  const lockName = `${LOCK_PREFIX}${name}`;

  // GET_LOCK(name, 0): 즉시 시도 (timeout=0). 다른 worker 가 가지고 있으면 0 반환.
  // 다중 인스턴스 환경에서 한 번에 한 worker 만 이 cron 작업 실행.
  let acquired: number | null = null;
  try {
    const result: any = await db.execute(
      sql`SELECT GET_LOCK(${lockName}, 0) AS got`
    );
    const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
    acquired = (rows as any[])?.[0]?.got;
  } catch (e: any) {
    console.error(`[SchedulerLock] GET_LOCK 실패 — ${name}: ${e.message}`);
    return false;
  }

  if (acquired !== 1) {
    // 다른 worker 가 이미 실행 중이거나 lock 획득 실패 — skip 정상.
    // 단일 인스턴스 환경에서는 거의 발생 안 함, cluster 환경에서 정상 동작.
    return false;
  }

  try {
    await fn();
    return true;
  } finally {
    // RELEASE_LOCK: 명시적 해제. connection 종료 시 자동 해제도 되지만
    // pool 이 connection 재사용하므로 명시적 해제 필수.
    try {
      await db.execute(sql`SELECT RELEASE_LOCK(${lockName})`);
    } catch (releaseErr: any) {
      console.error(`[SchedulerLock] RELEASE_LOCK 실패 — ${name}: ${releaseErr.message}`);
      // release 실패해도 connection 종료 시 자동 해제되므로 throw 안 함
    }
  }
}
