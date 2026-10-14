/**
 * 배치 투입 중 이미 출고 기록이 있는 행 (2026-10-14)
 *
 * h_batch_inputs.inventory_deducted 는 "LOT 을 실제로 차감했는가" 플래그다. 재고 마스터가 없거나
 * FEFO 가 실패하면 자동출고는 LOT 없이 출고 기록(h_inventory_transactions, lot_id NULL)만 남기고
 * 플래그는 0 으로 둔다 (덤프 10/14 기준 755건, 음수 허용 정책 10/8 이전 발생분).
 * 플래그만 보고 재실행하면 같은 투입이 두 번 출고되므로, 자동출고는 이 집합을 함께 본다.
 * completeBatch 는 같은 방식의 방어가 이미 있다 (batchLifecycle.ts existingTxBatchIds).
 */
import { getRawConnection } from "../../db/connection";

export async function getIssuedBatchLineIds(batchId: number, tenantId: number): Promise<Set<number>> {
  const ids = new Set<number>();
  try {
    const conn = await getRawConnection();
    const [rows] = await conn.execute<any[]>(
      `SELECT DISTINCT source_line_id FROM h_inventory_transactions
       WHERE source_type IN ('BATCH', 'batch_completion') AND source_id = ?
         AND transaction_type = 'usage' AND tenant_id = ? AND source_line_id IS NOT NULL`,
      [batchId, tenantId],
    );
    for (const r of rows as any[]) ids.add(Number(r.source_line_id));
  } catch (err) {
    console.warn(`[issuedBatchLines] batch=${batchId} 조회 실패 — 플래그만으로 판단:`, err);
  }
  return ids;
}
