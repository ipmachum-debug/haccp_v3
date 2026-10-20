/**
 * CCP 공정 투입량 — 품목제조보고 버전 하나 기준 (2026-10-16, Codex 수율 기준 검토 #8)
 */
import { describe, it, expect } from "vitest";
import { ccpInputKgByGroup, rowKg, isWaterName, ccpInputKgFromSnapshot, type CcpBomRow } from "./ccpBomInput";
import { BomQtyError, plannedInputQty, plannedRowKg, bomRowAmount } from "./batchInputPlan";

const row = (version_id: number, version_no: number, pg: number, quantity: number, extra: Partial<CcpBomRow> = {}): CcpBomRow => ({
  // 기본은 1배치 기준 kg 절대량 줄 (추가 원재료) — 주원료는 unit "%" · is_additional 0 으로 따로 지정 (2026-10-20 BOM 줄 계약)
  version_id, version_no, approval_status: "APPROVED", process_group_id: pg, quantity, unit: "kg", is_additional: 1, material_name: "멥쌀", batch_target_kg: 100, ...extra,
});

describe("ccpInputKgByGroup", () => {
  it("우유설기: 승인 버전 2개를 더하지 않는다 (9/14 9.19kg = 4.55 + 4.635 → 배치 버전 4.635)", () => {
    const rows = [row(10, 1, 2, 4.55), row(11, 2, 2, 4.635), row(11, 2, 2, 0.8, { material_name: "정제수" })];
    // 정제수도 공정 투입량에 포함 (2026-10-18 CEO) — 4.635 + 0.8
    expect(ccpInputKgByGroup(rows, 11).get(2)).toEqual({ kg: 5.435, versionId: 11 });
  });

  it("다른 버전 값으로 메우지 않는다 — 보고서 418: 버전2 가 호두를 공정4→1 로 옮김 → 공정4 없음, 기준량도 섞지 않음 (Codex 배포 검토 P2)", () => {
    const rows = [
      row(422, 1, 1, 50, { batch_target_kg: 100 }), row(422, 1, 4, 1.2, { unit: "%", batch_target_kg: 100, material_name: "호두분태" }),
      row(481, 2, 1, 40, { batch_target_kg: 95 }), row(481, 2, 1, 1.2, { unit: "%", batch_target_kg: 95, material_name: "호두분태" }),
    ];
    const m = ccpInputKgByGroup(rows, 481);
    expect([...m.keys()]).toEqual([1]);
    expect(m.get(1)!.kg).toBeCloseTo(40 + 1.14, 9);
  });

  it("배치 버전에 공정 지정 원료가 하나도 없으면 빈 결과 (호출측 기존 폴백) — 이전 버전으로 되살리지 않음", () => {
    expect(ccpInputKgByGroup([row(426, 1, 1, 60)], 464).size).toBe(0);
  });

  it("정제수도 공정 투입량에 들어간다 — 재고 차감 제외와는 다른 의미 (2026-10-18 CEO)", () => {
    expect(ccpInputKgByGroup([row(1, 1, 5, 3, { material_name: "정제수" })], 1).get(5)).toEqual({ kg: 3, versionId: 1 });
  });

  it("배치 버전이 DRAFT(승인 버전 없음 fallback) 여도 그 버전을 쓴다", () => {
    expect(ccpInputKgByGroup([row(7, 3, 1, 12, { approval_status: "DRAFT" })], 7).get(1)).toEqual({ kg: 12, versionId: 7 });
  });

  it("공정 미지정(NULL) 원료는 어느 공정에도 넣지 않는다", () => {
    const m = ccpInputKgByGroup([row(1, 1, 1, 5), { ...row(1, 1, 1, 9), process_group_id: null }], 1);
    expect([...m.entries()]).toEqual([[1, { kg: 5, versionId: 1 }]]);
  });
});

