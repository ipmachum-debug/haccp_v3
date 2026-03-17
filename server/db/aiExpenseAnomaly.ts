/**
 * ERP 비용 이상탐지 엔진 (Phase B-1)
 *
 * HACCP의 aiAnomalyDetection.ts와 동일한 패턴으로
 * 회계/비용 도메인의 이상 패턴을 자동 탐지:
 *
 * 1. 중복 거래 탐지 (같은 날짜+금액+거래처)
 * 2. 비용 이상치 탐지 (Z-score 기반)
 * 3. 카테고리별 월간 지출 급증 감지
 * 4. AP 연체 자동 분류 (30/60/90일)
 * 5. 매출 급감 감지 (전월 대비)
 * 6. 현금흐름 위험 예측 (예측 잔고 < 운영비 2주분)
 */

import { getRawConnection } from "../db";

// ============================================================================
// 타입 정의
// ============================================================================

export type ExpenseAnomalyType =
  | "duplicate_expense"
  | "expense_outlier"
  | "category_spike"
  | "payment_overdue"
  | "revenue_drop"
  | "cashflow_warning";

export type ExpenseAnomaly = {
  type: ExpenseAnomalyType;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  amount?: number;
  details: Record<string, any>;
  recommendations: string[];
};

export type ExpenseAnomalyReport = {
  tenantId: number;
  generatedAt: string;
  anomalies: ExpenseAnomaly[];
  criticalCount: number;
  highCount: number;
  summary: string;
};

// ============================================================================
// 1. 중복 거래 탐지
// ============================================================================

async function detectDuplicateExpenses(tenantId: number): Promise<ExpenseAnomaly[]> {
  const conn = await getRawConnection();
  const anomalies: ExpenseAnomaly[] = [];

  try {
    // 최근 30일 내 같은 날짜+금액+거래처 조합이 2회 이상
    const [rows] = await conn.execute(
      `SELECT
         e.expense_date, e.total_amount, e.partner_name,
         COUNT(*) as cnt,
         GROUP_CONCAT(e.id ORDER BY e.id SEPARATOR ',') as ids,
         GROUP_CONCAT(e.description SEPARATOR ' | ') as descriptions
       FROM expense_vouchers e
       WHERE e.tenant_id = ?
         AND e.expense_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
         AND e.status != 'cancelled'
       GROUP BY e.expense_date, e.total_amount, e.partner_name
       HAVING cnt >= 2
       ORDER BY e.total_amount DESC
       LIMIT 20`,
      [tenantId]
    );

    for (const row of rows as any[]) {
      anomalies.push({
        type: "duplicate_expense",
        severity: Number(row.total_amount) > 1000000 ? "high" : "medium",
        title: `중복 의심 거래 - ${row.partner_name || "미지정"} (${Number(row.cnt)}건)`,
        description: `${row.expense_date} / ${Number(row.total_amount).toLocaleString()}원 / ${row.partner_name || "거래처 미지정"} - 동일 조건 ${row.cnt}건 발견`,
        amount: Number(row.total_amount),
        details: {
          date: row.expense_date,
          partnerName: row.partner_name,
          count: Number(row.cnt),
          ids: row.ids?.split(",").map(Number),
          descriptions: row.descriptions,
        },
        recommendations: [
          "중복 전표 여부 확인",
          "거래처 확인 후 불필요한 전표 취소",
        ],
      });
    }
  } catch { /* 테이블 없을 수 있음 */ }

  return anomalies;
}

// ============================================================================
// 2. 비용 이상치 탐지 (Z-score)
// ============================================================================

