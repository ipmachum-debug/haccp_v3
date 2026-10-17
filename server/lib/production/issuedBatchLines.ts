/**
 * 배치 투입의 출고 여부 (2026-10-14, 2026-10-17 보강)
 *
 * h_batch_inputs.inventory_deducted 는 "LOT 을 실제로 차감했는가" 플래그다. 재고 마스터가 없거나
 * FEFO 가 실패하면 과거 자동출고는 LOT 없이 출고 기록(h_inventory_transactions, lot_id NULL)만 남기고
 * 플래그는 0 으로 뒀다 (덤프 10/14 기준 755건, 음수 허용 정책 10/8 이전 발생분).
 * 플래그만 보고 재실행하면 같은 투입이 두 번 출고되므로, 자동출고는 출고 원장(줄 id 연결)을 함께 본다.
 *
 * ★ 2026-10-17 (Codex #552 검토 P2): 조회가 실패하면 빈 집합으로 계속하지 않는다 — "출고 안 됨" 으로 추정하면
 *   재출고된다. 오류를 그대로 던진다.
 */
import { getRawConnection } from "../../db/connection";

/** 줄 출고 원장 조건 — 신규(BATCH)·구형(batch_completion) 모두, 줄 id 로 연결된 것만 */
export const ISSUED_LINE_SOURCE_TYPES = ["BATCH", "batch_completion"] as const;

export async function getIssuedBatchLineIds(batchId: number, tenantId: number, conn?: any): Promise<Set<number>> {
  const ids = new Set<number>();
  const c = conn ?? (await getRawConnection());
  const [rows]: any = await c.execute(
    `SELECT DISTINCT source_line_id FROM h_inventory_transactions
     WHERE source_type IN ('BATCH', 'batch_completion') AND source_id = ?
       AND transaction_type = 'usage' AND tenant_id = ? AND source_line_id IS NOT NULL`,
    [batchId, tenantId],
  );
  for (const r of rows as any[]) ids.add(Number(r.source_line_id));
  return ids;
}

/**
 * 아직 출고되지 않은 투입 줄 수 — 플래그 0 이고, 줄 id 로 연결된 출고 원장도 없고, 수량 > 0.
 * 이 수가 0 이 아니면 제품 LOT 생성·생산원가 확정(생산완료 분개)을 하지 않는다 (Codex #552 검토 P1).
 * 조회 실패는 throw.
 */
export async function countUnissuedBatchLines(batchId: number, tenantId: number, conn?: any): Promise<number> {
  const c = conn ?? (await getRawConnection());
  const [rows]: any = await c.execute(
    `SELECT COUNT(*) AS n FROM h_batch_inputs bi
      WHERE bi.batch_id = ? AND bi.tenant_id = ?
        AND COALESCE(bi.inventory_deducted, 0) = 0
        AND COALESCE(bi.actual_quantity, bi.planned_quantity, 0) > 0
        AND NOT EXISTS (
          SELECT 1 FROM h_inventory_transactions t
           WHERE t.tenant_id = bi.tenant_id AND t.source_id = bi.batch_id AND t.source_line_id = bi.id
             AND t.transaction_type = 'usage' AND t.source_type IN ('BATCH', 'batch_completion'))`,
    [batchId, tenantId],
  );
  return Number((rows as any[])[0]?.n ?? 0);
}
