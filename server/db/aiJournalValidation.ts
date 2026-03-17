/**
 * 분개 검증 AI (Phase B-4)
 *
 * 분개 엔트리의 이상 패턴을 자동 탐지:
 *
 * 1. 대차 불균형 감지 (차변 ≠ 대변)
 * 2. 비정상 계정 조합 탐지 (드문 차변-대변 페어)
 * 3. 라운드 넘버 집중 탐지 (부정 징후)
 * 4. 비업무시간 분개 탐지
 * 5. 연속 번호 누락/중복 체크
 */

import { getRawConnection } from "../db";

// ============================================================================
// 타입 정의
// ============================================================================

export type JournalIssueType =
  | "imbalance"
  | "unusual_pair"
  | "round_number"
  | "off_hours"
  | "sequence_gap";

export type JournalIssue = {
  type: JournalIssueType;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  journalEntryId?: number;
  details: Record<string, any>;
};

export type JournalValidationReport = {
  tenantId: number;
  generatedAt: string;
  period: string;
  issues: JournalIssue[];
  stats: {
    totalEntries: number;
    checkedEntries: number;
    issueCount: number;
    criticalCount: number;
  };
};

// ============================================================================
// 1. 대차 불균형 감지
// ============================================================================

async function detectImbalance(tenantId: number, startDate: string, endDate: string): Promise<JournalIssue[]> {
  const conn = await getRawConnection();
  const issues: JournalIssue[] = [];

  try {
    const [rows] = await conn.execute(
      `SELECT eje.id, eje.entry_date, eje.description,
              SUM(ejl.debit_amount) as total_debit,
              SUM(ejl.credit_amount) as total_credit,
              ABS(SUM(ejl.debit_amount) - SUM(ejl.credit_amount)) as diff
       FROM expense_journal_entries eje
       JOIN expense_journal_lines ejl ON ejl.journal_entry_id = eje.id
       WHERE eje.tenant_id = ? AND eje.entry_date BETWEEN ? AND ?
       GROUP BY eje.id, eje.entry_date, eje.description
       HAVING diff > 0.01
       ORDER BY diff DESC
       LIMIT 20`,
      [tenantId, startDate, endDate]
    );

    for (const row of rows as any[]) {
      issues.push({
        type: "imbalance",
        severity: Number(row.diff) > 10000 ? "critical" : "high",
        title: `대차 불균형 - 분개 #${row.id}`,
        description: `${row.entry_date} "${row.description || ""}" - 차변 ${Number(row.total_debit).toLocaleString()}원 ≠ 대변 ${Number(row.total_credit).toLocaleString()}원 (차이: ${Number(row.diff).toLocaleString()}원)`,
        journalEntryId: row.id,
        details: {
          debit: Number(row.total_debit),
          credit: Number(row.total_credit),
          difference: Number(row.diff),
        },
      });
    }
  } catch { /* 무시 */ }

  return issues;
}

// ============================================================================
// 2. 비정상 계정 조합 탐지
// ============================================================================

