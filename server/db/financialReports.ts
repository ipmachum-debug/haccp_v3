/**
 * 재무보고서 생성 함수
 * P3: 시산표 (Trial Balance), 재무상태표 (Balance Sheet), 손익계산서 (Income Statement)
 * 
 * 데이터 소스:
 * 1. expense_journal_lines (비용전표 분개)
 * 2. accounting_transactions (매입/매출/재고 자동분개)
 * 
 * 계정과목: accounting_accounts (system_code 기반 통합 테이블)
 */
import { getRawConnection } from "../db";

// ============================================
// 공통 타입
// ============================================

export interface TrialBalanceRow {
  accountId: number;
  accountCode: string;
  accountName: string;
  category: string; // assets, liabilities, equity, revenue, expenses
  systemCode: string | null;
  debitTotal: number;
  creditTotal: number;
  debitBalance: number; // 차변 잔액 (자산/비용)
  creditBalance: number; // 대변 잔액 (부채/자본/수익)
}

export interface TrialBalanceResult {
  period: { startDate: string; endDate: string };
  rows: TrialBalanceRow[];
  totals: {
    totalDebit: number;
    totalCredit: number;
    totalDebitBalance: number;
    totalCreditBalance: number;
  };
}

export interface BalanceSheetResult {
  asOfDate: string;
  assets: TrialBalanceRow[];
  liabilities: TrialBalanceRow[];
  equity: TrialBalanceRow[];
  totals: {
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;
    balanceCheck: boolean; // 자산 = 부채 + 자본
  };
}

export interface IncomeStatementResult {
  period: { startDate: string; endDate: string };
  revenue: TrialBalanceRow[];
  expenses: TrialBalanceRow[];
  totals: {
    totalRevenue: number;
    totalExpenses: number;
    netIncome: number; // 당기순이익
  };
}

// ============================================
// 시산표 (Trial Balance)
// ============================================

/**
 * 시산표 생성
 * 기간 내 모든 계정의 차변/대변 합계 + 잔액 계산
 */
export async function generateTrialBalance(
  tenantId: number,
  startDate: string,
  endDate: string,
): Promise<TrialBalanceResult> {
  const conn = await getRawConnection();

  // 1. expense_journal_lines에서 집계
  const [expenseRows] = await conn.execute(
    `SELECT 
       ejl.account_id,
       ejl.account_code,
       ejl.account_name,
       COALESCE(SUM(ejl.debit_amount), 0) as debit_total,
       COALESCE(SUM(ejl.credit_amount), 0) as credit_total
     FROM expense_journal_lines ejl
     INNER JOIN expense_journal_entries eje ON eje.id = ejl.journal_entry_id AND eje.tenant_id = ?
     WHERE ejl.tenant_id = ?
       AND eje.entry_date >= ? AND eje.entry_date <= ?
     GROUP BY ejl.account_id, ejl.account_code, ejl.account_name`,
    [tenantId, tenantId, startDate, endDate],
  );

  // 2. accounting_transactions에서 집계
  const [atRows] = await conn.execute(
    `SELECT 
       account_code,
       account_name,
       COALESCE(SUM(debit_amount), 0) as debit_total,
       COALESCE(SUM(credit_amount), 0) as credit_total
     FROM accounting_transactions
     WHERE tenant_id = ?
       AND transaction_date >= ? AND transaction_date <= ?
       AND action_type = 'POST'
     GROUP BY account_code, account_name`,
    [tenantId, startDate, endDate],
  );

  // 3. 계정과목 마스터 조회 (category, system_code 보강)
  const [accounts] = await conn.execute(
    `SELECT id, code, name, category, system_code
     FROM accounting_accounts
     WHERE tenant_id = ? AND is_active = 'Y'`,
    [tenantId],
  );
  const accountMap = new Map<string, any>();
  for (const acc of accounts as any[]) {
    accountMap.set(acc.code, acc);
  }

  // 4. 데이터 통합 (account_code 기준)
  const mergedMap = new Map<string, TrialBalanceRow>();

  // expense_journal_lines 데이터
  for (const row of expenseRows as any[]) {
    const code = row.account_code;
    const master = accountMap.get(code);
    const existing = mergedMap.get(code) || {
      accountId: row.account_id || master?.id || 0,
      accountCode: code,
      accountName: row.account_name || master?.name || code,
      category: master?.category || "expenses",
      systemCode: master?.system_code || null,
      debitTotal: 0,
      creditTotal: 0,
      debitBalance: 0,
      creditBalance: 0,
    };
    existing.debitTotal += Number(row.debit_total);
    existing.creditTotal += Number(row.credit_total);
    mergedMap.set(code, existing);
  }

  // accounting_transactions 데이터
  for (const row of atRows as any[]) {
    const code = row.account_code;
    const master = accountMap.get(code);
    const existing = mergedMap.get(code) || {
      accountId: master?.id || 0,
      accountCode: code,
      accountName: row.account_name || master?.name || code,
      category: master?.category || "expenses",
      systemCode: master?.system_code || null,
      debitTotal: 0,
      creditTotal: 0,
      debitBalance: 0,
      creditBalance: 0,
    };
    existing.debitTotal += Number(row.debit_total);
    existing.creditTotal += Number(row.credit_total);
    mergedMap.set(code, existing);
  }

  // 5. 잔액 계산
  const rows: TrialBalanceRow[] = [];
  for (const row of mergedMap.values()) {
    const diff = row.debitTotal - row.creditTotal;
    // 자산/비용: 차변 잔액, 부채/자본/수익: 대변 잔액
    if (["assets", "expenses"].includes(row.category)) {
      row.debitBalance = Math.max(0, diff);
      row.creditBalance = Math.max(0, -diff);
    } else {
      row.creditBalance = Math.max(0, -diff);
      row.debitBalance = Math.max(0, diff);
    }
    rows.push(row);
  }

  // 코드 순 정렬
  rows.sort((a, b) => a.accountCode.localeCompare(b.accountCode));

  // 6. 합계 계산
  const totals = rows.reduce(
    (acc, row) => ({
      totalDebit: acc.totalDebit + row.debitTotal,
      totalCredit: acc.totalCredit + row.creditTotal,
      totalDebitBalance: acc.totalDebitBalance + row.debitBalance,
      totalCreditBalance: acc.totalCreditBalance + row.creditBalance,
    }),
    { totalDebit: 0, totalCredit: 0, totalDebitBalance: 0, totalCreditBalance: 0 },
  );

  return {
    period: { startDate, endDate },
    rows,
    totals,
  };
}

