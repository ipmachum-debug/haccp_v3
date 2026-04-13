/**
 * 회계 정합성 검증
 * ═══════════════════════════════════════════════════════════════
 * 검증 항목:
 *   ACC_JOURNAL_UNBALANCED   — 분개 차변 ≠ 대변
 *   ACC_ORPHAN_LINES         — 분개 행의 entry_id 가 존재하지 않음
 *   ACC_ORPHAN_ACCOUNT       — 분개 행의 account_id 가 존재하지 않음
 *   ACC_PAID_NO_JOURNAL      — paid 매입인데 [매입] 분개 없음
 *   ACC_RECEIVED_NO_JOURNAL  — received 매출인데 [매출] 분개 없음
 *   ACC_SALE_NO_COGS         — ★ 매출 분개는 있는데 COGS 분개 없음 (P0)
 *   ACC_NEGATIVE_AMOUNT      — 분개 행의 금액이 음수
 *   ACC_TENANT_MISMATCH      — entry 와 lines 의 tenant_id 불일치
 * ═══════════════════════════════════════════════════════════════
 */

import type { Pool } from "mysql2/promise";
import type { Finding } from "./types";

const SAMPLE_LIMIT = 20;
const TOLERANCE = 0.01; // 원화 금액 허용 오차

/**
 * 분개 차변 합 ≠ 대변 합
 */
export async function checkJournalUnbalanced(
  conn: Pool,
  tenantId: number | null,
): Promise<Finding> {
  const tenantFilter = tenantId !== null ? "WHERE e.tenant_id = ?" : "";
  const params = tenantId !== null ? [tenantId] : [];

  const [rows]: any = await conn.execute(
    `SELECT e.id, e.tenant_id, e.entry_date, e.description,
            e.total_debit, e.total_credit,
            COALESCE(SUM(l.debit_amount), 0) AS sum_debit,
            COALESCE(SUM(l.credit_amount), 0) AS sum_credit
     FROM expense_journal_entries e
     LEFT JOIN expense_journal_lines l ON l.journal_entry_id = e.id
     ${tenantFilter}
     GROUP BY e.id
     HAVING ABS(sum_debit - sum_credit) > ${TOLERANCE}
     ORDER BY ABS(sum_debit - sum_credit) DESC
     LIMIT ${SAMPLE_LIMIT}`,
    params,
  );

  const [countRows]: any = await conn.execute(
    `SELECT COUNT(*) AS cnt FROM (
       SELECT e.id
       FROM expense_journal_entries e
       LEFT JOIN expense_journal_lines l ON l.journal_entry_id = e.id
       ${tenantFilter}
       GROUP BY e.id
       HAVING ABS(COALESCE(SUM(l.debit_amount), 0) - COALESCE(SUM(l.credit_amount), 0)) > ${TOLERANCE}
     ) q`,
    params,
  );

  const totalDelta = rows.reduce(
    (acc: number, r: any) => acc + Math.abs(Number(r.sum_debit) - Number(r.sum_credit)),
    0,
  );

  return {
    code: "ACC_JOURNAL_UNBALANCED",
    title: "분개 차변 ≠ 대변 (대차 불균형)",
    severity: "critical",
    count: Number(countRows[0]?.cnt || 0),
    samples: rows,
    totalDelta,
    message: "복식부기 원칙 위반. 차변 합 = 대변 합 이어야 합니다.",
  };
}

/**
 * 분개 행의 entry_id 가 존재하지 않음 (고아)
 */
