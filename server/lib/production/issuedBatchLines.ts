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

/**
 * 투입 줄(별칭 bi)이 이미 원장에 출고로 나타나 있는가 — 세 가지 표현 모두 (2026-10-19, 원장 중복 조사).
 *   1) 줄 id 연결: source BATCH·batch_completion, source_id = 배치, source_line_id = 줄
 *   2) 투입 참조: reference_type = 'batch_input', reference_id = 줄
 *   3) 배치 단위 옛 보충 출고 (줄 id 없음): source_id 또는 reference(batch) = 배치 이고,
 *      원료가 같은 사건 — 같은 id 이거나 정본 매핑(item_master.legacy_material_id FK)으로 이어진 id. 이름으로 잇지 않는다.
 *      (옛 보충 SQL 은 정본 원료 id 만 보고 '거래 없음' 으로 판단해, item_master 공간 id 로 남아 있던 원래 출고를 못 보고 한 번 더 넣었다)
 * '거래 없음' 판정만으로 다시 출고하지 않는다 — 3) 이 있으면 같은 원료 줄이 둘이어도 둘 다 출고된 것으로 본다(다시 빼지 않음, 사람 확인).
 * 원장 정리(LEDGER_DEDUP)의 상계 거래는 'return' 이라 여기 영향 없음 — 원 출고 사실은 그대로 남는다.
 */
export const LINE_REPRESENTED_SQL = `EXISTS (
  SELECT 1 FROM h_inventory_transactions t
   WHERE t.tenant_id = bi.tenant_id AND t.transaction_type = 'usage'
     AND (
       (t.source_type IN ('BATCH', 'batch_completion') AND t.source_id = bi.batch_id AND t.source_line_id = bi.id)
       OR (t.reference_type = 'batch_input' AND t.reference_id = bi.id)
       OR (t.source_line_id IS NULL
           AND ((t.source_type IN ('BATCH', 'batch_completion') AND t.source_id = bi.batch_id) OR (t.reference_type = 'batch' AND t.reference_id = bi.batch_id))
           AND (t.material_id = bi.material_id OR EXISTS (
             SELECT 1 FROM item_master im
              WHERE im.tenant_id = bi.tenant_id
                AND ((im.id = t.material_id AND im.legacy_material_id = bi.material_id) OR (im.id = bi.material_id AND im.legacy_material_id = t.material_id)))))
     ))`;

export async function getIssuedBatchLineIds(batchId: number, tenantId: number, conn?: any): Promise<Set<number>> {
  const ids = new Set<number>();
  const c = conn ?? (await getRawConnection());
  const [rows]: any = await c.execute(
    `SELECT bi.id FROM h_batch_inputs bi WHERE bi.batch_id = ? AND bi.tenant_id = ? AND ${LINE_REPRESENTED_SQL}`,
    [batchId, tenantId],
  );
  for (const r of rows as any[]) ids.add(Number(r.id));
  return ids;
}

/** 한 줄 — 출고 트랜잭션 안에서 잠근 뒤 다시 확인할 때 (같은 조건) */
export async function isBatchLineRepresented(conn: any, lineId: number, tenantId: number): Promise<boolean> {
  const [rows]: any = await conn.execute(
    `SELECT 1 FROM h_batch_inputs bi WHERE bi.id = ? AND bi.tenant_id = ? AND ${LINE_REPRESENTED_SQL} LIMIT 1`,
    [lineId, tenantId],
  );
  return (rows as any[]).length > 0;
}

/**
 * 아직 출고되지 않은 투입 줄 수 — 플래그 0 이고, 원장에 출고로 나타나지 않았고(LINE_REPRESENTED_SQL), 수량 > 0.
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
        AND NOT ${LINE_REPRESENTED_SQL}`,
    [batchId, tenantId],
  );
  return Number((rows as any[])[0]?.n ?? 0);
}
