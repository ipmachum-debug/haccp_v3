/**
 * 음수 재고 허용 정책 (2026-10-08, CEO 결정)
 *
 * "재고가 모자라도 생산 투입은 사실대로 기록하고, 다음 입고·실사 때 맞춘다."
 *
 * 기존 동작: 가용량 < 필요량이면 LOT 차감을 건너뛰고 lot_id=NULL usage 행만 남김
 *            → inventory_deducted=0 영구 잔존, 사람이 재차감해야 함.
 * 새 동작:   있는 LOT 는 FEFO 로 다 빼고, 모자란 나머지는 최근 LOT 에 음수로 차감
 *            → inventory_deducted=1 항상 보장. 음수 LOT 는 다음 입고 때 자동 상쇄
 *            (negativeLotReconcile.ts).
 *
 * 정책은 코드 분기가 아니라 설정값으로 관리한다 (docs/architecture/04-policy-registry.md).
 *   INVENTORY_ALLOW_NEGATIVE=true|false            기본 true
 *   INVENTORY_ALLOW_NEGATIVE_DENY_TENANTS="3,9"    음수 금지 테넌트 (예외 목록)
 *
 * 향후 platform_features 테이블로 이관 시 이 함수 내부만 바꾼다.
 */

const EPS = 0.001;

export function isNegativeStockAllowed(tenantId: number): boolean {
  const flag = (process.env.INVENTORY_ALLOW_NEGATIVE ?? "true").toLowerCase().trim();
  if (flag === "false" || flag === "0" || flag === "off") return false;

  const denyRaw = process.env.INVENTORY_ALLOW_NEGATIVE_DENY_TENANTS?.trim();
  if (denyRaw) {
    const deny = denyRaw.split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
    if (deny.includes(Number(tenantId))) return false;
  }
  return true;
}

/** 음수 허용 여부에 따라 `col - qty` 또는 `GREATEST(col - qty, 0)` 를 돌려준다 (raw SQL 조각). */
export function minusExpr(column: string, allowNegative: boolean): string {
  return allowNegative ? `${column} - ?` : `GREATEST(${column} - ?, 0)`;
}

/** 음수 판정 (소수 오차 방어) */
export function isNegativeQty(v: unknown): boolean {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "0"));
  return Number.isFinite(n) && n < -EPS;
}

/** 음수 허용 모드에서 LOT 가 하나도 없을 때 만드는 자리표시 LOT 번호 */
export function negativePlaceholderLotNumber(materialId: number, date: Date = new Date()): string {
  const d = date.toISOString().slice(0, 10).replace(/-/g, "");
  return `NEG-${materialId}-${d}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}
