/**
 * 소급 재고 차감 서비스
 *
 * 백업 데이터 임포트 등으로 autoMaterialIssue가 실행되지 않은 배치들을 대상으로
 * h_batch_inputs.inventory_deducted = 0인 레코드를 찾아 일괄 소급 차감
 *
 * 처리 순서:
 * 1. inventory_deducted = 0인 h_batch_inputs 조회 (배치 상태: in_progress 또는 completed)
 * 2. 각 배치에 대해 autoIssueMaterialsForBatch() 호출
 * 3. 결과 집계 (성공/실패/경고)
 */

import { getDb } from "../db";
import { sql } from "drizzle-orm";

interface RetroactiveDeductionParams {
  tenantId: number;
  userId: number;
  batchId?: number;    // 특정 배치만 처리
  dryRun?: boolean;    // true면 시뮬레이션만
}

interface RetroactiveDeductionResult {
  success: boolean;
  processedBatches: number;
  totalDeducted: number;
  totalCost: number;
  details: Array<{
    batchId: number;
    batchNumber: string;
    status: string;
    materialsIssued: number;
    cost: number;
    warnings: string[];
    errors: string[];
  }>;
  skippedBatches: number;
  errors: string[];
}

export async function retroactiveInventoryDeduction(
  params: RetroactiveDeductionParams
): Promise<RetroactiveDeductionResult> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result: RetroactiveDeductionResult = {
    success: true,
    processedBatches: 0,
    totalDeducted: 0,
    totalCost: 0,
    details: [],
    skippedBatches: 0,
    errors: []
  };

  try {
    // 1. inventory_deducted = 0인 batch_inputs가 있는 배치 조회
    //    배치 상태가 in_progress 또는 completed인 것만 (planned는 아직 시작 전이므로 제외)
    let batchFilter = '';
    if (params.batchId) {
      batchFilter = `AND b.id = ${params.batchId}`;
    }

    const [batchRows]: any = await db.execute(sql.raw(`
      SELECT DISTINCT b.id, b.batch_number, b.status, b.created_by,
             COUNT(bi.id) AS pending_inputs,
             SUM(bi.planned_quantity) AS total_planned_qty
      FROM h_batches b
      INNER JOIN h_batch_inputs bi ON bi.batch_id = b.id AND bi.tenant_id = b.tenant_id
      WHERE b.tenant_id = ${params.tenantId}
        AND b.status IN ('in_progress', 'completed')
        AND bi.inventory_deducted = 0
        ${batchFilter}
      GROUP BY b.id, b.batch_number, b.status, b.created_by
      ORDER BY b.id
    `));

    const batches = batchRows as any[];

    if (!batches || batches.length === 0) {
      result.errors.push("소급 차감 대상 배치가 없습니다. (모든 배치의 원재료가 이미 차감됨)");
      return result;
    }

    console.log(`[retroactiveDeduction] 소급 차감 대상: ${batches.length}개 배치 (tenantId: ${params.tenantId})`);

    if (params.dryRun) {
      // 시뮬레이션 모드 - 실제 차감 없이 대상 목록만 반환
      for (const batch of batches) {
        result.details.push({
          batchId: batch.id,
          batchNumber: batch.batch_number || `B-${batch.id}`,
          status: batch.status,
          materialsIssued: Number(batch.pending_inputs),
          cost: 0,
          warnings: [`[DRY RUN] 미차감 원재료 ${batch.pending_inputs}건, 계획수량 ${batch.total_planned_qty}`],
          errors: []
        });
      }
      result.processedBatches = batches.length;
      return result;
    }

    // 2. 각 배치에 대해 autoIssueMaterialsForBatch 실행
    const { autoIssueMaterialsForBatch } = await import("../lib/autoMaterialIssue");

    for (const batch of batches) {
      const batchId = Number(batch.id);
      const batchNumber = batch.batch_number || `B-${batchId}`;
      const userId = params.userId || Number(batch.created_by) || 1;

      try {
        console.log(`[retroactiveDeduction] 배치 #${batchId} (${batchNumber}) 소급 차감 시작...`);

        const issueResult = await autoIssueMaterialsForBatch(batchId, userId);

        result.processedBatches++;
        result.totalDeducted += issueResult.issuedMaterials.length;
        result.totalCost += issueResult.totalCost;

        result.details.push({
          batchId,
          batchNumber,
          status: batch.status,
          materialsIssued: issueResult.issuedMaterials.length,
          cost: issueResult.totalCost,
          warnings: issueResult.warnings,
          errors: issueResult.errors
        });

        if (!issueResult.success) {
          result.errors.push(`배치 #${batchId}: 일부 오류 발생`);
        }

        console.log(`[retroactiveDeduction] 배치 #${batchId} 완료: ${issueResult.issuedMaterials.length}건 차감, ${issueResult.totalCost.toFixed(0)}원`);
      } catch (batchErr: any) {
        result.errors.push(`배치 #${batchId} (${batchNumber}): ${batchErr.message}`);
        result.details.push({
          batchId,
          batchNumber,
          status: batch.status,
          materialsIssued: 0,
          cost: 0,
          warnings: [],
          errors: [batchErr.message]
        });
      }
    }

    console.log(`[retroactiveDeduction] 소급 차감 완료: ${result.processedBatches}/${batches.length}개 배치, 총 ${result.totalDeducted}건 원재료, ${result.totalCost.toFixed(0)}원`);

  } catch (error: any) {
    console.error("[retroactiveDeduction] 소급 차감 오류:", error);
    result.success = false;
    result.errors.push(error.message || "알 수 없는 오류");
  }

  return result;
}
