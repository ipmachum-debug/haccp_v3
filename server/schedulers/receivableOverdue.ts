/**
 * 미수금(AR) 결제주기 초과 알림 스케줄러
 *
 * 매일 오전 8시 30분 cron 실행:
 *   - 확정(status='approved')됐지만 아직 수금되지 않은 매출을 거래처별로 집계
 *   - 만기일 = 거래일 + partners.payment_terms_days (미설정 시 기본 30일)
 *   - 만기 초과 일수에 따라 단계(1/7/30/60/90일)를 판정하고 테넌트 admin 에게 h_notifications 생성
 *   - 같은 거래처 × 같은 단계는 7일 이내 재알림하지 않음 (단계가 올라가면 즉시 재알림)
 *
 * 회계 제외 매출(accounting_excluded=1, B2C 플랫폼 정산분)은 대상에서 제외한다.
 *
 * 작성: 2026-08-18 (다음 세션 TODO #3)
 */

import { getRawConnection } from "../db/connection";
import { logError, logInfo } from "../utils/logger";

/** 알림 단계 — 초과 일수가 큰 것부터 검사한다 */
export interface OverdueStage {
  key: string;
  /** 이 일수 이상 초과 시 해당 단계 */
  minDays: number;
  priority: "low" | "medium" | "high" | "urgent";
  label: string;
}

export const OVERDUE_STAGES: OverdueStage[] = [
  { key: "d90", minDays: 90, priority: "urgent", label: "90일 초과" },
  { key: "d60", minDays: 60, priority: "urgent", label: "60일 초과" },
  { key: "d30", minDays: 30, priority: "high", label: "30일 초과" },
  { key: "d7", minDays: 7, priority: "high", label: "7일 초과" },
  { key: "d1", minDays: 1, priority: "medium", label: "결제주기 초과" },
];

/** 같은 거래처 × 같은 단계 재알림 억제 기간(일) */
const RENOTIFY_SUPPRESS_DAYS = 7;

/** 기본 결제주기 (partners.payment_terms_days 미설정 시) */
export const DEFAULT_PAYMENT_TERMS_DAYS = 30;

/** 초과 일수 → 단계 판정 (해당 없으면 null) */
export function resolveOverdueStage(overdueDays: number): OverdueStage | null {
  return OVERDUE_STAGES.find((s) => overdueDays >= s.minDays) ?? null;
}

export interface OverdueRow {
  partnerId: number;
  partnerName: string;
  paymentTermsDays: number;
  invoiceCount: number;
  totalAmount: number;
  maxOverdueDays: number;
  oldestDate: string | null;
}

export interface ReceivableOverdueResult {
  tenantCount: number;
  partnerCount: number;
  alertCount: number;
  errors: number;
}

/**
 * 테넌트 1건의 연체 미수금 집계.
 *
 * partners.payment_terms_days 컬럼이 없는 환경(마이그레이션 전)에서는
 * 기본 결제주기(30일)로 자동 폴백한다.
 */
export async function getOverdueReceivables(tenantId: number): Promise<OverdueRow[]> {
  const pool = await getRawConnection();

  const buildSql = (termsExpr: string) => `
    SELECT s.partner_id                                  AS partner_id,
           p.company_name                                AS partner_name,
           ${termsExpr}                                  AS payment_terms_days,
           COUNT(*)                                      AS invoice_count,
           SUM(CAST(s.total_amount AS DECIMAL(15,2)))    AS total_amount,
           MIN(s.transaction_date)                       AS oldest_date,
           MAX(DATEDIFF(
                 CURDATE(),
                 DATE_ADD(STR_TO_DATE(s.transaction_date, '%Y-%m-%d'),
                          INTERVAL ${termsExpr} DAY)
               ))                                        AS max_overdue_days
      FROM accounting_sales s
      JOIN partners p
        ON p.id = s.partner_id
       AND p.tenant_id = s.tenant_id
     WHERE s.tenant_id = ?
       AND s.status = 'approved'
       AND COALESCE(s.accounting_excluded, 0) = 0
       AND s.partner_id IS NOT NULL
       AND s.transaction_date IS NOT NULL
       AND DATE_ADD(STR_TO_DATE(s.transaction_date, '%Y-%m-%d'),
                    INTERVAL ${termsExpr} DAY) < CURDATE()
     GROUP BY s.partner_id, p.company_name
     ORDER BY total_amount DESC
  `;

  let rows: any[] = [];
  try {
    const [r]: any = await pool.execute(
      buildSql(`COALESCE(p.payment_terms_days, ${DEFAULT_PAYMENT_TERMS_DAYS})`),
      [tenantId],
    );
    rows = r as any[];
  } catch (err: any) {
    // payment_terms_days 컬럼 미존재 환경 폴백
    if (!/payment_terms_days/i.test(String(err?.message ?? ""))) throw err;
    const [r]: any = await pool.execute(buildSql(String(DEFAULT_PAYMENT_TERMS_DAYS)), [tenantId]);
    rows = r as any[];
  }

  return rows.map((r) => ({
    partnerId: Number(r.partner_id),
    partnerName: r.partner_name ?? `거래처 #${r.partner_id}`,
    paymentTermsDays: Number(r.payment_terms_days ?? DEFAULT_PAYMENT_TERMS_DAYS),
    invoiceCount: Number(r.invoice_count ?? 0),
    totalAmount: Number(r.total_amount ?? 0),
    maxOverdueDays: Number(r.max_overdue_days ?? 0),
    oldestDate: r.oldest_date ? String(r.oldest_date).slice(0, 10) : null,
  }));
}

