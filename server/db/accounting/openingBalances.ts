/**
 * 기초 잔액 (Opening Balance / 전기이월) 관리 (P4-4)
 * 
 * accounting_accounts 테이블에 의존하지 않고
 * 별도의 opening_balances 개념을 journal_entries로 처리
 * 
 * 접근법:
 * - 특별 분개 엔트리 (entry_type = 'opening') 를 expense_journal_entries에 생성
 * - 조회 시 opening balance 분개만 필터링
 * - 재무보고서에서 자동 포함 (기존 generateTrialBalance가 이미 집계함)
 */
import { getRawConnection } from "../connection";

export interface OpeningBalanceItem {
  accountId: number;
  accountCode: string;
  accountName: string;
  category: string;
  debitAmount: number;
  creditAmount: number;
}

export interface OpeningBalanceData {
  fiscalYear: number;
  items: OpeningBalanceItem[];
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
  journalEntryId: number | null;
}

/**
 * 특정 회계연도의 기초 잔액 조회
 * description에 "[기초잔액]" 마커가 있는 분개를 검색
 */
export async function getOpeningBalances(
  tenantId: number,
  fiscalYear: number
): Promise<OpeningBalanceData> {
  const conn = await getRawConnection();
  const openingDate = `${fiscalYear}-01-01`;

  // 기초잔액 분개 엔트리 조회
  const [entries] = await conn.execute(
    `SELECT id FROM expense_journal_entries
     WHERE tenant_id = ? AND entry_date = ? AND description LIKE '%[기초잔액]%'
     ORDER BY id DESC LIMIT 1`,
    [tenantId, openingDate]
  );

  const entryRows = entries as any[];
  if (entryRows.length === 0) {
    return {
      fiscalYear,
      items: [],
      totalDebit: 0,
      totalCredit: 0,
      isBalanced: true,
      journalEntryId: null,
    };
  }

  const journalEntryId = entryRows[0].id;

  // 분개 행 조회 + 계정 정보 조인
  const [lines] = await conn.execute(
    `SELECT 
       ejl.account_id, ejl.account_code, ejl.account_name,
       ejl.debit_amount, ejl.credit_amount,
       COALESCE(aa.category, 'expenses') as category
     FROM expense_journal_lines ejl
     LEFT JOIN accounting_accounts aa ON aa.id = ejl.account_id AND aa.tenant_id = ?
     WHERE ejl.journal_entry_id = ? AND ejl.tenant_id = ?
     ORDER BY ejl.sort_order`,
    [tenantId, journalEntryId, tenantId]
  );

  const items: OpeningBalanceItem[] = (lines as any[]).map(row => ({
    accountId: row.account_id,
    accountCode: row.account_code,
    accountName: row.account_name,
    category: row.category,
    debitAmount: Number(row.debit_amount),
    creditAmount: Number(row.credit_amount),
  }));

  const totalDebit = items.reduce((sum, i) => sum + i.debitAmount, 0);
  const totalCredit = items.reduce((sum, i) => sum + i.creditAmount, 0);

  return {
    fiscalYear,
    items,
    totalDebit: Math.round(totalDebit * 100) / 100,
    totalCredit: Math.round(totalCredit * 100) / 100,
    isBalanced: Math.abs(totalDebit - totalCredit) < 0.01,
    journalEntryId,
  };
}

/**
 * 기초 잔액 저장 (기존 있으면 교체)
 * 차변/대변 균형 검증 후 분개 생성
 */
export async function saveOpeningBalances(
  tenantId: number,
  fiscalYear: number,
  items: Array<{
    accountId: number;
    accountCode: string;
    accountName: string;
    debitAmount: number;
    creditAmount: number;
  }>,
  userId: number
): Promise<{ journalEntryId: number; totalDebit: number; totalCredit: number }> {
  const conn = await getRawConnection();
  const openingDate = `${fiscalYear}-01-01`;

  // 유효한 항목만 필터링
  const validItems = items.filter(i => i.debitAmount > 0 || i.creditAmount > 0);
  if (validItems.length === 0) {
    throw new Error("저장할 기초 잔액 항목이 없습니다.");
  }

  const totalDebit = validItems.reduce((sum, i) => sum + i.debitAmount, 0);
  const totalCredit = validItems.reduce((sum, i) => sum + i.creditAmount, 0);

  // 대차 균형 검증
  if (Math.abs(totalDebit - totalCredit) >= 0.01) {
    throw new Error(`대차 불균형: 차변 ${totalDebit.toLocaleString()}원 vs 대변 ${totalCredit.toLocaleString()}원`);
  }

  // 기존 기초잔액 분개 삭제
  const [existingEntries] = await conn.execute(
    `SELECT id FROM expense_journal_entries
     WHERE tenant_id = ? AND entry_date = ? AND description LIKE '%[기초잔액]%'`,
    [tenantId, openingDate]
  );
  for (const entry of existingEntries as any[]) {
    await conn.execute(
      `DELETE FROM expense_journal_lines WHERE journal_entry_id = ? AND tenant_id = ?`,
      [entry.id, tenantId]
    );
    await conn.execute(
      `DELETE FROM expense_journal_entries WHERE id = ? AND tenant_id = ?`,
      [entry.id, tenantId]
    );
  }

  // 새 분개 엔트리 생성
  const [jeResult] = await conn.execute(
    `INSERT INTO expense_journal_entries
       (tenant_id, voucher_id, entry_date, description, total_debit, total_credit, posted_by)
     VALUES (?, 0, ?, ?, ?, ?, ?)`,
    [tenantId, openingDate, `[기초잔액] ${fiscalYear}년 전기이월`, totalDebit, totalCredit, userId]
  );
  const journalEntryId = Number((jeResult as any).insertId);

  // 분개 행 삽입
  let sortOrder = 0;
  for (const item of validItems) {
    await conn.execute(
      `INSERT INTO expense_journal_lines
         (tenant_id, journal_entry_id, account_id, account_code, account_name,
          debit_amount, credit_amount, description, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tenantId, journalEntryId,
        item.accountId, item.accountCode, item.accountName,
        item.debitAmount, item.creditAmount,
        `${fiscalYear}년 기초잔액`,
        sortOrder++,
      ]
    );
  }

  return {
    journalEntryId,
    totalDebit: Math.round(totalDebit * 100) / 100,
    totalCredit: Math.round(totalCredit * 100) / 100,
  };
}

/**
 * 기초 잔액 삭제
 */
export async function deleteOpeningBalances(
  tenantId: number,
  fiscalYear: number
): Promise<void> {
  const conn = await getRawConnection();
  const openingDate = `${fiscalYear}-01-01`;

  const [entries] = await conn.execute(
    `SELECT id FROM expense_journal_entries
     WHERE tenant_id = ? AND entry_date = ? AND description LIKE '%[기초잔액]%'`,
    [tenantId, openingDate]
  );

  for (const entry of entries as any[]) {
    await conn.execute(
      `DELETE FROM expense_journal_lines WHERE journal_entry_id = ? AND tenant_id = ?`,
      [entry.id, tenantId]
    );
    await conn.execute(
      `DELETE FROM expense_journal_entries WHERE id = ? AND tenant_id = ?`,
      [entry.id, tenantId]
    );
  }
}
