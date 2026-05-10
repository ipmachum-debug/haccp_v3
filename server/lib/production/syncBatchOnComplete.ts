/**
 * 배치 완료 시 자동 동기화 헬퍼 — PR #274
 *
 * 배경:
 *   - completeBatch() 외에도 autoApprovalRequest.ts:281 등이 h_batches.status='completed'
 *     로 직접 UPDATE 하면서 actual_quantity 를 NULL 로 둠
 *   - production_sku_output 에는 SKU 실적이 정상 저장돼 있는데 h_batches 만 NULL
 *   - h_daily_reports 캐시가 stale 한 채로 남아 화면에 잘못 표시
 *   - 4/2, 4/17, 4/20, 4/22, 4/27 모두 같은 패턴으로 발생 (Genspark 수동 정정 — 2026-05-09)
 *
 * 처치:
 *   - 이 헬퍼를 모든 status='completed' 전환 경로에서 호출
 *   - production_sku_output SUM(total_kg) → h_batches.actual_quantity 자동 갱신
 *   - h_batch_inputs 누락 시 경고 (재고 차감 안 됨 → 흑임자 460/461 사고 패턴)
 *   - h_daily_reports 캐시 무효화 (재생성 트리거)
 *
 * 사용처:
 *   - server/db/production/batchLifecycle.ts (completeBatch)
 *   - server/lib/autoApprovalRequest.ts (batch_production 승인 시)
 *   - 추후 다른 경로 추가 시 함께 호출
 */

import { getRawConnection } from "../../db";

export interface SyncBatchResult {
  batchId: number;
  /** sku_output 합계 기반 자동 갱신 여부 */
  actualQuantitySynced: boolean;
  /** 갱신된 값 (kg) */
  syncedActualKg: number | null;
  /** 갱신된 yield (%) */
  syncedActualYield: number | null;
  /** h_batch_inputs 행 수 (0 이면 재고 차감 안 됨, 알람) */
  batchInputCount: number;
  /** 무효화된 h_daily_reports 행 수 */
  invalidatedDailyReports: number;
  /** 경고 메시지 모음 */
  warnings: string[];
}

/**
 * 배치 완료 후 자동 동기화 작업.
 * - actual_quantity 가 NULL/0 이면 production_sku_output 합계로 채움
 * - h_batch_inputs 0 행이면 경고 (재고 차감 누락)
 * - h_daily_reports 캐시 무효화
 *
 * 멱등성: 여러 번 호출해도 안전.
 */
export async function syncBatchOnComplete(
  batchId: number,
  tenantId: number,
): Promise<SyncBatchResult> {
  const result: SyncBatchResult = {
    batchId,
    actualQuantitySynced: false,
    syncedActualKg: null,
    syncedActualYield: null,
    batchInputCount: 0,
    invalidatedDailyReports: 0,
    warnings: [],
  };

  if (!tenantId) {
    result.warnings.push("[P0 보안] syncBatchOnComplete: tenantId 누락");
    return result;
  }

  const conn = await getRawConnection();
  if (!conn) {
    result.warnings.push("DB 연결 실패");
    return result;
  }

  // ─────────────────────────────────────────────────────
  // 1. 배치 정보 조회 (planned_date, planned_quantity, actual_quantity)
  // ─────────────────────────────────────────────────────
  const [batchRows]: any = await conn.execute(
    `SELECT planned_date, planned_quantity, actual_quantity, actual_yield
       FROM h_batches WHERE id = ? AND tenant_id = ? LIMIT 1`,
    [batchId, tenantId],
  );
  const batch = (batchRows as any[])[0];
  if (!batch) {
    result.warnings.push(`배치 #${batchId} 을 찾을 수 없습니다 (tenant=${tenantId})`);
    return result;
  }

  // ─────────────────────────────────────────────────────
  // 2. actual_quantity 자동 갱신 (NULL/0 인 경우만)
  //    → production_sku_output.total_kg SUM 으로 채움
  // ─────────────────────────────────────────────────────
  const currentActual = batch.actual_quantity != null ? Number(batch.actual_quantity) : null;
  const needsSync = currentActual == null || currentActual === 0;

  if (needsSync) {
    const [skuRows]: any = await conn.execute(
      `SELECT COALESCE(SUM(total_kg), 0) AS total_kg, COUNT(*) AS sku_count
         FROM production_sku_output
        WHERE batch_id = ? AND tenant_id = ?`,
      [batchId, tenantId],
    );
    const skuTotal = Number((skuRows as any[])[0]?.total_kg ?? 0);
    const skuCount = Number((skuRows as any[])[0]?.sku_count ?? 0);

    if (skuTotal > 0 && skuCount > 0) {
      const planned = Number(batch.planned_quantity || 0);
      const yieldPct = planned > 0 ? Math.round((skuTotal / planned) * 10000) / 100 : null;

      await conn.execute(
        `UPDATE h_batches
            SET actual_quantity = ?,
                actual_yield = ?
          WHERE id = ? AND tenant_id = ?
            AND (actual_quantity IS NULL OR actual_quantity = 0)`,
        [skuTotal, yieldPct, batchId, tenantId],
      );

      result.actualQuantitySynced = true;
      result.syncedActualKg = skuTotal;
      result.syncedActualYield = yieldPct;
      console.log(
        `[syncBatchOnComplete] 배치#${batchId} actual_quantity=${skuTotal}kg, yield=${yieldPct}% (${skuCount} SKU 합계)`,
      );
    } else {
      result.warnings.push(
        `배치 #${batchId}: actual_quantity 가 NULL/0 인데 production_sku_output 도 없음 — 작업자 SKU 입력 필요`,
      );
    }
  }

  // ─────────────────────────────────────────────────────
  // 3. h_batch_inputs 행 수 점검 (재고 차감 누락 알람)
  // ─────────────────────────────────────────────────────
  const [inputRows]: any = await conn.execute(
    `SELECT COUNT(*) AS cnt FROM h_batch_inputs
      WHERE batch_id = ? AND tenant_id = ?`,
    [batchId, tenantId],
  );
  result.batchInputCount = Number((inputRows as any[])[0]?.cnt ?? 0);

  if (result.batchInputCount === 0) {
    const warn = `배치 #${batchId}: h_batch_inputs 0 행 — 재고 차감 안 됨 (BOM 미적용 의심, 흑임자 460/461 패턴)`;
    result.warnings.push(warn);
    console.warn(`[syncBatchOnComplete] ⚠️ ${warn}`);
  }

  // ─────────────────────────────────────────────────────
  // 4. h_daily_reports 캐시 무효화 (planned_date 기준)
  //    → 다음 조회 시 자동 재생성됨
  // ─────────────────────────────────────────────────────
  if (batch.planned_date) {
    const dateStr =
      batch.planned_date instanceof Date
        ? batch.planned_date.toISOString().slice(0, 10)
        : String(batch.planned_date).slice(0, 10);
    try {
      const [delResult]: any = await conn.execute(
        `DELETE FROM h_daily_reports
          WHERE tenant_id = ?
            AND report_date = ?
            AND report_type IN ('production_daily', 'production')`,
        [tenantId, dateStr],
      );
      result.invalidatedDailyReports = Number((delResult as any)?.affectedRows ?? 0);
      if (result.invalidatedDailyReports > 0) {
        console.log(
          `[syncBatchOnComplete] 배치#${batchId} 의 ${dateStr} h_daily_reports ${result.invalidatedDailyReports} 행 무효화`,
        );
      }
    } catch (e: any) {
      result.warnings.push(`h_daily_reports 무효화 실패: ${e?.message ?? e}`);
    }
  }

  return result;
}
