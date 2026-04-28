/**
 * 배치 자동출고 v2 — 단일 트랜잭션 엔진 사용 (F2-2-a)
 *
 * ============================================================================
 * F-2 단일 트랜잭션 엔진 (PR #117 설계 / PR #124 인프라) 활용 시범.
 *
 * 기존 autoIssueMaterialsForBatch (autoMaterialIssue.ts) 와 차이:
 *
 * | 항목 | v1 (기존) | v2 (이 PR) |
 * | --- | --- | --- |
 * | 트랜잭션 보장 | ❌ 각 원재료 독립 try/catch | ✅ postWithinTransaction |
 * | 부분 차감 가능성 | ✅ 가능 (3종 차감 + 2종 실패) | ❌ 불가능 (전체 rollback) |
 * | 도메인 이벤트 | ❌ 없음 | ✅ batch.* 이벤트 outbox 발행 |
 * | LOT 매칭 실패 시 | lot_id=NULL fallback | (이번 PR — 단순화) v1 호환 |
 *
 * ============================================================================
 * 분할 정책 (F-2 로드맵, PR #117 / PR #124):
 *   F2-2-a (이 PR): v2 외각 + postWithinTransaction 사용 시범 (사용처 0)
 *   F2-2-b: allocateLotsFEFO 시그니처 확장 (conn 옵션) → v2 본격 LOT 할당
 *   F2-2-c: feature flag 점진 전환 (USE_AUTO_ISSUE_V2)
 *   F2-2-d: 검증 후 v1 제거
 *
 * ============================================================================
 * 본 PR 의 명시적 한계 (F2-2-a 단계):
 *   - LOT 할당은 단순화 (allocateLotsFEFO 통합 전).
 *     이번 PR 은 LOT 가용량 확인 + 단순 차감만 — 마스터-LOT mismatch 자동 보정,
 *     inventory_id 재매핑 등은 F2-2-b 에서 통합.
 *   - 사용처 0 — feature flag 후 점진 도입 예정.
 *   - 본 함수는 호출되지 않으므로 회귀 영향 0.
 * ============================================================================
 */

import { sql } from "drizzle-orm";
import { getDb } from "../../db";
import { postWithinTransaction } from "../_core";
import type { TransactionContext } from "../_core";
import { allocateLotsFEFO } from "../inventory/fefoLotAllocation";

/** v1 과 동일 result 타입 (호환성) */
export interface AutoIssueResultV2 {
  success: boolean;
  issuedMaterials: Array<{
    materialId: number;
    materialName: string;
    requiredQuantity: number;
    issuedQuantity: number;
    unit: string;
    lotAllocations: Array<{
      lotId: number;
      quantity: number;
      unitCost: number;
    }>;
  }>;
  totalCost: number;
  warnings: string[];
  errors: string[];
}

/**
 * 정제수 판별 — 원가 0 원재료 (v1 과 동일).
 */
function isWaterMaterial(materialName: string | null | undefined): boolean {
  if (!materialName) return false;
  const name = materialName.toLowerCase();
  return name.includes("정제수") || name.includes("purified water");
}

/**
 * 배치 일자 결정 — v1 의 resolveBatchTransactionDate 와 동일.
 */
function resolveBatchTransactionDate(batch: {
  completed_at?: any;
  planned_date?: any;
}): string {
  const candidate = batch?.completed_at ?? batch?.planned_date ?? null;
  const d = candidate ? new Date(candidate) : new Date();
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().split("T")[0];
}

/**
 * 배치 정보 + 투입 계획 read-only 조회.
 *
 * 트랜잭션 외부에서 실행 (read-only, 락 불필요).
 */
