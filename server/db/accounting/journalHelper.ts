/**
 * @deprecated core-erp 레이어로 이주됨.
 *   신규 코드: `import { ... } from "../../core-erp/accounting/journal"` 사용
 *   이 파일은 하위 호환 유지를 위한 레거시 경로.
 *   모든 import 가 core-erp/accounting/journal 로 이주되면 이 파일 삭제 예정.
 */

import { getRawConnection } from "../connection";
import { SYSTEM_ACCOUNTS, type SystemAccountCode } from "../../../drizzle/schema/accountingAccounts";

import { formatLocalDate } from "../../utils/timezone";

/**
 * 시스템 계정 조회 (system_code 기반)
 * - system_code가 설정된 계정을 우선 조회
 * - 없으면 code/name 폴백으로 조회
 * - 결과: { id, code, name } 또는 폴백 기본값
 */
export async function resolveSystemAccount(
  tenantId: number,
  systemCode: SystemAccountCode,
  fallbackCode?: string,
  fallbackName?: string
): Promise<{ id: number; code: string; name: string }> {
  const conn = await getRawConnection();

  // 1차: system_code로 조회
  const [rows1] = await conn.execute(
    `SELECT id, code, name FROM accounting_accounts
     WHERE tenant_id = ? AND system_code = ? AND is_active = 'Y'
     LIMIT 1`,
    [tenantId, systemCode],
  );
  if ((rows1 as any[]).length > 0) {
    const r = (rows1 as any[])[0];
    return { id: r.id, code: r.code, name: r.name };
  }

  // 2차: code 또는 name 폴백 조회
  if (fallbackCode || fallbackName) {
    const conditions: string[] = [];
    const params: any[] = [tenantId];
    if (fallbackCode) {
      conditions.push("code = ?");
      params.push(fallbackCode);
    }
    if (fallbackName) {
      conditions.push("name LIKE ?");
      params.push(`%${fallbackName}%`);
    }
    const [rows2] = await conn.execute(
      `SELECT id, code, name FROM accounting_accounts
       WHERE tenant_id = ? AND (${conditions.join(" OR ")}) AND is_active = 'Y'
       LIMIT 1`,
      params,
    );
    if ((rows2 as any[]).length > 0) {
      const r = (rows2 as any[])[0];
      return { id: r.id, code: r.code, name: r.name };
    }
  }

  // 3차: 찾지 못하면 폴백 기본값 반환 (id=0)
  console.warn(
    `[resolveSystemAccount] 계정 미발견: tenantId=${tenantId}, systemCode=${systemCode}, fallbackCode=${fallbackCode}`
  );
  return {
    id: 0,
    code: fallbackCode || systemCode,
    name: fallbackName || systemCode,
  };
}

/**
 * 결제수단 → 시스템 계정 매핑
 */
export function getPaymentSystemAccount(paymentMethod: string): {
  systemCode: SystemAccountCode;
  fallbackCode: string;
  fallbackName: string;
} {
  switch (paymentMethod) {
    case "cash":
      return {
        systemCode: SYSTEM_ACCOUNTS.CASH,
        fallbackCode: "1010",
        fallbackName: "현금",
      };
    case "bank":
      return {
        systemCode: SYSTEM_ACCOUNTS.BANK_DEPOSIT,
        fallbackCode: "1020",
        fallbackName: "보통예금",
      };
    case "card":
      return {
        systemCode: SYSTEM_ACCOUNTS.ACCOUNTS_PAYABLE_CARD,
        fallbackCode: "2020",
        fallbackName: "미지급금-카드",
      };
    case "unpaid":
      return {
        systemCode: SYSTEM_ACCOUNTS.ACCOUNTS_PAYABLE,
        fallbackCode: "2010",
        fallbackName: "미지급금",
      };
    default:
      return {
        systemCode: SYSTEM_ACCOUNTS.CASH,
        fallbackCode: "1010",
        fallbackName: "현금",
      };
  }
}

/**
 * 공통 분개 행 생성 함수
 * expense_journal_lines 또는 향후 통합 journal_lines에 INSERT
 */
export async function insertJournalLine(
  conn: any,
  params: {
    tenantId: number;
    journalEntryId: number;
    accountId: number;
    accountCode: string;
    accountName: string;
    debitAmount: number;
    creditAmount: number;
    description?: string;
    sortOrder: number;
    bankAccountId?: number | null;
    partnerId?: number | null;
    tableName?: string; // 기본: expense_journal_lines
  }
) {
  const table = params.tableName || "expense_journal_lines";
  await conn.execute(
    `INSERT INTO ${table}
       (tenant_id, journal_entry_id, account_id, account_code, account_name,
        debit_amount, credit_amount, description, sort_order, bank_account_id, partner_id)
     VALUES (?,?,?,?,?, ?,?,?,?, ?,?)`,
    [
      params.tenantId,
      params.journalEntryId,
      params.accountId,
      params.accountCode,
      params.accountName,
      params.debitAmount,
      params.creditAmount,
      params.description || null,
      params.sortOrder,
      params.bankAccountId || null,
      params.partnerId || null,
    ],
  );
}

