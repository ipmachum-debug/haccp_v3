import { getDb, withTransaction } from "../db";
import { hBatches } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { resolveSystemAccount, insertJournalLine } from "../db/journalHelper";
import { SYSTEM_ACCOUNTS } from "../../drizzle/schema/accountingAccounts";
import { todayKST } from "../utils/timezone";

/**
 * 생산 완료 POST 로직 (트랜잭션 보장)
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
 * 모든 DB 조작이 단일 트랜잭션으로 묶여 있어
 * 중간 실패 시 전체 롤백됩니다.
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

  const transactionDate = todayKST();

  // 시스템 계정 조회 (트랜잭션 밖에서 - 읽기 전용)
  const inventoryGoodsAcc = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.INVENTORY_GOODS, "1140", "제품재고");
  const wipAcc = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.WIP || "WIP", "1130", "재공품");

  const description = `[생산완료] BATCH-${batchId} (${actualQuantity}kg)`;

  // 트랜잭션으로 묶어서 실행 (배치업데이트 + 재고원장 + 회계분개)
  await withTransaction(async (conn) => {
    // (A) 배치 업데이트
    await conn.execute(
      `UPDATE h_batches SET
        actual_quantity = ?, actual_yield = ?, loss_quantity = ?,
        total_cost = ?, unit_cost = ?, status = 'completed', completed_at = NOW()
       WHERE id = ? AND tenant_id = ?`,
      [actualQuantity.toString(), actualYield.toFixed(2), lossQuantity.toString(),
       totalCost.toFixed(2), unitCost.toFixed(2), batchId, tenantId]
    );

    // (B) 재고 원장 생성 (제품 입고)
    await conn.execute(
      `INSERT INTO h_inventory_transactions
         (tenant_id, inventory_id, lot_id, transaction_type, quantity, unit,
          transaction_date, source_type, source_id, source_line_id, action_type,
          purpose, unit_cost, amount, performed_by, created_by)
       VALUES (?, ?, NULL, 'receipt', ?, 'kg', ?, 'PRODUCTION', ?, ?, 'POST',
               'production_complete', ?, ?, ?, ?)`,
      [tenantId, batch.productId, actualQuantity.toString(), transactionDate,
       `BATCH-${batchId}`, `BATCH-${batchId}-1`,
       unitCost.toFixed(2), totalCost.toFixed(2), userId, userId]
    );

    // (C) 회계 분개 헤더
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
  });

  console.log(`[productionCompletePost] 배치 #${batchId} 생산 완료 (실제 수량: ${actualQuantity}kg, 수율: ${actualYield.toFixed(2)}%)`);
}
