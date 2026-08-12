/**
 * ERP 전용 매출 확정 (POST)
 * HACCP 재고(LOT/FEFO) 의존 없이 순수 회계 처리만 수행:
 *   - accounting_sales 상태 변경 (pending → approved)
 *   - 매출 인식 분개 (외상매출금 / 매출 / 부가세예수금)
 *
 * HACCP 모듈이 활성화된 테넌트는 productSalePost.ts 를 사용해야 합니다.
 */
import { withTransaction } from "../../db";
import { resolveSystemAccount, insertJournalLine, SYSTEM_ACCOUNTS } from "../../core-erp/accounting/journal";

export async function erpPostSale(saleId: number, userId: number) {
  return withTransaction(async (conn) => {
    // 매출 데이터 조회 + 잠금
    const [rows] = await conn.execute(
      `SELECT id, tenant_id, item_name, quantity, unit_price, total_amount, tax_amount, status, partner_id, transaction_date, accounting_excluded
       FROM accounting_sales
       WHERE id = ? FOR UPDATE`,
      [saleId]
    );

    const sale = (rows as any[])?.[0];
    if (!sale) throw new Error(`매출 ID ${saleId}를 찾을 수 없습니다.`);
    if (sale.status === "approved") return { success: true, alreadyPosted: true };

    const tenantId = sale.tenant_id;
    const totalAmount = Number(sale.total_amount) || 0;
    const taxAmount = Number(sale.tax_amount) || 0;
    const supplyAmount = totalAmount - taxAmount;

    // B2C(회계 제외) 매출은 분개 생략, 상태만 변경
    if (sale.accounting_excluded) {
      await conn.execute(
        `UPDATE accounting_sales SET status = 'approved' WHERE id = ?`,
        [saleId]
      );
      return { success: true, accountingExcluded: true };
    }

    const entryDate = sale.transaction_date || new Date().toISOString().slice(0, 10);

    // 분개 헤더 생성
    const [jeResult] = await conn.execute(
      `INSERT INTO expense_journal_entries
         (tenant_id, voucher_id, entry_date, description, total_debit, total_credit, posted_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, saleId, entryDate, `[매출] ${sale.item_name || ""}`, totalAmount, totalAmount, userId]
    );
    const journalEntryId = Number((jeResult as any).insertId);

    // 계정 조회
    const arAcc = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.ACCOUNTS_RECEIVABLE, "1030", "외상매출금");
    const revenueAcc = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.SALES_REVENUE, "4010", "상품매출");
    const vatAcc = taxAmount > 0
      ? await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.VAT_OUTPUT, "2350", "부가세예수금")
      : null;

    // 차변: 외상매출금
    let sortOrder = 0;
    await insertJournalLine(conn, {
      tenantId, journalEntryId,
      accountId: arAcc.id, accountCode: arAcc.code, accountName: arAcc.name,
      debitAmount: totalAmount, creditAmount: 0,
      description: `외상매출금: ${sale.item_name || ""}`, sortOrder: sortOrder++,
    });

    // 대변: 매출
    await insertJournalLine(conn, {
      tenantId, journalEntryId,
      accountId: revenueAcc.id, accountCode: revenueAcc.code, accountName: revenueAcc.name,
      debitAmount: 0, creditAmount: supplyAmount > 0 ? supplyAmount : totalAmount,
      description: `매출: ${sale.item_name || ""}`, sortOrder: sortOrder++,
    });

    // 대변: 부가세예수금
    if (vatAcc && taxAmount > 0) {
      await insertJournalLine(conn, {
        tenantId, journalEntryId,
        accountId: vatAcc.id, accountCode: vatAcc.code, accountName: vatAcc.name,
        debitAmount: 0, creditAmount: taxAmount,
        description: `매출 부가세: ${sale.item_name || ""}`, sortOrder: sortOrder++,
      });
    }

    // 상태 변경
    await conn.execute(
      `UPDATE accounting_sales SET status = 'approved' WHERE id = ?`,
      [saleId]
    );

    return { success: true, journalEntryId };
  });
}
