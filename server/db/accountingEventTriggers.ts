/**
 * 회계 이벤트 트리거 (Phase B-5)
 *
 * HACCP의 aiEventTriggers.ts와 동일한 패턴으로
 * 특정 회계 이벤트 발생 시 AI 기능 자동 실행:
 *
 * 1. 대형 비용 전표 등록 시 알림
 * 2. AP 결제 기한 도래 시 알림
 * 3. 현금 잔고 부족 경고
 * 4. 비용 전표 확정 시 이상 패턴 체크
 */

import { getRawConnection } from "../db";
import { createNotification } from "./notificationFunctions";

// ============================================================================
// 1. 대형 비용 전표 등록 시 알림
// ============================================================================

/**
 * 비용 전표 생성/확정 후 호출 - 금액이 평균의 3배 이상이면 알림
 */
export async function onLargeExpenseCreated(params: {
  tenantId: number;
  voucherId: number;
  amount: number;
  partnerName?: string;
  description?: string;
  userId?: number;
}) {
  const { tenantId, voucherId, amount, partnerName, description } = params;

  try {
    const conn = await getRawConnection();

    // 최근 90일 평균 비용 조회
    const [avgRows] = await conn.execute(
      `SELECT AVG(total_amount) as avg_amount, STDDEV(total_amount) as std_amount
       FROM expense_vouchers
       WHERE tenant_id = ? AND status NOT IN ('canceled', 'cancelled')
         AND expense_date >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)`,
      [tenantId]
    );

    const avg = Number((avgRows as any[])[0]?.avg_amount || 0);
    const std = Number((avgRows as any[])[0]?.std_amount || 0);

    // 평균의 3배 초과 또는 Z-score 3 초과
    const threshold = Math.max(avg * 3, avg + std * 3);
    if (avg > 0 && amount > threshold) {
      // AI 알림 생성
      await conn.execute(
        `INSERT INTO ai_alerts
         (tenant_id, rule_code, title, message, severity, entity_type, entity_id, context_data, status, created_at)
         VALUES (?, 'LARGE_EXPENSE_ALERT', ?, ?, ?, 'expense', ?, ?, 'active', NOW())`,
        [
          tenantId,
          `대형 비용 알림 - ${partnerName || "미지정"}`,
          `${partnerName || "미지정"}: ${amount.toLocaleString()}원 (평균 ${Math.round(avg).toLocaleString()}원의 ${(amount / avg).toFixed(1)}배)`,
          amount > avg * 5 ? "critical" : "high",
          voucherId,
          JSON.stringify({ amount, avg: Math.round(avg), partnerName, description }),
        ]
      );

      await createNotification({
        tenantId,
        notificationType: "expense_alert",
        title: `[비용 이상] 대형 비용 전표 등록`,
        message: `${partnerName || ""}: ${amount.toLocaleString()}원 - 평균 대비 ${(amount / avg).toFixed(1)}배 초과. 검토가 필요합니다.`,
        referenceType: "expense",
        referenceId: voucherId,
        priority: amount > avg * 5 ? "urgent" : "high",
        actionUrl: "/accounting/expenses",
      });
    }
  } catch (error) {
    console.error("[Accounting Trigger] 대형 비용 알림 실패:", error);
  }
}

// ============================================================================
// 2. AP 결제 기한 도래 알림
// ============================================================================

/**
 * 스케줄러에서 호출 - 3일 이내 결제 기한인 AP 건에 대해 알림
 */
