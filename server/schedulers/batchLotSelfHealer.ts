/**
 * 배치 완제품 LOT 자가치유 (Self-Healer) — 완료경로 파편화 봉인 (단절3)
 * ============================================================================
 * 배경:
 *   배치를 'completed' 로 만드는 경로가 5개+ 로 흩어져 있고(completeBatch /
 *   updateBatchStatus / finalApprove(batch/document) / batchApproveChecklists …),
 *   새 경로가 계속 발견됨. 한 경로를 고쳐도 다른 경로가 실제 트래픽을 타서
 *   "완료됐는데 완제품 LOT 0건" 이 재발했다(26배치 → 174 백로그).
 *
 *   경로를 하나씩 막는 whack-a-mole 대신, 결과 상태로 자가치유한다:
 *   "status='completed' 인데 완제품 LOT 이 0" 인 배치를 주기적으로 찾아
 *   ensureBatchLots(멱등) + runBatchCompletionHooks 를 돌린다.
 *   → 어느 경로로 완료됐든(알려졌든 미지든) LOT 이 보장됨. 재발 구조적 봉인.
 *
 *   원재료측 recomputeAggregateFromLots(자가치유 집계)의 완료-이벤트 판(版).
 *
 * 안전:
 *   - ensureBatchLots 는 멱등(이미 LOT 있으면 skip) → 중복 생성 없음.
 *   - 완료된 배치만 대상(status='completed'). 진행중/계획 배치는 안 건드림.
 *   - 한 배치 실패가 다른 배치를 막지 않음(개별 try/catch).
 *   - 스케줄러는 최근 window + limit 로 가볍게, 수동 트리거는 전체 백로그.
 */

import { getRawConnection } from "../db/connection";

export interface HealResult {
  scanned: number;
  healed: number;       // LOT 이 실제로 생성된 배치 수
  lotsCreated: number;  // 생성된 LOT 총 건수
  skipped: number;      // ensureBatchLots 가 skip (수량 0 등)
  failed: number;
  details: Array<{ batchId: number; tenantId: number; created: number; skipped?: string; error?: string }>;
}

export interface HealOptions {
  tenantId?: number;   // 지정 시 해당 테넌트만
  limit?: number;      // 한 번에 처리할 최대 배치 수 (기본 200)
  sinceDays?: number;  // 최근 N일 완료분만 (미지정 시 전체 백로그)
  runHooks?: boolean;  // runBatchCompletionHooks 실행 여부 (기본 true)
}

/**
 * 완료·완제품LOT없음 배치를 찾아 LOT 을 소급 생성(자가치유).
 * @returns 처리 요약
 */
export async function healIncompleteBatchLots(opts: HealOptions = {}): Promise<HealResult> {
  const limit = Math.max(1, Math.min(opts.limit ?? 200, 1000));
  const result: HealResult = { scanned: 0, healed: 0, lotsCreated: 0, skipped: 0, failed: 0, details: [] };

  const pool = await getRawConnection();
  if (!pool) return result;

  // 대상: 완료됐는데 완제품 LOT(product_id) 이 0인 배치
  const where: string[] = ["b.status = 'completed'"];
  const params: any[] = [];
  if (opts.tenantId != null) { where.push("b.tenant_id = ?"); params.push(opts.tenantId); }
  if (opts.sinceDays != null) { where.push("b.updated_at >= DATE_SUB(NOW(), INTERVAL ? DAY)"); params.push(opts.sinceDays); }
  where.push(
    "NOT EXISTS (SELECT 1 FROM h_inventory_lots l " +
    "WHERE l.batch_id = b.id AND l.tenant_id = b.tenant_id AND l.product_id IS NOT NULL)",
  );

  const [rows]: any = await pool.execute(
    `SELECT b.id, b.tenant_id
       FROM h_batches b
      WHERE ${where.join(" AND ")}
      ORDER BY b.id DESC
      LIMIT ${limit}`,
    params,
  );
  const targets = rows as Array<{ id: number; tenant_id: number }>;
  result.scanned = targets.length;
  if (targets.length === 0) return result;

  const { ensureBatchLots } = await import("../db/production/productOutboundManagement");
  const runHooks = opts.runHooks !== false;
  let runBatchCompletionHooks: any = null;
  if (runHooks) {
    ({ runBatchCompletionHooks } = await import("../lib/production/batchCompletionHooks"));
  }

  for (const t of targets) {
    const batchId = Number(t.id);
    const tenantId = Number(t.tenant_id);
    try {
      const r: any = await ensureBatchLots(batchId, tenantId);
      const created = r?.created?.length ?? 0;
      if (created > 0) {
        result.healed++;
        result.lotsCreated += created;
      } else {
        result.skipped++;
      }
      result.details.push({ batchId, tenantId, created, skipped: created === 0 ? (r?.reason ?? "no_lot") : undefined });

      if (runHooks && created > 0) {
        try {
          await runBatchCompletionHooks(batchId, tenantId, { source: "manual" });
        } catch { /* 훅 실패는 LOT 생성을 막지 않음 */ }
      }
    } catch (e: any) {
      result.failed++;
      result.details.push({ batchId, tenantId, created: 0, error: String(e?.message || e).slice(0, 120) });
    }
  }

  console.log(
    `[batchLotSelfHealer] scanned=${result.scanned} healed=${result.healed} ` +
    `lotsCreated=${result.lotsCreated} skipped=${result.skipped} failed=${result.failed}`,
  );
  return result;
}
