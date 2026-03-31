/**
 * 현금흐름 예측 엔진 (Phase B-2)
 *
 * AP/AR 결제 스케줄 + 과거 패턴 기반 30일 현금 포지션 예측:
 *
 * 1. 현재 현금/예금 잔액 산출
 * 2. 향후 30일 AP 지출 예정액 (due_date 기준)
 * 3. 향후 30일 AR 회수 예상액 (due_date + 회수율 보정)
 * 4. 과거 30일 일평균 운영비 기반 고정비 추정
 * 5. 일별 캐시 포지션 시뮬레이션 → 위험 구간 탐지
 */

import { getRawConnection } from "../db";

import { toKSTDate, todayKST, formatLocalDate} from "../utils/timezone";

// ============================================================================
// 타입 정의
// ============================================================================

export type CashFlowDay = {
  date: string;
  openingBalance: number;
  apOutflow: number;       // AP 결제 예정
  arInflow: number;        // AR 회수 예상
  operatingExpense: number; // 일상 운영비 (추정)
  netFlow: number;
  closingBalance: number;
  riskLevel: "safe" | "caution" | "warning" | "danger";
};

export type CashFlowForecast = {
  tenantId: number;
  generatedAt: string;
  currentBalance: number;
  forecastDays: number;
  dailyForecast: CashFlowDay[];
  summary: {
    totalApOutflow: number;
    totalArInflow: number;
    totalOperating: number;
    endingBalance: number;
    lowestBalance: number;
    lowestDate: string;
    dangerDays: number;
    warningDays: number;
  };
  recommendations: string[];
};

// ============================================================================
// 현재 현금/예금 잔액
// ============================================================================

async function getCurrentCashBalance(tenantId: number): Promise<number> {
  const conn = await getRawConnection();
  const [rows] = await conn.execute(
    `SELECT
       SUM(ejl.debit_amount) - SUM(ejl.credit_amount) as balance
     FROM expense_journal_lines ejl
     JOIN expense_journal_entries eje ON eje.id = ejl.journal_entry_id
     JOIN accounting_accounts aa ON aa.id = ejl.account_id AND aa.tenant_id = ?
     WHERE eje.tenant_id = ?
       AND aa.system_code IN ('CASH', 'BANK_DEPOSIT')`,
    [tenantId, tenantId]
  );
  return Number((rows as any[])[0]?.balance || 0);
}

// ============================================================================
// AP 지출 예정 (향후 N일)
// ============================================================================

async function getApSchedule(tenantId: number, days: number): Promise<Map<string, number>> {
  const conn = await getRawConnection();
  const schedule = new Map<string, number>();

  const [rows] = await conn.execute(
    `SELECT DATE(apl.due_date) as due_date, SUM(apl.amount) as total
     FROM ap_ledger apl
     WHERE apl.tenant_id = ? AND apl.status NOT IN ('paid', 'cancelled')
       AND apl.due_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
     GROUP BY DATE(apl.due_date)
     ORDER BY due_date`,
    [tenantId, days]
  );

  for (const row of rows as any[]) {
    const d = toKSTDate(new Date(row.due_date));
    schedule.set(d, Number(row.total));
  }

  // 이미 연체된 AP도 포함 (오늘 지불 가정)
  const [overdueRows] = await conn.execute(
    `SELECT SUM(apl.amount) as total
     FROM ap_ledger apl
     WHERE apl.tenant_id = ? AND apl.status NOT IN ('paid', 'cancelled')
       AND apl.due_date < CURDATE()`,
    [tenantId]
  );
  const overdueTotal = Number((overdueRows as any[])[0]?.total || 0);
  if (overdueTotal > 0) {
    const today = todayKST();
    schedule.set(today, (schedule.get(today) || 0) + overdueTotal);
  }

  return schedule;
}

// ============================================================================
// AR 회수 예상 (향후 N일, 과거 회수율 보정)
// ============================================================================

async function getArSchedule(tenantId: number, days: number): Promise<Map<string, number>> {
  const conn = await getRawConnection();
  const schedule = new Map<string, number>();

  // 과거 AR 회수율 계산 (최근 90일)
  const [rateRows] = await conn.execute(
    `SELECT
       COUNT(CASE WHEN status = 'collected' THEN 1 END) as collected,
       COUNT(*) as total
     FROM ar_ledger
     WHERE tenant_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)`,
    [tenantId]
  );
  const collectionRate = (rateRows as any[])[0]?.total > 0
    ? Number((rateRows as any[])[0].collected) / Number((rateRows as any[])[0].total)
    : 0.8; // 기본 회수율 80%

  const [rows] = await conn.execute(
    `SELECT DATE(arl.due_date) as due_date, SUM(arl.amount) as total
     FROM ar_ledger arl
     WHERE arl.tenant_id = ? AND arl.status NOT IN ('collected', 'cancelled')
       AND arl.due_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
     GROUP BY DATE(arl.due_date)
     ORDER BY due_date`,
    [tenantId, days]
  );

  for (const row of rows as any[]) {
    const d = toKSTDate(new Date(row.due_date));
    // 회수율 보정
    schedule.set(d, Math.round(Number(row.total) * collectionRate));
  }

  return schedule;
}

