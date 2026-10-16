/**
 * 품목제조보고 저장 — 화면이 보내지 않은 값은 원래 행에서 이어받는다 (2026-10-16, 보고서 422 버전2 CCP 공정 지정 소실)
 */
import { describe, it, expect } from "vitest";
import { mergeIngredientRows, unknownIngredientIds } from "./mfIngredientMerge";

const existing = [
  { id: 7142, processGroupId: 1, adjustedWeightKg: null, correctedQuantity: "44.3", isAdditional: 0, childSkuId: null, pieceCount: null, pieceWeightG: null },
  { id: 7143, processGroupId: null, adjustedWeightKg: "18.5", correctedQuantity: null, isAdditional: 0 },
  { id: 7150, processGroupId: 1, adjustedWeightKg: "3", correctedQuantity: null, isAdditional: 1 },
];
const base = { quantity: 43, unit: "%", isDeductible: 1, materialType: "RAW" };

describe("mergeIngredientRows", () => {
  it("'수정' 화면처럼 공정 지정을 안 보내면 원래 행의 CCP 공정·보정배합이 유지된다 (이전: 전부 NULL)", () => {
    const [row] = mergeIngredientRows([{ ...base, id: 7142, materialId: 645 }], existing, 464);
    expect(row).toMatchObject({ mfReportVersionId: 464, lineNo: 1, materialId: 645, quantity: "43", processGroupId: 1, correctedQuantity: "44.3" });
  });

  it("미지정(NULL) 행은 미지정 그대로 — 공정을 새로 붙이지 않는다", () => {
    const [row] = mergeIngredientRows([{ ...base, id: 7143, materialId: 700 }], existing, 464);
    expect(row.processGroupId).toBeNull();
    expect(row.adjustedWeightKg).toBe("18.5");
  });

  it("편집 화면이 명시적으로 null 을 보내면 비우고, 값을 보내면 그 값", () => {
    const rows = mergeIngredientRows([
      { ...base, id: 7142, materialId: 645, processGroupId: null },
      { ...base, id: 7143, materialId: 700, processGroupId: 3, adjustedWeightKg: null },
    ], existing, 464);
    expect(rows.map((r) => [r.processGroupId, r.adjustedWeightKg])).toEqual([[null, null], [3, null]]);
  });

  it("id 없는 새 행·다른 버전의 id 는 원본으로 추정하지 않는다 (재료·순서·이름 매칭 없음)", () => {
    const rows = mergeIngredientRows([
      { ...base, materialId: 645 },                // 같은 재료지만 id 없음
      { ...base, id: 99999, materialId: 645 },     // 이 버전에 없는 id
    ], existing, 464);
    expect(rows.map((r) => [r.processGroupId, r.correctedQuantity])).toEqual([[null, null], [null, null]]);
  });

  it("추가 원재료 행도 id 로 원래 값 유지 (isAdditional 생략 시 원래 1)", () => {
    const [row] = mergeIngredientRows([{ ...base, id: 7150, materialId: 191, quantity: 3, unit: "kg", isDeductible: 0 }], existing, 464);
    expect(row).toMatchObject({ isAdditional: 1, processGroupId: 1, adjustedWeightKg: "3" });
  });

  it("행 순서대로 line_no 를 다시 매긴다", () => {
    const rows = mergeIngredientRows([{ ...base, id: 7143 }, { ...base, id: 7142 }], existing, 464);
    expect(rows.map((r) => r.lineNo)).toEqual([1, 2]);
  });
});

describe("unknownIngredientIds — 오래된 화면 거부 (Codex 배포 검토 P2)", () => {
  it("현재 버전에 없는 id·같은 id 두 번은 거부 대상, id 없는 새 행은 괜찮음", () => {
    expect(unknownIngredientIds([{ ...base, id: 7142 }, { ...base }], existing)).toEqual([]);
    expect(unknownIngredientIds([{ ...base, id: 8001 }], existing)).toEqual([8001]);
    expect(unknownIngredientIds([{ ...base, id: 7142 }, { ...base, id: 7142 }], existing)).toEqual([7142]);
  });
});

describe("기준 원물 kg·전처리 배율 (수율 기준 PR B) 도 같은 규칙", () => {
  it("화면이 안 보내면 원래 값 유지, null 이면 비움, 값이면 그 값", () => {
    const ex = [{ id: 1, processGroupId: 2, basisRawKg: "8.0000", pretreatmentFactor: "1.2500" }];
    const [keep] = mergeIngredientRows([{ ...base, id: 1 }], ex, 472);
    expect([keep.basisRawKg, keep.pretreatmentFactor]).toEqual(["8.0000", "1.2500"]);
    const [cleared] = mergeIngredientRows([{ ...base, id: 1, basisRawKg: null, pretreatmentFactor: 1.4 }], ex, 472);
    expect([cleared.basisRawKg, cleared.pretreatmentFactor]).toEqual([null, "1.4"]);
  });
});