export async function checkOrphanJournalLines(
  conn: Pool,
  tenantId: number | null,
): Promise<Finding> {
  const tenantFilter = tenantId !== null ? "AND l.tenant_id = ?" : "";
  const params = tenantId !== null ? [tenantId] : [];

  const [rows]: any = await conn.execute(
    `SELECT l.id, l.tenant_id, l.journal_entry_id, l.account_code, l.account_name,
            l.debit_amount, l.credit_amount, l.description
     FROM expense_journal_lines l
     LEFT JOIN expense_journal_entries e ON e.id = l.journal_entry_id
     WHERE e.id IS NULL
       ${tenantFilter}
     ORDER BY l.id DESC
     LIMIT ${SAMPLE_LIMIT}`,
    params,
  );

  const [countRows]: any = await conn.execute(
    `SELECT COUNT(*) AS cnt
     FROM expense_journal_lines l
     LEFT JOIN expense_journal_entries e ON e.id = l.journal_entry_id
     WHERE e.id IS NULL
       ${tenantFilter}`,
    params,
  );

  return {
    code: "ACC_ORPHAN_LINES",
    title: "고아 분개 행 (entry_id 존재 X)",
    severity: "high",
    count: Number(countRows[0]?.cnt || 0),
    samples: rows,
  };
}

/**
 * 분개 행의 account_id 가 accounting_accounts 에 존재하지 않음
 */
export async function checkOrphanAccount(
  conn: Pool,
  tenantId: number | null,
): Promise<Finding> {
  const tenantFilter = tenantId !== null ? "AND l.tenant_id = ?" : "";
  const params = tenantId !== null ? [tenantId] : [];

  const [rows]: any = await conn.execute(
    `SELECT l.id, l.tenant_id, l.journal_entry_id, l.account_id, l.account_code, l.account_name
     FROM expense_journal_lines l
     LEFT JOIN accounting_accounts a ON a.id = l.account_id
     WHERE a.id IS NULL
       ${tenantFilter}
     LIMIT ${SAMPLE_LIMIT}`,
    params,
  );

  const [countRows]: any = await conn.execute(
    `SELECT COUNT(*) AS cnt
     FROM expense_journal_lines l
     LEFT JOIN accounting_accounts a ON a.id = l.account_id
     WHERE a.id IS NULL
       ${tenantFilter}`,
    params,
  );

  return {
    code: "ACC_ORPHAN_ACCOUNT",
    title: "분개 행의 account_id 가 accounting_accounts 에 없음",
    severity: "high",
    count: Number(countRows[0]?.cnt || 0),
    samples: rows,
  };
}

/**
 * paid 매입인데 [매입] 분개가 없음
 */
export async function checkPaidPurchaseNoJournal(
  conn: Pool,
  tenantId: number | null,
): Promise<Finding> {
  const tenantFilter = tenantId !== null ? "AND p.tenant_id = ?" : "";
  const params = tenantId !== null ? [tenantId] : [];

  const [rows]: any = await conn.execute(
    `SELECT p.id, p.tenant_id, p.transaction_date, p.item_name, p.total_amount, p.posted_at
     FROM accounting_purchases p
     LEFT JOIN expense_journal_entries e
       ON e.tenant_id = p.tenant_id
      AND e.description LIKE CONCAT('%PURCHASE-', p.id, '%')
     WHERE p.status = 'paid'
       AND e.id IS NULL
       ${tenantFilter}
     ORDER BY p.posted_at DESC
     LIMIT ${SAMPLE_LIMIT}`,
    params,
  );

  const [countRows]: any = await conn.execute(
    `SELECT COUNT(*) AS cnt
     FROM accounting_purchases p
     LEFT JOIN expense_journal_entries e
       ON e.tenant_id = p.tenant_id
      AND e.description LIKE CONCAT('%PURCHASE-', p.id, '%')
     WHERE p.status = 'paid'
       AND e.id IS NULL
       ${tenantFilter}`,
    params,
  );

  return {
    code: "ACC_PAID_NO_JOURNAL",
    title: "paid 매입인데 회계 분개 없음",
    severity: "critical",
    count: Number(countRows[0]?.cnt || 0),
    samples: rows,
    message: "매입이 paid 상태인데 연결된 [매입] PURCHASE-{id} 분개가 없습니다. 재무제표 왜곡.",
  };
}

/**
 * received 매출인데 [매출] 분개가 없음
 */
