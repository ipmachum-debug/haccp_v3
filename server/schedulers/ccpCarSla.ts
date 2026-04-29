/**
 * CP-3-j — CCP 시정조치 SLA 모니터링
 *
 * ============================================================================
 * 목적:
 *   PR #138 (CP-3-f) 가 자동 등록한 시정조치(CAR)가 운영자 처리 없이 N일
 *   이상 방치되면 (status='open' 또는 'investigating') 에스컬레이션 알림.
 *   F-3 폐쇄 루프의 마지막 약점 — "자동 등록은 되는데 처리는 누가?" — 보강.
 *
 * 흐름 (매일 오전 9:30 cron):
 *   1. 모든 tenant 의 (open|investigating) 상태 CAR 조회
 *   2. createdAt 또는 actionDueDate 가 N일 (기본 7일) 이상 경과한 것만 필터
 *   3. 같은 CAR 에 같은 날 SLA 알림이 이미 있으면 스킵 (멱등성)
 *   4. 수신자 fanout: admin/inspector/monitor + assignedTo (있으면)
 *
 * 환경변수:
 *   ENABLE_CCP_CAR_SLA_CHECK=false (기본) — 비활성
 *   CCP_CAR_SLA_DAYS=7 (기본 7일)         — SLA 임계 (open 후 N일)
 *
 * 안전:
 *   - cron 비활성 시 코드 호출 0
 *   - 실패는 catch + log (cron 다음 실행 대기)
 *   - 멱등성 — 같은 날 같은 CAR 에 알림 1건만 (DB 체크)
 *
 * 트리거: PR #138 CP-3-f / PR #143 F-3 대시보드 (보강)
 * ============================================================================
 */
import mysql from "mysql2/promise";

export function isCcpCarSlaCheckEnabled(): boolean {
  const flag = process.env.ENABLE_CCP_CAR_SLA_CHECK?.toLowerCase().trim();
  return flag === "true" || flag === "1" || flag === "yes";
}

function getSlaDays(): number {
  const raw = process.env.CCP_CAR_SLA_DAYS?.trim();
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 7;
}

export interface SlaCheckResult {
  scanned: number; // 검토한 CAR 수
  breached: number; // SLA 위반 CAR 수
  alertsCreated: number; // 발송된 알림 수 (fanout 포함)
  skippedDuplicate: number; // 같은 날 중복 알림 방지로 스킵된 수
}

/**
 * 모든 tenant 스캔 — 매일 cron 진입점.
 *
 * tenant 별 격리는 SQL 의 GROUP BY tenant_id 로 처리.
 */