// ============================================
// 비용전표 자동분개 (P2-3: expense.ts에서 추출)
// ============================================

/**
 * 비용전표 확정 - 분개 자동 생성
 * expense.ts의 post 프로시저에서 핵심 로직을 추출
 * 
 * @returns { journalEntryId: number }
 */
export async function postExpenseVoucher(
  conn: any,
  params: {
    tenantId: number;
    voucherId: number;
    voucher: any; // expense_vouchers row
    items: any[]; // expense_items rows
    postedBy: number; // user id
  }
): Promise<{ journalEntryId: number }> {
  const { tenantId, voucherId, voucher, items, postedBy } = params;
  const totalDebit = Number(voucher.total_amount);

  // 1. 분개 엔트리 생성
  const [jeResult] = await conn.execute(
    `INSERT INTO expense_journal_entries
       (tenant_id, voucher_id, entry_date, description, total_debit, total_credit, posted_by)
     VALUES (?,?,?,?,?,?,?)`,
    [
      tenantId, voucherId, voucher.expense_date,
      `비용전표 ${voucher.voucher_no} 확정`,
      totalDebit, totalDebit, postedBy,
    ],
  );
  const journalEntryId = Number((jeResult as any).insertId);

  // 2. 차변 행: 각 비용항목별
  let lineOrder = 0;
  for (const item of items) {
    const supplyAmt = Number(item.supply_amount);
    const vatAmt = Number(item.vat_amount);

    // 비용계정 (공급가) - 차변
    if (supplyAmt > 0) {
      await insertJournalLine(conn, {
        tenantId, journalEntryId,
        accountId: item.account_id,
        accountCode: item.account_code,
        accountName: item.account_name,
        debitAmount: supplyAmt, creditAmount: 0,
        description: item.description || item.account_name,
        sortOrder: lineOrder++,
      });
    }

    // 부가세대급금 (매입세액) - 차변 (세금계산서/카드 증빙)
    if (vatAmt > 0 && (voucher.proof_type === "tax_invoice" || voucher.proof_type === "card")) {
      const vatAcc = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.VAT_INPUT, "1350", "부가세대급금");
      await insertJournalLine(conn, {
        tenantId, journalEntryId,
        accountId: vatAcc.id, accountCode: vatAcc.code, accountName: vatAcc.name,
        debitAmount: vatAmt, creditAmount: 0,
        description: "매입세액", sortOrder: lineOrder++,
      });
    }
  }

  // 3. 대변 행: 결제수단에 따라 달라짐 (system_code 기반 조회)
  const creditAmount = totalDebit;
  const paymentMapping = getPaymentSystemAccount(voucher.payment_method);
  const creditAcc = await resolveSystemAccount(
    tenantId, paymentMapping.systemCode, paymentMapping.fallbackCode, paymentMapping.fallbackName
  );

  await insertJournalLine(conn, {
    tenantId, journalEntryId,
    accountId: creditAcc.id, accountCode: creditAcc.code, accountName: creditAcc.name,
    debitAmount: 0, creditAmount: creditAmount,
    description: `${voucher.payment_method} 결제`,
    sortOrder: lineOrder++,
    bankAccountId: voucher.bank_account_id || null,
    partnerId: voucher.partner_id || null,
  });

  // 4. 전표 상태 변경 (posted) + 미지급잔액 설정
  const unpaidBalance = voucher.payment_method === "unpaid" ? totalDebit : 0;
  await conn.execute(
    `UPDATE expense_vouchers SET status = 'posted', posted_by = ?, posted_at = NOW(),
     unpaid_balance = ?, is_fully_paid = 0
     WHERE id = ? AND tenant_id = ?`,
    [postedBy, unpaidBalance, voucherId, tenantId],
  );

  return { journalEntryId };
}

/**
 * 비용전표 취소 - 분개 삭제
 * expense.ts의 cancel 프로시저에서 핵심 로직을 추출
 */
export async function cancelExpenseJournal(
  conn: any,
  params: {
    tenantId: number;
    voucherId: number;
  }
): Promise<void> {
  const { tenantId, voucherId } = params;
  
  const [jeRows] = await conn.execute(
    `SELECT id FROM expense_journal_entries WHERE voucher_id = ? AND tenant_id = ?`,
    [voucherId, tenantId],
  );
  for (const je of jeRows as any[]) {
    await conn.execute(
      `DELETE FROM expense_journal_lines WHERE journal_entry_id = ? AND tenant_id = ?`,
      [je.id, tenantId],
    );
  }
  await conn.execute(
    `DELETE FROM expense_journal_entries WHERE voucher_id = ? AND tenant_id = ?`,
    [voucherId, tenantId],
  );
}