async function detectExpenseOutliers(tenantId: number): Promise<ExpenseAnomaly[]> {
  const conn = await getRawConnection();
  const anomalies: ExpenseAnomaly[] = [];

  try {
    // 거래처별 평균/표준편차 계산 후 최근 거래에서 3σ 초과 탐지
    const [rows] = await conn.execute(
      `SELECT e.id, e.expense_date, e.total_amount, e.partner_name, e.description,
              stats.avg_amount, stats.std_amount,
              (e.total_amount - stats.avg_amount) / NULLIF(stats.std_amount, 0) as z_score
       FROM expense_vouchers e
       JOIN (
         SELECT partner_name,
                AVG(total_amount) as avg_amount,
                STDDEV(total_amount) as std_amount,
                COUNT(*) as cnt
         FROM expense_vouchers
         WHERE tenant_id = ? AND status != 'cancelled'
           AND expense_date >= DATE_SUB(CURDATE(), INTERVAL 180 DAY)
         GROUP BY partner_name
         HAVING cnt >= 5 AND std_amount > 0
       ) stats ON stats.partner_name = e.partner_name
       WHERE e.tenant_id = ? AND e.status != 'cancelled'
         AND e.expense_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
         AND (e.total_amount - stats.avg_amount) / NULLIF(stats.std_amount, 0) > 2.5
       ORDER BY z_score DESC
       LIMIT 10`,
      [tenantId, tenantId]
    );

    for (const row of rows as any[]) {
      const zScore = Number(row.z_score);
      anomalies.push({
        type: "expense_outlier",
        severity: zScore > 4 ? "critical" : zScore > 3 ? "high" : "medium",
        title: `비용 이상치 - ${row.partner_name || "미지정"} (Z=${zScore.toFixed(1)})`,
        description: `${row.expense_date} ${Number(row.total_amount).toLocaleString()}원 (평균 ${Math.round(Number(row.avg_amount)).toLocaleString()}원의 ${zScore.toFixed(1)}배 표준편차)`,
        amount: Number(row.total_amount),
        details: {
          voucherId: row.id,
          zScore: Math.round(zScore * 10) / 10,
          avgAmount: Math.round(Number(row.avg_amount)),
          stdAmount: Math.round(Number(row.std_amount)),
          description: row.description,
        },
        recommendations: [
          "해당 비용 항목 상세 검토",
          zScore > 4 ? "관리자 승인 필요" : "정상 거래인지 확인",
        ],
      });
    }
  } catch { /* 무시 */ }

  return anomalies;
}

// ============================================================================
// 3. 카테고리별 월간 지출 급증 감지
// ============================================================================

async function detectCategorySpike(tenantId: number): Promise<ExpenseAnomaly[]> {
  const conn = await getRawConnection();
  const anomalies: ExpenseAnomaly[] = [];

  try {
    // 이번 달 vs 전월 카테고리별 비교
    const [rows] = await conn.execute(
      `SELECT
         aa.name as accountName,
         aa.code as accountCode,
         cur.amount as currentAmount,
         prev.amount as prevAmount,
         CASE WHEN prev.amount > 0
           THEN ((cur.amount - prev.amount) / prev.amount) * 100
           ELSE 100
         END as changeRate
       FROM (
         SELECT ejl.account_id, SUM(ejl.debit_amount) as amount
         FROM expense_journal_lines ejl
         JOIN expense_journal_entries eje ON eje.id = ejl.journal_entry_id
         JOIN accounting_accounts aa ON aa.id = ejl.account_id AND aa.category = 'expenses'
         WHERE eje.tenant_id = ?
           AND eje.entry_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
         GROUP BY ejl.account_id
       ) cur
       LEFT JOIN (
         SELECT ejl.account_id, SUM(ejl.debit_amount) as amount
         FROM expense_journal_lines ejl
         JOIN expense_journal_entries eje ON eje.id = ejl.journal_entry_id
         JOIN accounting_accounts aa ON aa.id = ejl.account_id AND aa.category = 'expenses'
         WHERE eje.tenant_id = ?
           AND eje.entry_date >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01')
           AND eje.entry_date < DATE_FORMAT(CURDATE(), '%Y-%m-01')
         GROUP BY ejl.account_id
       ) prev ON prev.account_id = cur.account_id
       JOIN accounting_accounts aa ON aa.id = cur.account_id
       WHERE cur.amount > 100000
       HAVING changeRate > 50
       ORDER BY changeRate DESC
       LIMIT 10`,
      [tenantId, tenantId]
    );

    for (const row of rows as any[]) {
      const rate = Number(row.changeRate);
      anomalies.push({
        type: "category_spike",
        severity: rate > 200 ? "high" : rate > 100 ? "medium" : "low",
        title: `비용 급증 - ${row.accountName} (+${Math.round(rate)}%)`,
        description: `${row.accountName}(${row.accountCode}): 이번 달 ${Number(row.currentAmount).toLocaleString()}원 (전월 ${Number(row.prevAmount || 0).toLocaleString()}원 대비 ${Math.round(rate)}% 증가)`,
        amount: Number(row.currentAmount),
        details: {
          accountCode: row.accountCode,
          currentAmount: Number(row.currentAmount),
          prevAmount: Number(row.prevAmount || 0),
          changeRate: Math.round(rate),
        },
        recommendations: [
          "비용 증가 원인 분석",
          rate > 200 ? "예산 초과 여부 점검" : "전월 대비 변동 사유 확인",
        ],
      });
    }
  } catch { /* 무시 */ }

  return anomalies;
}

// ============================================================================
// 4. AP 연체 자동 분류 (30/60/90일)
// ============================================================================

