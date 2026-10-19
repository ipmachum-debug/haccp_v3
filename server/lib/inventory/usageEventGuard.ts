/**
 * 같은 사용 사건을 두 번 차감하지 않는 조건 (2026-10-19, 원장 중복 조사)
 *
 * 옛 '유령 출고 재조정' 은 LOT 없는 사용 거래를 보면 실제 LOT 을 다시 깎았다 — 같은 배치·투입 줄 사건에
 * 이미 LOT 이 연결된 보충 출고가 있는지는 보지 않았다. 그 결과 재고가 남아 있던 앞쪽 건만 다시 깎이고,
 * 나머지는 재고가 없어 건너뛰었을 뿐이다 (다시 돌면 그 나머지도 깎인다).
 *
 * 규칙: LOT 없는 사용 거래에 LOT 을 붙여 차감하려면, 그 거래의 사건(배치 + 같은 원료, 정본 매핑)에
 *   1) LOT 이 연결된 다른 사용 거래가 없고  2) 원장 정리 연결(h_ledger_event_links)·상계가 없어야 한다.
 * 같은 원료인지는 같은 id 또는 item_master.legacy_material_id FK 로만 본다 (이름 매칭 없음).
 * 읽기만 한다 — 재조정·보충 스크립트가 차감 전에 부른다.
 */

export interface RedeductionCheck {
  txId: number;
  safe: boolean;
  reason: string | null;
}

export async function checkLotAttachSafety(conn: any, tenantId: number, txIds: number[]): Promise<RedeductionCheck[]> {
  if (!txIds.length) return [];
  const [rows]: any = await conn.query(
    `SELECT t.id, t.lot_id, t.transaction_type,
            (SELECT COUNT(*) FROM h_inventory_transactions o
              WHERE o.tenant_id = t.tenant_id AND o.id <> t.id AND o.transaction_type = 'usage' AND o.lot_id IS NOT NULL AND o.lot_id <> 0
                AND ((o.source_type IN ('BATCH', 'batch_completion') AND o.source_id = COALESCE(t.source_id, t.reference_id))
                     OR (o.reference_type = 'batch' AND o.reference_id = COALESCE(t.source_id, t.reference_id)))
                AND (o.material_id = t.material_id OR EXISTS (
                  SELECT 1 FROM item_master im WHERE im.tenant_id = t.tenant_id
                     AND ((im.id = o.material_id AND im.legacy_material_id = t.material_id) OR (im.id = t.material_id AND im.legacy_material_id = o.material_id))))
            ) AS other_lot_reps,
            (SELECT COUNT(*) FROM h_inventory_transactions r WHERE r.tenant_id = t.tenant_id AND r.reversal_of_id = t.id) AS offsets
       FROM h_inventory_transactions t
      WHERE t.tenant_id = ? AND t.id IN (?)`,
    [tenantId, txIds],
  );
  let linked = new Set<number>();
  try {
    const [l]: any = await conn.query(`SELECT original_tx_id, backfill_tx_id FROM h_ledger_event_links WHERE tenant_id = ? AND (original_tx_id IN (?) OR backfill_tx_id IN (?))`, [tenantId, txIds, txIds]);
    linked = new Set((l as any[]).flatMap((x) => [Number(x.original_tx_id), Number(x.backfill_tx_id)]));
  } catch (e: any) {
    if (e?.code !== "ER_NO_SUCH_TABLE") throw e;
  }
  const byId = new Map((rows as any[]).map((r) => [Number(r.id), r]));
  return txIds.map((id) => {
    const r = byId.get(Number(id));
    if (!r) return { txId: id, safe: false, reason: "이 회사의 거래가 아닙니다" };
    if (r.transaction_type !== "usage") return { txId: id, safe: false, reason: "사용 거래가 아닙니다" };
    if (r.lot_id != null && Number(r.lot_id) !== 0) return { txId: id, safe: false, reason: "이미 LOT 이 연결된 거래" };
    if (Number(r.offsets) > 0) return { txId: id, safe: false, reason: "원장 상계가 붙은 거래 (원장 전용 중복)" };
    if (linked.has(Number(id))) return { txId: id, safe: false, reason: "원장 정리에 연결된 사건" };
    if (Number(r.other_lot_reps) > 0) return { txId: id, safe: false, reason: "같은 배치·원료 사건에 LOT 이 연결된 다른 사용 거래가 있음 — 다시 깎으면 두 번 차감" };
    return { txId: id, safe: true, reason: null };
  });
}
