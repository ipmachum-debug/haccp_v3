import { getDb, getRawConnection } from "../../db";

import { hInventoryTransactions } from "../../../drizzle/schema/part2";
import { hBatches } from "../../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { resolveSystemAccount, insertJournalLine } from "../../db/accounting/journalHelper";
import { SYSTEM_ACCOUNTS } from "../../../drizzle/schema/accountingAccounts";

import { todayKST } from "../../utils/timezone";

/**
 * 생산 완료 CANCEL 로직 (역거래 패턴)
 *
 * **워크플로우:**
 * 1. 배치 상태 검증 (completed만 CANCEL 가능)
 * 2. 원본 재고 원장 조회
 * 3. 재고 역거래 생성 (h_inventory_transactions - 음수)
 * 4. 회계 역거래 생성 (expense_journal_entries/lines - DR/CR 반대)
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
  userId: number,
  tenantId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 1. 배치 조회 및 상태 검증 (tenant_id 필터 적용)
  const batch = await db
    .select()
    .from(hBatches)
    .where(and(
      eq(hBatches.id, batchId),
      eq(hBatches.tenantId, tenantId)
    ))
    .limit(1)
    .then((rows) => rows[0] as unknown as Batch);

  if (!batch) {
    throw new Error("배치를 찾을 수 없습니다");
  }

  if (batch.status !== "completed") {
    throw new Error("완료된 배치만 취소할 수 있습니다");
  }

  // 2. 원본 재고 원장 조회 (tenant_id 필터)
  const originalInventoryTxs = await db
    .select()
    .from(hInventoryTransactions)
    .where(and(
      eq(hInventoryTransactions.sourceId, `BATCH-${batchId}` as any),
      eq(hInventoryTransactions.tenantId, tenantId)
    ));

  if (originalInventoryTxs.length === 0) {
    throw new Error("원본 재고 거래를 찾을 수 없습니다");
  }

  // 3. 재고 역거래 생성
  for (const originalTx of originalInventoryTxs) {
    if (originalTx.actionType !== "POST") continue;

    try {
      await db.insert(hInventoryTransactions).values({
        tenantId,
        inventoryId: originalTx.inventoryId,
        lotId: originalTx.lotId,
        transactionType: "adjustment",
        quantity: (-parseFloat(originalTx.quantity || "0")).toString(),
        unit: originalTx.unit,
        transactionDate: todayKST(),
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
      } as any);
    } catch (error: any) {
      if (error.code === "ER_DUP_ENTRY") {
        throw new Error("이미 취소된 배치입니다 (재고 원장 중복)");
      }
      throw error;
    }
  }

  // 4. 원본 회계 분개 조회 (description 패턴 매칭)
  const conn = await getRawConnection();
  const transactionDate = todayKST();

  const [originalEntries] = await conn.execute(
    `SELECT id, total_debit, total_credit FROM expense_journal_entries
     WHERE tenant_id = ? AND description LIKE ?`,
    [tenantId, `[생산완료] BATCH-${batchId}%`]
  );
  const entries = originalEntries as any[];

  if (entries.length === 0) {
    throw new Error("원본 회계 거래를 찾을 수 없습니다");
  }

  // 5. 회계 역거래 생성 (역분개)
  // system_code 기반 계정 조회
  const inventoryGoodsAcc = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.INVENTORY_GOODS, "1140", "제품재고");
  const wipAcc = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.WIP || "WIP", "1130", "재공품");

  for (const entry of entries) {
    const totalAmount = parseFloat(entry.total_debit || "0");
    const reverseDesc = `[생산완료취소] BATCH-${batchId}`;

    const [jeResult] = await conn.execute(
      `INSERT INTO expense_journal_entries
         (tenant_id, voucher_id, entry_date, description, total_debit, total_credit, posted_by)
       VALUES (?, NULL, ?, ?, ?, ?, ?)`,
      [tenantId, transactionDate, reverseDesc, totalAmount.toFixed(2), totalAmount.toFixed(2), userId]
    );
    const journalEntryId = Number((jeResult as any).insertId);

    // 역분개: 차변 WIP (재공품), 대변 제품재고
    await insertJournalLine(conn, {
      tenantId, journalEntryId,
      accountId: wipAcc.id, accountCode: wipAcc.code, accountName: wipAcc.name,
      debitAmount: totalAmount, creditAmount: 0,
      description: reverseDesc, sortOrder: 0,
    });

    await insertJournalLine(conn, {
      tenantId, journalEntryId,
      accountId: inventoryGoodsAcc.id, accountCode: inventoryGoodsAcc.code, accountName: inventoryGoodsAcc.name,
      debitAmount: 0, creditAmount: totalAmount,
      description: reverseDesc, sortOrder: 1,
    });
  }

  // 6. 배치 상태 전환
  await db.update(hBatches).set({
    status: "cancelled",
    canceledAt: new Date()
  } as any).where(and(
    eq(hBatches.id, batchId),
    eq(hBatches.tenantId, tenantId)
  ));

  console.log(`[productionCompleteCancel] 배치 #${batchId} 생산 완료 취소`);
}
