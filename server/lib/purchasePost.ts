import { getDb, withTransaction } from "../db";
import { accountingPurchases } from "../../drizzle/schema_accounting_extended";
import { eq } from "drizzle-orm";
import { resolveSystemAccount, insertJournalLine } from "../db/journalHelper";
import { SYSTEM_ACCOUNTS } from "../../drizzle/schema/accountingAccounts";
import { formatLocalDate } from "../utils/timezone";

/**
 * 매입 POST 로직 (트랜잭션 + 멱등성 보장)
 *
 * pending/approved 상태의 매입 전표를 paid(확정)로 전환하고,
 * 재고 원장(h_inventory_transactions)과 회계 원장에 자동 반영
 *
 * **멱등성:**
 * - 트랜잭션 내부에서 SELECT ... FOR UPDATE로 상태를 잠금
 * - 이미 paid 상태면 조용히 반환 (중복 호출 안전)
 *
 * **트랜잭션:**
 * - LOT + 재고원장 + 회계분개 + 상태변경이 원자적으로 실행
 */
export async function postPurchase(purchaseId: number, userId: number): Promise<{ alreadyProcessed: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 1. 사전 조회 (읽기 전용 - 빠른 실패)
  const purchase = await db
    .select()
    .from(accountingPurchases)
    .where(eq(accountingPurchases.id, purchaseId))
    .limit(1)
    .then((rows) => rows[0]);

  if (!purchase) {
    throw new Error(`매입 전표 ID ${purchaseId}를 찾을 수 없습니다.`);
  }
  if (purchase.status === "cancelled") {
    throw new Error(`취소된 전표는 확정할 수 없습니다. (ID: ${purchaseId})`);
  }

  const tenantId = purchase.tenantId;
  if (!tenantId) throw new Error('[보안] tenantId is required for purchasePost');

  // 이미 처리됨 → 멱등 반환
  if (purchase.status === "paid") {
    return { alreadyProcessed: true };
  }

  const docId = `PURCHASE-${purchaseId}`;
  const lotNumber = `LOT-${Date.now()}-${purchaseId}`;
  const qty = purchase.quantity?.toString() || "0";
  const totalAmount = Number(purchase.totalAmount || 0);
  const taxAmount = Number(purchase.taxAmount || 0);
  const supplyAmount = totalAmount - taxAmount;
  const entryDate = typeof purchase.transactionDate === 'string'
    ? purchase.transactionDate
    : formatLocalDate(purchase.transactionDate as Date);

  // 시스템 계정 조회 (트랜잭션 밖 - 읽기 전용)
  const inventoryAcc = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.INVENTORY_RAW, "1410", "원재료");
  const payableAcc = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.ACCOUNTS_PAYABLE, "2010", "외상매입금");
  const vatAcc = taxAmount > 0
    ? await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.VAT_INPUT, "1350", "부가세대급금")
    : null;

  // 2. 트랜잭션 + FOR UPDATE 잠금
  return await withTransaction(async (conn) => {
    // (0) 비관적 잠금: 트랜잭션 내 재검증
    const [lockRows] = await conn.execute(
      `SELECT status FROM accounting_purchases WHERE id = ? AND tenant_id = ? FOR UPDATE`,
      [purchaseId, tenantId]
    );
    const currentStatus = (lockRows as any[])[0]?.status;
    if (currentStatus === "paid") {
      // 다른 요청이 먼저 처리 → 멱등 반환
      return { alreadyProcessed: true };
    }
    if (currentStatus === "cancelled") {
      throw new Error(`취소된 전표는 확정할 수 없습니다. (ID: ${purchaseId})`);
    }

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

    let sortOrder = 0;
    await insertJournalLine(conn, {
      tenantId, journalEntryId,
      accountId: inventoryAcc.id, accountCode: inventoryAcc.code, accountName: inventoryAcc.name,
      debitAmount: supplyAmount, creditAmount: 0,
      description: `매입: ${purchase.itemName || ""}`, sortOrder: sortOrder++,
    });

    if (vatAcc && taxAmount > 0) {
      await insertJournalLine(conn, {
        tenantId, journalEntryId,
        accountId: vatAcc.id, accountCode: vatAcc.code, accountName: vatAcc.name,
        debitAmount: taxAmount, creditAmount: 0,
        description: `매입 부가세: ${purchase.itemName || ""}`, sortOrder: sortOrder++,
      });
    }

    await insertJournalLine(conn, {
      tenantId, journalEntryId,
      accountId: payableAcc.id, accountCode: payableAcc.code, accountName: payableAcc.name,
      debitAmount: 0, creditAmount: totalAmount,
      description: `매입: ${purchase.itemName || ""}`, sortOrder: sortOrder++,
      partnerId: (purchase as any).partnerId || null,
    });

    // (D) 상태 전환
    await conn.execute(
      `UPDATE accounting_purchases SET status = 'paid', posted_at = NOW(), posted_by = ? WHERE id = ? AND tenant_id = ?`,
      [userId, purchaseId, tenantId]
    );

    console.log(`[POST] 매입 전표 ID ${purchaseId} 확정 완료 (LOT: ${lotNumber})`);
    return { alreadyProcessed: false };
  });
}
