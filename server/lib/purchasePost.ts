import { getDb, withTransaction } from "../db";
import { accountingPurchases } from "../../drizzle/schema_accounting_extended";
import { eq } from "drizzle-orm";
import { resolveSystemAccount, insertJournalLine } from "../db/journalHelper";
import { SYSTEM_ACCOUNTS } from "../../drizzle/schema/accountingAccounts";
import { formatLocalDate } from "../utils/timezone";

/**
 * 매입 POST 로직 (트랜잭션 보장)
 *
 * pending/approved 상태의 매입 전표를 paid(확정)로 전환하고,
 * 재고 원장(h_inventory_transactions)과 회계 원장에 자동 반영
 *
 * 모든 DB 조작이 단일 트랜잭션으로 묶여 있어
 * 중간 실패 시 전체 롤백됩니다.
 */
export async function postPurchase(purchaseId: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 1. 매입 전표 조회 (트랜잭션 밖에서 - 읽기 전용)
  const purchase = await db
    .select()
    .from(accountingPurchases)
    .where(eq(accountingPurchases.id, purchaseId))
    .limit(1)
    .then((rows) => rows[0]);

  if (!purchase) {
    throw new Error(`매입 전표 ID ${purchaseId}를 찾을 수 없습니다.`);
  }

  if (purchase.status === "paid") {
    throw new Error(`이미 확정된 전표입니다. (ID: ${purchaseId})`);
  }

  if (purchase.status === "cancelled") {
    throw new Error(`취소된 전표는 확정할 수 없습니다. (ID: ${purchaseId})`);
  }

  const tenantId = purchase.tenantId;
  if (!tenantId) throw new Error('[P0 보안] tenantId is required for purchasePost');

  const docId = `PURCHASE-${purchaseId}`;
  const lotNumber = `LOT-${Date.now()}-${purchaseId}`;
  const qty = purchase.quantity?.toString() || "0";
  const totalAmount = Number(purchase.totalAmount || 0);
  const taxAmount = Number(purchase.taxAmount || 0);
  const supplyAmount = totalAmount - taxAmount;
  const entryDate = typeof purchase.transactionDate === 'string'
    ? purchase.transactionDate
    : formatLocalDate(purchase.transactionDate as Date);

  // 시스템 계정 조회 (트랜잭션 밖에서 - 읽기 전용)
  const inventoryAcc = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.INVENTORY_RAW, "1410", "원재료");
  const payableAcc = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.ACCOUNTS_PAYABLE, "2010", "외상매입금");
  const vatAcc = taxAmount > 0
    ? await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.VAT_INPUT, "1350", "부가세대급금")
    : null;

  // 2. 트랜잭션으로 묶어서 실행 (LOT + 재고원장 + 회계분개 + 상태변경)
  await withTransaction(async (conn) => {
    // (A) LOT 생성
    const [lotResult] = await conn.execute(
      `INSERT INTO h_inventory_lots
         (tenant_id, lot_number, quantity, current_quantity, available_quantity, unit, unit_price, receipt_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'available')`,
      [tenantId, lotNumber, qty, qty, qty, purchase.unit || "EA", purchase.unitPrice?.toString() || "0", purchase.transactionDate]
    );
    const lotId = (lotResult as any).insertId;

    // (B) 재고 원장 생성
    await conn.execute(
      `INSERT INTO h_inventory_transactions
         (tenant_id, lot_id, transaction_type, quantity, unit, transaction_date,
          reference_type, source_id, unit_cost, amount, created_by)
       VALUES (?, ?, 'receipt', ?, ?, ?, 'PURCHASE', ?, ?, ?, ?)`,
      [tenantId, lotId, qty, purchase.unit || "EA", purchase.transactionDate,
       purchaseId, purchase.unitPrice?.toString() || "0", purchase.totalAmount?.toString() || "0", userId]
    );

    // (C) 회계 분개 헤더
    const [jeResult] = await conn.execute(
      `INSERT INTO expense_journal_entries
         (tenant_id, voucher_id, entry_date, description, total_debit, total_credit, posted_by)
       VALUES (?, NULL, ?, ?, ?, ?, ?)`,
      [tenantId, entryDate, `[매입] ${docId} ${purchase.itemName || ""}`, totalAmount, totalAmount, userId]
    );
    const journalEntryId = Number((jeResult as any).insertId);

    // (C-1) 차변: 원재료
    let sortOrder = 0;
    await insertJournalLine(conn, {
      tenantId, journalEntryId,
      accountId: inventoryAcc.id, accountCode: inventoryAcc.code, accountName: inventoryAcc.name,
      debitAmount: supplyAmount, creditAmount: 0,
      description: `매입: ${purchase.itemName || ""}`, sortOrder: sortOrder++,
    });

    // (C-2) 차변: 부가세대급금
    if (vatAcc && taxAmount > 0) {
      await insertJournalLine(conn, {
        tenantId, journalEntryId,
        accountId: vatAcc.id, accountCode: vatAcc.code, accountName: vatAcc.name,
        debitAmount: taxAmount, creditAmount: 0,
        description: `매입 부가세: ${purchase.itemName || ""}`, sortOrder: sortOrder++,
      });
    }

    // (C-3) 대변: 외상매입금
    await insertJournalLine(conn, {
      tenantId, journalEntryId,
      accountId: payableAcc.id, accountCode: payableAcc.code, accountName: payableAcc.name,
      debitAmount: 0, creditAmount: totalAmount,
      description: `매입: ${purchase.itemName || ""}`, sortOrder: sortOrder++,
      partnerId: (purchase as any).partnerId || null,
    });

    // (D) 매입 전표 상태 업데이트
    await conn.execute(
      `UPDATE accounting_purchases SET status = 'paid', posted_at = NOW(), posted_by = ? WHERE id = ? AND tenant_id = ?`,
      [userId, purchaseId, tenantId]
    );
  });

  console.log(`[POST] 매입 전표 ID ${purchaseId} 확정 완료 (LOT: ${lotNumber})`);
}
