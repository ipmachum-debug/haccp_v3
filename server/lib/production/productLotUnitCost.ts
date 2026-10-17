/**
 * 제품 LOT 단가 = 생산원가 (2026-10-15, Codex #518·#519 검증 ①)
 *
 * 문제
 *   제품 LOT 의 unit_price 에 SKU 판매가(product_skus.unit_price)를 그대로 넣었다 (completeBatch·ensureBatchLots 둘 다).
 *   판매 승인(productSalePost)은 매출원가 = LOT 단가 × 출고 수량 이라 판매가가 원가로 잡히고,
 *   판매가가 없는 SKU(단가 0)는 매출원가 분개 자체가 없다. 생산완료 분개는 제품(1430)에 실제 투입 원가를
 *   올리는데 판매로는 판매가만큼 빠져 제품 계정이 맞지 않는다.
 *   단지 10/12: LOT 1828 3,800(원가 약 1,945) · 1825 9,000(약 5,905) · 1826/1827 0(약 2,284/3,917).
 *
 * 규칙
 *   - 배치 원가 = 생산완료 분개와 같은 금액 (resolveBatchCost: material_cost → actual_cost → 투입 합계).
 *   - LOT 별 kg = 수량 × SKU 판매단위 kg (SKU 없으면 수량 — fallback LOT 은 kg 단위).
 *     LOT 단가 = 배치 원가 ÷ 배치 LOT 총 kg × 판매단위 kg → LOT 들의 (수량 × 단가) 합 = 배치 원가.
 *   - 생산완료 분개 시작일(생산일 기준) 이후 배치만 — 제품 계정이 생산원가로 들어오는 배치와 같은 범위.
 *     그 전 배치 LOT 은 건드리지 않는다 (소급 없음, 2026-10-12 실사 원칙).
 *   - 원가 0 이면 손대지 않는다. 멱등 (같은 값으로 다시 계산).
 *   - 판매가는 SKU 에 그대로 있다 — LOT 단가만 원가로.
 *
 * #521 배포 후 안전점검 (2026-10-15, P1 2건)
 *   - 출고 이력이 있는 LOT 은 재평가하지 않는다. 이미 나간 수량의 매출원가 분개는 옛 단가로 전기돼 있어
 *     단가를 바꾸면 잔여 재고 금액과 장부가 갈라진다. 이력은 잔량이 아니라 거래 기록으로 본다
 *     (판매 취소로 잔량이 원래 수량으로 돌아와도 이력은 남는다): h_inventory_transactions 의 입고 외 거래,
 *     h_product_outbound(취소 포함), bundle_lots 의 child 차감.
 *     이력이 있는 LOT 의 현재 단가가 계산값과 같으면(멱등 재실행) 그대로 통과, 다르면 배치 전체를 적용하지 않고
 *     `lot_issued` 로 돌려준다 — 일부 LOT 만 바꾸면 LOT 합 ≠ 배치 원가 가 되므로 전체 또는 전무.
 *   - 여러 LOT 갱신은 한 트랜잭션에서 배치·LOT 행을 잠그고(FOR UPDATE) 적용한다. 두 번째 UPDATE 가 실패하면
 *     첫 번째도 롤백된다. 같은 배치의 동시 완료·재시도는 행 잠금에서 직렬화된다.
 *   - 반올림 잔차: 단가는 소수 2자리(h_inventory_lots.unit_price DECIMAL(10,2)) 라 LOT (수량 × 단가) 합은 배치 원가와
 *     수십 원 이내로 어긋날 수 있다 (단지 10/12 4건 합계 +1.97원). 이 잔차는 허용한다 — 정합성 점검
 *     PROD_LOT_COST_MISMATCH 의 허용치(1% 또는 10원) 안이고, 제품 계정(1430)의 잔여는 결산 재고 평가에서 흡수한다.
 *     원가를 정밀 단가로 맞추려면 컬럼 정밀도 변경이 필요하므로 여기서 억지로 맞추지 않는다.
 */
import { getRawConnection, withTransaction } from "../../db/connection";
import { resolveBatchCost, productionJournalStartDate, isOnOrAfterStart } from "./productionCompletionJournal";
import { resolveBatchBusinessDate } from "./batchBusinessDate";

export type CostLot = { id: number; quantity: number; kgPerUnit: number };

/** 배치 원가를 LOT 들에 kg 비율로 배분한 단가 (원, 소수 2자리). kg 합이 0 이면 빈 배열 */
export function allocateLotUnitCosts(batchCost: number, lots: CostLot[]): Array<{ id: number; unitCost: number }> {
  const totalKg = lots.reduce((a, l) => a + Math.max(0, l.quantity) * l.kgPerUnit, 0);
  if (!(batchCost > 0) || !(totalKg > 0)) return [];
  const perKg = batchCost / totalKg;
  return lots.filter((l) => l.quantity > 0).map((l) => ({ id: l.id, unitCost: Math.round(perKg * l.kgPerUnit * 100) / 100 }));
}

/** 단가 2자리 비교 — DECIMAL(10,2) 문자열과 계산값이 같은지 */
export function sameUnitCost(current: unknown, unitCost: number): boolean {
  const cur = Number(current ?? 0);
  return Number.isFinite(cur) && Math.abs(cur - unitCost) < 0.005;
}

