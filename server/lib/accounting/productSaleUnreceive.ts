/**
 * 매출 수금 취소 (received → approved) — markSaleReceived 대칭 역수행 (2026-10-16, Codex DB 감사: 수금 역처리 없음)
 *
 * markSaleReceived 가 남긴 것:
 *   - [수금] SALE-<id> 전표 (차변 현금/보통예금 / 대변 외상매출금)
 *   - ar_ledger payment (ref_type='SALE', ref_id=매출ID) — 거래처가 있을 때
 *   - accounting_sales.status = 'received'
 * 되돌리기:
 *   - 원 [수금] 전표를 계정·금액 그대로 뒤집은 [수금취소] 전표
 *   - ar_ledger 에 같은 금액의 adjust(+) — 거래처 채권 잔액이 수금 전으로 (payment 행은 감사 추적으로 남김)
 *   - status = 'approved' → 이후 매출 취소(cancelProductSale) 가능
 * 원 [수금] 전표가 없으면(은행 매칭 등 다른 경로로 수금됨) 자동으로 되돌리지 않는다 — 그 경로에서 해제해야 한다.
 */
import { withTransaction } from "../../db/connection";
import { insertJournalLine } from "../../db/accounting/journalHelper";
import { findPostedEntryLines } from "./amountContract";
import { todayKST } from "../../utils/timezone";

export async function unreceiveSale(
  saleId: number,
  userId: number,
  tenantId: number,
): Promise<{ alreadyProcessed: boolean; journalEntryId?: number }> {
  return await withTransaction(async (conn: any) => {
    const [rows] = await conn.execute(
      `SELECT id, status, item_name FROM accounting_sales WHERE id = ? AND tenant_id = ? FOR UPDATE`,
      [saleId, tenantId],
    );
    const sale = (rows as any[])[0];
    if (!sale) throw new Error(`매출 ID ${saleId}를 찾을 수 없습니다.`);
    if (sale.status === "approved") return { alreadyProcessed: true };
    if (sale.status !== "received") throw new Error(`수금 완료 상태만 수금 취소할 수 있습니다. (현재: ${sale.status})`);

    const docId = `SALE-${saleId}`;
    const posted = await findPostedEntryLines(conn, tenantId, `[수금] ${docId}`);
    if (!posted || posted.lines.length === 0) {
      throw new Error("수금 전표를 찾을 수 없어 자동으로 되돌릴 수 없습니다. 은행 매칭 등 다른 경로로 수금됐다면 그 화면에서 해제하세요.");
    }
    // 이미 [수금취소] 가 [수금] 만큼 있으면 (이전 시도 후 상태만 남은 경우) 전표는 더 만들지 않는다
    const [cnt] = await conn.execute(
      `SELECT
         (SELECT COUNT(*) FROM expense_journal_entries WHERE tenant_id = ? AND (description = ? OR description LIKE ?)) AS rec,
         (SELECT COUNT(*) FROM expense_journal_entries WHERE tenant_id = ? AND (description = ? OR description LIKE ?)) AS rev`,
      [tenantId, `[수금] ${docId}`, `[수금] ${docId} %`, tenantId, `[수금취소] ${docId}`, `[수금취소] ${docId} %`],
    );
    const cancelDate = todayKST();
    let journalEntryId: number | undefined;
    if (Number((cnt as any[])[0].rec) > Number((cnt as any[])[0].rev)) {
      const lines = posted.lines.map((l) => ({
        accountId: l.account_id, accountCode: l.account_code, accountName: l.account_name,
        debit: Number(l.credit_amount || 0), credit: Number(l.debit_amount || 0), partnerId: l.partner_id ?? null,
      }));
      const total = Math.round(lines.reduce((a, l) => a + l.debit, 0) * 100) / 100;
      const [je] = await conn.execute(
        `INSERT INTO expense_journal_entries
           (tenant_id, voucher_id, entry_date, description, total_debit, total_credit, posted_by, posted_at)
         VALUES (?, NULL, ?, ?, ?, ?, ?, NOW())`,
        [tenantId, cancelDate, `[수금취소] ${docId} ${sale.item_name ?? ""}`.trim(), total, total, userId],
      );
      journalEntryId = Number((je as any).insertId);
      let sortOrder = 0;
      for (const l of lines) {
        await insertJournalLine(conn, {
          tenantId, journalEntryId,
          accountId: l.accountId, accountCode: l.accountCode, accountName: l.accountName,
          debitAmount: l.debit, creditAmount: l.credit,
          description: `수금 취소: ${docId}`,
          sortOrder: sortOrder++,
          partnerId: l.partnerId,
        });
      }
    }

    // AR: 수금(payment) 합계 − 이미 되돌린 adjust 만큼 adjust(+) 로 상쇄
    const [ar] = await conn.execute(
      `SELECT customer_partner_id,
              SUM(CASE WHEN ar_entry_type = 'payment' AND ref_type = 'SALE' THEN amount ELSE 0 END)
            - SUM(CASE WHEN ar_entry_type = 'adjust' AND ref_type = 'SALE_UNRECEIVE' THEN amount ELSE 0 END) AS open_amt,
              MAX(accounting_account_id) AS acc
         FROM ar_ledger
        WHERE tenant_id = ? AND ref_id = ? AND ref_type IN ('SALE', 'SALE_UNRECEIVE')
        GROUP BY customer_partner_id`,
      [tenantId, saleId],
    );
    for (const r of ar as any[]) {
      const amt = Number(r.open_amt || 0);
      if (amt <= 0.005) continue;
      await conn.execute(
        `INSERT INTO ar_ledger
           (tenant_id, customer_partner_id, occurred_at, ar_entry_type, amount, ref_type, ref_id, memo, accounting_account_id, created_by)
         VALUES (?, ?, ?, 'adjust', ?, 'SALE_UNRECEIVE', ?, ?, ?, ?)`,
        [tenantId, r.customer_partner_id, `${cancelDate} 00:00:00`, amt, saleId, `수금 취소: ${docId}`, r.acc, userId],
      );
    }

    await conn.execute(
      `UPDATE accounting_sales SET status = 'approved' WHERE id = ? AND tenant_id = ? AND status = 'received'`,
      [saleId, tenantId],
    );
    return { alreadyProcessed: false, journalEntryId };
  }, `unreceiveSale:${saleId}`);
}
