import { getDb, getRawConnection } from "../db";
import { accountingPurchases } from "../../drizzle/schema_accounting_extended";
import { hInventoryTransactions, hInventoryLots } from "../../drizzle/schema/part2";
import { eq, and } from "drizzle-orm";
import { resolveSystemAccount, insertJournalLine } from "../db/journalHelper";
import { SYSTEM_ACCOUNTS } from "../../drizzle/schema/accountingAccounts";

/**
 * 매입 POST 로직
 *
 * pending/approved 상태의 매입 전표를 paid(확정)로 전환하고,
 * 재고 원장(h_inventory_transactions)과 회계 원장에 자동 반영
 *
 * @param purchaseId 매입 전표 ID
 * @param userId 처리자 ID
 */
export async function postPurchase(purchaseId: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection not available");

  // 1. 매입 전표 조회
  const purchase = await db
    .select()
    .from(accountingPurchases)
    .where(eq(accountingPurchases.id, purchaseId))
    .limit(1)
    .then((rows) => rows[0]);

  if (!purchase) {
    throw new Error(`매입 전표 ID ${purchaseId}를 찾을 수 없습니다.`);
  }

  // 2. 상태 검증
  if (purchase.status === "paid") {
    throw new Error(`이미 확정된 전표입니다. (ID: ${purchaseId})`);
  }

  if (purchase.status === "cancelled") {
    throw new Error(`취소된 전표는 확정할 수 없습니다. (ID: ${purchaseId})`);
  }

  const tenantId = purchase.tenantId;
  if (!tenantId) throw new Error('[P0 보안] tenantId is required for purchasePost');

  // 3. 멱등성 키 생성
  const docId = `PURCHASE-${purchaseId}`;

  // 4. LOT 생성 (매입은 항상 새 LOT 생성)
  const lotNumber = `LOT-${Date.now()}-${purchaseId}`;
  const qty = purchase.quantity?.toString() || "0";
  const [newLot] = await db.insert(hInventoryLots).values({
    tenantId,
    lotNumber,
    quantity: qty,
    currentQuantity: qty,
    availableQuantity: qty,
    unit: purchase.unit || "EA",
    unitPrice: purchase.unitPrice?.toString() || "0",
    receiptDate: purchase.transactionDate,
    status: "available",
  } as any);

  const lotId = newLot.insertId;

  // 5. 재고 원장 생성 (h_inventory_transactions)
  try {
    await db.insert(hInventoryTransactions).values({
      tenantId,
      lotId,
      transactionType: "receipt",
      quantity: qty,
      unit: purchase.unit || "EA",
      transactionDate: purchase.transactionDate,
      referenceType: "PURCHASE",
      sourceId: purchaseId,
      unitCost: purchase.unitPrice?.toString() || "0",
      amount: purchase.totalAmount?.toString() || "0",
      createdBy: userId,
    } as any);
  } catch (error: any) {
    if (error.code === "ER_DUP_ENTRY") {
      throw new Error(`이미 처리된 매입 전표입니다. (ID: ${purchaseId})`);
    }
    throw error;
  }

  // 6. 회계 원장 생성 - system_code 기반
  // 매입 분개: 차변 원재료(INVENTORY_RAW) + 부가세대급금(VAT_INPUT), 대변 외상매입금(ACCOUNTS_PAYABLE)
  const totalAmount = Number(purchase.totalAmount || 0);
  const taxAmount = Number(purchase.taxAmount || 0);
  const supplyAmount = totalAmount - taxAmount;

  const inventoryAcc = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.INVENTORY_RAW, "1410", "원재료");
  const payableAcc = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.ACCOUNTS_PAYABLE, "2010", "외상매입금");
  const vatAcc = taxAmount > 0
    ? await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.VAT_INPUT, "1350", "부가세대급금")
    : null;

  const conn = await getRawConnection();
  const entryDate = typeof purchase.transactionDate === 'string'
    ? purchase.transactionDate
    : (purchase.transactionDate as Date).toISOString().split('T')[0];

  const [jeResult] = await conn.execute(
    `INSERT INTO expense_journal_entries
       (tenant_id, voucher_id, entry_date, description, total_debit, total_credit, posted_by)
     VALUES (?, NULL, ?, ?, ?, ?, ?)`,
    [tenantId, entryDate, `[매입] ${docId} ${purchase.itemName || ""}`, totalAmount, totalAmount, userId]
  );
  const journalEntryId = Number((jeResult as any).insertId);

  let sortOrder = 0;
  // (A) 차변: 원재료 증가 (공급가)
  await insertJournalLine(conn, {
    tenantId, journalEntryId,
    accountId: inventoryAcc.id, accountCode: inventoryAcc.code, accountName: inventoryAcc.name,
    debitAmount: supplyAmount, creditAmount: 0,
    description: `매입: ${purchase.itemName || ""}`, sortOrder: sortOrder++,
  });

  // (A-2) 차변: 부가세대급금 (세액이 있는 경우)
  if (vatAcc && taxAmount > 0) {
    await insertJournalLine(conn, {
      tenantId, journalEntryId,
      accountId: vatAcc.id, accountCode: vatAcc.code, accountName: vatAcc.name,
      debitAmount: taxAmount, creditAmount: 0,
      description: `매입 부가세: ${purchase.itemName || ""}`, sortOrder: sortOrder++,
    });
  }

  // (B) 대변: 외상매입금 증가 (총액)
  await insertJournalLine(conn, {
    tenantId, journalEntryId,
    accountId: payableAcc.id, accountCode: payableAcc.code, accountName: payableAcc.name,
    debitAmount: 0, creditAmount: totalAmount,
    description: `매입: ${purchase.itemName || ""}`, sortOrder: sortOrder++,
    partnerId: (purchase as any).partnerId || null,
  });

  // 7. 매입 전표 상태 업데이트
  await db
    .update(accountingPurchases)
    .set({
      status: "paid",
      postedAt: new Date(),
      postedBy: userId
    })
    .where(eq(accountingPurchases.id, purchaseId));

  console.log(`[POST] 매입 전표 ID ${purchaseId} 확정 완료 (LOT: ${lotNumber})`);
}
