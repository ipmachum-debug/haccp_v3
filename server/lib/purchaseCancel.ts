import { getDb, getRawConnection } from "../db";

import { accountingPurchases } from "../../drizzle/schema_accounting_extended";
import { hInventoryTransactions, hInventoryLots } from "../../drizzle/schema/part2";
import { eq, and } from "drizzle-orm";
import { resolveSystemAccount, insertJournalLine } from "../db/journalHelper";
import { SYSTEM_ACCOUNTS } from "../../drizzle/schema/accountingAccounts";

import { todayKST } from "../utils/timezone";

/**
 * 매입 CANCEL 로직 (역거래 패턴)
 *
 * POSTED 상태의 매입 전표를 CANCELED로 전환하고,
 * 재고 원장과 회계 원장(expense_journal_entries/lines)에 역거래(REVERSAL) 추가
 */
export async function cancelPurchase(purchaseId: number, userId: number, tenantId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 1. 매입 전표 조회 (tenant_id 필터 적용)
  const purchase = await db
    .select()
    .from(accountingPurchases)
    .where(and(
      eq(accountingPurchases.id, purchaseId),
      eq(accountingPurchases.tenantId, tenantId)
    ))
    .limit(1)
    .then((rows) => rows[0]);

  if (!purchase) {
    throw new Error(`매입 전표 ID ${purchaseId}를 찾을 수 없습니다.`);
  }

  // 2. 상태 검증
  if (purchase.status !== "paid") {
    throw new Error(`확정된 전표만 취소할 수 있습니다. (현재 상태: ${purchase.status})`);
  }

  // 3. 멱등성 키 생성
  const docId = `PURCHASE-${purchaseId}`;
  const sourceType = "PURCHASE";

  // 4. 원본 재고 거래 조회 (LOT ID 확인)
  const originalInventoryTx = await db
    .select()
    .from(hInventoryTransactions)
    .where(
      and(
        eq(hInventoryTransactions.referenceType, sourceType),
        eq(hInventoryTransactions.sourceId, purchaseId),
        eq(hInventoryTransactions.transactionType, "receipt"),
        eq(hInventoryTransactions.tenantId, tenantId)
      )
    )
    .limit(1)
    .then((rows) => rows[0]);

  if (originalInventoryTx) {
    const lotId = originalInventoryTx.lotId;

    // 5. 재고 원장에 역거래 추가
    try {
      await db.insert(hInventoryTransactions).values({
        tenantId,
        lotId,
        transactionType: "adjustment",
        quantity: (-Number(purchase.quantity || 0)).toString(),
        unit: purchase.unit || "EA",
        transactionDate: todayKST(),
        referenceType: sourceType,
        sourceId: purchaseId,
        unitCost: purchase.unitPrice?.toString() || "0",
        amount: (-Number(purchase.totalAmount || 0)).toString(),
        createdBy: userId,
      } as any);
    } catch (error: any) {
      if (error.code === "ER_DUP_ENTRY") {
        throw new Error(`이미 취소 처리된 매입 전표입니다. (ID: ${purchaseId})`);
      }
      throw error;
    }

    // 6. LOT 재고 감소 (available → 0 또는 disposed)
    const currentQty = Number((originalInventoryTx as any).quantity || 0);
    const cancelQty = Number(purchase.quantity || 0);
    const newQty = Math.max(0, currentQty - cancelQty);
    await db
      .update(hInventoryLots)
      .set({
        availableQuantity: newQty.toString(),
        status: newQty <= 0 ? "disposed" : "available",
      } as any)
      .where(and(
        eq(hInventoryLots.id, lotId),
        eq(hInventoryLots.tenantId, tenantId)
      ));
  }

  // 7. 회계 역분개 생성 (expense_journal_entries/lines)
  const totalAmount = Number(purchase.totalAmount || 0);
  const conn = await getRawConnection();
  const cancelDate = todayKST();

  const inventoryAcc = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.INVENTORY_RAW, "1410", "원재료");
  const payableAcc = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.ACCOUNTS_PAYABLE, "2010", "외상매입금");

  const [jeResult] = await conn.execute(
    `INSERT INTO expense_journal_entries
       (tenant_id, voucher_id, entry_date, description, total_debit, total_credit, posted_by)
     VALUES (?, NULL, ?, ?, ?, ?, ?)`,
    [tenantId, cancelDate, `[매입취소] ${docId} ${purchase.itemName || ""}`, totalAmount, totalAmount, userId]
  );
  const journalEntryId = Number((jeResult as any).insertId);

  // 역거래: 차변 외상매입금, 대변 원재료
  await insertJournalLine(conn, {
    tenantId, journalEntryId,
    accountId: payableAcc.id, accountCode: payableAcc.code, accountName: payableAcc.name,
    debitAmount: totalAmount, creditAmount: 0,
    description: `매입 취소: ${purchase.itemName || ""}`, sortOrder: 0,
  });
  await insertJournalLine(conn, {
    tenantId, journalEntryId,
    accountId: inventoryAcc.id, accountCode: inventoryAcc.code, accountName: inventoryAcc.name,
    debitAmount: 0, creditAmount: totalAmount,
    description: `매입 취소: ${purchase.itemName || ""}`, sortOrder: 1,
  });

  // 8. 매입 전표 상태 업데이트
  await db
    .update(accountingPurchases)
    .set({
      status: "cancelled",
      canceledAt: new Date(),
      canceledBy: userId
    })
    .where(and(
      eq(accountingPurchases.id, purchaseId),
      eq(accountingPurchases.tenantId, tenantId)
    ));

  console.log(`[CANCEL] 매입 전표 ID ${purchaseId} 취소 완료 (역거래 생성)`);
}