export async function checkUpcomingPayments(tenantId: number): Promise<number> {
  try {
    const conn = await getRawConnection();

    // ap_ledger uses: supplier_partner_id, occurred_at, ap_entry_type, memo
    // partners uses: company_name (not name)
    // Note: ap_ledger has no due_date column; use occurred_at + 30 day payment terms as proxy
    const [rows] = await conn.execute(
      `SELECT apl.id, apl.amount, 
              DATE_ADD(apl.occurred_at, INTERVAL 30 DAY) as due_date,
              apl.memo as description,
              p.company_name as partnerName,
              DATEDIFF(DATE_ADD(apl.occurred_at, INTERVAL 30 DAY), CURDATE()) as daysUntilDue
       FROM ap_ledger apl
       LEFT JOIN partners p ON p.id = apl.supplier_partner_id AND p.tenant_id = ?
       WHERE apl.tenant_id = ? AND apl.ap_entry_type = 'bill'
         AND DATE_ADD(apl.occurred_at, INTERVAL 30 DAY) BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 3 DAY)
       ORDER BY apl.occurred_at ASC`,
      [tenantId, tenantId]
    );

    const items = rows as any[];
    if (items.length === 0) return 0;

    // 중복 방지: 오늘 이미 알림했는지 확인
    const [existing] = await conn.execute(
      `SELECT id FROM ai_alerts
       WHERE tenant_id = ? AND rule_code = 'AP_DUE_REMINDER'
         AND DATE(created_at) = CURDATE() AND status = 'active'
       LIMIT 1`,
      [tenantId]
    );
    if ((existing as any[]).length > 0) return 0;

    const totalAmount = items.reduce((s: number, r: any) => s + Number(r.amount), 0);
    const todayDue = items.filter((r: any) => Number(r.daysUntilDue) === 0);

    await conn.execute(
      `INSERT INTO ai_alerts
       (tenant_id, rule_code, title, message, severity, entity_type, context_data, status, created_at)
       VALUES (?, 'AP_DUE_REMINDER', ?, ?, ?, 'payment', ?, 'active', NOW())`,
      [
        tenantId,
        `결제 기한 도래 - ${items.length}건`,
        `3일 이내 결제 예정 ${items.length}건 (합계 ${totalAmount.toLocaleString()}원)${todayDue.length > 0 ? `, 오늘 마감 ${todayDue.length}건` : ""}`,
        todayDue.length > 0 ? "high" : "medium",
        JSON.stringify({
          count: items.length,
          totalAmount,
          todayDueCount: todayDue.length,
          partners: items.slice(0, 5).map((r: any) => ({ name: r.partnerName, amount: Number(r.amount), dueDate: r.due_date })),
        }),
      ]
    );

    if (todayDue.length > 0) {
      await createNotification({
        tenantId,
        notificationType: "payment_reminder",
        title: `[결제] 오늘 마감 ${todayDue.length}건`,
        message: `오늘 결제 기한인 건: ${todayDue.map((r: any) => `${r.partnerName} ${Number(r.amount).toLocaleString()}원`).join(", ")}`,
        priority: "high",
        actionUrl: "/accounting/ap-ledger",
      });
    }

    return items.length;
  } catch (error) {
    console.error("[Accounting Trigger] AP 기한 알림 실패:", error);
    return 0;
  }
}

// ============================================================================
// 3. 일일 비용 이상탐지 스캔 (스케줄러용)
// ============================================================================

/**
 * 스케줄러에서 매일 호출 - 전일 비용 데이터 이상 패턴 스캔
 */
export async function runDailyExpenseAnomalyScan(tenantId: number): Promise<number> {
  try {
    const { detectExpenseAnomalies } = await import("./aiExpenseAnomaly");
    const { saveAlerts } = await import("./rulesEngine");

    const report = await detectExpenseAnomalies(tenantId);

    if (report.anomalies.length === 0) return 0;

    // 이상탐지 결과를 ai_alerts에 저장 (rulesEngine의 saveAlerts 형식에 맞춤)
    const ruleResults = report.anomalies.map((a) => ({
      ruleId: 0,
      ruleCode: `ERP_${a.type.toUpperCase()}`,
      triggered: true,
      severity: a.severity,
      title: a.title,
      message: a.description,
      entityType: "accounting" as const,
      entityCode: a.type,
      contextData: a.details,
    }));

    const saved = await saveAlerts(tenantId, ruleResults);
    return saved;
  } catch (error) {
    console.error("[Accounting Trigger] 비용 이상탐지 스캔 실패:", error);
    return 0;
  }
}
