/**
 * 유효 사용량 — 사용 거래와 그 거래를 가리키는 상계를 함께 본다 (2026-10-19, #608 검토 P2)
 *
 * 원본 사용 거래는 남기고, reversal_of_id 로 그 거래를 가리키는 'return' 을 두 가지로 나눠 붙인다:
 *   - 원장 전용 상계 (source_type = 'LEDGER_DEDUP'): 같은 사건이 원장에 두 번 남은 것의 정리 — 재고 변화 없음, 금액 미확정
 *   - 실제 재고 복원 (그 밖, 예: 'BATCH_VOID' 중복 생산 건 무효): LOT 으로 돌아간 양·금액
 * 유효 사용량 = 원본 − 원장 전용 상계 − 실제 재고 복원 (0 미만 없음). 모든 return 을 입고·환불로 합치지 않는다.
 * 원장 전용 상계가 있으면 금액은 '미확정' — 원 거래·보충 거래 중 어느 금액을 뺄지 아직 정하지 않았다.
 */

/** 사용 거래 별칭(t)에 붙이는 LEFT JOIN — 별칭 rv 로 ledger_offset_qty · stock_return_qty · stock_return_amount */
export function usageReversalJoin(tenantSql: string, txAlias = "t"): string {
  return `LEFT JOIN (
      SELECT r.reversal_of_id,
             SUM(CASE WHEN r.source_type = 'LEDGER_DEDUP' THEN ABS(r.quantity) ELSE 0 END) AS ledger_offset_qty,
             SUM(CASE WHEN COALESCE(r.source_type, '') <> 'LEDGER_DEDUP' THEN ABS(r.quantity) ELSE 0 END) AS stock_return_qty,
             SUM(CASE WHEN COALESCE(r.source_type, '') <> 'LEDGER_DEDUP' THEN ABS(COALESCE(r.amount, 0)) ELSE 0 END) AS stock_return_amount
        FROM h_inventory_transactions r
       WHERE r.tenant_id = ${tenantSql} AND r.reversal_of_id IS NOT NULL AND r.transaction_type = 'return'
       GROUP BY r.reversal_of_id
    ) rv ON rv.reversal_of_id = ${txAlias}.id`;
}

/** SELECT 칸 (수량) — originalQuantity · ledgerOffsetQty · stockReturnQty · quantity(유효) */
export function usageQtyColumns(txAlias = "t"): string {
  return `ABS(${txAlias}.quantity) AS originalQuantity,
        COALESCE(rv.ledger_offset_qty, 0) AS ledgerOffsetQty,
        COALESCE(rv.stock_return_qty, 0) AS stockReturnQty,
        GREATEST(0, ABS(${txAlias}.quantity) - COALESCE(rv.ledger_offset_qty, 0) - COALESCE(rv.stock_return_qty, 0)) AS quantity`;
}

/** SELECT 칸 (금액) — amount(유효: 실제 재고 복원 금액만 뺌) · amountPending(원장 전용 상계가 있어 금액 미확정) */
export function usageAmountColumns(txAlias = "t"): string {
  return `GREATEST(0, ABS(COALESCE(${txAlias}.amount, 0)) - COALESCE(rv.stock_return_amount, 0)) AS amount,
        CASE WHEN COALESCE(rv.ledger_offset_qty, 0) > 0 THEN 1 ELSE 0 END AS amountPending`;
}

/** 원본·상계를 뺀 숫자 (JS 쪽 합계용) */
export function readUsageRow(row: any): { originalQuantity: number; ledgerOffsetQty: number; stockReturnQty: number; quantity: number; amountPending: boolean } {
  const f = (v: unknown) => (v == null ? 0 : parseFloat(String(v)) || 0);
  return {
    originalQuantity: row.originalQuantity != null ? f(row.originalQuantity) : f(row.quantity),
    ledgerOffsetQty: f(row.ledgerOffsetQty),
    stockReturnQty: f(row.stockReturnQty),
    quantity: f(row.quantity),
    amountPending: Number(row.amountPending ?? 0) === 1,
  };
}
