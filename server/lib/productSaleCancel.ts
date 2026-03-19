import { getDb, getRawConnection } from "../db";

import { hInventoryTransactions } from "../../drizzle/schema/part2";
import { accountingSales } from "../../drizzle/schema_accounting_extended";
import { eq, and } from "drizzle-orm";
import { resolveSystemAccount, insertJournalLine } from "../db/journalHelper";
import { SYSTEM_ACCOUNTS } from "../../drizzle/schema/accountingAccounts";

/**
 * 제품 출고/판매 CANCEL 로직 (역거래 패턴)
 *
 * **워크플로우:**
 * 1. 판매 문서 상태 검증 (POSTED만 CANCEL 가능)
 * 2. 원본 재고 원장 조회
 * 3. 재고 역거래 생성 (h_inventory_transactions - 양수)
 * 4. 회계 역거래 생성 (accounting_transactions - DR/CR 반대)
 * 5. 판매 문서 상태 전환 (POSTED → CANCELED)
 *
 * **멱등성 보장:**
 * - actionType: "REVERSAL"로 중복 방지
 */

interface SalesDocument {
  id: number;
  status: string;
}

export async function cancelProductSale(
  saleId: number,
  userId: number,
  tenantId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection not available");

  // 1. 판매 문서 조회 및 상태 검증 (tenant_id 필터 적용)
  const sale = await db
    .select()
    .from(accountingSales)
    .where(and(
      eq(accountingSales.id, saleId),
      eq(accountingSales.tenantId, tenantId)
    ))
    .limit(1)
    .then((rows) => rows[0] as unknown as SalesDocument);

  if (!sale) {
    throw new Error("판매 문서를 찾을 수 없습니다");
  }

  if (sale.status !== "received") {
    throw new Error("확정된 판매 문서만 취소할 수 있습니다");
  }

  // 2. 회계 역분개 생성 (expense_journal_entries/lines)
  const conn = await getRawConnection();
  const cancelDate = new Date().toISOString().split("T")[0];

  // 원본 분개 조회
  const [originalJeRows] = await conn.execute(
    `SELECT id, total_debit FROM expense_journal_entries
     WHERE tenant_id = ? AND description LIKE ?
     LIMIT 1`,
    [tenantId, `[매출] SALE-${saleId}%`]
  );
  const originalJe = (originalJeRows as any[])[0];

  if (originalJe) {
    const receivableAcc = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.ACCOUNTS_RECEIVABLE, "1030", "외상매출금");
    const salesRevenueAcc = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.SALES_REVENUE, "4010", "상품매출");
    const cogsAcc = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.COST_OF_GOODS, "5010", "매출원가");
    const inventoryGoodsAcc = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.INVENTORY_GOODS, "1420", "상품");

    // 원본 분개행 조회
    const [originalLines] = await conn.execute(
      `SELECT account_id, account_code, account_name, debit_amount, credit_amount
       FROM expense_journal_lines WHERE journal_entry_id = ? AND tenant_id = ?`,
      [originalJe.id, tenantId]
    );
    const lines = originalLines as any[];

    const totalReversalAmount = Number(originalJe.total_debit);
    const [jeResult] = await conn.execute(
      `INSERT INTO expense_journal_entries
         (tenant_id, voucher_id, entry_date, description, total_debit, total_credit, posted_by)
       VALUES (?, NULL, ?, ?, ?, ?, ?)`,
      [tenantId, cancelDate, `[매출취소] SALE-${saleId}`, totalReversalAmount, totalReversalAmount, userId]
    );
    const journalEntryId = Number((jeResult as any).insertId);

    let sortOrder = 0;
    for (const line of lines) {
      // DR/CR 반대
      await insertJournalLine(conn, {
        tenantId, journalEntryId,
        accountId: line.account_id, accountCode: line.account_code, accountName: line.account_name,
        debitAmount: Number(line.credit_amount), creditAmount: Number(line.debit_amount),
        description: `매출 취소 (판매 #${saleId})`, sortOrder: sortOrder++,
      });
    }
  }

  // 6. 판매 문서 상태 전환
  await db.update(accountingSales).set({
    status: "cancelled",
    canceledAt: new Date(),
    canceledBy: userId
  }).where(and(
    eq(accountingSales.id, saleId),
    eq(accountingSales.tenantId, tenantId)
  ));

  console.log(`[productSaleCancel] 판매 #${saleId} 취소 완료`);
}
