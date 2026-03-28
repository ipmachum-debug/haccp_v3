import { getDb, getRawConnection } from "../db";

import { accountingSales } from "../../drizzle/schema_accounting_extended";
import { eq } from "drizzle-orm";
import { resolveSystemAccount, insertJournalLine } from "../db/journalHelper";
import { SYSTEM_ACCOUNTS } from "../../drizzle/schema/accountingAccounts";
import { formatLocalDate } from "../utils/timezone";

/**
 * 제품 출고/판매 POST 로직
 *
 * **워크플로우:**
 * 1. 판매 문서 상태 검증 (approved만 POST 가능)
 * 2. 회계 원장 생성 (expense_journal_entries/lines)
 *    (A) 매출 인식:
 *      - 차변: 외상매출금 (ACCOUNTS_RECEIVABLE)
 *      - 대변: 매출 (SALES_REVENUE)
 *    (B) 부가세 (세액 있는 경우):
 *      - 대변: 부가세예수금 (VAT_OUTPUT)
 * 3. 판매 문서 상태 전환 (approved → received)
 *
 * NOTE: 재고 차감(FEFO)은 배치 완료 시 별도 처리됨.
 *       accountingSales에는 inventoryId/materialId가 없으므로
 *       매출 POST에서는 회계 분개만 처리.
 */

export async function postProductSale(
  saleId: number,
  userId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 1. 판매 문서 조회 및 상태 검증
  const sale = await db
    .select()
    .from(accountingSales)
    .where(eq(accountingSales.id, saleId))
    .limit(1)
    .then((rows) => rows[0]);

  if (!sale) {
    throw new Error("판매 문서를 찾을 수 없습니다");
  }

  if (sale.status === "received") {
    throw new Error("이미 확정된 판매 문서입니다");
  }

  if (sale.status === "cancelled") {
    throw new Error("취소된 판매 문서는 확정할 수 없습니다");
  }

  const tenantId = sale.tenantId;
  if (!tenantId) throw new Error('[P0 보안] tenantId is required for productSalePost');

  const totalAmount = Number(sale.totalAmount || 0);
  const taxAmount = Number(sale.taxAmount || 0);
  const supplyAmount = totalAmount - taxAmount;

  // 2. 회계 분개 생성 - system_code 기반
  const receivableAcc = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.ACCOUNTS_RECEIVABLE, "1030", "외상매출금");
  const salesRevenueAcc = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.SALES_REVENUE, "4010", "상품매출");
  const vatAcc = taxAmount > 0
    ? await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.VAT_OUTPUT, "2350", "부가세예수금")
    : null;

  const conn = await getRawConnection();
  const entryDate = typeof sale.transactionDate === 'string'
    ? sale.transactionDate
    : formatLocalDate(sale.transactionDate as Date);

  const [jeResult] = await conn.execute(
    `INSERT INTO expense_journal_entries
       (tenant_id, voucher_id, entry_date, description, total_debit, total_credit, posted_by)
     VALUES (?, NULL, ?, ?, ?, ?, ?)`,
    [tenantId, entryDate, `[매출] SALE-${saleId} ${sale.itemName || ""}`, totalAmount, totalAmount, userId]
  );
  const journalEntryId = Number((jeResult as any).insertId);

  let sortOrder = 0;

  // (A) 차변: 외상매출금 (총액)
  await insertJournalLine(conn, {
    tenantId, journalEntryId,
    accountId: receivableAcc.id, accountCode: receivableAcc.code, accountName: receivableAcc.name,
    debitAmount: totalAmount, creditAmount: 0,
    description: `매출: ${sale.itemName || ""} (판매 #${saleId})`, sortOrder: sortOrder++,
    partnerId: (sale as any).partnerId || null,
  });

  // (B) 대변: 매출 (공급가)
  await insertJournalLine(conn, {
    tenantId, journalEntryId,
    accountId: salesRevenueAcc.id, accountCode: salesRevenueAcc.code, accountName: salesRevenueAcc.name,
    debitAmount: 0, creditAmount: supplyAmount,
    description: `매출: ${sale.itemName || ""} (판매 #${saleId})`, sortOrder: sortOrder++,
  });

  // (B-2) 대변: 부가세예수금 (세액이 있는 경우)
  if (vatAcc && taxAmount > 0) {
    await insertJournalLine(conn, {
      tenantId, journalEntryId,
      accountId: vatAcc.id, accountCode: vatAcc.code, accountName: vatAcc.name,
      debitAmount: 0, creditAmount: taxAmount,
      description: `매출 부가세: ${sale.itemName || ""} (판매 #${saleId})`, sortOrder: sortOrder++,
    });
  }

  // 3. 판매 문서 상태 전환 (→ received/확정)
  await db.update(accountingSales).set({
    status: "received",
    postedAt: new Date(),
    postedBy: userId
  }).where(eq(accountingSales.id, saleId));

  console.log(`[productSalePost] 판매 #${saleId} 확정 완료 (매출: ${totalAmount})`);
}
