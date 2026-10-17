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
import { documentAmounts } from "./amountContract";

export async function erpPostPurchase(purchaseId: number, userId: number, expectedTenantId?: number) {
  return withTransaction(async (conn) => {
    // 매입 데이터 조회 + 잠금
    const [rows] = await conn.execute(
      `SELECT id, tenant_id, item_name, quantity, unit_price, total_amount, tax_amount, status, partner_id, transaction_date, inbound_line_id
       FROM accounting_purchases
       WHERE id = ? FOR UPDATE`,
      [purchaseId]
    );

    const purchase = (rows as any[])?.[0];
    if (!purchase) throw new Error(`매입 ID ${purchaseId}를 찾을 수 없습니다.`);
    // ★ 2026-10-16: 호출자 회사와 다르면 거부 (postDispatcher 와 이중 방어)
    if (expectedTenantId != null && Number(expectedTenantId) !== Number(purchase.tenant_id)) throw new Error(`매입 ID ${purchaseId}를 찾을 수 없습니다.`);
    // 확정·지급된 매입은 다시 확정하지 않는다 (2026-10-15). 확정은 pending 에서만.
    if (purchase.status === "approved" || purchase.status === "paid") return { success: true, alreadyPosted: true };
    if (purchase.status !== "pending") throw new Error(`확정할 수 없는 상태입니다: ${purchase.status} (ID: ${purchaseId})`);

    const tenantId = purchase.tenant_id;
    // 금액 계약 (amountContract, 2026-10-15): total_amount = 공급가, 외상매입금 = 공급가 + 세액
    const { supply: supplyAmount, tax: taxAmount, gross: grossAmount } = documentAmounts({ totalAmount: purchase.total_amount, taxAmount: purchase.tax_amount });
    const entryDate = purchase.transaction_date || new Date().toISOString().slice(0, 10);
    // 입고 줄에 연결된 전표 — 살아 있는 확정 입고 줄·금액 기준 검사 (Codex #561·562 검증 R2·R3).
    //   LOT 이 있는 입고(재고 사용으로 받은 입고) 는 재고 경로 — 디스패처가 문서 기준으로 보낸다 (R6)
    if (purchase.inbound_line_id != null) {
      const { assertInboundVoucherPostable } = await import("../inventory/inbound/inboundVoucherGuard");
      const line = await assertInboundVoucherPostable(conn, { tenantId: Number(tenantId), purchaseId, inboundLineId: Number(purchase.inbound_line_id), supplyAmount });
      if (line.lotId) throw new Error(`연결된 입고 줄 #${purchase.inbound_line_id} 은 재고 입고입니다 — 재고 경로로 확정해야 합니다.`);
    }

    // 분개 헤더 생성
    const [jeResult] = await conn.execute(
      `INSERT INTO expense_journal_entries
         (tenant_id, voucher_id, entry_date, description, total_debit, total_credit, posted_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, purchaseId, entryDate, `[매입] PURCHASE-${purchaseId} ${purchase.item_name || ""}`, grossAmount, grossAmount, userId]
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
      debitAmount: supplyAmount, creditAmount: 0,
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
      debitAmount: 0, creditAmount: grossAmount,
      description: `외상매입금: ${purchase.item_name || ""}`, sortOrder: sortOrder++,
    });

    // 상태 변경
    await conn.execute(
      `UPDATE accounting_purchases SET status = 'approved' WHERE id = ? AND tenant_id = ?`,
      [purchaseId, tenantId]
    );

    return { success: true, journalEntryId };
  });
}
