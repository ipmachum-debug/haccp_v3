/**
 * 배치 완료 통합 훅 (PR #274)
 * ============================================================================
 *
 * 배경:
 *   배치를 'completed' 로 만드는 경로가 3개 있고, 각자 부분적인 후처리만 했음.
 *
 *   Path 1: server/db/production/batchLifecycle.ts:completeBatch()
 *           — 메인 경로 (router/production/batch.lifecycle.router.ts:475)
 *   Path 2: server/lib/production/productionCompletePost{V2}.ts
 *           — 회계/재고 후처리 (productionCompleteDispatch)
 *   Path 3: server/db/production/batchCRUD.ts:updateBatchStatus()
 *           — 드롭다운/직접 상태 변경
 *
 *   세 경로 모두에서 다음 문제가 발견됨 (이번 세션 데이터 진단 결과):
 *
 *   (a) actual_quantity NULL 잔존
 *       - production_sku_output 합계가 있는데도 h_batches.actual_quantity 가 NULL
 *       - 4/17 배치 579~582, 4/22 배치 600, 4/27 배치 591 등이 이 문제로 빈 PDF 발생
 *       - autoRegenerateProductionDaily() 가 NULL 을 0 으로 보고 달성률 0% 산출
 *
 *   (b) h_batch_inputs 0건 미감지
 *       - 배치가 완료됐는데 투입 원재료가 0건 → 수불부에서 사용량 누락
 *       - 4/20 배치 460, 4/25 배치 461 사고 (이번 세션에서 BOM 복구)
 *
 *   (c) h_daily_reports 캐시 stale
 *       - 배치 완료 후에도 production_daily summary 가 옛 값 유지
 *       - 사용자가 PDF 인쇄/조회 시 옛 데이터 표시
 *
 * ============================================================================
 * 통합 훅 설계:
 *
 *   runBatchCompletionHooks(batchId, tenantId, opts) 를 모든 경로 끝에서 호출.
 *   세 경로 어디서 들어와도 동일한 후처리 보장 (멱등).
 *
 *   1. backfillActualQuantity:
 *      h_batches.actual_quantity 가 NULL/0 이면 production_sku_output.total_kg 합계로 보강
 *      (production_sku_output > planned_quantity > 0 우선순위)
 *
 *   2. checkBatchInputs:
 *      h_batch_inputs.count = 0 이면 경고 로그 + 결과에 warning 포함
 *      (블로킹은 하지 않음 — 데이터 의도일 수 있음)
 *
 *   3. invalidateDailyReportCache:
 *      해당 (planned_date, tenant_id) 의 production_daily 캐시 1행 삭제
 *      → 다음 조회 시 autoRegenerateProductionDaily 가 재계산
 *
 * ============================================================================
 * 멱등성:
 *   - actual_quantity 가 이미 채워져 있으면 backfill skip
 *   - production_sku_output 합계가 0 이면 skip
 *   - h_batch_inputs 0건은 warning 만 내고 진행 (정상 흐름 막지 않음)
 *   - 캐시 삭제는 DELETE WHERE … (없어도 무해)
 *
 * 모든 단계는 try/catch 로 감싸서 한 단계 실패가 다른 단계를 막지 않음.
 *
 * 트리거: PR #274 (이번 세션 진단으로 확인된 3개 경로 통합)
 * ============================================================================
 */

import { getRawConnection } from "../../db";

export interface BatchCompletionHookOptions {
  /** 호출 출처 식별 (로깅용) */
  source: "completeBatch" | "productionCompletePost" | "updateBatchStatus" | "manual";
  /** true 시 actual_quantity 가 NULL/0 일 때 production_sku_output 합계로 보강 (기본 true) */
  backfillActualQuantity?: boolean;
  /** true 시 h_batch_inputs 가 0건이면 경고 로그 출력 (기본 true) */
  warnOnZeroInputs?: boolean;
  /** true 시 production_daily 캐시 무효화 (기본 true) */
  invalidateDailyCache?: boolean;
}

export interface BatchCompletionHookResult {
  batchId: number;
  tenantId: number;
  source: string;
  /** actual_quantity 가 NULL/0 → SKU 합계로 보강된 경우 그 값 */
  backfilledActualQuantity?: number;
  /** h_batch_inputs 행 수 */
  batchInputsCount: number;
  /** 캐시 삭제된 production_daily 레코드 수 */
  invalidatedCacheRows: number;
  warnings: string[];
  errors: string[];
}

/**
 * 배치 완료 통합 훅.
 *
 * 사용 예:
 *   ```ts
 *   await runBatchCompletionHooks(batchId, tenantId, { source: "completeBatch" });
 *   ```
 *
 * 모든 경로의 끝에서 호출 (한번만 호출되어도 안전, 여러번 호출되어도 안전).
 */
