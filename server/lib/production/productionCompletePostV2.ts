/**
 * 생산 완료 POST v2 — 단일 트랜잭션 엔진 + 도메인 이벤트 (F2-3-a)
 *
 * ============================================================================
 * v1 (productionCompletePost.ts) 와 차이:
 *
 * | 항목                | v1 (기존)                  | v2 (이 PR)                |
 * | 트랜잭션 보장        | ✅ withTransaction          | ✅ postWithinTransaction  |
 * | 멱등성 (FOR UPDATE) | ✅                          | ✅                        |
 * | 회계 분개 동기화     | ✅ 같은 트랜잭션            | ✅ 같은 트랜잭션          |
 * | 도메인 이벤트 발행   | ❌                         | ✅ 3종 outbox             |
 * | tenant 격리 강제     | 직접 처리                  | postWithinTransaction 자동 |
 * | F-3 IoT 폐쇄 루프 토대 | 없음                      | ControlPoint.evaluate() 호출 가능 |
 *
 * v1 이 이미 안전 (withTransaction 사용 중) — v2 의 가치는 주로 이벤트 인프라.
 * 향후 F-3 (특허 [0016]) 가 production.completed 이벤트를 구독해서
 * 자동 검증 / LOT 관리 / 시정조치 트리거 등 가능.
 *
 * 도메인 이벤트 (3종):
 *   - production.completed       { batchId, productId, actualQuantity, totalCost, yield }
 *   - inventory.received         { inventoryId, productId, quantity, unitCost }
 *   - journal.posted             { journalEntryId, sourceType: "PRODUCTION", sourceId }
 *
 * ============================================================================
 * 분할 정책 (F-2 로드맵):
 *   F2-3-a (이 PR): v2 외각 + 도메인 이벤트 (사용처 0)
 *   F2-3-b: dispatcher + 호출처 전환 (env 기본 v1)
 *   F2-3-c: feature flag 점진 활성화 (USE_PRODUCTION_COMPLETE_V2)
 *
 * 트리거: PR #117 F-2 설계 / PR #124 인프라 / PR #128 dispatcher 패턴
 * ============================================================================
 */

import { eq, and } from "drizzle-orm";
import { getDb } from "../../db";
import { hBatches } from "../../../drizzle/schema";
import { resolveSystemAccount, insertJournalLine } from "../../db/accounting/journalHelper";
import { SYSTEM_ACCOUNTS } from "../../../drizzle/schema/accountingAccounts";
import { todayKST } from "../../utils/timezone";
import { postWithinTransaction } from "../_core";

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

export interface ProductionCompleteResult {
  alreadyProcessed: boolean;
}

/**
 * 생산 완료 POST v2 — 단일 트랜잭션 엔진 사용.
 *
 * 흐름:
 *   1. 사전 조회 (트랜잭션 외부, 빠른 실패)
 *   2. postWithinTransaction:
 *      (0) FOR UPDATE 락 + 재검증 (멱등성)
 *      (A) h_batches UPDATE (status=completed)
 *      (B) h_inventory_transactions INSERT (제품 receipt)
 *      (C) 회계 분개 (expense_journal_entries + lines)
 *      (D) 도메인 이벤트 emit() — production.completed / inventory.received / journal.posted
 *   3. commit 시 outbox 에 이벤트 INSERT (rollback 시 자동 폐기)
 *
 * 사용처: 0 (이번 PR — feature flag 도입 후 점진 전환)
 */
