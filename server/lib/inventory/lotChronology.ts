/**
 * LOT 시점 조건 — "그날 있던 LOT 만" (2026-10-15, Codex #523 판매 사전 점검)
 *
 * 사고 예상: 10/08 매출 #10535 를 지금 승인하면 FEFO 가 10/14 생산 LOT #1834 를 차감한다
 *   (판매일 이전에 존재하지 않던 재고). 음수 재고 자리(sink)도 날짜 제한 없이 가장 최근 LOT 을 골랐다.
 * 규칙: 출고·판매가 고를 수 있는 LOT 은 LOT 날짜(생산일 → 입고일 → 생성일) ≤ 출고·판매일.
 *   그날 쓸 LOT 이 모자라면 기존 음수 재고 정책 그대로 — 그날 기준 가장 최근 LOT 에 음수로,
 *   그런 LOT 도 없으면 그날 날짜의 자리표시 LOT. 정책 자체는 바꾸지 않는다.
 */

/** LOT 의 업무 날짜 (SQL). 별칭이 있으면 `${alias}.` 를 붙인다 */
export function lotDateExpr(alias?: string): string {
  const p = alias ? `${alias}.` : "";
  return `COALESCE(${p}production_date, ${p}receipt_date, DATE(${p}created_at))`;
}

/** WHERE 조건 — 바인딩 1개 (출고·판매일 YYYY-MM-DD) */
export function lotAvailableOnSql(alias?: string): string {
  return `${lotDateExpr(alias)} <= ?`;
}