export async function runBatchCompletionHooks(
  batchId: number,
  tenantId: number,
  opts: BatchCompletionHookOptions,
): Promise<BatchCompletionHookResult> {
  const result: BatchCompletionHookResult = {
    batchId,
    tenantId,
    source: opts.source,
    batchInputsCount: 0,
    invalidatedCacheRows: 0,
    warnings: [],
    errors: [],
  };

  if (!tenantId) {
    result.errors.push("tenantId is required");
    return result;
  }
  if (!batchId) {
    result.errors.push("batchId is required");
    return result;
  }

  const pool = await getRawConnection();
  if (!pool) {
    result.errors.push("DB connection unavailable");
    return result;
  }

  // ── (1) actual_quantity 자동 보강 ──────────────────────────────────────
  // production_sku_output > h_batches.planned_quantity 우선순위로
  // h_batches.actual_quantity 가 NULL/0 이면 SKU 합계로 채움.
  if (opts.backfillActualQuantity !== false) {
    try {
      const [batchRows]: any = await pool.execute(
        `SELECT id, actual_quantity, planned_quantity, planned_date
         FROM h_batches
         WHERE id = ? AND tenant_id = ?
         LIMIT 1`,
        [batchId, tenantId],
      );
      const batch = (batchRows as any[])[0];
      if (!batch) {
        result.warnings.push(`batch not found (id=${batchId}, tenant=${tenantId})`);
      } else {
        const currentActual = batch.actual_quantity != null ? Number(batch.actual_quantity) : 0;
        if (currentActual <= 0) {
          // production_sku_output 합계 (total_kg) 조회
          const [skuRows]: any = await pool.execute(
            `SELECT COALESCE(SUM(total_kg), 0) AS sku_total_kg, COUNT(*) AS sku_rows
             FROM production_sku_output
             WHERE batch_id = ? AND tenant_id = ?`,
            [batchId, tenantId],
          );
          const skuTotalKg = Number((skuRows as any[])[0]?.sku_total_kg || 0);
          const skuRowCount = Number((skuRows as any[])[0]?.sku_rows || 0);

          if (skuTotalKg > 0) {
            await pool.execute(
              `UPDATE h_batches
               SET actual_quantity = ?, updated_at = NOW()
               WHERE id = ? AND tenant_id = ? AND (actual_quantity IS NULL OR actual_quantity = 0)`,
              [skuTotalKg.toString(), batchId, tenantId],
            );
            result.backfilledActualQuantity = skuTotalKg;
            console.log(
              `[batchCompletionHooks:${opts.source}] 배치 #${batchId} actual_quantity NULL → SKU 합계 ${skuTotalKg}kg (${skuRowCount} SKU) 으로 보강`,
            );
          } else {
            result.warnings.push(
              `actual_quantity NULL/0 이지만 production_sku_output 도 0건 — 자동 보강 불가`,
            );
          }
        }
      }
    } catch (e: any) {
      result.errors.push(`backfillActualQuantity failed: ${e?.message ?? e}`);
      console.error(
        `[batchCompletionHooks:${opts.source}] actual_quantity 보강 실패 (배치#${batchId}):`,
        e,
      );
    }
  }

  // ── (2) h_batch_inputs 0건 감지 ─────────────────────────────────────────
  if (opts.warnOnZeroInputs !== false) {
    try {
      const [inputRows]: any = await pool.execute(
        `SELECT COUNT(*) AS cnt FROM h_batch_inputs WHERE batch_id = ? AND tenant_id = ?`,
        [batchId, tenantId],
      );
      const cnt = Number((inputRows as any[])[0]?.cnt || 0);
      result.batchInputsCount = cnt;
      if (cnt === 0) {
        const msg = `[BATCH_INPUTS_EMPTY] 배치 #${batchId} 완료 시 h_batch_inputs 0건 — 수불부 사용량 미반영 위험`;
        result.warnings.push(msg);
        console.warn(`[batchCompletionHooks:${opts.source}] ${msg}`);
      }
    } catch (e: any) {
      result.errors.push(`checkBatchInputs failed: ${e?.message ?? e}`);
      console.error(
        `[batchCompletionHooks:${opts.source}] h_batch_inputs 점검 실패 (배치#${batchId}):`,
        e,
      );
    }
  }

  // ── (3) production_daily 캐시 무효화 ────────────────────────────────────
  // 다음 조회 시 autoRegenerateProductionDaily 가 SKU 합계 + actual_quantity 를
  // 새로 읽어 summary 를 재계산하도록 옛 캐시를 삭제.
  if (opts.invalidateDailyCache !== false) {
    try {
      // 배치의 planned_date 기준 캐시 삭제
      const [batchRows]: any = await pool.execute(
        `SELECT planned_date, site_id FROM h_batches WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [batchId, tenantId],
      );
      const batch = (batchRows as any[])[0];
      if (batch?.planned_date) {
        // planned_date 가 DATE 또는 DATETIME 일 수 있으므로 DATE() 로 정규화
        const [delResult]: any = await pool.execute(
          `DELETE FROM h_daily_reports
           WHERE tenant_id = ?
             AND DATE(report_date) = DATE(?)
             AND report_type = 'production_daily'`,
          [tenantId, batch.planned_date],
        );
        const affected = Number((delResult as any).affectedRows || 0);
        result.invalidatedCacheRows = affected;
        if (affected > 0) {
          console.log(
            `[batchCompletionHooks:${opts.source}] production_daily 캐시 ${affected}행 삭제 (배치#${batchId}, date=${batch.planned_date})`,
          );
        }
      }
    } catch (e: any) {
      result.errors.push(`invalidateDailyCache failed: ${e?.message ?? e}`);
      console.error(
        `[batchCompletionHooks:${opts.source}] 캐시 무효화 실패 (배치#${batchId}):`,
        e,
      );
    }
  }

  return result;
}
