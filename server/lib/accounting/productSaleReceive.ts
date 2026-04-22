/**
 * 제품 매출 수금 처리 (Module 2, 2026-04-22)
 *
 * 배경:
 *   saleMarkReceived 가 원래 UPDATE status='received' 만 수행하던 반쪽 구현.
 *   실제 입금 분개 / AR 원장 / 은행거래 기록이 전부 누락되어
 *   재무제표 왜곡 (2026-04-22 tenant 2 기준 2.3M 장부 불일치 발견).
 *
 * 이 함수가 처리하는 7단계 (withTransaction 원자성):
 *   1. accounting_sales 조회 + 상태 검증 (FOR UPDATE)
 *   2. 은행계좌 결정 (opts.bankAccountId → is_primary → first-active → NULL=CASH)
 *   3. 시스템 계정 조회 (BANK_DEPOSIT / CASH / ACCOUNTS_RECEIVABLE)
 *   4. expense_journal_entries INSERT (voucher_id=NULL, [수금] SALE-xxxx)
 *   5. expense_journal_lines 2줄:
 *      차변: 보통예금 or 현금 (총액)
 *      대변: 외상매출금 (총액)
 *   6. ar_ledger INSERT (ar_entry_type='payment', ref_type='SALE', ref_id=saleId)
 *   7. bank_transactions INSERT (transaction_type='deposit', auto-matched)
 *   8. accounting_sales.status='received' UPDATE
 *
 * 멱등성:
 *   - 이미 received 면 조용히 반환 (재실행 안전)
 *   - FOR UPDATE 로 동시성 방지
 *
 * 사용처:
 *   - 매출 승인 UI 의 "수금" 버튼
 *   - scripts/backfill-sales-journals.ts (과거 received 데이터 복구)
 */

import { withTransaction, getRawConnection } from "../../db";
import { resolveSystemAccount, insertJournalLine } from "../../db/accounting/journalHelper";
import { SYSTEM_ACCOUNTS } from "../../../drizzle/schema/accountingAccounts";

export interface MarkSaleReceivedOptions {
  /** 입금받은 은행계좌 ID. 미지정 시 is_primary → first-active → CASH fallback */
  bankAccountId?: number;
  /** 수금일 (YYYY-MM-DD). 미지정 시 오늘 */
  receivedDate?: string;
  /** 메모 */
  memo?: string;
}

export interface MarkSaleReceivedResult {
  success: boolean;
  alreadyProcessed: boolean;
  journalEntryId: number | null;
  bankTransactionId: number | null;
  arLedgerId: number | null;
  message: string;
}