export async function postProductionCompleteV2(
  batchId: number,
  actualQuantity: number,
  userId: number,
  tenantId: number,
): Promise<ProductionCompleteResult> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 사전 조회 (읽기 전용 — 빠른 실패)
  const batch = (await db
    .select()
    .from(hBatches)
    .where(and(eq(hBatches.id, batchId), eq(hBatches.tenantId, tenantId)))
    .limit(1)
    .then((rows) => rows[0])) as unknown as Batch | undefined;

  if (!batch) throw new Error("배치를 찾을 수 없습니다");
  if (batch.status === "completed") return { alreadyProcessed: true };
  if (batch.status !== "in_progress") {
    throw new Error("진행 중인 배치만 완료할 수 있습니다");
  }

  // 계산 (트랜잭션 외부에서 미리)
  const plannedQuantity = parseFloat(batch.plannedQuantity);
  const actualYield = (actualQuantity / plannedQuantity) * 100;
  const lossQuantity = plannedQuantity - actualQuantity;
  const materialCost = parseFloat(batch.materialCost || "0");
  const laborCost = parseFloat(batch.laborCost || "0");
  const overheadCost = parseFloat(batch.overheadCost || "0");
  const totalCost = materialCost + laborCost + overheadCost;
  const unitCost = actualQuantity > 0 ? totalCost / actualQuantity : 0;
  const transactionDate = todayKST();

  const inventoryGoodsAcc = await resolveSystemAccount(
    tenantId,
    SYSTEM_ACCOUNTS.INVENTORY_GOODS,
    "1140",
    "제품재고",
  );
  const wipAcc = await resolveSystemAccount(
    tenantId,
    SYSTEM_ACCOUNTS.WIP || "WIP",
    "1130",
    "재공품",
  );
  const description = `[생산완료] BATCH-${batchId} (${actualQuantity}kg)`;

  // 결과 capture (postWithinTransaction 외부)
  let alreadyProcessed = false;
  let journalEntryId = 0;

  await postWithinTransaction({
    sourceType: "PRODUCTION",
    sourceId: batchId,
    tenantId,
    userId,
    operationName: `productionCompleteV2:${batchId}`,
    actions: [
      async (ctx) => {
        // (0) 비관적 잠금 + 재검증 (트랜잭션 안 멱등성)
        const [lockRows]: any = await ctx.conn.execute(
          `SELECT status FROM h_batches WHERE id = ? AND tenant_id = ? FOR UPDATE`,
          [batchId, tenantId],
        );
        const currentStatus = (lockRows as any[])[0]?.status;
        if (currentStatus === "completed") {
          alreadyProcessed = true;
          return; // 이벤트 발행 / INSERT 모두 skip
        }
        if (currentStatus !== "in_progress") {
          throw new Error("진행 중인 배치만 완료할 수 있습니다");
        }

        // (A) 배치 업데이트
        await ctx.conn.execute(
          `UPDATE h_batches SET
            actual_quantity = ?, actual_yield = ?, loss_quantity = ?,
            total_cost = ?, unit_cost = ?, status = 'completed', completed_at = NOW()
           WHERE id = ? AND tenant_id = ?`,
          [
            actualQuantity.toString(),
            actualYield.toFixed(2),
            lossQuantity.toString(),
            totalCost.toFixed(2),
            unitCost.toFixed(2),
            batchId,
            tenantId,
          ],
        );

        // (B) 재고 원장 (제품 입고)
        // PR-§5.2-2: material_id NULL — 제품 입고는 inventory_id (productId) 기반.
        // material_id 컬럼은 h_materials 전용 — BATCH/receipt 정상 패턴.
        await ctx.conn.execute(
          `INSERT INTO h_inventory_transactions
             (tenant_id, inventory_id, lot_id, transaction_type, quantity, unit,
              transaction_date, source_type, source_id, source_line_id, action_type,
              purpose, unit_cost, amount, performed_by, created_by)
           VALUES (?, ?, NULL, 'receipt', ?, 'kg', ?, 'PRODUCTION', ?, ?, 'POST',
                   'production_complete', ?, ?, ?, ?)`,
          [
            tenantId,
            batch.productId,
            actualQuantity.toString(),
            transactionDate,
            `BATCH-${batchId}`,
            `BATCH-${batchId}-1`,
            unitCost.toFixed(2),
            totalCost.toFixed(2),
            userId,
            userId,
          ],
        );

        // (C) 회계 분개 헤더
        const [jeResult]: any = await ctx.conn.execute(
          `INSERT INTO expense_journal_entries
             (tenant_id, voucher_id, entry_date, description, total_debit, total_credit, posted_by)
           VALUES (?, NULL, ?, ?, ?, ?, ?)`,
          [tenantId, transactionDate, description, totalCost.toFixed(2), totalCost.toFixed(2), userId],
        );
        journalEntryId = Number(jeResult.insertId);

        // 차변: 제품재고
        await insertJournalLine(ctx.conn as any, {
          tenantId,
          journalEntryId,
          accountId: inventoryGoodsAcc.id,
          accountCode: inventoryGoodsAcc.code,
          accountName: inventoryGoodsAcc.name,
          debitAmount: totalCost,
          creditAmount: 0,
          description,
          sortOrder: 0,
        });
        // 대변: 재공품
        await insertJournalLine(ctx.conn as any, {
          tenantId,
          journalEntryId,
          accountId: wipAcc.id,
          accountCode: wipAcc.code,
          accountName: wipAcc.name,
          debitAmount: 0,
          creditAmount: totalCost,
          description,
          sortOrder: 1,
        });

        // (D) 도메인 이벤트 발행 (commit 시 outbox INSERT)

        // 1. production.completed — 배치 완료 (F-3 IoT 폐쇄 루프가 구독 가능)
        ctx.emit({
          tenantId,
          eventType: "production.completed",
          aggregateType: "batch",
          aggregateId: batchId,
          payload: {
            productId: batch.productId,
            plannedQuantity,
            actualQuantity,
            actualYield,
            lossQuantity,
            totalCost,
            unitCost,
            materialCost,
            laborCost,
            overheadCost,
          },
          createdBy: userId,
        });

        // 2. inventory.received — 제품 입고
        ctx.emit({
          tenantId,
          eventType: "inventory.received",
          aggregateType: "inventory",
          aggregateId: batch.productId,
          payload: {
            sourceType: "PRODUCTION",
            sourceId: batchId,
            quantity: actualQuantity,
            unit: "kg",
            unitCost,
            totalCost,
          },
          createdBy: userId,
        });

        // 3. journal.posted — 회계 분개
        ctx.emit({
          tenantId,
          eventType: "journal.posted",
          aggregateType: "journal_entry",
          aggregateId: journalEntryId,
          payload: {
            sourceType: "PRODUCTION",
            sourceId: batchId,
            totalDebit: totalCost,
            totalCredit: totalCost,
            description,
          },
          createdBy: userId,
        });

        console.log(
          `[productionCompleteV2] 배치 #${batchId} 생산 완료 ` +
          `(${actualQuantity}kg, 수율: ${actualYield.toFixed(2)}%, 이벤트 3건 발행)`,
        );
      },
    ],
  });

  return { alreadyProcessed };
}