async function fetchBatchAndInputs(batchId: number): Promise<{
  batch: any;
  inputs: any[];
} | null> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const [batchRows]: any = await db.execute(sql`
    SELECT b.id, b.tenant_id, b.product_id, b.planned_quantity, b.status,
           b.completed_at, b.planned_date,
           p.product_name
    FROM h_batches b
    LEFT JOIN h_products_v2 p ON p.id = b.product_id AND p.tenant_id = b.tenant_id
    WHERE b.id = ${batchId}
    LIMIT 1
  `);
  const batch = (batchRows as any[])?.[0];
  if (!batch) return null;

  const tenantId = Number(batch.tenant_id);
  const [inputRows]: any = await db.execute(sql`
    SELECT bi.id, bi.material_id, bi.planned_quantity, bi.actual_quantity,
           bi.unit, bi.inventory_deducted, bi.process_group_id,
           m.material_name, m.material_code, m.unit_price
    FROM h_batch_inputs bi
    LEFT JOIN h_materials m ON m.id = bi.material_id AND m.tenant_id = bi.tenant_id
    WHERE bi.batch_id = ${batchId} AND bi.tenant_id = ${tenantId}
    ORDER BY bi.id
  `);

  return { batch, inputs: inputRows as any[] };
}

/**
 * 한 원재료 input 처리 — 단일 트랜잭션 안에서 호출됨 (F2-2-c).
 *
 * 정식 통합 (F2-2-c):
 *   1. h_inventory FOR UPDATE 락 (race condition 차단)
 *   2. allocateLotsFEFO(..., ctx.conn) 호출 — 같은 트랜잭션 안에서 LOT 할당
 *   3. 각 LOT 별 차감 (h_inventory_lots) + tx INSERT (lot_id 정상)
 *   4. h_inventory 차감
 *   5. h_batch_inputs 업데이트
 *   6. 도메인 이벤트 발행
 *
 * Fallback (FEFO 실패 시):
 *   - allocateLotsFEFO throw → catch 후 lot_id=NULL INSERT
 *   - v1 과 의미 동일하지만 같은 트랜잭션 안 (부분 차감 차단)
 *   - 사용 사례: LOT 자체 없는 원재료 (차조 / 삶은팥 등 4건 — Phase 2 백필 후 잔존)
 *   - warning 로 보고, batch 전체는 commit
 *
 * DB 에러 (allocateLotsFEFO 외):
 *   - throw → 전체 rollback (postWithinTransaction)
 *   - 부분 차감 영구 차단
 */