export async function checkReceivedSaleNoJournal(
  conn: Pool,
  tenantId: number | null,
): Promise<Finding> {
  const tenantFilter = tenantId !== null ? "AND s.tenant_id = ?" : "";
  const params = tenantId !== null ? [tenantId] : [];

  const [rows]: any = await conn.execute(
    `SELECT s.id, s.tenant_id, s.transaction_date, s.item_name, s.total_amount, s.posted_at
     FROM accounting_sales s
     LEFT JOIN expense_journal_entries e
       ON e.tenant_id = s.tenant_id
      AND e.description LIKE CONCAT('%SALE-', s.id, '%')
     WHERE s.status = 'received'
       AND e.id IS NULL
       ${tenantFilter}
     ORDER BY s.posted_at DESC
     LIMIT ${SAMPLE_LIMIT}`,
    params,
  );

  const [countRows]: any = await conn.execute(
    `SELECT COUNT(*) AS cnt
     FROM accounting_sales s
     LEFT JOIN expense_journal_entries e
       ON e.tenant_id = s.tenant_id
      AND e.description LIKE CONCAT('%SALE-', s.id, '%')
     WHERE s.status = 'received'
       AND e.id IS NULL
       ${tenantFilter}`,
    params,
  );

  return {
    code: "ACC_RECEIVED_NO_JOURNAL",
    title: "received 매출인데 회계 분개 없음",
    severity: "critical",
    count: Number(countRows[0]?.cnt || 0),
    samples: rows,
    message: "매출이 received 상태인데 연결된 [매출] SALE-{id} 분개가 없습니다.",
  };
}

/**
 * ★ 매출 분개는 있는데 COGS 분개가 없음 (P0 - 현재 알려진 버그)
 *
 * 매출 분개: 차변 외상매출금 / 대변 매출(+부가세)
 * COGS 분개: 차변 매출원가(5010) / 대변 제품재고(1420)
 *
 * 현재 productSalePost 가 COGS 를 누락하고 있어서 이 규칙은 거의 100% 발견될 것.
 */
export async function checkSaleWithoutCOGS(
  conn: Pool,
  tenantId: number | null,
): Promise<Finding> {
  const tenantFilter = tenantId !== null ? "AND s.tenant_id = ?" : "";
  const params = tenantId !== null ? [tenantId] : [];

  // 매출 분개에서 매출원가(COGS) 계정이 있는지 체크
  // system_code='COST_OF_GOODS' 또는 code='5010' 기준
  const [rows]: any = await conn.execute(
    `SELECT s.id AS sale_id, s.tenant_id, s.transaction_date, s.item_name, s.total_amount, s.posted_at
     FROM accounting_sales s
     WHERE s.status = 'received'
       AND NOT EXISTS (
         SELECT 1 FROM expense_journal_entries e
         INNER JOIN expense_journal_lines l ON l.journal_entry_id = e.id
         INNER JOIN accounting_accounts a ON a.id = l.account_id
         WHERE e.tenant_id = s.tenant_id
           AND (e.description LIKE CONCAT('%SALE-', s.id, '%')
                OR e.description LIKE CONCAT('%매출원가%SALE-', s.id, '%'))
           AND (a.system_code = 'COST_OF_GOODS' OR a.code = '5010' OR a.code LIKE '5010%')
           AND l.debit_amount > 0
       )
       ${tenantFilter}
     ORDER BY s.posted_at DESC
     LIMIT ${SAMPLE_LIMIT}`,
    params,
  );

  const [countRows]: any = await conn.execute(
    `SELECT COUNT(*) AS cnt
     FROM accounting_sales s
     WHERE s.status = 'received'
       AND NOT EXISTS (
         SELECT 1 FROM expense_journal_entries e
         INNER JOIN expense_journal_lines l ON l.journal_entry_id = e.id
         INNER JOIN accounting_accounts a ON a.id = l.account_id
         WHERE e.tenant_id = s.tenant_id
           AND (e.description LIKE CONCAT('%SALE-', s.id, '%')
                OR e.description LIKE CONCAT('%매출원가%SALE-', s.id, '%'))
           AND (a.system_code = 'COST_OF_GOODS' OR a.code = '5010' OR a.code LIKE '5010%')
           AND l.debit_amount > 0
       )
       ${tenantFilter}`,
    params,
  );

  return {
    code: "ACC_SALE_NO_COGS",
    title: "★ 매출 분개는 있는데 COGS(매출원가) 분개 없음 (P0 버그)",
    severity: "critical",
    count: Number(countRows[0]?.cnt || 0),
    samples: rows,
    message: "productSalePost 가 COGS(매출원가) 분개를 누락하고 있음. 손익계산서 매출원가 과소 / 순이익 과대.",
  };
}

