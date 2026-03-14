import { getDb } from "../db";

import { hInventoryTransactions } from "../../drizzle/schema/part2";
import { accountingTransactions } from "../../drizzle/schema_inventory_accounting";
import { eq, and } from "drizzle-orm";

/**
 * 원재료 출고 CANCEL 로직 (역거래 패턴)
 *
 * **워크플로우:**
 * 1. 출고 문서 상태 검증 (POSTED만 CANCEL 가능)
 * 2. 원본 재고 원장 조회
 * 3. 재고 역거래 생성 (h_inventory_transactions - 양수)
 * 4. 회계 역거래 생성 (accounting_transactions - DR/CR 반대)
 * 5. 출고 문서 상태 전환 (POSTED → CANCELED)
 *
 * **멱등성 보장:**
 * - actionType: "REVERSAL"로 중복 방지
 */

interface MaterialOutboundDocument {
  id: number;
  status: string;
}

export async function cancelMaterialOutbound(
  outboundId: number,
  userId: number,
  tenantId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection not available");

  // 1. 출고 문서 조회 및 상태 검증 (tenant_id 필터 적용)
  const outbound = await db
    .select()
    .from(hInventoryTransactions)
    .where(and(
      eq(hInventoryTransactions.id, outboundId),
      eq(hInventoryTransactions.tenantId, tenantId)
    ))
    .limit(1)
    .then((rows) => rows[0] as unknown as MaterialOutboundDocument);

  if (!outbound) {
    throw new Error("출고 문서를 찾을 수 없습니다");
  }

  if (outbound.status !== "paid") {
    throw new Error("확정된 출고 문서만 취소할 수 있습니다");
  }

  // 2. 원본 재고 원장 조회 (tenant_id 필터)
  const originalInventoryTxs = await db
    .select()
    .from(hInventoryTransactions)
    .where(and(
      eq(hInventoryTransactions.sourceId, `OUTBOUND-${outboundId}` as any),
      eq(hInventoryTransactions.tenantId, tenantId)
    ));

  if (originalInventoryTxs.length === 0) {
    throw new Error("원본 재고 거래를 찾을 수 없습니다");
  }

  // 3. 재고 역거래 생성 (각 LOT별로)
  for (const originalTx of originalInventoryTxs) {
    if (originalTx.actionType !== "POST") continue;

    try {
      await db.insert(hInventoryTransactions).values({
        tenantId,
        inventoryId: originalTx.inventoryId,
        lotId: originalTx.lotId,
        transactionType: "adjustment", // 조정
        quantity: (-parseFloat(originalTx.quantity || "0")).toString(), // 부호 반대
        unit: originalTx.unit,
        transactionDate: new Date().toISOString().split("T")[0],
        sourceType: "OUTBOUND",
        sourceId: `OUTBOUND-${outboundId}`,
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
        throw new Error("이미 취소된 출고 문서입니다 (재고 원장 중복)");
      }
      throw error;
    }
  }

  // 4. 원본 회계 원장 조회 (tenant_id 필터)
  const originalAccountingTxs = await db
    .select()
    .from(accountingTransactions)
    .where(and(
      eq(accountingTransactions.sourceId, `OUTBOUND-${outboundId}`),
      eq(accountingTransactions.tenantId, tenantId)
    ));

  if (originalAccountingTxs.length === 0) {
    throw new Error("원본 회계 거래를 찾을 수 없습니다");
  }

  // 5. 회계 역거래 생성 (DR/CR 반대)
  const transactionDate = new Date().toISOString().split("T")[0];

  for (const originalTx of originalAccountingTxs) {
    if (originalTx.actionType !== "POST") continue;

    try {
      await db.insert(accountingTransactions).values({
        tenantId,
        transactionDate,
        accountCode: originalTx.accountCode,
        debitAmount: originalTx.creditAmount, // DR ↔ CR 반대
        creditAmount: originalTx.debitAmount,
        description: `원재료 출고 취소 (출고 #${outboundId})`,
        sourceType: "OUTBOUND",
        sourceId: `OUTBOUND-${outboundId}`,
        sourceLineId: originalTx.sourceLineId,
        actionType: "REVERSAL",
        reversalOfId: originalTx.id,
        createdBy: userId
      } as any);
    } catch (error: any) {
      if (error.code === "ER_DUP_ENTRY") {
        throw new Error("이미 취소된 출고 문서입니다 (회계 원장 중복)");
      }
      throw error;
    }
  }

  console.log(`[materialOutboundCancel] 원재료 출고 #${outboundId} 취소 완료`);
}
