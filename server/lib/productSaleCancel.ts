import { getDb } from "../db";

import { hInventoryTransactions } from "../../drizzle/schema/part2";
import { accountingTransactions } from "../../drizzle/schema_inventory_accounting";
import { accountingSales } from "../../drizzle/schema_accounting_extended";
import { eq } from "drizzle-orm";

/**
 * 제품 출고/판매 CANCEL 로직 (역거래 패턴)
 * 
 * **워크플로우:**
 * 1. 판매 문서 상태 검증 (POSTED만 CANCEL 가능)
 * 2. 원본 재고 원장 조회
 * 3. 재고 역거래 생성 (h_inventory_transactions - 양수)
 * 4. 회계 역거래 생성 (accounting_transactions - DR/CR 반대)
 * 5. 판매 문서 상태 전환 (POSTED → CANCELED)
 * 
 * **멱등성 보장:**
 * - actionType: "REVERSAL"로 중복 방지
 */

interface SalesDocument {
  id: number;
  status: string;
}

export async function cancelProductSale(
  saleId: number,
  userId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection not available");
  if (!db) throw new Error("Database connection not available");

  // 1. 판매 문서 조회 및 상태 검증
  const sale = await db
    .select()
    .from(accountingSales)
    .where(eq(accountingSales.id, saleId))
    .limit(1)
    .then((rows) => rows[0] as unknown as SalesDocument);

  if (!sale) {
    throw new Error("판매 문서를 찾을 수 없습니다");
  }

  if (sale.status !== "paid") {
    throw new Error("확정된 판매 문서만 취소할 수 있습니다");
  }

  // 2. 원본 재고 원장 조회
  const originalInventoryTxs = await db
    .select()
    .from(hInventoryTransactions)
    .where(eq(hInventoryTransactions.sourceId, `SALE-${saleId}`) as any);

  if (originalInventoryTxs.length === 0) {
    throw new Error("원본 재고 거래를 찾을 수 없습니다");
  }

  // 3. 재고 역거래 생성 (각 LOT별로)
  for (const originalTx of originalInventoryTxs) {
    if (originalTx.actionType !== "POST") continue;

    try {
      await db.insert(hInventoryTransactions).values({
        inventoryId: originalTx.inventoryId,
        lotId: originalTx.lotId,
        transactionType: "adjustment",
        quantity: (-parseFloat(originalTx.quantity || "0")).toString(), // 부호 반대
        unit: originalTx.unit,
        transactionDate: new Date().toISOString().split("T")[0],
        sourceType: "SALE",
        sourceId: `SALE-${saleId}`,
        sourceLineId: originalTx.sourceLineId,
        actionType: "REVERSAL",
        purpose: "cancellation",
        unitCost: originalTx.unitCost,
        amount: (-parseFloat(originalTx.amount || "0")).toString(),
        reversalOfId: originalTx.id,
        performedBy: userId,
        createdBy: userId
      } as any);
    } catch (error: any) {
      if (error.code === "ER_DUP_ENTRY") {
        throw new Error("이미 취소된 판매 문서입니다 (재고 원장 중복)");
      }
      throw error;
    }
  }

  // 4. 원본 회계 원장 조회
  const originalAccountingTxs = await db
    .select()
    .from(accountingTransactions)
    .where(eq(accountingTransactions.sourceId, `SALE-${saleId}`));

  if (originalAccountingTxs.length === 0) {
    throw new Error("원본 회계 거래를 찾을 수 없습니다");
  }

  // 5. 회계 역거래 생성 (DR/CR 반대)
  const transactionDate = new Date().toISOString().split("T")[0];

  for (const originalTx of originalAccountingTxs) {
    if (originalTx.actionType !== "POST") continue;

    try {
      await db.insert(accountingTransactions).values({
        transactionDate,
        accountCode: originalTx.accountCode,
        debitAmount: originalTx.creditAmount, // DR ↔ CR 반대
        creditAmount: originalTx.debitAmount,
        description: `제품 판매 취소 (판매 #${saleId})`,
        sourceType: "SALE",
        sourceId: `SALE-${saleId}`,
        sourceLineId: originalTx.sourceLineId,
        actionType: "REVERSAL",
        reversalOfId: originalTx.id,
        createdBy: userId
      } as any);
    } catch (error: any) {
      if (error.code === "ER_DUP_ENTRY") {
        throw new Error("이미 취소된 판매 문서입니다 (회계 원장 중복)");
      }
      throw error;
    }
  }

  // 6. 판매 문서 상태 전환
  await db.update(accountingSales).set({
    status: "cancelled",
    canceledAt: new Date(),
    canceledBy: userId
  }).where(eq(accountingSales.id, saleId));

  console.log(`[productSaleCancel] 판매 #${saleId} 취소 완료`);
}