async function processOneInput(
  ctx: TransactionContext,
  input: any,
  batch: any,
  result: AutoIssueResultV2,
): Promise<void> {
  const materialId = Number(input.material_id);
  const requiredQuantity = parseFloat(input.planned_quantity?.toString() || "0");
  const unit = input.unit || "kg";
  const materialName = input.material_name || `원재료 #${materialId}`;
  const isWater = isWaterMaterial(materialName);
  const unitPrice = isWater ? 0 : parseFloat(input.unit_price?.toString() || "0");
  const transactionDate = resolveBatchTransactionDate(batch);
  const tenantId = ctx.tenantId;

  // 1. h_inventory FOR UPDATE 락 — race condition 차단
  const [invRows]: any = await ctx.conn.execute(
    `SELECT id, total_quantity, available_quantity
     FROM h_inventory
     WHERE material_id = ? AND tenant_id = ?
     LIMIT 1
     FOR UPDATE`,
    [materialId, tenantId],
  );
  const inventory = (invRows as any[])?.[0];

  let lotAllocations: Array<{ lotId: number; quantity: number; unitCost: number }> = [];
  let issuedQuantity = requiredQuantity;
  let materialCost = requiredQuantity * unitPrice;
  let fallbackToNull = false;

  if (inventory) {
    const inventoryId = Number(inventory.id);

    // 2. allocateLotsFEFO(..., ctx.conn) — 같은 트랜잭션 (F2-2-b 통합)
    try {
      const allocations = await allocateLotsFEFO(
        inventoryId,
        requiredQuantity,
        unit,
        tenantId,
        materialId,
        ctx.conn,
      );

      // 3. 각 LOT 별 차감 + tx INSERT (lot_id 정상)
      let totalAllocated = 0;
      let totalCost = 0;
      for (const alloc of allocations) {
        const amount = alloc.quantity * alloc.unitCost;

        // tx INSERT (lot_id = alloc.lotId — 정상)
        await ctx.conn.execute(
          `INSERT INTO h_inventory_transactions
           (inventory_id, lot_id, material_id, transaction_type, quantity, unit,
            unit_cost, amount, transaction_date, source_type, source_id, source_line_id,
            action_type, purpose, performed_by, created_by, tenant_id)
           VALUES
           (?, ?, ?, 'usage', ?, ?, ?, ?, ?, 'BATCH', ?, ?, 'AUTO_ISSUE', 'production',
            ?, ?, ?)`,
          [
            inventoryId,
            alloc.lotId,
            materialId,
            alloc.quantity.toString(),
            unit,
            alloc.unitCost.toString(),
            amount.toString(),
            transactionDate,
            ctx.sourceId,
            input.id,
            ctx.userId ?? null,
            ctx.userId ?? null,
            tenantId,
          ],
        );

        // LOT 차감 (h_inventory_lots)
        await ctx.conn.execute(
          `UPDATE h_inventory_lots
           SET available_quantity = GREATEST(available_quantity - ?, 0)
           WHERE id = ?`,
          [alloc.quantity, alloc.lotId],
        );

        totalAllocated += alloc.quantity;
        totalCost += amount;
        lotAllocations.push({
          lotId: alloc.lotId,
          quantity: alloc.quantity,
          unitCost: alloc.unitCost,
        });
      }

      issuedQuantity = totalAllocated;
      materialCost = totalCost;

      // 4. h_inventory 차감 (총 재고)
      await ctx.conn.execute(
        `UPDATE h_inventory
         SET total_quantity = GREATEST(total_quantity - ?, 0),
             available_quantity = GREATEST(available_quantity - ?, 0),
             last_updated = NOW()
         WHERE id = ?`,
        [issuedQuantity.toString(), issuedQuantity.toString(), inventoryId],
      );
    } catch (fefoErr: any) {
      // FEFO 실패 (LOT 0건 또는 가용량 부족) — fallback (lot_id=NULL)
      // v1 과 의미 동일. 같은 트랜잭션 안이라 다른 원재료 영향 없음.
      console.warn(
        `[autoIssueV2] FEFO 실패 → lot_id=NULL fallback ` +
        `material=${materialId}/${materialName} batch=${ctx.sourceId} ` +
        `err="${fefoErr.message}"`,
      );
      result.warnings.push(
        `${materialName}: FEFO 할당 실패, lot_id=NULL fallback (${fefoErr.message})`,
      );
      fallbackToNull = true;
    }
  } else {
    // h_inventory 자체 없음 — fallback
    result.warnings.push(`${materialName}: 재고 레코드 없음. lot_id=NULL fallback`);
    fallbackToNull = true;
  }

  // Fallback INSERT — FEFO 실패 또는 inventory 부재
  if (fallbackToNull) {
    await ctx.conn.execute(
      `INSERT INTO h_inventory_transactions
       (lot_id, material_id, transaction_type, quantity, unit, unit_cost, amount,
        transaction_date, source_type, source_id, source_line_id,
        action_type, purpose, performed_by, created_by, tenant_id,
        reference_type, reference_id, notes)
       VALUES
       (NULL, ?, 'usage', ?, ?, ?, ?, ?, 'BATCH', ?, ?, 'AUTO_ISSUE', 'production',
        ?, ?, ?, 'batch', ?, ?)`,
      [
        materialId,
        requiredQuantity.toString(),
        unit,
        unitPrice.toString(),
        (requiredQuantity * unitPrice).toString(),
        transactionDate,
        ctx.sourceId,
        input.id,
        ctx.userId ?? null,
        ctx.userId ?? null,
        tenantId,
        ctx.sourceId,
        `${materialName} 자동출고 v2 (재고미등록 fallback)`,
      ],
    );
  }

  // 5. h_batch_inputs UPDATE — 효과적 단가 (LOT 가중평균 또는 폴백)
  const effectiveUnitPrice = isWater
    ? 0
    : lotAllocations.length > 0 && issuedQuantity > 0
      ? materialCost / issuedQuantity
      : unitPrice;
  await ctx.conn.execute(
    `UPDATE h_batch_inputs
     SET inventory_deducted = 1,
         actual_quantity = ?,
         unit_price = ?,
         total_price = ?,
         input_time = NOW(),
         input_by = ?
     WHERE id = ? AND tenant_id = ?`,
    [
      issuedQuantity.toString(),
      effectiveUnitPrice.toFixed(2),
      (isWater ? 0 : materialCost).toFixed(2),
      ctx.userId ?? null,
      input.id,
      tenantId,
    ],
  );

  // 6. 도메인 이벤트 발행 (commit 시 outbox INSERT)
  ctx.emit({
    tenantId: ctx.tenantId,
    eventType: "batch.material_consumed",
    aggregateType: "batch_input",
    aggregateId: Number(input.id),
    payload: {
      batchId: ctx.sourceId,
      materialId,
      materialName,
      quantity: issuedQuantity,
      unit,
      lotMatched: !fallbackToNull,
      lotCount: lotAllocations.length,
    },
    createdBy: ctx.userId ?? null,
  });

  result.issuedMaterials.push({
    materialId,
    materialName,
    requiredQuantity,
    issuedQuantity,
    unit,
    lotAllocations,
  });
  result.totalCost += isWater ? 0 : materialCost;
}

