/**
 * 배치 원료 투입 계획 수량 — 배치 생성(createBatch)과 생산 설계 시험 계산이 같은 식을 쓴다 (2026-10-19, 설계 18 2b)
 *
 * 대상 줄: 원료 품목이 있고 재고 차감하는 줄 (is_deductible ≠ 0). 정제수 등 차감 안 함 줄은 투입 계획에 없다.
 * 수량: 원물·공정 환산이면 스냅샷의 원물 kg (호출부가 rawKgToMaterialUnit 으로 원료 단위로 바꿈),
 *       아니면 아래 BOM 줄 계약(plannedRowKg) → 원료 재고 단위.
 *
 * ★ BOM 줄 양의 계약 (2026-10-20, BOM·설비 시간·인쇄 기준 검토 1) — 원료 계획·CCP 투입량·설계 화면이 이 함수 하나로 읽는다.
 *   이전: 원료 계획(legacyInputQty)은 단위를 보지 않고 모두 % 로, CCP 투입량(rowKg)은 kg·g 를 절대량으로 읽어
 *         같은 줄이 두 곳에서 다른 양이 됐다 (500g 줄 → CCP 0.5kg, 원료 계획 50).
 *   주원료 줄 (is_additional = 0): 배합 편집 화면의 '비율(%)' 칸 — 단위가 % 여야 한다.
 *       % 가 아닌 단위(kg·g 등)로 저장된 주원료 줄은 비율인지 kg 인지 정할 근거가 없어 계산하지 않는다 (생산 건을 만들지 않음).
 *       배합 편집에서 비율을 확인하고 저장하면 % 로 기록된다.
 *   추가 원재료 줄 (is_additional = 1): 화면의 '투입량(kg)' — 1배치 기준량(batch_target_kg) 한 번에 들어가는 kg (g 는 /1000).
 *       계획량에는 계획 kg / 1배치 기준량 으로 비례 — 기준량이 없으면 맞출 수 없어 막는다.
 *   그 밖의 단위는 kg 로 바꿀 근거가 없어 막는다 (추정하지 않음).
 *   원료 재고 단위로는 kg·g 만 바꾼다 (kgToMaterialUnit) — 개·포대 등은 막는다.
 * 원물 kg 와 공정 kg 의 구분은 그대로: 원료 계획(재고 출고)은 배합 원물, CCP 투입량은 조정량(adjusted_weight_kg, 공정 kg)이 있으면 그 값.
 */
export interface InputPlanRow {
  materialId: number | null;
  isDeductible: number | null;
  quantity: string | number | null;
  correctedQuantity?: string | number | null;
  unit?: string | null;
  isAdditional?: number | boolean | null;
}

export class BomQtyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BomQtyError";
  }
}

export function isPlannedInputRow(ing: InputPlanRow): boolean {
  return ing.materialId !== null && ing.isDeductible !== 0;
}

export type BomRowAmount =
  | { kind: "ratio"; pct: number }
  | { kind: "kg"; kg: number }
  | { kind: "invalid"; reason: string };

/** BOM 줄 하나의 양이 무엇을 뜻하는지 (계약은 파일 머리 참고) */
export function bomRowAmount(row: Pick<InputPlanRow, "quantity" | "correctedQuantity" | "unit" | "isAdditional">): BomRowAmount {
  const value = parseFloat(String(row.correctedQuantity || row.quantity || "0"));
  if (!Number.isFinite(value) || value < 0) return { kind: "invalid", reason: `수량 '${row.correctedQuantity || row.quantity}' 이 숫자가 아닙니다` };
  const unit = String(row.unit ?? "").trim().toLowerCase();
  const additional = row.isAdditional === true || Number(row.isAdditional) === 1;
  if (unit === "%") return { kind: "ratio", pct: value };
  if (unit === "kg" || unit === "g") {
    if (additional) return { kind: "kg", kg: unit === "g" ? value / 1000 : value };
    return { kind: "invalid", reason: `주원료 줄이 '${row.unit}' 로 저장돼 있어 비율(%)인지 ${row.unit} 인지 정할 수 없습니다 — 품목제조보고 배합에서 비율을 확인하고 저장하세요` };
  }
  return { kind: "invalid", reason: `단위 '${row.unit ?? ""}' 는 kg 로 바꿀 근거가 없습니다` };
}

/** 계획 완제품 kg 에 대한 BOM 줄 kg (재고 출고 기준 원물). 계산할 수 없으면 BomQtyError */
export function plannedRowKg(row: InputPlanRow, plannedKg: number, batchTargetKg: number | null | undefined): number {
  const a = bomRowAmount(row);
  if (a.kind === "invalid") throw new BomQtyError(a.reason);
  if (a.kind === "ratio") return (a.pct / 100) * plannedKg;
  const target = Number(batchTargetKg);
  if (!(Number.isFinite(target) && target > 0)) {
    throw new BomQtyError(`1배치 기준량이 없어 ${a.kg}kg 줄을 계획량(${plannedKg}kg)에 맞출 수 없습니다`);
  }
  return a.kg * (plannedKg / target);
}

/** kg → 원료 재고 단위 (kg·g 만, 빈 단위는 kg). 바꿀 수 없으면 null */
export function kgToMaterialUnit(kg: number, materialUnit: string | null | undefined): { qty: number; unit: string } | null {
  const u = String(materialUnit ?? "").trim().toLowerCase();
  if (u === "" || u === "kg") return { qty: kg, unit: "kg" };
  if (u === "g") return { qty: kg * 1000, unit: "g" };
  return null;
}

/** 원료 계획 수량 (원료 재고 단위). 계산할 수 없으면 BomQtyError */
export function plannedInputQty(
  ing: InputPlanRow,
  plannedKg: number,
  batchTargetKg: number | null | undefined,
  materialUnit: string | null | undefined,
): { qty: number; unit: string } {
  const kg = plannedRowKg(ing, plannedKg, batchTargetKg);
  const conv = kgToMaterialUnit(kg, materialUnit);
  if (!conv) throw new BomQtyError(`원료 단위 '${materialUnit}' 는 kg 에서 바꿀 근거가 없습니다`);
  return conv;
}