export type IssuedLotInfo = { id: number; currentUnitPrice: number; unitCost: number };

export type ProductLotCostResult =
  | { applied: true; batchCost: number; lots: Array<{ id: number; unitCost: number }>; changed: number }
  | { applied: false; reason: "not_found" | "before_start" | "zero_cost" | "no_lots" }
  /** 출고 이력이 있는 LOT 의 단가가 계산값과 달라 배치 전체를 적용하지 않음 — 수동 재평가 절차 필요 */
  | { applied: false; reason: "lot_issued"; batchCost: number; issuedLots: IssuedLotInfo[] };

/**
 * 배치 원가를 제품 LOT 단가에 적용. 전체 성공 또는 전체 롤백 (DB 오류는 그대로 throw — 호출자가 "원가 미확정" 으로 처리).
 */
export async function applyProductLotUnitCost(batchId: number, tenantId: number): Promise<ProductLotCostResult> {
  const pool: any = await getRawConnection();
  const [bRows]: any = await pool.execute(
    `SELECT id, planned_date, completed_at, end_time, created_at, material_cost, actual_cost
       FROM h_batches WHERE id = ? AND tenant_id = ? LIMIT 1`,
    [batchId, tenantId],
  );
  const batch = bRows?.[0];
  if (!batch) return { applied: false, reason: "not_found" };
  if (!isOnOrAfterStart(resolveBatchBusinessDate(batch), productionJournalStartDate())) return { applied: false, reason: "before_start" };

  const [iRows]: any = await pool.execute(
    `SELECT COALESCE(SUM(total_price), 0) AS total FROM h_batch_inputs WHERE batch_id = ? AND tenant_id = ?`,
    [batchId, tenantId],
  );
  const batchCost = resolveBatchCost(batch, Number(iRows?.[0]?.total ?? 0));
  if (batchCost <= 0) return { applied: false, reason: "zero_cost" };

  return withTransaction(async (conn: any) => {
    // 배치 행 잠금 — 같은 배치의 완료 훅 재실행·동시 완료를 직렬화
    await conn.execute(`SELECT id FROM h_batches WHERE id = ? AND tenant_id = ? FOR UPDATE`, [batchId, tenantId]);

    // 제품 LOT 만 (원재료 LOT·혼합 분해 LOT 제외) — 판매단위 kg 은 SKU 에서. 출고 이력은 거래 기록으로 판정.
    const [lRows]: any = await conn.execute(
      `SELECT l.id, l.quantity, l.unit_price, ps.kg_per_sales_unit,
              (EXISTS (SELECT 1 FROM h_inventory_transactions t
                        WHERE t.tenant_id = l.tenant_id AND t.lot_id = l.id
                          AND t.transaction_type NOT IN ('receipt', 'inbound'))
               OR EXISTS (SELECT 1 FROM h_product_outbound o
                           WHERE o.tenant_id = l.tenant_id AND o.lot_id = l.id)
               OR EXISTS (SELECT 1 FROM bundle_lots bl
                           WHERE bl.tenant_id = l.tenant_id AND bl.child_lot_id = l.id)) AS issued
         FROM h_inventory_lots l
         LEFT JOIN product_skus ps ON ps.id = l.sku_id AND ps.tenant_id = l.tenant_id
        WHERE l.batch_id = ? AND l.tenant_id = ? AND l.product_id IS NOT NULL
        FOR UPDATE`,
      [batchId, tenantId],
    );
    const rows = (lRows as any[]) ?? [];
    const lots: CostLot[] = rows.map((r) => ({
      id: Number(r.id),
      quantity: Number(r.quantity ?? 0),
      kgPerUnit: Number(r.kg_per_sales_unit) > 0 ? Number(r.kg_per_sales_unit) : 1,
    }));
    const costs = allocateLotUnitCosts(batchCost, lots);
    if (costs.length === 0) return { applied: false, reason: "no_lots" } as const;

    const byId = new Map(rows.map((r) => [Number(r.id), r]));
    const issuedLots: IssuedLotInfo[] = [];
    const toUpdate: Array<{ id: number; unitCost: number }> = [];
    for (const c of costs) {
      const row = byId.get(c.id);
      if (sameUnitCost(row?.unit_price, c.unitCost)) continue; // 멱등 — 이미 같은 값
      if (Number(row?.issued) === 1) issuedLots.push({ id: c.id, currentUnitPrice: Number(row?.unit_price ?? 0), unitCost: c.unitCost });
      else toUpdate.push(c);
    }
    if (issuedLots.length > 0) {
      // 트랜잭션 안에서 아무것도 쓰지 않았으므로 COMMIT 돼도 변경 0
      return { applied: false, reason: "lot_issued", batchCost, issuedLots } as const;
    }
    for (const c of toUpdate) {
      await conn.execute(`UPDATE h_inventory_lots SET unit_price = ? WHERE id = ? AND tenant_id = ?`, [c.unitCost.toFixed(2), c.id, tenantId]);
    }
    return { applied: true, batchCost, lots: costs, changed: toUpdate.length } as const;
  }, `productLotUnitCost:${tenantId}:${batchId}`);
}