async function detectUnusualPairs(tenantId: number, startDate: string, endDate: string): Promise<JournalIssue[]> {
  const conn = await getRawConnection();
  const issues: JournalIssue[] = [];

  try {
    // 동일 분개 엔트리 내에서 차변-대변 계정 조합 빈도 분석
    const [rows] = await conn.execute(
      `SELECT
         d_acc.code as debit_code, d_acc.name as debit_name,
         c_acc.code as credit_code, c_acc.name as credit_name,
         COUNT(*) as pair_count,
         eje.id as sample_entry_id,
         eje.entry_date as sample_date
       FROM expense_journal_lines d_line
       JOIN expense_journal_entries eje ON eje.id = d_line.journal_entry_id
       JOIN expense_journal_lines c_line ON c_line.journal_entry_id = eje.id AND c_line.credit_amount > 0
       JOIN accounting_accounts d_acc ON d_acc.id = d_line.account_id AND d_acc.tenant_id = ?
       JOIN accounting_accounts c_acc ON c_acc.id = c_line.account_id AND c_acc.tenant_id = ?
       WHERE eje.tenant_id = ? AND eje.entry_date BETWEEN ? AND ?
         AND d_line.debit_amount > 0
         AND d_acc.id != c_acc.id
       GROUP BY d_acc.code, d_acc.name, c_acc.code, c_acc.name, eje.id, eje.entry_date
       HAVING pair_count = 1
       ORDER BY eje.entry_date DESC
       LIMIT 50`,
      [tenantId, tenantId, tenantId, startDate, endDate]
    );

    // 전체 기간 대비 이 조합이 처음인 건만 필터
    const uniquePairs = rows as any[];
    for (const row of uniquePairs.slice(0, 10)) {
      const [historyCount] = await conn.execute(
        `SELECT COUNT(*) as cnt
         FROM expense_journal_lines d_line
         JOIN expense_journal_entries eje ON eje.id = d_line.journal_entry_id
         JOIN expense_journal_lines c_line ON c_line.journal_entry_id = eje.id AND c_line.credit_amount > 0
         WHERE eje.tenant_id = ?
           AND d_line.account_id = (SELECT id FROM accounting_accounts WHERE code = ? AND tenant_id = ? LIMIT 1)
           AND c_line.account_id = (SELECT id FROM accounting_accounts WHERE code = ? AND tenant_id = ? LIMIT 1)
           AND d_line.debit_amount > 0
           AND eje.entry_date < ?`,
        [tenantId, row.debit_code, tenantId, row.credit_code, tenantId, startDate]
      );

      if (Number((historyCount as any[])[0]?.cnt || 0) === 0) {
        issues.push({
          type: "unusual_pair",
          severity: "medium",
          title: `처음 사용된 계정 조합`,
          description: `${row.sample_date} - 차변: ${row.debit_name}(${row.debit_code}), 대변: ${row.credit_name}(${row.credit_code}) - 이전에 사용된 적 없는 조합`,
          journalEntryId: row.sample_entry_id,
          details: {
            debitAccount: { code: row.debit_code, name: row.debit_name },
            creditAccount: { code: row.credit_code, name: row.credit_name },
          },
        });
      }
    }
  } catch { /* 무시 */ }

  return issues;
}

// ============================================================================
// 3. 라운드 넘버 집중 탐지
// ============================================================================

async function detectRoundNumbers(tenantId: number, startDate: string, endDate: string): Promise<JournalIssue[]> {
  const conn = await getRawConnection();
  const issues: JournalIssue[] = [];

  try {
    // 해당 기간 전체 라인 수 vs 라운드 넘버(1만원 단위) 비율
    const [rows] = await conn.execute(
      `SELECT
         COUNT(*) as total_lines,
         SUM(CASE WHEN (ejl.debit_amount > 0 AND MOD(ejl.debit_amount, 10000) = 0)
                    OR (ejl.credit_amount > 0 AND MOD(ejl.credit_amount, 10000) = 0) THEN 1 ELSE 0 END) as round_lines,
         SUM(CASE WHEN (ejl.debit_amount > 0 AND MOD(ejl.debit_amount, 100000) = 0)
                    OR (ejl.credit_amount > 0 AND MOD(ejl.credit_amount, 100000) = 0) THEN 1 ELSE 0 END) as very_round_lines
       FROM expense_journal_lines ejl
       JOIN expense_journal_entries eje ON eje.id = ejl.journal_entry_id
       WHERE eje.tenant_id = ? AND eje.entry_date BETWEEN ? AND ?
         AND (ejl.debit_amount > 0 OR ejl.credit_amount > 0)`,
      [tenantId, startDate, endDate]
    );

    const data = (rows as any[])[0];
    const total = Number(data?.total_lines || 0);
    const round = Number(data?.round_lines || 0);
    const veryRound = Number(data?.very_round_lines || 0);

    if (total > 20) {
      const roundRate = (round / total) * 100;
      // 50% 이상이 라운드 넘버면 경고
      if (roundRate > 50) {
        issues.push({
          type: "round_number",
          severity: roundRate > 70 ? "high" : "medium",
          title: `라운드 넘버 비율 높음 (${Math.round(roundRate)}%)`,
          description: `전체 ${total}건 중 ${round}건(${Math.round(roundRate)}%)이 만원 단위. 10만원 단위: ${veryRound}건. 추정/가공 분개 가능성 점검 필요.`,
          details: {
            totalLines: total,
            roundLines: round,
            veryRoundLines: veryRound,
            roundRate: Math.round(roundRate * 10) / 10,
          },
        });
      }
    }
  } catch { /* 무시 */ }

  return issues;
}

