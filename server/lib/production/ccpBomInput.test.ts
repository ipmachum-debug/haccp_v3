/**
 * CCP 공정 투입량 — 품목제조보고 버전 하나 기준 (2026-10-16, Codex 수율 기준 검토 #8)
 */
import { describe, it, expect } from "vitest";
import { ccpInputKgByGroup, rowKg, isWaterName, ccpInputKgFromSnapshot, type CcpBomRow } from "./ccpBomInput";

const row = (version_id: number, version_no: number, pg: number, quantity: number, extra: Partial<CcpBomRow> = {}): CcpBomRow => ({
  version_id, version_no, approval_status: "APPROVED", process_group_id: pg, quantity, unit: "kg", material_name: "멥쌀", batch_target_kg: 100, ...extra,
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
