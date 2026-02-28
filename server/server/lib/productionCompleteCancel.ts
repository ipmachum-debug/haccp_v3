import { getDb } from "../db";

import { hInventoryTransactions } from "../../drizzle/schema/part2";
import { hBatches } from "../../drizzle/schema";
import { accountingTransactions } from "../../drizzle/schema_inventory_accounting";
import { eq } from "drizzle-orm";

/**
 * 생산 완료 CANCEL 로직 (역거래 패턴)
 * 
 * **워크플로우:**
 * 1. 배치 상태 검증 (completed만 CANCEL 가능)
 * 2. 원본 재고 원장 조회
 * 3. 재고 역거래 생성 (h_inventory_transactions - 음수)
 * 4. 회계 역거래 생성 (accounting_transactions - DR/CR 반대)
 * 5. 배치 상태 전환 (completed → canceled)
 * 
 * **멱등성 보장:**
 * - actionType: "REVERSAL"로 중복 방지
 */

interface Batch {
  id: number;
  status: string;
}

export async function cancelProductionComplete(
  batchId: number,
  userId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection not available");
  if (!db) throw new Error("Database connection not available");

  // 1. 배치 조회 및 상태 검증
  const batch = await db
    .select()
    .from(hBatches)
    .where(eq(hBatches.id, batchId))
    .limit(1)
    .then((rows) => rows[0] as unknown as Batch);

  if (!batch) {
    throw new Error("배치를 찾을 수 없습니다");
  }

  if (batch.status !== "completed") {
    throw new Error("완료된 배치만 취소할 수 있습니다");
  }

  // 2. 원본 재고 원장 조회
  const originalInventoryTxs = await db
    .select()
    .from(hInventoryTransactions)
    .where(eq(hInventoryTransactions.sourceId, `BATCH-${batchId}`));

  if (originalInventoryTxs.length === 0) {
    throw new Error("원본 재고 거래를 찾을 수 없습니다");
  }

  // 3. 재고 역거래 생성
  for (const originalTx of originalInventoryTxs) {
    if (originalTx.actionType !== "POST") continue;

    try {
      await db.insert(hInventoryTransactions).values({
        inventoryId: originalTx.inventoryId,
        lotId: originalTx.lotId,
        transactionType: "adjustment",
        quantity: (-parseFloat(originalTx.quantity || "0")).toString(),
        unit: originalTx.unit,
        transactionDate: new Date().toISOString().split("T")[0],
        sourceType: "PRODUCTION",
        sourceId: `BATCH-${batchId}`,
        sourceLineId: originalTx.sourceLineId,
        actionType: "REVERSAL",
        purpose: "cancellation",
        unitCost: originalTx.unitCost,
        amount: (-parseFloat(originalTx.amount || "0")).toString(),
        reversalOfId: originalTx.id,
        performedBy: userId,
        createdBy: userId
      });
    } catch (error: any) {
      if (error.code === "ER_DUP_ENTRY") {
        throw new Error("이미 취소된 배치입니다 (재고 원장 중복)");
      }
      throw error;
    }
  }

  // 4. 원본 회계 원장 조회
  const originalAccountingTxs = await db
    .select()
    .from(accountingTransactions)
    .where(eq(accountingTransactions.sourceId, `BATCH-${batchId}`));

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
        debitAmount: originalTx.creditAmount,
        creditAmount: originalTx.debitAmount,
        description: `생산 완료 취소 (배치 #${batchId})`,
        sourceType: "PRODUCTION",
        sourceId: `BATCH-${batchId}`,
        sourceLineId: originalTx.sourceLineId,
        actionType: "REVERSAL",
        reversalOfId: originalTx.id,
        createdBy: userId
      });
    } catch (error: any) {
      if (error.code === "ER_DUP_ENTRY") {
        throw new Error("이미 취소된 배치입니다 (회계 원장 중복)");
      }
      throw error;
    }
  }

  // 6. 배치 상태 전환
  await db.update(hBatches).set({
    status: "canceled",
    canceledAt: new Date()
  }).where(eq(hBatches.id, batchId));

  console.log(`[productionCompleteCancel] 배치 #${batchId} 생산 완료 취소`);
}
