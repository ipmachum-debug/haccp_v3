/**
 * 계획량 — kg 또는 배치 수 (2026-10-19, 하루 생산 흐름)
 *
 * 배치 수 × BOM 1회 기준량(계획 함수와 같은 값 — loadPlanBom.subBatchKg) = kg.
 * kg 입력은 그대로 — 마지막 회차는 남은 양(예: 475kg, 1회 96kg → 96×4 + 91)으로 계획 함수가 나눈다.
 * 1회 기준량이 없으면 배치 수로는 계산하지 않는다 (추정하지 않음).
 */
import { loadPlanBom } from "./ccpPlanContext";

export async function resolvePlannedKg(
  conn: any, tenantId: number, item: { productId: number; plannedQuantityKg?: number | null; batchCount?: number | null },
): Promise<{ kg: number | null; subBatchKg: number | null; batchCount: number | null; error?: string }> {
  if (item.plannedQuantityKg != null && item.plannedQuantityKg > 0) return { kg: item.plannedQuantityKg, subBatchKg: null, batchCount: null };
  const count = item.batchCount != null ? Math.floor(Number(item.batchCount)) : 0;
  if (!(count > 0)) return { kg: null, subBatchKg: null, batchCount: null, error: "하루 총생산량(kg) 또는 배치 수를 입력하세요." };
  const bom = await loadPlanBom(conn, tenantId, item.productId, 1);
  const sub = bom.subBatchKg != null && bom.subBatchKg > 0 ? bom.subBatchKg : null;
  if (!sub) return { kg: null, subBatchKg: null, batchCount: count, error: "BOM 1회 기준량이 없어 배치 수로 계산할 수 없습니다 — kg 로 입력하거나 제품 배합에서 1회 기준량을 정하세요." };
  return { kg: Math.round(count * sub * 1000) / 1000, subBatchKg: sub, batchCount: count };
}