// ============================================================================
// 일평균 운영비 (고정비 추정)
// ============================================================================

async function getDailyOperatingExpense(tenantId: number): Promise<number> {
  const conn = await getRawConnection();
  const [rows] = await conn.execute(
    `SELECT SUM(ejl.debit_amount) / 30 as daily_avg
     FROM expense_journal_lines ejl
     JOIN expense_journal_entries eje ON eje.id = ejl.journal_entry_id
     JOIN accounting_accounts aa ON aa.id = ejl.account_id AND aa.category = 'expenses' AND aa.tenant_id = ?
     WHERE eje.tenant_id = ?
       AND eje.entry_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
       AND aa.system_code NOT IN ('COST_OF_GOODS')`,
    [tenantId, tenantId]
  );
  return Math.round(Number((rows as any[])[0]?.daily_avg || 0));
}

// ============================================================================
// 통합 예측 함수
// ============================================================================

export async function forecastCashFlow(
  tenantId: number,
  days: number = 30
): Promise<CashFlowForecast> {
  const [currentBalance, apSchedule, arSchedule, dailyOpex] = await Promise.all([
    getCurrentCashBalance(tenantId),
    getApSchedule(tenantId, days),
    getArSchedule(tenantId, days),
    getDailyOperatingExpense(tenantId),
  ]);

  // 일별 시뮬레이션
  const dailyForecast: CashFlowDay[] = [];
  let balance = currentBalance;
  let totalAp = 0, totalAr = 0, totalOp = 0;
  let lowestBalance = currentBalance;
  let lowestDate = todayKST();
  let dangerDays = 0, warningDays = 0;

  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);
    const dateStr = formatLocalDate(date);

    const apOut = apSchedule.get(dateStr) || 0;
    const arIn = arSchedule.get(dateStr) || 0;
    // 주말에는 운영비 감소 (토일 50%)
    const dayOfWeek = date.getDay();
    const opex = (dayOfWeek === 0 || dayOfWeek === 6) ? Math.round(dailyOpex * 0.5) : dailyOpex;

    const opening = balance;
    const netFlow = arIn - apOut - opex;
    balance = opening + netFlow;

    totalAp += apOut;
    totalAr += arIn;
    totalOp += opex;

    if (balance < lowestBalance) {
      lowestBalance = balance;
      lowestDate = dateStr;
    }

    let riskLevel: CashFlowDay["riskLevel"] = "safe";
    if (balance < 0) { riskLevel = "danger"; dangerDays++; }
    else if (balance < dailyOpex * 7) { riskLevel = "warning"; warningDays++; }
    else if (balance < dailyOpex * 14) { riskLevel = "caution"; }

    dailyForecast.push({
      date: dateStr,
      openingBalance: Math.round(opening),
      apOutflow: apOut,
      arInflow: arIn,
      operatingExpense: opex,
      netFlow: Math.round(netFlow),
      closingBalance: Math.round(balance),
      riskLevel,
    });
  }

  // 권고사항 생성
  const recommendations: string[] = [];
  if (dangerDays > 0) {
    recommendations.push(`향후 ${days}일 중 ${dangerDays}일간 잔고 부족 예상 - 긴급 자금 조달 필요`);
  }
  if (warningDays > 0) {
    recommendations.push(`${warningDays}일간 잔고 주의 구간 (운영비 1주일분 미만)`);
  }
  if (totalAp > totalAr * 1.5) {
    recommendations.push(`AP 지출(${totalAp.toLocaleString()}원)이 AR 회수(${totalAr.toLocaleString()}원)의 1.5배 초과 - AR 회수 촉진 필요`);
  }
  if (lowestBalance < 0) {
    recommendations.push(`${lowestDate} 최저 잔고 ${lowestBalance.toLocaleString()}원 - 해당 일자 전까지 자금 확보`);
  }
  if (recommendations.length === 0) {
    recommendations.push("향후 30일간 현금흐름 안정적");
  }

  return {
    tenantId,
    generatedAt: new Date().toISOString(),
    currentBalance: Math.round(currentBalance),
    forecastDays: days,
    dailyForecast,
    summary: {
      totalApOutflow: totalAp,
      totalArInflow: totalAr,
      totalOperating: totalOp,
      endingBalance: Math.round(balance),
      lowestBalance: Math.round(lowestBalance),
      lowestDate,
      dangerDays,
      warningDays,
    },
    recommendations,
  };
}
