/**
 * 배치 완료 통합 훅 (PR #274)
 * ============================================================================
 *
 * 배경:
 *   배치를 'completed' 로 만드는 경로가 3개 있고, 각자 부분적인 후처리만 했음.
 *
 *   Path 1: server/db/production/batchLifecycle.ts:completeBatch()
 *           — 메인 경로 (router/production/batch.lifecycle.router.ts:475)
 *   Path 2: (제거됨 2026-10-12) productionCompletePost{V2} — 유령 receipt 원장만 쓰던 경로.
 *           승인(finalApproveRequest)은 이제 ensureBatchLots 만 호출.
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

// ⚠️ 배럴(`../../db`) 대신 소스 모듈에서 직접 import — no-circular 규칙 준수.
//   `../../db` 배럴은 batchFunctions/batchCRUD/productAndCcp 를 재export 하므로,
//   여기서 배럴을 import 하면 batchCompletionHooks → db → batch* → batchCompletionHooks
//   순환의존 3건이 형성됨(arch:check FAILURE). getRawConnection 은 db/connection 소유.
import { getRawConnection } from "../../db/connection";

export interface BatchCompletionHookOptions {
  /** 호출 출처 식별 (로깅용) */
  source: "completeBatch" | "updateBatchStatus" | "manual";
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

  // ── (3-b) 배치 원가 확정 (actual_cost · cost_finalized_at) — 원료가 다 출고된 뒤 한 번 ──
  // 2026-10-17 (Codex #553 검토 P2): completeBatch 안에서만 하던 확정을 공통 후처리로. 첫 완료가 미출고로 보류되면
  //   재출고 뒤 자가치유가 이 훅을 부를 때 확정된다. 이미 확정된 배치는 그대로 (재호출 무변경).
  try {
    const fin = await finalizeBatchCost(pool, batchId, tenantId);
    if (fin === "materials_not_issued") result.warnings.push("배치 원가 확정 보류: 원료 미출고");
    if (typeof fin === "object" && fin.status === "journal_mismatch") {
      const msg = `[COST_MISMATCH] 배치 #${batchId} 원가 확정 보류 — 기존 생산완료 분개 ${fin.journalAmount} ≠ 현재 출고 원가 ${fin.issuedCost} (차이 ${fin.diff}). 승인된 정정 절차 필요`;
      result.warnings.push(msg);
      console.warn(`[batchCompletionHooks:${opts.source}] ${msg}`);
    }
  } catch (e: any) {
    result.errors.push(`배치 원가 확정 실패: ${e?.message || e}`);
  }

  // ── (4) 생산완료 회계 전기 (차변 제품 / 대변 원재료) + 제품 LOT 단가 = 생산원가 (같은 트랜잭션) ──
  // 2026-10-12: 운영에서 한 번도 전기된 적 없던 공백. 전기 시작일 이후 완료 배치만, 멱등.
  try {
    const { postProductionCompletionJournal } = await import("./productionCompletionJournal");
    const jr = await postProductionCompletionJournal({ batchId, tenantId, userId: 1 });
    if (!jr.posted && jr.reason !== "already" && jr.reason !== "before_start" && jr.reason !== "disabled") {
      result.warnings.push(`생산완료 분개 건너뜀: ${jr.reason}${jr.detail ? ` (${jr.detail})` : ""}`);
    }
    // 제품 LOT 단가 = 생산원가는 분개와 같은 트랜잭션에서 적용된다 (productLotUnitCost)
    if (jr.posted && !jr.lotCost.applied) {
      result.warnings.push(`제품 LOT 원가 단가 미적용: ${jr.lotCost.reason}${jr.lotCost.detail ? ` (${jr.lotCost.detail})` : ""}`);
    }
  } catch (e: any) {
    result.errors.push(`생산완료 분개 실패: ${e?.message || e}`);
  }

  return result;
}

/**
 * 배치 원가 확정 — 출고된 투입 행 금액 합(정제수 제외) 을 actual_cost 로, cost_finalized_at 기록.
 * 미출고 줄이 있으면 하지 않는다. 이미 확정(cost_finalized_at) 된 배치는 바꾸지 않는다.
 */
export type FinalizeBatchCostResult =
  | "finalized" | "already" | "materials_not_issued" | "zero" | "not_completed"
  | { status: "journal_mismatch"; journalAmount: number; issuedCost: number; diff: number };

/**
 * ★ 2026-10-17 (Codex #555 검증 P2): 이미 생산완료 분개가 전기된 배치(복구 경로)는 그 분개가 장부 정본이다.
 *   현재 출고 원가와 같으면 그 값으로 확정, 다르면 확정을 보류하고 차이를 돌려준다 — 기존 전표·판매된 LOT 을 몰래
 *   재평가하지 않고, 배치 원가만 다른 값으로 확정해 세 값이 갈리지도 않게 한다 (정정은 승인된 절차로).
 */
export async function finalizeBatchCost(conn: any, batchId: number, tenantId: number): Promise<FinalizeBatchCostResult> {
  const { countUnissuedBatchLines } = await import("./issuedBatchLines");
  if ((await countUnissuedBatchLines(batchId, tenantId, conn)) > 0) return "materials_not_issued";
  const [bRows]: any = await conn.execute(
    `SELECT status, cost_finalized_at FROM h_batches WHERE id = ? AND tenant_id = ? LIMIT 1`, [batchId, tenantId],
  );
  const b = (bRows as any[])[0];
  if (!b || b.status !== "completed") return "not_completed";
  if (b.cost_finalized_at) return "already";
  const [sRows]: any = await conn.execute(
    `SELECT COALESCE(SUM(bi.total_price), 0) AS total
       FROM h_batch_inputs bi
       LEFT JOIN h_materials m ON m.id = bi.material_id AND m.tenant_id = bi.tenant_id
      WHERE bi.batch_id = ? AND bi.tenant_id = ? AND bi.inventory_deducted = 1
        AND NOT (COALESCE(m.material_name, '') LIKE '%정제수%' OR LOWER(COALESCE(m.material_name, '')) LIKE '%purified water%')`,
    [batchId, tenantId],
  );
  const total = Math.round((Number((sRows as any[])[0]?.total ?? 0) || 0) * 100) / 100;
  if (!(total > 0)) return "zero";
  const marker = `[생산완료] BATCH-${batchId}`;
  const [jRows]: any = await conn.execute(
    `SELECT total_debit FROM expense_journal_entries WHERE tenant_id = ? AND (description = ? OR description LIKE ?) LIMIT 1`,
    [tenantId, marker, `${marker} %`],
  );
  const j = (jRows as any[])[0];
  if (j) {
    const journalAmount = Math.round(Number(j.total_debit) * 100) / 100;
    if (Math.abs(journalAmount - total) > 0.01) {
      return { status: "journal_mismatch", journalAmount, issuedCost: total, diff: Math.round((total - journalAmount) * 100) / 100 };
    }
  }
  const [res]: any = await conn.execute(
    `UPDATE h_batches SET actual_cost = ?, cost_finalized_at = NOW()
      WHERE id = ? AND tenant_id = ? AND status = 'completed' AND cost_finalized_at IS NULL`,
    [total.toFixed(2), batchId, tenantId],
  );
  return Number(res?.affectedRows ?? 0) === 1 ? "finalized" : "already";
}