async function detectPaymentOverdue(tenantId: number): Promise<ExpenseAnomaly[]> {
  const conn = await getRawConnection();
  const anomalies: ExpenseAnomaly[] = [];

  try {
    const [rows] = await conn.execute(
      `SELECT
         p.name as partnerName,
         DATEDIFF(CURDATE(), apl.due_date) as overdueDays,
         apl.amount,
         apl.description,
         apl.due_date
       FROM ap_ledger apl
       LEFT JOIN partners p ON p.id = apl.partner_id AND p.tenant_id = ?
       WHERE apl.tenant_id = ? AND apl.status != 'paid'
         AND apl.due_date < CURDATE()
       ORDER BY overdueDays DESC
       LIMIT 30`,
      [tenantId, tenantId]
    );

    // 30/60/90일 구간 분류
    const items = rows as any[];
    const over90 = items.filter((r) => Number(r.overdueDays) >= 90);
    const over60 = items.filter((r) => Number(r.overdueDays) >= 60 && Number(r.overdueDays) < 90);
    const over30 = items.filter((r) => Number(r.overdueDays) >= 30 && Number(r.overdueDays) < 60);

    if (over90.length > 0) {
      const total = over90.reduce((s: number, r: any) => s + Number(r.amount), 0);
      anomalies.push({
        type: "payment_overdue",
        severity: "critical",
        title: `AP 90일 이상 연체 - ${over90.length}건 (${total.toLocaleString()}원)`,
        description: over90.slice(0, 3).map((r: any) => `${r.partnerName}: ${Number(r.amount).toLocaleString()}원 (${r.overdueDays}일)`).join(", "),
        amount: total,
        details: { aging: "90+", count: over90.length, partners: over90.slice(0, 5).map((r: any) => r.partnerName) },
        recommendations: ["즉시 거래처 연락 및 결제 협의", "법적 조치 검토"],
      });
    }

    if (over60.length > 0) {
      const total = over60.reduce((s: number, r: any) => s + Number(r.amount), 0);
      anomalies.push({
        type: "payment_overdue",
        severity: "high",
        title: `AP 60~90일 연체 - ${over60.length}건 (${total.toLocaleString()}원)`,
        description: over60.slice(0, 3).map((r: any) => `${r.partnerName}: ${Number(r.amount).toLocaleString()}원`).join(", "),
        amount: total,
        details: { aging: "60-90", count: over60.length },
        recommendations: ["결제 일정 확인 및 독촉", "거래처별 결제 계획 수립"],
      });
    }

    if (over30.length > 0) {
      const total = over30.reduce((s: number, r: any) => s + Number(r.amount), 0);
      anomalies.push({
        type: "payment_overdue",
        severity: "medium",
        title: `AP 30~60일 연체 - ${over30.length}건 (${total.toLocaleString()}원)`,
        description: `${over30.length}건 / 총 ${total.toLocaleString()}원`,
        amount: total,
        details: { aging: "30-60", count: over30.length },
        recommendations: ["결제 일정 확인"],
      });
    }
  } catch { /* AP 테이블 없을 수 있음 */ }

  return anomalies;
}

// ============================================================================
// 5. 매출 급감 감지
// ============================================================================

async function detectRevenueDrop(tenantId: number): Promise<ExpenseAnomaly[]> {
  const conn = await getRawConnection();
  const anomalies: ExpenseAnomaly[] = [];

  try {
    const [rows] = await conn.execute(
      `SELECT
         DATE_FORMAT(eje.entry_date, '%Y-%m') as month,
         SUM(ejl.credit_amount) as revenue
       FROM expense_journal_lines ejl
       JOIN expense_journal_entries eje ON eje.id = ejl.journal_entry_id
       JOIN accounting_accounts aa ON aa.id = ejl.account_id AND aa.category = 'revenue'
       WHERE eje.tenant_id = ?
         AND eje.entry_date >= DATE_SUB(CURDATE(), INTERVAL 3 MONTH)
       GROUP BY DATE_FORMAT(eje.entry_date, '%Y-%m')
       ORDER BY month DESC
       LIMIT 3`,
      [tenantId]
    );

    const months = rows as any[];
    if (months.length >= 2) {
      const current = Number(months[0].revenue);
      const prev = Number(months[1].revenue);
      if (prev > 0) {
        const dropRate = ((prev - current) / prev) * 100;
        if (dropRate > 20) {
          anomalies.push({
            type: "revenue_drop",
            severity: dropRate > 50 ? "critical" : dropRate > 30 ? "high" : "medium",
            title: `매출 급감 경고 (-${Math.round(dropRate)}%)`,
            description: `${months[0].month} 매출 ${current.toLocaleString()}원 (전월 ${prev.toLocaleString()}원 대비 ${Math.round(dropRate)}% 감소)`,
            amount: current,
            details: {
              currentMonth: months[0].month,
              currentRevenue: current,
              prevRevenue: prev,
              dropRate: Math.round(dropRate),
            },
            recommendations: [
              "매출 감소 원인 분석 (거래처/제품별)",
              dropRate > 50 ? "긴급 경영 회의 필요" : "영업 전략 재검토",
              "주요 거래처 상태 확인",
            ],
          });
        }
      }
    }
  } catch { /* 무시 */ }

  return anomalies;
}

