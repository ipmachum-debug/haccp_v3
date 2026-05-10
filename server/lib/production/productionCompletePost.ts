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
    // PR-§5.2-2 (part 2): material_id NULL — 이건 제품 입고(BATCH/receipt) 트랜잭션이며
    //   inventory_id 가 batch.productId(제품 마스터) 를 가리킴. material_id 컬럼은 h_materials 전용.
    //   백필 분석 결과 NULL 잔존 652건 중 BATCH/receipt 45건이 이 경로에서 생성됨 — 정상.
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
  }).then(async (result) => {
    // ★ 2026-05-09 (PR #274): 트랜잭션 커밋 후 cache 무효화 + h_batch_inputs 점검
    // (이 경로는 actualQuantity 가 이미 set 되어 있으므로 actual_quantity 자동 갱신은 no-op)
    try {
      const { syncBatchOnComplete } = await import("./syncBatchOnComplete.js");
      const syncResult = await syncBatchOnComplete(batchId, tenantId);
      if (syncResult.warnings.length > 0) {
        console.warn(`[productionCompletePost] 배치 #${batchId} sync 경고:`, syncResult.warnings);
      }
    } catch (syncErr: any) {
      console.error(`[productionCompletePost] syncBatchOnComplete 실패 (계속 진행):`, syncErr?.message ?? syncErr);
    }
    return result;
  });
}
