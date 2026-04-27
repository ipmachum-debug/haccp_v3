import { getDb, withTransaction } from "../../db";
import { hBatches } from "../../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { resolveSystemAccount, insertJournalLine } from "../../db/accounting/journalHelper";
import { SYSTEM_ACCOUNTS } from "../../../drizzle/schema/accountingAccounts";
import { todayKST } from "../../utils/timezone";

/**
 * 생산 완료 POST 로직 (트랜잭션 + 멱등성 보장)
 *
 * **멱등성:**
 * - 트랜잭션 내부에서 SELECT ... FOR UPDATE로 배치 상태를 잠금
 * - 이미 completed 상태면 조용히 반환 (중복 호출 안전)
 *
 * **트랜잭션:**
 * - 배치업데이트 + 재고원장 + 회계분개가 원자적으로 실행
 */

interface Batch {
  id: number;
  status: string;
  productId: number;
  plannedQuantity: string;
  actualQuantity?: string;
  materialCost?: string;
  laborCost?: string;
  overheadCost?: string;
}

export async function postProductionComplete(
  batchId: number,
  actualQuantity: number,
  userId: number,
  tenantId: number
): Promise<{ alreadyProcessed: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 사전 조회 (읽기 전용 - 빠른 실패)
  const batch = await db
    .select()
    .from(hBatches)
    .where(and(eq(hBatches.id, batchId), eq(hBatches.tenantId, tenantId)))
    .limit(1)
    .then((rows) => rows[0] as unknown as Batch);

  if (!batch) throw new Error("배치를 찾을 수 없습니다");
  if (batch.status === "completed") return { alreadyProcessed: true };
  if (batch.status !== "in_progress") throw new Error("진행 중인 배치만 완료할 수 있습니다");

  const plannedQuantity = parseFloat(batch.plannedQuantity);
  const actualYield = (actualQuantity / plannedQuantity) * 100;
  const lossQuantity = plannedQuantity - actualQuantity;
  const materialCost = parseFloat(batch.materialCost || "0");
  const laborCost = parseFloat(batch.laborCost || "0");
  const overheadCost = parseFloat(batch.overheadCost || "0");
  const totalCost = materialCost + laborCost + overheadCost;
  const unitCost = totalCost / actualQuantity;
  const transactionDate = todayKST();

  const inventoryGoodsAcc = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.INVENTORY_GOODS, "1140", "제품재고");
  const wipAcc = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.WIP || "WIP", "1130", "재공품");
  const description = `[생산완료] BATCH-${batchId} (${actualQuantity}kg)`;

  return await withTransaction(async (conn) => {
    // (0) 비관적 잠금: 트랜잭션 내 재검증
    const [lockRows] = await conn.execute(
      `SELECT status FROM h_batches WHERE id = ? AND tenant_id = ? FOR UPDATE`,
      [batchId, tenantId]
    );
    const currentStatus = (lockRows as any[])[0]?.status;
    if (currentStatus === "completed") return { alreadyProcessed: true };
    if (currentStatus !== "in_progress") throw new Error("진행 중인 배치만 완료할 수 있습니다");

    // (A) 배치 업데이트
    await conn.execute(
      `UPDATE h_batches SET
        actual_quantity = ?, actual_yield = ?, loss_quantity = ?,
        total_cost = ?, unit_cost = ?, status = 'completed', completed_at = NOW()
       WHERE id = ? AND tenant_id = ?`,
      [actualQuantity.toString(), actualYield.toFixed(2), lossQuantity.toString(),
       totalCost.toFixed(2), unitCost.toFixed(2), batchId, tenantId]
    );

    // (B) 재고 원장 생성
    // PR-§5.2-2 노트: 본 INSERT 는 *제품 입고* (BATCH/receipt) 트랜잭션이므로
    //   material_id 는 NULL 로 둔다 (h_materials.id 기반 컬럼 — 원재료 전용).
    //   productId 는 inventory_id 자리에 그대로 유지. SELECT 측에서 본 행은
    //   getConsumptionSummary 가 PR-I/J 필터로 이미 제외함.
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

    // (C) 회계 분개
    const [jeResult] = await conn.execute(
      `INSERT INTO expense_journal_entries
         (tenant_id, voucher_id, entry_date, description, total_debit, total_credit, posted_by)
       VALUES (?, NULL, ?, ?, ?, ?, ?)`,
      [tenantId, transactionDate, description, totalCost.toFixed(2), totalCost.toFixed(2), userId]
    );
    const journalEntryId = Number((jeResult as any).insertId);

    await insertJournalLine(conn, {
      tenantId, journalEntryId,
      accountId: inventoryGoodsAcc.id, accountCode: inventoryGoodsAcc.code, accountName: inventoryGoodsAcc.name,
      debitAmount: totalCost, creditAmount: 0, description, sortOrder: 0,
    });
    await insertJournalLine(conn, {
      tenantId, journalEntryId,
      accountId: wipAcc.id, accountCode: wipAcc.code, accountName: wipAcc.name,
      debitAmount: 0, creditAmount: totalCost, description, sortOrder: 1,
    });

    console.log(`[productionCompletePost] 배치 #${batchId} 생산 완료 (${actualQuantity}kg, 수율: ${actualYield.toFixed(2)}%)`);
    return { alreadyProcessed: false };
  });
}