describe("rowKg", () => {
  it("% 는 그 행 버전의 batch_target_kg 기준, g 는 /1000, 보정값 우선순위 adjusted > corrected > quantity", () => {
    expect(rowKg(row(1, 1, 1, 73.3, { unit: "%", batch_target_kg: 12.5 }))).toBeCloseTo(9.1625, 6);
    expect(rowKg(row(1, 1, 1, 0, { unit: "%", batch_target_kg: null }))).toBe(0);
    expect(rowKg(row(1, 1, 1, 130, { unit: "g" }))).toBeCloseTo(0.13, 6);
    expect(rowKg(row(1, 1, 1, 8, { corrected_quantity: 9 }))).toBe(9);
    expect(rowKg(row(1, 1, 1, 8, { corrected_quantity: 9, adjusted_weight_kg: 10 }))).toBe(10);
  });
  it("BOM 줄 계약 — 주원료 % 는 기준량 비례, 추가 원재료 kg·g 는 절대량, % 가 아닌 주원료·모르는 단위는 추정하지 않고 막음 (검토 1)", () => {
    const main = { is_additional: 0, unit: "%" };
    expect(rowKg(row(1, 1, 1, 5, { ...main, batch_target_kg: 10 }))).toBeCloseTo(0.5, 9);
    expect(rowKg(row(1, 1, 1, 500, { unit: "g", batch_target_kg: 10 }))).toBeCloseTo(0.5, 9);
    expect(rowKg(row(1, 1, 1, 2, { unit: "kg", batch_target_kg: 96 }))).toBe(2);
    expect(() => rowKg(row(1, 1, 1, 57, { is_additional: 0, unit: "kg" }))).toThrow(BomQtyError);
    expect(() => rowKg(row(1, 1, 1, 500, { is_additional: 0, unit: "g" }))).toThrow(/비율\(%\)인지/);
    expect(() => rowKg(row(1, 1, 1, 3, { unit: "ea" }))).toThrow(/kg 로 바꿀 근거가 없습니다/);
    expect(() => ccpInputKgByGroup([row(1, 1, 1, 57, { is_additional: 0, unit: "kg" })], 1)).toThrow(BomQtyError);
    // 조정량(공정 kg)이 있으면 그 값 — 단위와 무관
    expect(rowKg(row(1, 1, 1, 57, { is_additional: 0, unit: "kg", adjusted_weight_kg: 18.5 }))).toBe(18.5);
  });
  it("정제수 판별", () => {
    expect(isWaterName("정제수")).toBe(true);
    expect(isWaterName("물")).toBe(true);
    expect(isWaterName("물엿")).toBe(false);
  });
});

describe("ccpInputKgFromSnapshot (수율 기준 PR C)", () => {
  // 우유설기 2판(5kg) 스냅샷 — 기록지 한 행 = batch_target_kg 5kg
  const milk = [
    { materialId: 168, processGroupId: 2, processKg: 4 },     // 불린 멥쌀 (원물 3.2 × 1.25)
    { materialId: 191, processGroupId: 2, processKg: 0.32 },  // 정제수 — 포함 (2026-10-18)
    { materialId: 177, processGroupId: 2, processKg: 0.4 },
    { materialId: 188, processGroupId: 2, processKg: 0.4 },
    { materialId: 199, processGroupId: 2, processKg: 0.052 },
    { materialId: 300, processGroupId: null, processKg: 9 },  // 공정 미지정 — 넣지 않음
  ];
  it("공정 투입량은 원물이 아니라 전처리 후 kg, 정제수 포함·미지정 제외 (4 + 0.32 + 0.4 + 0.4 + 0.052)", () => {
    expect(ccpInputKgFromSnapshot(milk, new Set([191]), 5, 5)).toEqual({ 2: 5.172 });
  });
  it("배치가 12.5kg 이면 기록지 한 행(5kg) 기준으로 나눔", () => {
    const big = milk.map((r) => ({ ...r, processKg: r.processKg * 2.5 }));
    expect(ccpInputKgFromSnapshot(big, new Set([191]), 5, 12.5)).toEqual({ 2: 5.172 });
  });
  it("행 기준량이 없으면 배치 전체량", () => {
    expect(ccpInputKgFromSnapshot(milk, new Set([191]), null, 5)).toEqual({ 2: 5.172 });
  });
});

