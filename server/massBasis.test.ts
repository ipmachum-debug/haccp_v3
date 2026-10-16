/**
 * 원물·공정·완제품 기준 계산 (shared/production/massBasis) — Codex 수율 기준 검토 v5 의 확인 사례
 */
import { describe, it, expect } from "vitest";
import { computeMassBasis, productionMultiplier, referenceRawKgOf, finishedKgForTrays, MassBasisError } from "../shared/production/massBasis";

const STICKY = 1.4; // 생찹쌀 1kg → 불린찹쌀 1.4kg (CEO 확인)
const NON_GLUTINOUS = 1.25; // 생멥쌀 1kg → 불린멥쌀 1.25kg
const rowOf = (r: ReturnType<typeof computeMassBasis>, key: string) => r.rows.find((x) => x.key === key)!;

describe("우유설기 — 준비 5판(완제품 12.5kg) / 작업 2판(5kg)", () => {
  const prep = [
    { key: "멥쌀", rawKg: 8, factor: NON_GLUTINOUS },
    { key: "우유", rawKg: 1 }, { key: "설탕", rawKg: 1 }, { key: "정제수", rawKg: 0.8 }, { key: "소금", rawKg: 0.13 },
  ];
  it("운영 기준 (CEO 확정, 엑셀 kg): 작업 2판 생멥쌀 3.2kg 출고, 공정 멥쌀 4.0kg, 나머지도 같은 배수 (×0.4)", () => {
    const r = computeMassBasis({ rows: prep, referenceFinishedKg: finishedKgForTrays(5, 2.5), plannedFinishedKg: finishedKgForTrays(2, 2.5) });
    expect(r.multiplier).toBeCloseTo(0.4, 12);
    expect(rowOf(r, "멥쌀").rawKg).toBeCloseTo(3.2, 9);
    expect(rowOf(r, "멥쌀").processKg).toBeCloseTo(4.0, 9);
    expect(rowOf(r, "우유").rawKg).toBeCloseTo(0.4, 9);
    expect(rowOf(r, "소금").rawKg).toBeCloseTo(0.052, 9);
    // 공정 투입 합계 5.172kg 와 완제품 5kg 는 다른 값 — 차이를 손실로 기록하지 않는다
    expect(r.totalProcessKg).toBeCloseTo(5.172, 9);
    expect(r.plannedFinishedKg).toBe(5);
  });
  it("PDF 73.3% 를 완제품 5kg 에 바로 곱한 3.665kg 가 아니다", () => {
    const r = computeMassBasis({ rows: prep, referenceFinishedKg: 12.5, plannedFinishedKg: 5 });
    expect(rowOf(r, "멥쌀").rawKg).not.toBeCloseTo(5 * 0.733, 2);
  });
  // 비율(percent) 입력 산식 검증용 비교 사례 — 우유설기 운영값이 아니다.
  // CEO 확정(2026-10-16): 우유설기 운영 기준은 엑셀 kg (준비 5판 원물 생멥쌀 8kg / 완제품 12.5kg, 배율 1.25 → 작업 2판 3.2 / 4.0kg).
  it("percent 입력 산식: 기준 원물 합계 × % / 100 (예시 수치 10.93kg × 73.3% → 작업 5kg 3.204676 / 공정 4.005845)", () => {
    const r = computeMassBasis({
      rows: [{ key: "멥쌀", percent: 73.3, factor: NON_GLUTINOUS }],
      referenceFinishedKg: 12.5, referenceRawTotalKg: 10.93, plannedFinishedKg: 5,
    });
    expect(rowOf(r, "멥쌀").rawKg).toBeCloseTo(3.204676, 6);
    expect(rowOf(r, "멥쌀").processKg).toBeCloseTo(4.005845, 6);
  });
});

describe("10종설기 — 멥쌀 80kg 는 10맛 × 5판 = 50판분 (완제품 125kg)", () => {
  it("합계 경로와 맛별 경로가 같은 3.2kg — 50판을 5판으로 취급하면 10배 오류", () => {
    const total = computeMassBasis({ rows: [{ key: "멥쌀", rawKg: 80, factor: NON_GLUTINOUS }], referenceFinishedKg: finishedKgForTrays(50, 2.5), plannedFinishedKg: 5 });
    const perFlavor = computeMassBasis({ rows: [{ key: "멥쌀", rawKg: 8, factor: NON_GLUTINOUS }], referenceFinishedKg: finishedKgForTrays(5, 2.5), plannedFinishedKg: 5 });
    expect(rowOf(total, "멥쌀").rawKg).toBeCloseTo(3.2, 9);
    expect(rowOf(perFlavor, "멥쌀").rawKg).toBeCloseTo(rowOf(total, "멥쌀").rawKg, 9);
    const wrong = computeMassBasis({ rows: [{ key: "멥쌀", rawKg: 80 }], referenceFinishedKg: 12.5, plannedFinishedKg: 5 });
    expect(rowOf(wrong, "멥쌀").rawKg / rowOf(total, "멥쌀").rawKg).toBeCloseTo(10, 9);
  });
});

