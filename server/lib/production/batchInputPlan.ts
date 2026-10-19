/**
 * 배치 원료 투입 계획 수량 — 배치 생성(createBatch)과 생산 설계 시험 계산이 같은 식을 쓴다 (2026-10-19, 설계 18 2b)
 *
 * 대상 줄: 원료 품목이 있고 재고 차감하는 줄 (is_deductible ≠ 0). 정제수 등 차감 안 함 줄은 투입 계획에 없다.
 * 수량: 원물·공정 환산이면 스냅샷의 원물 kg (호출부가 rawKgToMaterialUnit 으로 원료 단위로 바꿈),
 *       아니면 (보정 배합비 || 배합비) % × 계획량.
 */
export interface InputPlanRow {
  materialId: number | null;
  isDeductible: number | null;
  quantity: string | number | null;
  correctedQuantity?: string | number | null;
}

export function isPlannedInputRow(ing: InputPlanRow): boolean {
  return ing.materialId !== null && ing.isDeductible !== 0;
}

export function legacyInputQty(ing: InputPlanRow, plannedQty: number): number {
  const ratio = ing.correctedQuantity ? parseFloat(String(ing.correctedQuantity)) : parseFloat(String(ing.quantity));
  return (ratio / 100) * plannedQty;
}