/**
 * 분개 행의 금액이 음수
 */
export async function checkNegativeJournalAmount(
  conn: Pool,
  tenantId: number | null,
): Promise<Finding> {
  const tenantFilter = tenantId !== null ? "AND tenant_id = ?" : "";
  const params = tenantId !== null ? [tenantId] : [];

  const [rows]: any = await conn.execute(
    `SELECT id, tenant_id, journal_entry_id, account_code, account_name,
            debit_amount, credit_amount, description
     FROM expense_journal_lines
     WHERE (debit_amount < ${-TOLERANCE} OR credit_amount < ${-TOLERANCE})
       ${tenantFilter}
     LIMIT ${SAMPLE_LIMIT}`,
    params,
  );

  const [countRows]: any = await conn.execute(
    `SELECT COUNT(*) AS cnt
     FROM expense_journal_lines
     WHERE (debit_amount < ${-TOLERANCE} OR credit_amount < ${-TOLERANCE})
       ${tenantFilter}`,
    params,
  );

  return {
    code: "ACC_NEGATIVE_AMOUNT",
    title: "분개 행 금액 음수 (역거래는 반대편에 양수로 기록해야 함)",
    severity: "high",
    count: Number(countRows[0]?.cnt || 0),
    samples: rows,
  };
}

/**
 * entry 와 lines 의 tenant_id 불일치
 */
export async function checkJournalTenantMismatch(
  conn: Pool,
  tenantId: number | null,
): Promise<Finding> {
  const tenantFilter = tenantId !== null ? "AND e.tenant_id = ?" : "";
  const params = tenantId !== null ? [tenantId] : [];

  const [rows]: any = await conn.execute(
    `SELECT l.id AS line_id, l.tenant_id AS line_tenant,
            e.id AS entry_id, e.tenant_id AS entry_tenant, e.description
     FROM expense_journal_lines l
     INNER JOIN expense_journal_entries e ON e.id = l.journal_entry_id
     WHERE l.tenant_id != e.tenant_id
       ${tenantFilter}
     LIMIT ${SAMPLE_LIMIT}`,
    params,
  );

  const [countRows]: any = await conn.execute(
    `SELECT COUNT(*) AS cnt
     FROM expense_journal_lines l
     INNER JOIN expense_journal_entries e ON e.id = l.journal_entry_id
     WHERE l.tenant_id != e.tenant_id
       ${tenantFilter}`,
    params,
  );

  return {
    code: "ACC_TENANT_MISMATCH",
    title: "entry/lines tenant_id 불일치 (★ 보안 위험)",
    severity: "critical",
    count: Number(countRows[0]?.cnt || 0),
    samples: rows,
  };
}

/**
 * 회계 검증 전체 실행
 */
export async function runAccountingChecks(
  conn: Pool,
  tenantId: number | null,
): Promise<Finding[]> {
  const [
    unbalanced,
    orphanLines,
    orphanAccount,
    paidNoJournal,
    receivedNoJournal,
    saleNoCOGS,
    negAmount,
    tenantMismatch,
  ] = await Promise.all([
    checkJournalUnbalanced(conn, tenantId),
    checkOrphanJournalLines(conn, tenantId),
    checkOrphanAccount(conn, tenantId),
    checkPaidPurchaseNoJournal(conn, tenantId),
    checkReceivedSaleNoJournal(conn, tenantId),
    checkSaleWithoutCOGS(conn, tenantId),
    checkNegativeJournalAmount(conn, tenantId),
    checkJournalTenantMismatch(conn, tenantId),
  ]);

  return [
    unbalanced,
    orphanLines,
    orphanAccount,
    paidNoJournal,
    receivedNoJournal,
    saleNoCOGS,
    negAmount,
    tenantMismatch,
  ];
}
