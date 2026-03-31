import { getDb, withTransaction } from "../db";
import { accountingPurchases } from "../../drizzle/schema_accounting_extended";
import { hInventoryTransactions } from "../../drizzle/schema/part2";
import { eq, and } from "drizzle-orm";
import { resolveSystemAccount, insertJournalLine } from "../db/journalHelper";
import { SYSTEM_ACCOUNTS } from "../../drizzle/schema/accountingAccounts";
import { todayKST } from "../utils/timezone";

/**
 * 매입 CANCEL 로직 (역거래 패턴, 트랜잭션 보장)
 *
 * POSTED 상태의 매입 전표를 CANCELED로 전환하고,
 * 재고 원장과 회계 원장에 역거래(REVERSAL) 추가
 *
 * 모든 DB 조작이 단일 트랜잭션으로 묶여 있어
 * 중간 실패 시 전체 롤백됩니다.
 */
export async function cancelPurchase(purchaseId: number, userId: number, tenantId: number): Promise<{ alreadyProcessed: boolean }> {
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

  // 멱등성: 이미 취소됨
  if (purchase.status === "cancelled") {
    return { alreadyProcessed: true };
  }

  if (purchase.status !== "paid") {
    throw new Error(`확정된 전표만 취소할 수 있습니다. (현재 상태: ${purchase.status})`);
  }

  const sourceType = "PURCHASE";
  const docId = `PURCHASE-${purchaseId}`;

  // 원본 재고 거래 조회 (LOT ID 확인)
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

  const totalAmount = Number(purchase.totalAmount || 0);
  const cancelDate = todayKST();

  // 시스템 계정 조회
  const inventoryAcc = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.INVENTORY_RAW, "1410", "원재료");
  const payableAcc = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.ACCOUNTS_PAYABLE, "2010", "외상매입금");

  // 트랜잭션 + FOR UPDATE 잠금으로 멱등성 보장
  return await withTransaction(async (conn) => {
    // 비관적 잠금: 트랜잭션 내 재검증
    const [lockRows] = await conn.execute(
      `SELECT status FROM accounting_purchases WHERE id = ? AND tenant_id = ? FOR UPDATE`,
      [purchaseId, tenantId]
    );
    const currentStatus = (lockRows as any[])[0]?.status;
    if (currentStatus === "cancelled") return { alreadyProcessed: true };
    if (currentStatus !== "paid") throw new Error(`확정된 전표만 취소할 수 있습니다. (현재: ${currentStatus})`);
    if (originalInventoryTx) {
      const lotId = originalInventoryTx.lotId;

      // (A) 재고 원장 역거래
      await conn.execute(
        `INSERT INTO h_inventory_transactions
           (tenant_id, lot_id, transaction_type, quantity, unit, transaction_date,
            reference_type, source_id, unit_cost, amount, created_by)
         VALUES (?, ?, 'adjustment', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [tenantId, lotId, (-Number(purchase.quantity || 0)).toString(), purchase.unit || "EA",
         cancelDate, sourceType, purchaseId, purchase.unitPrice?.toString() || "0",
         (-totalAmount).toString(), userId]
      );

      // (B) LOT 재고 감소
      const currentQty = Number((originalInventoryTx as any).quantity || 0);
      const cancelQty = Number(purchase.quantity || 0);
      const newQty = Math.max(0, currentQty - cancelQty);
      await conn.execute(
        `UPDATE h_inventory_lots
         SET available_quantity = ?, status = ?
         WHERE id = ? AND tenant_id = ?`,
        [newQty.toString(), newQty <= 0 ? "disposed" : "available", lotId, tenantId]
      );
    }

    // (C) 회계 역분개 헤더
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

    // (D) 매입 전표 상태 업데이트
    await conn.execute(
      `UPDATE accounting_purchases SET status = 'cancelled', canceled_at = NOW(), canceled_by = ? WHERE id = ? AND tenant_id = ?`,
      [userId, purchaseId, tenantId]
    );
    console.log(`[CANCEL] 매입 전표 ID ${purchaseId} 취소 완료 (역거래 생성)`);
    return { alreadyProcessed: false };
  });
}