// ============================================
// 은행 거래 매칭 자동분개 (P6)
// ============================================

/**
 * 은행 거래 매칭 시 자동 분개 생성
 * - 입금(deposit): 차변 보통예금(BANK_DEPOSIT), 대변 매칭된 계정
 * - 출금(withdrawal): 차변 매칭된 계정, 대변 보통예금(BANK_DEPOSIT)
 */
export async function postBankTransactionJournal(params: {
  tenantId: number;
  transactionId: number;
  accountingAccountId: number;
  amount: number;
  transactionType: "deposit" | "withdrawal";
  description: string;
  transactionDate: string | Date;
  bankAccountId?: number;
  partnerId?: number | null;
  postedBy: number;
}): Promise<{ journalEntryId: number }> {
  const conn = await getRawConnection();
  const { tenantId, transactionId, accountingAccountId, amount, transactionType } = params;

  // 중복 체크: 이미 분개가 있으면 스킵
  const [existing] = await conn.execute(
    `SELECT id FROM expense_journal_entries
     WHERE tenant_id = ? AND description LIKE ? LIMIT 1`,
    [tenantId, `[은행매칭] txn_id=${transactionId}%`]
  );
  if ((existing as any[]).length > 0) {
    return { journalEntryId: (existing as any[])[0].id };
  }

  // 은행 계정 조회
  const bankAcc = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.BANK_DEPOSIT, "1020", "보통예금");

  // 매칭된 계정 조회
  const [matchedAccRows] = await conn.execute(
    `SELECT id, code, name FROM accounting_accounts WHERE id = ? AND tenant_id = ? LIMIT 1`,
    [accountingAccountId, tenantId]
  );
  const matchedAcc = (matchedAccRows as any[])[0];
  if (!matchedAcc) {
    throw new Error(`매칭된 계정(id=${accountingAccountId})을 찾을 수 없습니다.`);
  }

  const entryDate = typeof params.transactionDate === "string"
    ? params.transactionDate
    : formatLocalDate(params.transactionDate);

  // 분개 엔트리 생성
  const [jeResult] = await conn.execute(
    `INSERT INTO expense_journal_entries
       (tenant_id, voucher_id, entry_date, description, total_debit, total_credit, posted_by)
     VALUES (?, NULL, ?, ?, ?, ?, ?)`,
    [
      tenantId, entryDate,
      `[은행매칭] txn_id=${transactionId} ${params.description}`,
      amount, amount, params.postedBy,
    ]
  );
  const journalEntryId = Number((jeResult as any).insertId);

  if (transactionType === "deposit") {
    // 입금: 차변 보통예금, 대변 매칭계정 (예: 매출, 외상매출금 회수 등)
    await insertJournalLine(conn, {
      tenantId, journalEntryId,
      accountId: bankAcc.id, accountCode: bankAcc.code, accountName: bankAcc.name,
      debitAmount: amount, creditAmount: 0,
      description: "은행 입금", sortOrder: 0,
      bankAccountId: params.bankAccountId,
    });
    await insertJournalLine(conn, {
      tenantId, journalEntryId,
      accountId: matchedAcc.id, accountCode: matchedAcc.code, accountName: matchedAcc.name,
      debitAmount: 0, creditAmount: amount,
      description: params.description, sortOrder: 1,
      partnerId: params.partnerId,
    });
  } else {
    // 출금: 차변 매칭계정 (예: 비용, 외상매입금 결제 등), 대변 보통예금
    await insertJournalLine(conn, {
      tenantId, journalEntryId,
      accountId: matchedAcc.id, accountCode: matchedAcc.code, accountName: matchedAcc.name,
      debitAmount: amount, creditAmount: 0,
      description: params.description, sortOrder: 0,
      partnerId: params.partnerId,
    });
    await insertJournalLine(conn, {
      tenantId, journalEntryId,
      accountId: bankAcc.id, accountCode: bankAcc.code, accountName: bankAcc.name,
      debitAmount: 0, creditAmount: amount,
      description: "은행 출금", sortOrder: 1,
      bankAccountId: params.bankAccountId,
    });
  }

  return { journalEntryId };
}

/**
 * 은행 거래 매칭 취소 시 분개 삭제
 */
