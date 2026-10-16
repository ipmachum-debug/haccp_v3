/**
 * 매출의 "이미 처리된 흔적" — 재고 차감·매출 분개가 순(net)으로 남아 있는지 (2026-10-16, Codex DB 감사)
 *
 * 사고: 매출 7건(7796, 7820, 7823, 7924, 7985, 8082, 8097)이 07/04 에 재고 차감(분개 없음)된 뒤
 *   10/14 에 상태만 pending 으로 되돌려져(bulkRestoreApprovedToPending) 다시 확정 → 같은 수량을 한 번 더 차감.
 *   상태 컬럼만 보고 "아직 안 한 매출" 로 판단했기 때문.
 * 고정: 확정·복구는 상태가 아니라 원장 흔적으로 판단한다.
 *   - 재고: SALE/usage + 번들 분해(BUNDLE_OUTBOUND, reference sales) − SALE_CANCEL/return 의 순수량 > 0
 *   - 분개: `[매출] SALE-<id>` 전표 수 > `[매출취소] SALE-<id>` 전표 수
 * 정상 취소(productSaleCancel)는 재고를 되돌리고 역분개를 남기므로 흔적 0 → 다시 대기·확정 가능.
 */

const EPS = 0.001;

/** 매출 별칭 `s` (accounting_sales) 에 대해 "흔적 있음" 이면 참인 SQL 조건 — 바인딩 없음 */
export function saleHasFootprintSql(s = "s"): string {
  const marker = (prefix: string) =>
    `(e.description = CONCAT('${prefix} SALE-', ${s}.id) OR e.description LIKE CONCAT('${prefix} SALE-', ${s}.id, ' %'))`;
  return `(
    (SELECT COALESCE(SUM(CASE
              WHEN t.source_type = 'SALE' AND t.transaction_type = 'usage' THEN t.quantity
              WHEN t.source_type = 'BUNDLE_OUTBOUND' AND t.transaction_type = 'usage' THEN t.quantity
              WHEN t.source_type = 'SALE_CANCEL' THEN -t.quantity
              ELSE 0 END), 0)
       FROM h_inventory_transactions t
      WHERE t.tenant_id = ${s}.tenant_id
        AND ( (t.source_type IN ('SALE', 'SALE_CANCEL') AND t.source_id = ${s}.id)
           OR (t.source_type = 'BUNDLE_OUTBOUND' AND t.reference_type = 'sales' AND t.reference_id = ${s}.id) )
    ) > ${EPS}
    OR
    (SELECT COUNT(*) FROM expense_journal_entries e WHERE e.tenant_id = ${s}.tenant_id AND ${marker("[매출]")})
      > (SELECT COUNT(*) FROM expense_journal_entries e WHERE e.tenant_id = ${s}.tenant_id AND ${marker("[매출취소]")})
  )`;
}

export type SaleFootprint = { netDeducted: number; postedJournals: number; reversedJournals: number; live: boolean };

export async function getSaleFootprint(conn: any, tenantId: number, saleId: number): Promise<SaleFootprint> {
  const [txRows] = await conn.execute(
    `SELECT COALESCE(SUM(CASE
              WHEN source_type IN ('SALE', 'BUNDLE_OUTBOUND') AND transaction_type = 'usage' THEN quantity
              WHEN source_type = 'SALE_CANCEL' THEN -quantity
              ELSE 0 END), 0) AS net
       FROM h_inventory_transactions
      WHERE tenant_id = ?
        AND ( (source_type IN ('SALE', 'SALE_CANCEL') AND source_id = ?)
           OR (source_type = 'BUNDLE_OUTBOUND' AND reference_type = 'sales' AND reference_id = ?) )`,
    [tenantId, saleId, saleId],
  );
  const count = async (prefix: string) => {
    const docId = `SALE-${saleId}`;
    const [rows] = await conn.execute(
      `SELECT COUNT(*) AS n FROM expense_journal_entries
        WHERE tenant_id = ? AND (description = ? OR description LIKE ?)`,
      [tenantId, `${prefix} ${docId}`, `${prefix} ${docId} %`],
    );
    return Number((rows as any[])[0]?.n ?? 0);
  };
  const netDeducted = Number((txRows as any[])[0]?.net ?? 0);
  const postedJournals = await count("[매출]");
  const reversedJournals = await count("[매출취소]");
  return { netDeducted, postedJournals, reversedJournals, live: netDeducted > EPS || postedJournals > reversedJournals };
}

export function describeFootprint(saleId: number, f: SaleFootprint): string {
  const parts: string[] = [];
  if (f.netDeducted > EPS) parts.push(`재고 차감 ${Number(f.netDeducted.toFixed(3))}`);
  if (f.postedJournals > f.reversedJournals) parts.push(`매출 분개 ${f.postedJournals - f.reversedJournals}건`);
  return `매출 #${saleId} 은 이미 ${parts.join("·")} 기록이 남아 있습니다. 다시 확정하면 이중 차감·이중 분개가 됩니다. ` +
    `정정이 필요하면 정식 취소(재고 복원·역분개) 후 진행하세요.`;
}

/** 확정·복구 전에 호출 — 흔적이 있으면 throw */
export async function assertNoSaleFootprint(conn: any, tenantId: number, saleId: number): Promise<void> {
  const f = await getSaleFootprint(conn, tenantId, saleId);
  if (f.live) throw new Error(describeFootprint(saleId, f));
}
