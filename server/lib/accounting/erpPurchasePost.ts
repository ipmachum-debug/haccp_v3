/**
 * ERP 전용 매입 확정 (POST)
 * HACCP 테이블 의존 없이 순수 회계 처리만 수행:
 *   - accounting_purchases 상태 변경 (pending → approved)
 *   - expense_journal_entries + lines 분개 생성
 *
 * HACCP 모듈이 활성화된 테넌트는 purchasePost.ts 를 사용해야 합니다.
 */
import { getDb, withTransaction } from "../../db";
import { resolveSystemAccount, insertJournalLine, SYSTEM_ACCOUNTS } from "../../core-erp/accounting/journal";

export async function erpPostPurchase(purchaseId: number, userId: number) {
  return withTransaction(async (conn) => {
    // 매입 데이터 조회 + 잠금
    const [rows] = await conn.execute(
      `SELECT id, tenant_id, item_name, quantity, unit_price, total_amount, tax_amount, status, partner_id, transaction_date
       FROM accounting_purchases
       WHERE id = ? FOR UPDATE`,
      [purchaseId]
    );

    const purchase = (rows as any[])?.[0];
    if (!purchase) throw new Error(`매입 ID ${purchaseId}를 찾을 수 없습니다.`);
    if (purchase.status === "approved") return { success: true, alreadyPosted: true };

    const tenantId = purchase.tenant_id;
    const totalAmount = Number(purchase.total_amount) || 0;
    const taxAmount = Number(purchase.tax_amount) || 0;
    const supplyAmount = totalAmount - taxAmount;
    const entryDate = purchase.transaction_date || new Date().toISOString().slice(0, 10);

    // 분개 헤더 생성
    const [jeResult] = await conn.execute(
      `INSERT INTO expense_journal_entries
         (tenant_id, voucher_id, entry_date, description, total_debit, total_credit, posted_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, purchaseId, entryDate, `[매입] ${purchase.item_name || ""}`, totalAmount, totalAmount, userId]
    );
    const journalEntryId = Number((jeResult as any).insertId);

    // 계정 조회
    const inventoryAcc = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.INVENTORY_RAW, "1410", "원재료");
    const payableAcc = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.ACCOUNTS_PAYABLE, "2010", "외상매입금");
    const vatAcc = taxAmount > 0
      ? await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.VAT_INPUT, "1350", "부가세대급금")
      : null;

    // 차변: 원재료
    let sortOrder = 0;
    await insertJournalLine(conn, {
      tenantId, journalEntryId,
      accountId: inventoryAcc.id, accountCode: inventoryAcc.code, accountName: inventoryAcc.name,
      debitAmount: supplyAmount > 0 ? supplyAmount : totalAmount, creditAmount: 0,
      description: `매입: ${purchase.item_name || ""}`, sortOrder: sortOrder++,
    });

    // 차변: 부가세대급금
    if (vatAcc && taxAmount > 0) {
      await insertJournalLine(conn, {
        tenantId, journalEntryId,
        accountId: vatAcc.id, accountCode: vatAcc.code, accountName: vatAcc.name,
        debitAmount: taxAmount, creditAmount: 0,
        description: `매입 부가세: ${purchase.item_name || ""}`, sortOrder: sortOrder++,
      });
    }

    // 대변: 외상매입금
    await insertJournalLine(conn, {
      tenantId, journalEntryId,
      accountId: payableAcc.id, accountCode: payableAcc.code, accountName: payableAcc.name,
      debitAmount: 0, creditAmount: totalAmount,
      description: `외상매입금: ${purchase.item_name || ""}`, sortOrder: sortOrder++,
    });

    // 상태 변경
    await conn.execute(
      `UPDATE accounting_purchases SET status = 'approved' WHERE id = ?`,
      [purchaseId]
    );

    return { success: true, journalEntryId };
  });
}
