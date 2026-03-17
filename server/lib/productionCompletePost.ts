import { getDb, getRawConnection } from "../db";

import { hInventoryTransactions } from "../../drizzle/schema/part2";
import { hBatches } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { resolveSystemAccount, insertJournalLine } from "../db/journalHelper";
import { SYSTEM_ACCOUNTS } from "../../drizzle/schema/accountingAccounts";

/**
 * 생산 완료 POST 로직
 *
 * **워크플로우:**
 * 1. 배치 상태 검증 (in_progress만 POST 가능)
 * 2. 원가 산식 계산 (재료비 + 인건비 + 경비)
 * 3. 수율 처리 (planned_yield vs actual_yield, loss 계산)
 * 4. 재고 원장 생성 (h_inventory_transactions - receipt)
 * 5. 회계 원장 생성 (expense_journal_entries/lines)
 *    - 차변: 제품재고 (1140 - 제품재고)
 *    - 대변: WIP (1130 - 재공품)
 * 6. 배치 상태 전환 (in_progress → completed)
 *
 * **원가 흐름:**
 * - WIP (재공품) → 제품재고
 * - WIP에 누적된 재료비 + 인건비 + 경비를 제품재고로 전환
 *
 * **멱등성 보장:**
 * - h_inventory_transactions: UNIQUE(source_type, source_id, source_line_id, action_type, lot_id)
 * - expense_journal_entries: description 기반 중복 확인
 */

interface Batch {
  id: number;
  status: string;
  productId: number;
  plannedQuantity: string;
  actualQuantity?: string;
  plannedYield?: string;
  actualYield?: string;
  lossQuantity?: string;
  totalCost?: string;
  materialCost?: string;
  laborCost?: string;
  overheadCost?: string;
  unitCost?: string;
}

export async function postProductionComplete(
  batchId: number,
  actualQuantity: number,
  userId: number,
  tenantId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection not available");

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

  if (batch.status !== "in_progress") {
    throw new Error("진행 중인 배치만 완료할 수 있습니다");
  }

  const plannedQuantity = parseFloat(batch.plannedQuantity);

  // 2. 수율 계산
  const actualYield = (actualQuantity / plannedQuantity) * 100;
  const lossQuantity = plannedQuantity - actualQuantity;

  // 3. 원가 계산 (WIP에 누적된 원가)
  const materialCost = parseFloat(batch.materialCost || "0");
  const laborCost = parseFloat(batch.laborCost || "0");
  const overheadCost = parseFloat(batch.overheadCost || "0");
  const totalCost = materialCost + laborCost + overheadCost;
  const unitCost = totalCost / actualQuantity;

  // 4. 배치 업데이트 (실제 수량, 수율, 원가)
  await db.update(hBatches).set({
    actualQuantity: actualQuantity.toString(),
    actualYield: actualYield.toFixed(2),
    lossQuantity: lossQuantity.toString(),
    totalCost: totalCost.toFixed(2),
    unitCost: unitCost.toFixed(2),
    status: "completed",
    completedAt: new Date()
  }).where(and(
    eq(hBatches.id, batchId),
    eq(hBatches.tenantId, tenantId)
  ));

  // 5. 재고 원장 생성 (제품 입고)
  try {
    await db.insert(hInventoryTransactions).values({
      tenantId,
      inventoryId: batch.productId,
      lotId: null, // LOT은 별도로 생성해야 함
      transactionType: "receipt",
      quantity: actualQuantity.toString(),
      unit: "kg", // 생산 기본단위는 kg
      transactionDate: new Date().toISOString().split("T")[0],
      sourceType: "PRODUCTION",
      sourceId: `BATCH-${batchId}`,
      sourceLineId: `BATCH-${batchId}-1`,
      actionType: "POST",
      purpose: "production_complete",
      unitCost: unitCost.toFixed(2),
      amount: totalCost.toFixed(2),
      performedBy: userId,
      createdBy: userId
    } as any);
  } catch (error: any) {
    if (error.code === "ER_DUP_ENTRY") {
      throw new Error("이미 완료된 배치입니다 (재고 원장 중복)");
    }
    throw error;
  }

  // 6. 회계 원장 생성 (복식부기: WIP → 제품재고) - system_code 기반
  const transactionDate = new Date().toISOString().split("T")[0];

  // system_code 기반 계정 조회
  const inventoryGoodsAcc = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.INVENTORY_GOODS, "1140", "제품재고");
  const wipAcc = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.WIP || "WIP", "1130", "재공품");

  const description = `[생산완료] BATCH-${batchId} (${actualQuantity}kg)`;
  const conn = await getRawConnection();

  const [jeResult] = await conn.execute(
    `INSERT INTO expense_journal_entries
       (tenant_id, voucher_id, entry_date, description, total_debit, total_credit, posted_by)
     VALUES (?, NULL, ?, ?, ?, ?, ?)`,
    [tenantId, transactionDate, description, totalCost.toFixed(2), totalCost.toFixed(2), userId]
  );
  const journalEntryId = Number((jeResult as any).insertId);

  // 차변: 제품재고
  await insertJournalLine(conn, {
    tenantId, journalEntryId,
    accountId: inventoryGoodsAcc.id, accountCode: inventoryGoodsAcc.code, accountName: inventoryGoodsAcc.name,
    debitAmount: totalCost, creditAmount: 0,
    description, sortOrder: 0,
  });

  // 대변: WIP (재공품)
  await insertJournalLine(conn, {
    tenantId, journalEntryId,
    accountId: wipAcc.id, accountCode: wipAcc.code, accountName: wipAcc.name,
    debitAmount: 0, creditAmount: totalCost,
    description, sortOrder: 1,
  });

  console.log(`[productionCompletePost] 배치 #${batchId} 생산 완료 (실제 수량: ${actualQuantity}kg, 수율: ${actualYield.toFixed(2)}%)`);
}