export async function checkOpenCarSlaBreaches(): Promise<SlaCheckResult> {
  if (!isCcpCarSlaCheckEnabled()) {
    return { scanned: 0, breached: 0, alertsCreated: 0, skippedDuplicate: 0 };
  }

  const slaDays = getSlaDays();

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "haccp_user",
    password: process.env.DB_PASSWORD || "haccp_password",
    database: process.env.DB_NAME || "haccp_v3",
  });

  let scanned = 0;
  let breached = 0;
  let alertsCreated = 0;
  let skippedDuplicate = 0;

  try {
    // 1. SLA 위반 CAR 검색
    //    조건: status IN ('open','investigating')
    //          AND (action_due_date < CURDATE() OR
    //               (action_due_date IS NULL AND created_at < DATE_SUB(NOW(), INTERVAL N DAY)))
    const [rows]: any = await conn.execute(
      `SELECT id, tenant_id, request_number, status, priority, action_due_date,
              created_at, occurred_at,
              DATEDIFF(NOW(), created_at) AS days_open
       FROM h_corrective_action_requests
       WHERE status IN ('open', 'investigating')
         AND (
           (action_due_date IS NOT NULL AND action_due_date < CURDATE())
           OR
           (action_due_date IS NULL AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY))
         )
       ORDER BY tenant_id, days_open DESC`,
      [slaDays],
    );

    const breachedRows = rows as any[];
    scanned = breachedRows.length;
    breached = breachedRows.length;

    // 2. 각 CAR 별 알림 fanout (멱등성 체크 포함)
    for (const car of breachedRows) {
      // 멱등성: 오늘 같은 CAR 에 sla 알림이 이미 있는지 확인
      const [existingRows]: any = await conn.execute(
        `SELECT id FROM h_notifications
         WHERE tenant_id = ?
           AND notification_type = 'ccp_car_sla_breach'
           AND reference_id = ?
           AND DATE(created_at) = CURDATE()
         LIMIT 1`,
        [car.tenant_id, car.id],
      );

      if ((existingRows as any[]).length > 0) {
        skippedDuplicate++;
        continue;
      }

      // 수신자: admin/inspector/monitor + (있으면) assigned_to
      // assigned_to 컬럼은 h_corrective_action_requests 에 없을 수 있음 — 안전하게 admin 만
      const [recipientRows]: any = await conn.execute(
        `SELECT id FROM users
         WHERE tenant_id = ?
           AND role IN ('admin', 'inspector', 'monitor')
           AND is_active = 1
           AND approval_status = 'approved'
         LIMIT 20`,
        [car.tenant_id],
      );

      const recipientIds = (recipientRows as any[]).map((r) => Number(r.id));
      if (recipientIds.length === 0) {
        // 수신자 0명 — 알림 발송 스킵 (관리자 미등록 tenant)
        continue;
      }

      const daysOpen = Number(car.days_open ?? 0);
      const dueDate = car.action_due_date ? String(car.action_due_date).slice(0, 10) : null;
      const title = `[CAR SLA 위반] ${car.request_number} — ${daysOpen}일 미처리`;
      const message =
        `시정조치 요청이 처리되지 않은 상태로 ${daysOpen}일 경과했습니다.\n` +
        `  • CAR: ${car.request_number}\n` +
        `  • 상태: ${car.status}\n` +
        `  • 우선순위: ${car.priority}\n` +
        (dueDate ? `  • 마감일: ${dueDate} (경과)\n` : `  • SLA: ${slaDays}일 (경과)\n`) +
        `\n조치:\n` +
        `  - 시정조치 페이지(/corrective-actions)에서 즉시 검토\n` +
        `  - 즉시조치 / 근본원인 / 시정 / 검증 4단계 진행\n` +
        `  - 진행 불가능한 사유면 reject 처리`;

      // 우선순위: critical CAR → urgent, 그 외 → high
      const alertPriority = car.priority === "critical" ? "urgent" : "high";

      // 일괄 INSERT (recipients 만큼)
      const placeholders = recipientIds.map(() => "(?,?,?,?,?,?,?,?,?,NOW())").join(",");
      const values: any[] = [];
      for (const uid of recipientIds) {
        values.push(
          car.tenant_id,
          uid,
          "ccp_car_sla_breach",
          title,
          message,
          "corrective_action_request",
          Number(car.id),
          alertPriority,
          0, // is_read
        );
      }

      try {
        await conn.execute(
          `INSERT INTO h_notifications
            (tenant_id, user_id, notification_type, title, message,
             reference_type, reference_id, priority, is_read, created_at)
           VALUES ${placeholders}`,
          values,
        );
        alertsCreated += recipientIds.length;
      } catch (insertErr: any) {
        console.warn(
          `[ccpCarSla] 알림 INSERT 실패 — CAR id=${car.id}: ${insertErr?.message ?? insertErr}`,
        );
      }
    }

    if (scanned > 0) {
      console.log(
        `[ccpCarSla] 일일 스캔 — 위반 ${breached}건, 알림 ${alertsCreated}건, ` +
        `중복 스킵 ${skippedDuplicate}건 (SLA=${slaDays}일)`,
      );
    }
  } finally {
    await conn.end();
  }

  return { scanned, breached, alertsCreated, skippedDuplicate };
}