/** 알림 본문 생성 (테스트/재사용) */
export function buildOverdueNotification(row: OverdueRow, stage: OverdueStage) {
  return {
    title: `[미수금 ${stage.label}] ${row.partnerName}`,
    message:
      `미수금 ${Math.round(row.totalAmount).toLocaleString("ko-KR")}원 (${row.invoiceCount}건) — ` +
      `결제주기 ${row.paymentTermsDays}일 기준 ${row.maxOverdueDays}일 초과` +
      (row.oldestDate ? ` (최초 거래일 ${row.oldestDate})` : ""),
    referenceType: `ar_overdue_${stage.key}`,
    priority: stage.priority,
  };
}

/**
 * 테넌트 1건의 미수금 연체 알림 생성.
 * 스케줄러(전체 테넌트 루프)와 수동 실행 엔드포인트가 공유한다.
 */
export async function checkOverdueReceivablesForTenant(
  tenantId: number,
): Promise<{ partnerCount: number; alertCount: number }> {
  const pool = await getRawConnection();
  let partnerCount = 0;
  let alertCount = 0;

  const overdue = await getOverdueReceivables(tenantId);
  if (overdue.length === 0) return { partnerCount, alertCount };

  const [userRows]: any = await pool.execute(
    `SELECT id FROM users WHERE tenant_id = ? AND role IN ('admin', 'super_admin')`,
    [tenantId],
  );
  const users = userRows as any[];
  if (users.length === 0) return { partnerCount, alertCount };

  for (const row of overdue) {
    const stage = resolveOverdueStage(row.maxOverdueDays);
    if (!stage) continue;
    partnerCount++;

    const { title, message, referenceType, priority } = buildOverdueNotification(row, stage);

    // 중복 방지: 같은 거래처 × 같은 단계는 N일 이내 재알림 안 함
    const [dupRows]: any = await pool.execute(
      `SELECT id FROM h_notifications
        WHERE tenant_id = ?
          AND notification_type = 'ar_overdue'
          AND reference_type = ?
          AND reference_id = ?
          AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        LIMIT 1`,
      [tenantId, referenceType, row.partnerId, RENOTIFY_SUPPRESS_DAYS],
    );
    if ((dupRows as any[]).length > 0) continue;

    for (const u of users) {
      await pool.execute(
        `INSERT INTO h_notifications
           (tenant_id, user_id, notification_type, title, message,
            priority, reference_type, reference_id, action_url, created_at)
         VALUES (?, ?, 'ar_overdue', ?, ?, ?, ?, ?, ?, NOW())`,
        [
          tenantId,
          u.id,
          title,
          message,
          priority,
          referenceType,
          row.partnerId,
          "/dashboard/accounting/partner-credit",
        ],
      );
    }
    alertCount++;
  }

  return { partnerCount, alertCount };
}

/**
 * 전체 테넌트에 대해 미수금 연체 알림 생성.
 */
export async function checkOverdueReceivables(): Promise<ReceivableOverdueResult> {
  const pool = await getRawConnection();
  const result: ReceivableOverdueResult = {
    tenantCount: 0,
    partnerCount: 0,
    alertCount: 0,
    errors: 0,
  };

  const [tenantRows]: any = await pool.execute(`SELECT id FROM tenants`);

  for (const t of tenantRows as any[]) {
    const tenantId = Number(t.id);
    if (!tenantId) continue;
    result.tenantCount++;

    try {
      const r = await checkOverdueReceivablesForTenant(tenantId);
      result.partnerCount += r.partnerCount;
      result.alertCount += r.alertCount;
    } catch (err: any) {
      result.errors++;
      logError("미수금 연체 알림 생성 실패", err, {
        tenantId,
        operation: "checkOverdueReceivables",
      });
    }
  }

  logInfo("미수금 연체 알림 체크 완료", {
    operation: "checkOverdueReceivables",
    ...result,
  });

  return result;
}