export async function markSaleReceived(
  saleId: number,
  userId: number,
  tenantId: number,
  opts: MarkSaleReceivedOptions = {},
): Promise<MarkSaleReceivedResult> {
  // 트랜잭션 외부: 사전 조회 (빠른 실패)
  const conn0 = await getRawConnection();
  const [saleRows] = await conn0.execute(
    `SELECT id, status, partner_id, total_amount, transaction_date, item_name
       FROM accounting_sales WHERE id = ? AND tenant_id = ? LIMIT 1`,
    [saleId, tenantId],
  );
  const sale = (saleRows as Array<{
    id: number; status: string; partner_id: number | null;
    total_amount: string; transaction_date: string; item_name: string | null;
  }>)[0];

  if (!sale) throw new Error(`매출 전표 #${saleId} 없음`);
  if (sale.status === "cancelled") {
    throw new Error("취소된 전표는 수금 처리할 수 없습니다.");
  }
  if (sale.status === "received") {
    return {
      success: true, alreadyProcessed: true,
      journalEntryId: null, bankTransactionId: null, arLedgerId: null,
      message: "이미 수금 완료 상태입니다.",
    };
  }
  if (sale.status !== "approved") {
    throw new Error(`승인(approved) 상태만 수금 처리 가능. 현재: ${sale.status}`);
  }

  const totalAmount = Number(sale.total_amount);
  if (!(totalAmount > 0)) {
    throw new Error(`매출 금액이 0 이하입니다 (saleId=${saleId})`);
  }

  const receivedDate = opts.receivedDate
    || new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // 은행계좌 결정
  let bankAccountId: number | null = opts.bankAccountId ?? null;
  if (!bankAccountId) {
    // 기본 계좌 (is_primary=1) → 첫 active 계좌
    const [priRows] = await conn0.execute(
      `SELECT id FROM bank_accounts
         WHERE tenant_id = ? AND is_active = 'Y' AND is_primary = 1
         ORDER BY id ASC LIMIT 1`,
      [tenantId],
    );
    const priRow = (priRows as Array<{ id: number }>)[0];
    if (priRow) {
      bankAccountId = priRow.id;
    } else {
      const [anyRows] = await conn0.execute(
        `SELECT id FROM bank_accounts
           WHERE tenant_id = ? AND is_active = 'Y'
           ORDER BY id ASC LIMIT 1`,
        [tenantId],
      );
      const anyRow = (anyRows as Array<{ id: number }>)[0];
      if (anyRow) bankAccountId = anyRow.id;
      // 없으면 null → CASH 계정 fallback (bank_transactions 생략)
    }
  }

  // 시스템 계정 사전 조회 (트랜잭션 밖)
  const receivableAcc = await resolveSystemAccount(
    tenantId, SYSTEM_ACCOUNTS.ACCOUNTS_RECEIVABLE, "1030", "외상매출금",
  );
  const cashOrBankAcc = bankAccountId
    ? await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.BANK_DEPOSIT, "1020", "보통예금")
    : await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.CASH, "1010", "현금");

  // 트랜잭션 시작
  return await withTransaction(async (conn) => {
    // 1. 비관적 잠금 + 멱등성 재확인
    const [lockRows] = await conn.execute(
      `SELECT status FROM accounting_sales
         WHERE id = ? AND tenant_id = ? FOR UPDATE`,
      [saleId, tenantId],
    );
    const curStatus = (lockRows as Array<{ status: string }>)[0]?.status;
    if (curStatus === "received") {
      return {
        success: true, alreadyProcessed: true,
        journalEntryId: null, bankTransactionId: null, arLedgerId: null,
        message: "이미 수금 완료 상태입니다 (동시 실행).",
      };
    }
    if (curStatus !== "approved") {
      throw new Error(`승인 상태만 수금 가능. 현재: ${curStatus}`);
    }

    // 2. 분개 헤더 INSERT
    const docId = `SALE-${saleId}`;
    const description = `[수금] ${docId} ${sale.item_name ?? ""}`.trim();
    const [jeResult] = await conn.execute(
      `INSERT INTO expense_journal_entries
         (tenant_id, voucher_id, entry_date, description,
          total_debit, total_credit, posted_by, posted_at)
       VALUES (?, NULL, ?, ?, ?, ?, ?, NOW())`,
      [tenantId, receivedDate, description, totalAmount, totalAmount, userId],
    );
    const journalEntryId = Number((jeResult as { insertId: number }).insertId);

    // 3. 분개 라인 (차변 현금/보통예금 / 대변 외상매출금)
    await insertJournalLine(conn, {
      tenantId, journalEntryId,
      accountId: cashOrBankAcc.id,
      accountCode: cashOrBankAcc.code,
      accountName: cashOrBankAcc.name,
      debitAmount: totalAmount, creditAmount: 0,
      description: `수금: ${docId}`,
      sortOrder: 0,
      bankAccountId: bankAccountId ?? null,
    });
    await insertJournalLine(conn, {
      tenantId, journalEntryId,
      accountId: receivableAcc.id,
      accountCode: receivableAcc.code,
      accountName: receivableAcc.name,
      debitAmount: 0, creditAmount: totalAmount,
      description: `외상매출금 회수: ${docId}`,
      sortOrder: 1,
      partnerId: sale.partner_id ?? null,
    });

    // 4. ar_ledger INSERT (payment 타입 — 채권 감소 의미)
    let arLedgerId: number | null = null;
    if (sale.partner_id) {
      const [arResult] = await conn.execute(
        `INSERT INTO ar_ledger
           (tenant_id, customer_partner_id, occurred_at, ar_entry_type,
            amount, ref_type, ref_id, memo, accounting_account_id, created_by)
         VALUES (?, ?, ?, 'payment', ?, 'SALE', ?, ?, ?, ?)`,
        [
          tenantId, sale.partner_id, `${receivedDate} 00:00:00`,
          totalAmount, saleId, opts.memo ?? `수금: ${docId}`,
          receivableAcc.id, userId,
        ],
      );
      arLedgerId = Number((arResult as { insertId: number }).insertId);
    }

    // 5. bank_transactions 는 생성하지 않음 (관심사 분리 원칙, 2026-04-22 수정)
    //
    // 배경:
    //   이전 구현은 수금 처리 시 bank_transactions INSERT 를 같이 했음.
    //   그러나 이는 "가짜 통장거래" 를 생성하는 것으로 회계 시스템 기본
    //   원칙 위반:
    //     - bank_transactions = 실제 은행 CSV/API 에서 수집된 데이터만
    //     - 매출 수금 = AR 원장의 payment 엔트리로만 기록
    //     - 둘의 매칭은 사용자가 통장 업로드 시 별도 매칭 엔진에서 수행
    //
    //   특히 B2C 다건 매출 (하루 1,000건+) 의 경우 통장 입금은 플랫폼별
    //   주/월 정산으로 N:1 매칭되므로 1:1 생성은 불가능.
    //
    //   향후 플랫폼 정산 모듈 (별도 PR) 에서 통장 입금 ↔ AR 다건 매칭 처리.
    const bankTransactionId: number | null = null;

    // 6. 매출 상태 전환
    await conn.execute(
      `UPDATE accounting_sales
          SET status = 'received'
        WHERE id = ? AND tenant_id = ?`,
      [saleId, tenantId],
    );

    console.log(
      `[markSaleReceived] #${saleId} 수금 완료 ` +
      `(금액: ${totalAmount}, JE: ${journalEntryId}, AR: ${arLedgerId ?? "skip"})`,
    );

    return {
      success: true, alreadyProcessed: false,
      journalEntryId, bankTransactionId, arLedgerId,
      message: `매출 #${saleId} 수금 완료 (${totalAmount.toLocaleString()}원)`,
    };
  }, `markSaleReceived:${saleId}`);
}
