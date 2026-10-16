/**
 * 배치 원물·공정·완제품 기준 스냅샷 (shared/production/massBasisPlan) — 수율 기준 PR B
 */
import { describe, it, expect } from "vitest";
import { buildMassBasisSnapshot } from "../shared/production/massBasisPlan";

// 우유설기 — CEO 확정 운영 기준(엑셀 kg): 준비 5판 = 완제품 12.5kg, 생멥쌀 8kg(배율 1.25)…
const milkVersion = { id: 472, referenceFinishedKg: "12.500", referenceRawTotalKg: null, massBasisEnabled: 1 };
const milkRows = [
  { id: 1, materialId: 615, processGroupId: 2, isDeductible: 1, quantity: "73.3", unit: "%", basisRawKg: "8", pretreatmentFactor: "1.25" },
  { id: 2, materialId: 701, processGroupId: 2, isDeductible: 1, quantity: "9.1", unit: "%", basisRawKg: "1", pretreatmentFactor: null },
  { id: 3, materialId: 702, processGroupId: 2, isDeductible: 1, quantity: "9.1", unit: "%", basisRawKg: "1", pretreatmentFactor: null },
  { id: 4, materialId: 191, processGroupId: null, isDeductible: 0, quantity: "7.3", unit: "%", basisRawKg: "0.8", pretreatmentFactor: null },
  { id: 5, materialId: 703, processGroupId: 2, isDeductible: 1, quantity: "1.2", unit: "%", basisRawKg: "0.13", pretreatmentFactor: null },
];

describe("buildMassBasisSnapshot", () => {
  it("우유설기 작업 2판(5kg): 생멥쌀 3.2 / 공정 4.0, 법적 % 가 아니라 운영 기준 원물 kg 사용, 공정·차감 정보 보존", () => {
    const r = buildMassBasisSnapshot(milkVersion, milkRows, 5);
    if (!r.ok) throw new Error(r.reason);
    const rice = r.snapshot.rows.find((x) => x.ingredientId === 1)!;
    expect([rice.rawKg, rice.processKg, rice.factor, rice.processGroupId]).toEqual([3.2, 4, 1.25, 2]);
    expect(r.snapshot.multiplier).toBeCloseTo(0.4, 12);
    expect(r.snapshot.totalRawKg).toBeCloseTo(4.372, 9);
    expect(r.snapshot.totalProcessKg).toBeCloseTo(5.172, 9);
    expect(r.snapshot.rows.find((x) => x.ingredientId === 4)!.isDeductible).toBe(false);
    expect(r.snapshot).toMatchObject({ calcVersion: "massBasis/1", versionId: 472, referenceFinishedKg: 12.5, plannedFinishedKg: 5 });
  });

  it("꺼진 버전은 만들지 않음 (기존 계산 그대로)", () => {
    expect(buildMassBasisSnapshot({ ...milkVersion, massBasisEnabled: 0 }, milkRows, 5)).toEqual({ ok: false, reason: "disabled" });
  });

  it("기준 원물 kg 없으면: kg·g 행은 quantity 그대로, % 행은 기준 원물 합계 필요 — 없으면 오류 (완제품에 % 를 곱하지 않음)", () => {
    const rows = [{ id: 9, materialId: 1, quantity: "40", unit: "%" }, { id: 10, materialId: 2, quantity: "500", unit: "g" }];
    const noTotal = buildMassBasisSnapshot({ id: 1, referenceFinishedKg: 100, massBasisEnabled: 1 }, rows, 100);
    expect(noTotal.ok).toBe(false);
    const withTotal = buildMassBasisSnapshot({ id: 1, referenceFinishedKg: 100, referenceRawTotalKg: 90, massBasisEnabled: 1 }, rows, 50);
    if (!withTotal.ok) throw new Error(withTotal.reason);
    expect(withTotal.snapshot.rows.map((x) => x.rawKg)).toEqual([18, 0.25]);
  });

  it("기준 완제품 없음·알 수 없는 단위(포대)는 오류로 — 추정하지 않음", () => {
    expect(buildMassBasisSnapshot({ id: 1, referenceFinishedKg: null, massBasisEnabled: 1 }, milkRows, 5).ok).toBe(false);
    const r = buildMassBasisSnapshot({ id: 1, referenceFinishedKg: 10, massBasisEnabled: 1 }, [{ id: 1, materialId: 1, quantity: "3", unit: "포대" }], 10);
    expect(r).toMatchObject({ ok: false });
  });
});