describe("불린 kg 로 적힌 배합 — 원물로 되돌리고, 원물 kg 는 다시 나누지 않는다", () => {
  it("왕찹쌀떡: 불린찹쌀 30kg → 생찹쌀 21.428571kg, 불린멥쌀 10kg → 생멥쌀 8kg", () => {
    expect(referenceRawKgOf({ key: "찹쌀", processedKg: 30, factor: STICKY })).toBeCloseTo(21.428571, 6);
    expect(referenceRawKgOf({ key: "멥쌀", processedKg: 10, factor: NON_GLUTINOUS })).toBeCloseTo(8, 9);
  });
  it("두 입력 경로 동치: 불린 30kg(배율 1.4) == 원물 21.428571kg", () => {
    const a = computeMassBasis({ rows: [{ key: "찹쌀", processedKg: 30, factor: STICKY }], referenceFinishedKg: 94.99, plannedFinishedKg: 100 });
    const b = computeMassBasis({ rows: [{ key: "찹쌀", rawKg: 30 / STICKY, factor: STICKY }], referenceFinishedKg: 94.99, plannedFinishedKg: 100 });
    expect(a.rows[0].rawKg).toBeCloseTo(b.rows[0].rawKg, 12);
    expect(a.rows[0].processKg).toBeCloseTo(30 * 100 / 94.99, 9);
  });
  it("원물 kg 에 배율을 줘도 원물 값은 그대로 (다시 나누지 않음) — 공정 kg 만 커진다", () => {
    expect(referenceRawKgOf({ key: "찹쌀", rawKg: 21.428571, factor: STICKY })).toBe(21.428571);
  });
});

describe("콩고물쑥떡 배치 1109 — 계획 191kg, 기준 완제품 95.34kg", () => {
  it("이론 원물: 찹쌀 42.929066kg, 멥쌀 16.026851kg (설탕 등 비쌀 원료도 같은 배수)", () => {
    const r = computeMassBasis({
      rows: [{ key: "찹쌀", rawKg: 21.428571, factor: STICKY }, { key: "멥쌀", rawKg: 8, factor: NON_GLUTINOUS }, { key: "설탕", rawKg: 3 }],
      referenceFinishedKg: 95.34, plannedFinishedKg: 191,
    });
    expect(rowOf(r, "찹쌀").rawKg).toBeCloseTo(42.929066, 5);
    expect(rowOf(r, "멥쌀").rawKg).toBeCloseTo(16.026851, 5);
    expect(rowOf(r, "설탕").rawKg).toBeCloseTo(3 * 191 / 95.34, 9);
  });
});

describe("기존 1:1 업체 — 배율 1.0, 기준 완제품 = 배치 크기면 기존 계산과 같다", () => {
  it("100kg 배합(합계 100) 으로 250kg 생산 → 각 원료 ×2.5, 원물 = 공정", () => {
    const r = computeMassBasis({ rows: [{ key: "A", rawKg: 60 }, { key: "B", rawKg: 40 }], referenceFinishedKg: 100, plannedFinishedKg: 250 });
    expect(r.rows.map((x) => [x.rawKg, x.processKg])).toEqual([[150, 150], [100, 100]]);
  });
  it("g 단위는 kg 로", () => {
    expect(referenceRawKgOf({ key: "소금", rawKg: 130, unit: "g" })).toBeCloseTo(0.13, 12);
  });
  it("생산 0kg → 원물 0", () => {
    expect(computeMassBasis({ rows: [{ key: "A", rawKg: 10 }], referenceFinishedKg: 10, plannedFinishedKg: 0 }).totalRawKg).toBe(0);
  });
});

describe("막아야 하는 입력", () => {
  it("기준 완제품 0·전처리 배율 0·지원하지 않는 단위·입력 중복/누락·비율인데 원물 합계 없음", () => {
    expect(() => productionMultiplier(5, 0)).toThrow(MassBasisError);
    expect(() => referenceRawKgOf({ key: "x", rawKg: 1, factor: 0 })).toThrow(/전처리 배율/);
    expect(() => referenceRawKgOf({ key: "x", rawKg: 1, unit: "포대" as any })).toThrow(/지원하지 않는 단위/);
    expect(() => referenceRawKgOf({ key: "x", rawKg: 1, percent: 5 })).toThrow(/하나만/);
    expect(() => referenceRawKgOf({ key: "x" })).toThrow(/하나만/);
    expect(() => referenceRawKgOf({ key: "x", percent: 73.3 })).toThrow(/기준 원물 합계/);
    expect(() => finishedKgForTrays(2, 0)).toThrow(MassBasisError);
  });
});
