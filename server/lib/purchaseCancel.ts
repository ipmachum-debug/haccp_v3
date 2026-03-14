import { getDb } from "../db";

import { accountingPurchases } from "../../drizzle/schema_accounting_extended";
import { hInventoryTransactions, hInventoryLots } from "../../drizzle/schema/part2";
import { accountingTransactions } from "../../drizzle/schema_inventory_accounting";
import { eq, and } from "drizzle-orm";
import { resolveSystemAccount } from "../db/journalHelper";
import { SYSTEM_ACCOUNTS } from "../../drizzle/schema/accountingAccounts";

/**
 * 매입 CANCEL 로직 (역거래 패턴)
 *
 * POSTED 상태의 매입 전표를 CANCELED로 전환하고,
 * 재고 원장과 회계 원장에 역거래(REVERSAL) 추가
 *
 * @param purchaseId 매입 전표 ID
 * @param userId 처리자 ID
 * @param tenantId 테넌트 ID (보안: 크로스 테넌트 접근 방지)
 */
export async function cancelPurchase(purchaseId: number, userId: number, tenantId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection not available");

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
  const actionType = "REVERSAL";

  // 4. 원본 재고 거래 조회 (LOT ID 확인) - tenant_id 필터
  const originalInventoryTx = await db
    .select()
    .from(hInventoryTransactions)
    .where(
      and(
        eq(hInventoryTransactions.referenceType, sourceType),
        eq(hInventoryTransactions.sourceId, purchaseId),
        eq(hInventoryTransactions.actionType, "POST"),
        eq(hInventoryTransactions.tenantId, tenantId)
      )
    )
    .limit(1)
    .then((rows) => rows[0]);

  if (!originalInventoryTx) {
    throw new Error(`원본 재고 거래를 찾을 수 없습니다. (매입 ID: ${purchaseId})`);
  }

  const lotId = originalInventoryTx.lotId;

  // 5. 재고 원장에 역거래 추가 (quantity 음수)
  try {
    await db.insert(hInventoryTransactions).values({
      tenantId,
      inventoryId: (purchase as any).inventoryId!,
      lotId,
      transactionType: "adjustment", // 취소는 조정으로 처리
      quantity: (-Number(purchase.quantity || 0)).toString(),
      unit: purchase.unit || "EA",
      transactionDate: new Date().toISOString().split("T")[0], // 취소 일자
      sourceType,
      sourceId: docId,
      sourceLineId: purchaseId.toString(),
      actionType,
      purpose: "매입 취소",
      unitCost: purchase.unitPrice?.toString() || "0",
      amount: (-Number(purchase.totalAmount || 0)).toString(),
      createdBy: userId
    } as any);
  } catch (error: any) {
    // 멱등성 키 중복 오류 처리
    if (error.code === "ER_DUP_ENTRY") {
      throw new Error(`이미 취소 처리된 매입 전표입니다. (ID: ${purchaseId})`);
    }
    throw error;
  }

  // 6. LOT 재고 감소
  await db
    .update(hInventoryLots)
    .set({
      currentQuantity: (Number((originalInventoryTx as any).currentQuantity || 0) - Number(purchase.quantity || 0)).toString()
    })
    .where(and(
      eq(hInventoryLots.id, lotId),
      eq(hInventoryLots.tenantId, tenantId)
    ));

  // 7. 회계 원장에 역거래 추가 (DR/CR 반대) - system_code 기반
  const totalAmount = Number(purchase.totalAmount || 0);

  // system_code 기반 계정 조회
  const inventoryAcc = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.INVENTORY_RAW, "1120", "원재료");
  const payableAcc = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.ACCOUNTS_PAYABLE, "2110", "매입채무");

  // 원본 회계 거래 조회 (reversal_of_id 설정용) - tenant_id 필터
  const originalAccountingTxs = await db
    .select()
    .from(accountingTransactions)
    .where(
      and(
        eq(accountingTransactions.sourceType, sourceType),
        eq(accountingTransactions.sourceId, docId),
        eq(accountingTransactions.actionType, "POST"),
        eq(accountingTransactions.tenantId, tenantId)
      )
    );

  const originalDebitTx = originalAccountingTxs.find((tx) => Number(tx.debitAmount) > 0);
  const originalCreditTx = originalAccountingTxs.find((tx) => Number(tx.creditAmount) > 0);

  try {
    // (A) 역거래: 원재료 감소 (대변)
    await db.insert(accountingTransactions).values({
      tenantId,
      transactionDate: new Date().toISOString().split("T")[0],
      accountCode: inventoryAcc.code,
      accountName: inventoryAcc.name,
      debitAmount: "0.00",
      creditAmount: totalAmount.toFixed(2), // 원본은 차변, 역거래는 대변
      description: `매입 취소: ${purchase.itemName || ""}`,
      sourceType,
      sourceId: docId,
      sourceLineId: purchaseId.toString(),
      actionType,
      reversalOfId: originalDebitTx?.id || null,
      postedAt: new Date(),
      createdBy: userId
    } as any);

    // (B) 역거래: 매입채무 감소 (차변)
    await db.insert(accountingTransactions).values({
      tenantId,
      transactionDate: new Date().toISOString().split("T")[0],
      accountCode: payableAcc.code,
      accountName: payableAcc.name,
      debitAmount: totalAmount.toFixed(2), // 원본은 대변, 역거래는 차변
      creditAmount: "0.00",
      description: `매입 취소: ${purchase.itemName || ""}`,
      sourceType,
      sourceId: docId,
      sourceLineId: purchaseId.toString(),
      actionType,
      reversalOfId: originalCreditTx?.id || null,
      postedAt: new Date(),
      createdBy: userId
    } as any);
  } catch (error: any) {
    // 멱등성 키 중복 오류 처리
    if (error.code === "ER_DUP_ENTRY") {
      throw new Error(`이미 회계 취소 처리된 매입 전표입니다. (ID: ${purchaseId})`);
    }
    throw error;
  }

  // 8. 매입 전표 상태 업데이트 (POSTED → CANCELED)
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