// ============================================================================
// 6. 현금흐름 위험 예측
// ============================================================================

async function detectCashflowWarning(tenantId: number): Promise<ExpenseAnomaly[]> {
  const conn = await getRawConnection();
  const anomalies: ExpenseAnomaly[] = [];

  try {
    // 현재 현금/예금 잔액
    const [cashRows] = await conn.execute(
      `SELECT
         SUM(ejl.debit_amount) - SUM(ejl.credit_amount) as balance
       FROM expense_journal_lines ejl
       JOIN expense_journal_entries eje ON eje.id = ejl.journal_entry_id
       JOIN accounting_accounts aa ON aa.id = ejl.account_id
       WHERE eje.tenant_id = ?
         AND aa.system_code IN ('CASH', 'BANK_DEPOSIT')`,
      [tenantId]
    );

    // 최근 30일 일평균 비용
    const [expRows] = await conn.execute(
      `SELECT
         SUM(ejl.debit_amount) / 30 as dailyExpense
       FROM expense_journal_lines ejl
       JOIN expense_journal_entries eje ON eje.id = ejl.journal_entry_id
       JOIN accounting_accounts aa ON aa.id = ejl.account_id AND aa.category = 'expenses'
       WHERE eje.tenant_id = ?
         AND eje.entry_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,
      [tenantId]
    );

    const cashBalance = Number((cashRows as any[])[0]?.balance || 0);
    const dailyExpense = Number((expRows as any[])[0]?.dailyExpense || 0);

    if (dailyExpense > 0 && cashBalance > 0) {
      const runwayDays = Math.round(cashBalance / dailyExpense);

      if (runwayDays < 30) {
        anomalies.push({
          type: "cashflow_warning",
          severity: runwayDays < 7 ? "critical" : runwayDays < 14 ? "high" : "medium",
          title: `현금흐름 위험 - 잔여 ${runwayDays}일`,
          description: `현재 현금/예금 잔액 ${cashBalance.toLocaleString()}원, 일평균 비용 ${Math.round(dailyExpense).toLocaleString()}원 → 약 ${runwayDays}일 운영 가능`,
          amount: cashBalance,
          details: {
            cashBalance,
            dailyExpense: Math.round(dailyExpense),
            runwayDays,
          },
          recommendations: [
            runwayDays < 7 ? "긴급 자금 조달 필요" : "자금 조달 계획 수립",
            "AR 회수 촉진",
            "비필수 비용 지출 보류",
          ],
        });
      }
    }
  } catch { /* 무시 */ }

  return anomalies;
}

// ============================================================================
// 통합 탐지 함수
// ============================================================================

export async function detectExpenseAnomalies(tenantId: number): Promise<ExpenseAnomalyReport> {
  const [duplicates, outliers, spikes, overdue, revDrop, cashflow] = await Promise.all([
    detectDuplicateExpenses(tenantId).catch(() => []),
    detectExpenseOutliers(tenantId).catch(() => []),
    detectCategorySpike(tenantId).catch(() => []),
    detectPaymentOverdue(tenantId).catch(() => []),
    detectRevenueDrop(tenantId).catch(() => []),
    detectCashflowWarning(tenantId).catch(() => []),
  ]);

  const allAnomalies = [...duplicates, ...outliers, ...spikes, ...overdue, ...revDrop, ...cashflow]
    .sort((a, b) => {
      const sev = { critical: 0, high: 1, medium: 2, low: 3 };
      return (sev[a.severity] || 3) - (sev[b.severity] || 3);
    });

  const criticalCount = allAnomalies.filter((a) => a.severity === "critical").length;
  const highCount = allAnomalies.filter((a) => a.severity === "high").length;

  let summary = "이상 항목이 감지되지 않았습니다.";
  if (allAnomalies.length > 0) {
    summary = `총 ${allAnomalies.length}건의 회계 이상 감지 (위험 ${criticalCount}, 높음 ${highCount})`;
  }

  return {
    tenantId,
    generatedAt: new Date().toISOString(),
    anomalies: allAnomalies,
    criticalCount,
    highCount,
    summary,
  };
}
