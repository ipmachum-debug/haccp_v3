/**
 * 제품 LOT 단가 = 생산원가 (2026-10-15, Codex #518·#519 검증 ① → #521 안전성 리뷰 반영)
 *
 * 문제
 *   제품 LOT 의 unit_price 에 SKU 판매가(product_skus.unit_price)를 그대로 넣었다 (completeBatch·ensureBatchLots 둘 다).
 *   판매 승인(productSalePost)은 매출원가 = LOT 단가 × 출고 수량 이라 판매가가 원가로 잡히고,
 *   판매가가 없는 SKU(단가 0)는 매출원가 분개 자체가 없다. 생산완료 분개는 제품(1430)에 실제 투입 원가를
 *   올리는데 판매로는 판매가만큼 빠져 제품 계정이 맞지 않는다.
 *
 * 규칙
 *   - 배치 원가 = 생산완료 분개 금액. LOT 별 kg(수량 × SKU 판매단위 kg, SKU 없으면 수량) 비율로 배분.
 *   - **생산완료 분개와 같은 트랜잭션** 에서 적용한다 (postProductionCompletionJournal 이 호출).
 *     둘 다 되거나 둘 다 안 된다. 분개가 이미 있으면 단가도 확정 — 완료 훅을 다시 돌려도 덮어쓰지 않는다
 *     (그 뒤 배치 원가·SKU kg 이 바뀌어도 전기된 금액과 단가가 따로 놀지 않게).
 *   - **움직임이 있는 LOT 은 재평가하지 않는다.** 판매·출고·혼합 분해·반품(취소 복원 포함)·조정 거래가 하나라도 있거나,
 *     제품 출고 기록이 있거나, 잔량 ≠ 수량이면 그 배치는 통째로 건너뛴다 (일부 LOT 만 바꾸면 배분 합이 깨진다).
 *     이미 나간 수량의 매출원가 전표는 옛 단가로 전기돼 있으므로 단가를 바꾸면 장부와 재고 금액이 어긋난다.
 *   - 반올림: 단가 컬럼이 소수 2자리라 (수량 × 단가) 합과 배치 원가에 잔차가 남는다 (LOT 당 수량 × 0.005원 이하,
 *     단지 10/12 4건 합 +1.97원). 잔차는 결과(residual)로 돌려주고 제품(1430) 잔액에 남는다 — 기말 재고 평가에서 정리.
 *     정합성 점검은 1% 또는 10원까지 허용.
 *   - 판매가는 SKU 에 그대로 있다 — LOT 단가만 원가로.
 */
import { withTransaction } from "../../db/connection";

export type CostLot = { id: number; quantity: number; kgPerUnit: number };

/** 배치 원가를 LOT 들에 kg 비율로 배분한 단가 (원, 소수 2자리). kg 합이 0 이면 빈 배열 */
export function allocateLotUnitCosts(batchCost: number, lots: CostLot[]): Array<{ id: number; unitCost: number }> {
  const totalKg = lots.reduce((a, l) => a + Math.max(0, l.quantity) * l.kgPerUnit, 0);
  if (!(batchCost > 0) || !(totalKg > 0)) return [];
  const perKg = batchCost / totalKg;
  return lots.filter((l) => l.quantity > 0).map((l) => ({ id: l.id, unitCost: Math.round(perKg * l.kgPerUnit * 100) / 100 }));
}

export type ProductLotCostResult =
  | { applied: true; batchCost: number; lots: Array<{ id: number; unitCost: number }>; residual: number }
  | { applied: false; reason: "no_lots" | "has_movement" | "not_posted"; detail?: string };

/** 생산 LOT 이 만들어질 때의 거래만 — 나머지는 전부 움직임 */
const CREATION_TX_TYPES = ["inbound", "receipt"];

/**
 * 트랜잭션 안에서 배치의 제품 LOT 을 잠그고 단가를 원가로 맞춘다 (호출자가 트랜잭션을 연다).
 * 움직임이 있으면 아무것도 바꾸지 않고 has_movement. 실패는 throw — 호출자 트랜잭션이 통째로 되돌린다.
 */