export async function cancelBankTransactionJournal(tenantId: number, transactionId: number): Promise<void> {
  const conn = await getRawConnection();

  const [jeRows] = await conn.execute(
    `SELECT id FROM expense_journal_entries
     WHERE tenant_id = ? AND description LIKE ?`,
    [tenantId, `[은행매칭] txn_id=${transactionId}%`]
  );
  for (const je of jeRows as any[]) {
    await conn.execute(
      `DELETE FROM expense_journal_lines WHERE journal_entry_id = ? AND tenant_id = ?`,
      [je.id, tenantId]
    );
  }
  if ((jeRows as any[]).length > 0) {
    await conn.execute(
      `DELETE FROM expense_journal_entries
       WHERE tenant_id = ? AND description LIKE ?`,
      [tenantId, `[은행매칭] txn_id=${transactionId}%`]
    );
  }
}

// ============================================
// 시스템 계정 시드
// ============================================

/**
 * 시스템 기본 계정 시드 (tenant 초기 설정 시 호출)
 * 이미 system_code가 지정된 계정이 있으면 건너뜀
 */
export async function ensureSystemAccounts(tenantId: number, createdBy: number) {
  const conn = await getRawConnection();

  const systemAccountSeeds: {
    systemCode: string;
    code: string;
    name: string;
    category: string;
  }[] = [
    // 자산
    { systemCode: SYSTEM_ACCOUNTS.CASH, code: "1010", name: "현금", category: "assets" },
    { systemCode: SYSTEM_ACCOUNTS.BANK_DEPOSIT, code: "1020", name: "보통예금", category: "assets" },
    { systemCode: SYSTEM_ACCOUNTS.ACCOUNTS_RECEIVABLE, code: "1030", name: "외상매출금", category: "assets" },
    { systemCode: SYSTEM_ACCOUNTS.VAT_INPUT, code: "1350", name: "부가세대급금", category: "assets" },
    { systemCode: SYSTEM_ACCOUNTS.INVENTORY_RAW, code: "1410", name: "원재료", category: "assets" },
    { systemCode: SYSTEM_ACCOUNTS.INVENTORY_GOODS, code: "1420", name: "상품", category: "assets" },
    // 부채
    { systemCode: SYSTEM_ACCOUNTS.ACCOUNTS_PAYABLE, code: "2010", name: "외상매입금", category: "liabilities" },
    { systemCode: SYSTEM_ACCOUNTS.ACCOUNTS_PAYABLE_CARD, code: "2020", name: "미지급금-카드", category: "liabilities" },
    { systemCode: SYSTEM_ACCOUNTS.VAT_OUTPUT, code: "2350", name: "부가세예수금", category: "liabilities" },
    // 자본
    { systemCode: SYSTEM_ACCOUNTS.CAPITAL, code: "3010", name: "자본금", category: "equity" },
    { systemCode: SYSTEM_ACCOUNTS.RETAINED_EARNINGS, code: "3020", name: "이익잉여금", category: "equity" },
    // 수익
    { systemCode: SYSTEM_ACCOUNTS.SALES_REVENUE, code: "4010", name: "상품매출", category: "revenue" },
    { systemCode: SYSTEM_ACCOUNTS.SERVICE_REVENUE, code: "4020", name: "서비스매출", category: "revenue" },
    // 비용
    { systemCode: SYSTEM_ACCOUNTS.COST_OF_GOODS, code: "5010", name: "매출원가", category: "expenses" },
    // 재고 자산 (제조 중간 단계)
    { systemCode: SYSTEM_ACCOUNTS.WIP, code: "1430", name: "재공품", category: "assets" },
  ];

  for (const seed of systemAccountSeeds) {
    // 이미 해당 system_code를 가진 계정이 있는지 확인
    const [existing] = await conn.execute(
      `SELECT id FROM accounting_accounts WHERE tenant_id = ? AND system_code = ? LIMIT 1`,
      [tenantId, seed.systemCode],
    );
    if ((existing as any[]).length > 0) continue;

    // code 중복 확인 (같은 tenant)
    const [codeExisting] = await conn.execute(
      `SELECT id FROM accounting_accounts WHERE tenant_id = ? AND code = ? LIMIT 1`,
      [tenantId, seed.code],
    );
    if ((codeExisting as any[]).length > 0) {
      // 기존 계정에 system_code만 설정
      await conn.execute(
        `UPDATE accounting_accounts SET system_code = ? WHERE tenant_id = ? AND code = ? AND system_code IS NULL`,
        [seed.systemCode, tenantId, seed.code],
      );
      continue;
    }

    // 새로 생성
    await conn.execute(
      `INSERT INTO accounting_accounts (tenant_id, category, code, name, system_code, is_active, created_by)
       VALUES (?, ?, ?, ?, ?, 'Y', ?)`,
      [tenantId, seed.category, seed.code, seed.name, seed.systemCode, createdBy],
    );
  }
}