/**
 * 배치 자동출고 v2 — 단일 트랜잭션 보장.
 *
 * v1 (autoIssueMaterialsForBatch) 와 차이:
 *   - 모든 원재료 차감 + 회계 분개가 단일 postWithinTransaction 안에서 실행
 *   - 어느 원재료에서 throw 시 전체 rollback (부분 차감 불가능)
 *   - 도메인 이벤트 outbox 발행 (rollback 시 자동 폐기)
 *
 * 사용처: 0 (이번 PR — 인프라 시범, feature flag 도입 후 점진 전환)
 */
export async function autoIssueMaterialsForBatchV2(
  batchId: number,
  userId: number,
): Promise<AutoIssueResultV2> {
  const result: AutoIssueResultV2 = {
    success: true,
    issuedMaterials: [],
    totalCost: 0,
    warnings: [],
    errors: [],
  };

  // (1) read-only 조회 — 트랜잭션 외부 (락 불필요)
  const fetched = await fetchBatchAndInputs(batchId);
  if (!fetched) {
    throw new Error(`배치 ID ${batchId}를 찾을 수 없습니다.`);
  }
  const { batch, inputs } = fetched;

  const plannedQuantity = parseFloat(batch.planned_quantity?.toString() || "0");
  if (plannedQuantity <= 0) {
    throw new Error("계획 수량이 0 이하입니다.");
  }
  if (inputs.length === 0) {
    result.warnings.push(`배치 #${batchId}에 원재료 투입 계획이 없습니다.`);
    return result;
  }
  if (inputs.every((bi: any) => Number(bi.inventory_deducted) === 1)) {
    result.warnings.push(`배치 #${batchId} 원재료가 이미 전량 출고되었습니다.`);
    return result;
  }

  const tenantId = Number(batch.tenant_id);

  try {
    // (2) 단일 트랜잭션 — 모든 원재료 + 배치 cost 한 번에
    await postWithinTransaction({
      sourceType: "BATCH",
      sourceId: batchId,
      tenantId,
      userId,
      operationName: `autoIssueV2:${batchId}`,
      actions: [
        // (i) 모든 원재료 처리 — 하나라도 throw 시 전체 rollback
        async (ctx) => {
          for (const input of inputs) {
            if (Number(input.inventory_deducted) === 1) continue;
            await processOneInput(ctx, input, batch, result);
          }
        },
        // (ii) 배치 cost 업데이트 + 이벤트
        async (ctx) => {
          if (result.totalCost <= 0) return;
          await ctx.conn.execute(
            `UPDATE h_batches SET planned_cost = ? WHERE id = ?`,
            [result.totalCost.toFixed(2), batchId],
          );
          ctx.emit({
            tenantId: ctx.tenantId,
            eventType: "batch.cost_updated",
            aggregateType: "batch",
            aggregateId: batchId,
            payload: {
              totalCost: result.totalCost,
              materialCount: result.issuedMaterials.length,
            },
            createdBy: userId,
          });
        },
      ],
    });
  } catch (err: any) {
    result.success = false;
    result.errors.push(err.message ?? "단일 트랜잭션 실패 — 전체 rollback");
    throw err;
  }

  return result;
}
