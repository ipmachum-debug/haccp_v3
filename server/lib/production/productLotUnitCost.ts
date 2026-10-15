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
 */
import { getRawConnection } from "../../db/connection";
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

export type ProductLotCostResult =
  | { applied: true; batchCost: number; lots: Array<{ id: number; unitCost: number }> }
  | { applied: false; reason: "not_found" | "before_start" | "zero_cost" | "no_lots" };

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

  // 제품 LOT 만 (원재료 LOT·혼합 분해 LOT 제외) — 판매단위 kg 은 SKU 에서
  const [lRows]: any = await pool.execute(
    `SELECT l.id, l.quantity, ps.kg_per_sales_unit
       FROM h_inventory_lots l
       LEFT JOIN product_skus ps ON ps.id = l.sku_id AND ps.tenant_id = l.tenant_id
      WHERE l.batch_id = ? AND l.tenant_id = ? AND l.product_id IS NOT NULL`,
    [batchId, tenantId],
  );
  const lots: CostLot[] = (lRows as any[]).map((r) => ({
    id: Number(r.id),
    quantity: Number(r.quantity ?? 0),
    kgPerUnit: Number(r.kg_per_sales_unit) > 0 ? Number(r.kg_per_sales_unit) : 1,
  }));
  const costs = allocateLotUnitCosts(batchCost, lots);
  if (costs.length === 0) return { applied: false, reason: "no_lots" };
  for (const c of costs) {
    await pool.execute(`UPDATE h_inventory_lots SET unit_price = ? WHERE id = ? AND tenant_id = ?`, [c.unitCost.toFixed(2), c.id, tenantId]);
  }
  return { applied: true, batchCost, lots: costs };
}