// ============================================
// 재무상태표 (Balance Sheet)
// ============================================

/**
 * 재무상태표 생성
 * 자산 = 부채 + 자본 (특정 날짜 기준 누적 잔액)
 * 당기순이익을 자본(이익잉여금)에 포함
 */
export async function generateBalanceSheet(
  tenantId: number,
  asOfDate: string,
): Promise<BalanceSheetResult> {
  // 기초일자: 설정 없으면 해당 연도 1월 1일
  const year = asOfDate.substring(0, 4);
  const startDate = `${year}-01-01`;

  // 시산표 데이터 활용
  const trialBalance = await generateTrialBalance(tenantId, startDate, asOfDate);

  // 카테고리별 분리
  const assets = trialBalance.rows.filter(r => r.category === "assets");
  const liabilities = trialBalance.rows.filter(r => r.category === "liabilities");
  const equityRows = trialBalance.rows.filter(r => r.category === "equity");
  const revenue = trialBalance.rows.filter(r => r.category === "revenue");
  const expenses = trialBalance.rows.filter(r => r.category === "expenses");

  // 자산 잔액: 차변 - 대변
  const totalAssets = assets.reduce((sum, r) => sum + r.debitTotal - r.creditTotal, 0);
  
  // 부채 잔액: 대변 - 차변
  const totalLiabilities = liabilities.reduce((sum, r) => sum + r.creditTotal - r.debitTotal, 0);
  
  // 자본 잔액: 대변 - 차변 + 당기순이익
  const totalEquityBase = equityRows.reduce((sum, r) => sum + r.creditTotal - r.debitTotal, 0);
  const totalRevenue = revenue.reduce((sum, r) => sum + r.creditTotal - r.debitTotal, 0);
  const totalExpenses = expenses.reduce((sum, r) => sum + r.debitTotal - r.creditTotal, 0);
  const netIncome = totalRevenue - totalExpenses;
  const totalEquity = totalEquityBase + netIncome;

  // 당기순이익을 이익잉여금 행에 표시
  const retainedEarningsRow: TrialBalanceRow = {
    accountId: 0,
    accountCode: "3099",
    accountName: "당기순이익",
    category: "equity",
    systemCode: null,
    debitTotal: 0,
    creditTotal: netIncome,
    debitBalance: 0,
    creditBalance: netIncome,
  };

  return {
    asOfDate,
    assets,
    liabilities,
    equity: [...equityRows, ...(netIncome !== 0 ? [retainedEarningsRow] : [])],
    totals: {
      totalAssets: Math.round(totalAssets * 100) / 100,
      totalLiabilities: Math.round(totalLiabilities * 100) / 100,
      totalEquity: Math.round(totalEquity * 100) / 100,
      balanceCheck: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
    },
  };
}

// ============================================
// 손익계산서 (Income Statement)
// ============================================

/**
 * 손익계산서 생성
 * 수익 - 비용 = 당기순이익
 */
export async function generateIncomeStatement(
  tenantId: number,
  startDate: string,
  endDate: string,
): Promise<IncomeStatementResult> {
  const trialBalance = await generateTrialBalance(tenantId, startDate, endDate);

  const revenue = trialBalance.rows.filter(r => r.category === "revenue");
  const expenses = trialBalance.rows.filter(r => r.category === "expenses");

  const totalRevenue = revenue.reduce((sum, r) => sum + r.creditTotal - r.debitTotal, 0);
  const totalExpenses = expenses.reduce((sum, r) => sum + r.debitTotal - r.creditTotal, 0);

  return {
    period: { startDate, endDate },
    revenue,
    expenses,
    totals: {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalExpenses: Math.round(totalExpenses * 100) / 100,
      netIncome: Math.round((totalRevenue - totalExpenses) * 100) / 100,
    },
  };
}