describe("원료 계획 = CCP 투입량 — 같은 BOM 줄 계약 (2026-10-20 BOM·설비 시간·인쇄 기준 검토 1)", () => {
  const plan = (r: Partial<{ quantity: string; correctedQuantity: string; unit: string; isAdditional: number }>, kg: number, target: number | null, mu = "kg") =>
    plannedInputQty({ materialId: 1, isDeductible: 1, quantity: "0", ...r }, kg, target, mu);
  it("Codex 재현 1: 기준 10kg · 생산 10kg · 500g 줄 → 원료 계획 0.5kg (이전 50), CCP 0.5kg", () => {
    expect(plan({ quantity: "500", unit: "g", isAdditional: 1 }, 10, 10)).toEqual({ qty: 0.5, unit: "kg" });
    expect(rowKg(row(1, 1, 1, 500, { unit: "g", batch_target_kg: 10 }))).toBeCloseTo(0.5, 9);
  });
  it("Codex 재현 2: 기준 10kg · 생산 20kg · 2kg 줄 → 원료 계획 4kg (이전 0.4), CCP 1회차 2kg × 2회차", () => {
    expect(plan({ quantity: "2", unit: "kg", isAdditional: 1 }, 20, 10).qty).toBeCloseTo(4, 9);
    expect(rowKg(row(1, 1, 1, 2, { batch_target_kg: 10 })) * (20 / 10)).toBeCloseTo(4, 9);
  });
  it("대조군 5% — 두 계산 모두 1kg (기존과 같음, 기준량 없어도 % 는 계획량 비례)", () => {
    expect(plan({ quantity: "5", unit: "%" }, 20, 10).qty).toBeCloseTo(1, 9);
    expect(plan({ quantity: "5", unit: "%" }, 20, null).qty).toBeCloseTo(1, 9);
    expect(rowKg(row(1, 1, 1, 5, { is_additional: 0, unit: "%", batch_target_kg: 20 }))).toBeCloseTo(1, 9);
  });
  it("기준량 10/96/100kg · 부분 회차 — kg 줄은 계획/기준 비례, 원료 재고 단위 g 면 ×1000", () => {
    for (const target of [10, 96, 100]) {
      expect(plannedRowKg({ materialId: 1, isDeductible: 1, quantity: "2", unit: "kg", isAdditional: 1 }, 475, target)).toBeCloseTo(2 * 475 / target, 9);
      expect(plannedRowKg({ materialId: 1, isDeductible: 1, quantity: "62.6", unit: "%" }, 475, target)).toBeCloseTo(297.35, 9);
    }
    expect(plan({ quantity: "5", unit: "%" }, 10, 10, "g")).toEqual({ qty: 500, unit: "g" });
    expect(plan({ quantity: "500", unit: "g", isAdditional: 1 }, 5, 10, "g")).toEqual({ qty: 250, unit: "g" });
  });
  it("정할 수 없으면 막음 — 기준량 없는 kg 줄, % 가 아닌 주원료, 모르는 단위, 원료 단위 개·포대", () => {
    expect(() => plan({ quantity: "2", unit: "kg", isAdditional: 1 }, 20, null)).toThrow(/1배치 기준량이 없어/);
    expect(() => plan({ quantity: "57", unit: "kg", isAdditional: 0 }, 20, 100)).toThrow(BomQtyError);
    expect(() => plan({ quantity: "3", unit: "ml", isAdditional: 1 }, 20, 100)).toThrow(/근거가 없습니다/);
    expect(() => plan({ quantity: "5", unit: "%" }, 20, 100, "ea")).toThrow(/원료 단위 'ea'/);
    expect(bomRowAmount({ quantity: "abc", unit: "%" }).kind).toBe("invalid");
  });
});
