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
import { documentAmounts } from "./amountContract";
import { assertNoSaleFootprint } from "./saleFootprint";

export async function erpPostSale(saleId: number, userId: number, expectedTenantId?: number) {
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
    // ★ 2026-10-16: 호출자 회사와 다르면 거부 (postDispatcher 와 이중 방어)
    if (expectedTenantId != null && Number(expectedTenantId) !== Number(sale.tenant_id)) throw new Error(`매출 ID ${saleId}를 찾을 수 없습니다.`);
    // 확정·수금된 매출은 다시 확정하지 않는다 (2026-10-15). 확정은 pending 에서만.
    if (sale.status === "approved" || sale.status === "received") return { success: true, alreadyPosted: true };
    if (sale.status !== "pending") throw new Error(`확정할 수 없는 상태입니다: ${sale.status} (ID: ${saleId})`);

    const tenantId = sale.tenant_id;
    // 상태만 되돌린 매출의 이중 분개 방지 (2026-10-16, saleFootprint)
    await assertNoSaleFootprint(conn, tenantId, saleId);
    // 금액 계약 (amountContract): total_amount = 공급가, 외상매출금 = 공급가 + 세액
    const { supply: supplyAmount, tax: taxAmount, gross: grossAmount } = documentAmounts({ totalAmount: sale.total_amount, taxAmount: sale.tax_amount });

    // B2C(회계 제외) 매출은 분개 생략, 상태만 변경
    if (sale.accounting_excluded) {
      await conn.execute(
        `UPDATE accounting_sales SET status = 'approved' WHERE id = ? AND tenant_id = ?`,
        [saleId, tenantId]
      );
      return { success: true, accountingExcluded: true };
    }

    const entryDate = sale.transaction_date || new Date().toISOString().slice(0, 10);

    // 분개 헤더 생성
    const [jeResult] = await conn.execute(
      `INSERT INTO expense_journal_entries
         (tenant_id, voucher_id, entry_date, description, total_debit, total_credit, posted_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, saleId, entryDate, `[매출] SALE-${saleId} ${sale.item_name || ""}`, grossAmount, grossAmount, userId]
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
      debitAmount: grossAmount, creditAmount: 0,
      description: `외상매출금: ${sale.item_name || ""}`, sortOrder: sortOrder++,
    });

    // 대변: 매출
    await insertJournalLine(conn, {
      tenantId, journalEntryId,
      accountId: revenueAcc.id, accountCode: revenueAcc.code, accountName: revenueAcc.name,
      debitAmount: 0, creditAmount: supplyAmount,
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
      `UPDATE accounting_sales SET status = 'approved' WHERE id = ? AND tenant_id = ?`,
      [saleId, tenantId]
    );

    return { success: true, journalEntryId };
  });
}