export async function valueProductLotsInTx(conn: any, batchId: number, tenantId: number, batchCost: number): Promise<ProductLotCostResult> {
  const [lRows]: any = await conn.execute(
    `SELECT l.id, l.quantity, l.available_quantity, ps.kg_per_sales_unit
       FROM h_inventory_lots l
       LEFT JOIN product_skus ps ON ps.id = l.sku_id AND ps.tenant_id = l.tenant_id
      WHERE l.batch_id = ? AND l.tenant_id = ? AND l.product_id IS NOT NULL
      ORDER BY l.id
      FOR UPDATE`,
    [batchId, tenantId],
  );
  const rows = (lRows as any[]) ?? [];
  if (rows.length === 0) return { applied: false, reason: "no_lots" };

  const ids = rows.map((r) => Number(r.id));
  const ph = ids.map(() => "?").join(",");
  const [mRows]: any = await conn.execute(
    `SELECT t.lot_id FROM h_inventory_transactions t
      WHERE t.tenant_id = ? AND t.lot_id IN (${ph}) AND t.transaction_type NOT IN (${CREATION_TX_TYPES.map(() => "?").join(",")})
     UNION
     SELECT o.lot_id FROM h_product_outbound o WHERE o.tenant_id = ? AND o.lot_id IN (${ph})`,
    [tenantId, ...ids, ...CREATION_TX_TYPES, tenantId, ...ids],
  );
  const moved = new Set<number>(((mRows as any[]) ?? []).map((r) => Number(r.lot_id)));
  for (const r of rows) {
    if (Math.abs(Number(r.quantity ?? 0) - Number(r.available_quantity ?? 0)) > 0.0005) moved.add(Number(r.id));
  }
  if (moved.size > 0) return { applied: false, reason: "has_movement", detail: `LOT ${[...moved].sort((a, b) => a - b).join(",")}` };

  const lots: CostLot[] = rows.map((r) => ({
    id: Number(r.id),
    quantity: Number(r.quantity ?? 0),
    kgPerUnit: Number(r.kg_per_sales_unit) > 0 ? Number(r.kg_per_sales_unit) : 1,
  }));
  const costs = allocateLotUnitCosts(batchCost, lots);
  if (costs.length === 0) return { applied: false, reason: "no_lots" };
  for (const c of costs) {
    await conn.execute(`UPDATE h_inventory_lots SET unit_price = ? WHERE id = ? AND tenant_id = ?`, [c.unitCost.toFixed(2), c.id, tenantId]);
  }
  const valued = costs.reduce((a, c) => a + c.unitCost * (lots.find((l) => l.id === c.id)?.quantity ?? 0), 0);
  return { applied: true, batchCost, lots: costs, residual: Math.round((batchCost - valued) * 100) / 100 };
}

/**
 * 이미 생산완료 분개가 전기된 배치의 LOT 단가 보정 (운영 1회성 — 예: 단지 LOT 1825~1828).
 * 원가는 전기된 분개 금액을 쓴다. 움직임 검사는 같다. 분개가 없으면 not_posted (완료 훅이 처리).
 */
export async function revalueProductLotsFromPostedJournal(batchId: number, tenantId: number): Promise<ProductLotCostResult> {
  return withTransaction(async (conn: any) => {
    const marker = `[생산완료] BATCH-${batchId}`;
    const [jRows]: any = await conn.execute(
      `SELECT id, total_debit FROM expense_journal_entries
        WHERE tenant_id = ? AND (description = ? OR description LIKE ?) LIMIT 1 FOR UPDATE`,
      [tenantId, marker, `${marker} %`],
    );
    const j = (jRows as any[])?.[0];
    if (!j) return { applied: false, reason: "not_posted" } as ProductLotCostResult;
    return valueProductLotsInTx(conn, batchId, tenantId, Number(j.total_debit));
  }, `revalueProductLots:${batchId}`);
}