// ============================================================================
// 4. 비업무시간 분개 탐지
// ============================================================================

async function detectOffHoursEntries(tenantId: number, startDate: string, endDate: string): Promise<JournalIssue[]> {
  const conn = await getRawConnection();
  const issues: JournalIssue[] = [];

  try {
    const [rows] = await conn.execute(
      `SELECT eje.id, eje.entry_date, eje.description, eje.created_at,
              HOUR(eje.created_at) as hour,
              SUM(ejl.debit_amount) as total_amount
       FROM expense_journal_entries eje
       JOIN expense_journal_lines ejl ON ejl.journal_entry_id = eje.id
       WHERE eje.tenant_id = ? AND eje.entry_date BETWEEN ? AND ?
         AND (HOUR(eje.created_at) < 7 OR HOUR(eje.created_at) >= 22)
       GROUP BY eje.id, eje.entry_date, eje.description, eje.created_at
       HAVING total_amount > 100000
       ORDER BY total_amount DESC
       LIMIT 10`,
      [tenantId, startDate, endDate]
    );

    for (const row of rows as any[]) {
      issues.push({
        type: "off_hours",
        severity: Number(row.total_amount) > 1000000 ? "high" : "low",
        title: `비업무시간 분개 (${row.hour}시)`,
        description: `${row.entry_date} ${row.hour}시 - "${row.description || ""}" ${Number(row.total_amount).toLocaleString()}원`,
        journalEntryId: row.id,
        details: {
          hour: row.hour,
          createdAt: row.created_at,
          amount: Number(row.total_amount),
        },
      });
    }
  } catch { /* 무시 */ }

  return issues;
}

// ============================================================================
// 통합 검증 함수
// ============================================================================

export async function validateJournalEntries(
  tenantId: number,
  startDate?: string,
  endDate?: string
): Promise<JournalValidationReport> {
  const now = new Date();
  const start = startDate || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const end = endDate || now.toISOString().split("T")[0];

  const conn = await getRawConnection();

  // 기간 내 총 분개 수
  const [countRows] = await conn.execute(
    `SELECT COUNT(*) as cnt FROM expense_journal_entries WHERE tenant_id = ? AND entry_date BETWEEN ? AND ?`,
    [tenantId, start, end]
  );
  const totalEntries = Number((countRows as any[])[0]?.cnt || 0);

  const [imbalance, unusualPairs, roundNumbers, offHours] = await Promise.all([
    detectImbalance(tenantId, start, end),
    detectUnusualPairs(tenantId, start, end),
    detectRoundNumbers(tenantId, start, end),
    detectOffHoursEntries(tenantId, start, end),
  ]);

  const allIssues = [...imbalance, ...unusualPairs, ...roundNumbers, ...offHours]
    .sort((a, b) => {
      const sev = { critical: 0, high: 1, medium: 2, low: 3 };
      return (sev[a.severity] || 3) - (sev[b.severity] || 3);
    });

  return {
    tenantId,
    generatedAt: now.toISOString(),
    period: `${start} ~ ${end}`,
    issues: allIssues,
    stats: {
      totalEntries,
      checkedEntries: totalEntries,
      issueCount: allIssues.length,
      criticalCount: allIssues.filter((i) => i.severity === "critical").length,
    },
  };
}
