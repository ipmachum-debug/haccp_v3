/**
 * 품목제조보고 회사 소유 검증 (설계 18 R6) — 입력에서 확인할 번호 모으기, 라우터 연결
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { collectMfIds } from "./lib/production/mfReportOwnership";

describe("collectMfIds — 입력의 모든 번호", () => {
  it("저장(update): 보고서·원료 줄·원료 품목·공정", () => {
    expect(collectMfIds({ mfReportId: 7, ingredients: [{ id: 11, materialId: 101, processGroupId: 3 }, { materialId: 102, processGroupId: null }] }))
      .toEqual({ reports: [7], versions: [], ingredients: [11], items: [101, 102], groups: [3] });
  });
  it("버전·일괄·조회·매핑·조정", () => {
    expect(collectMfIds({ versionId: 5 }).versions).toEqual([5]);
    expect(collectMfIds({ mfReportVersionId: 6, materialId: 9 })).toMatchObject({ versions: [6], items: [9] });
    expect(collectMfIds({ ids: [1, 2, 2] }).reports).toEqual([1, 2]);
    expect(collectMfIds({ id: 4 }).reports).toEqual([4]);
    expect(collectMfIds({ versionId: 1, mappings: [{ ingredientId: 8, processGroupId: 2 }] })).toMatchObject({ ingredients: [8], groups: [2] });
    expect(collectMfIds({ versionId: 1, adjustments: [{ processGroupId: 4, yieldMaterialId: 77 }] })).toMatchObject({ groups: [4], items: [77] });
  });
  it("값이 없거나 숫자가 아니면 건너뜀", () => {
    expect(collectMfIds(undefined)).toEqual({ reports: [], versions: [], ingredients: [], items: [], groups: [] });
    expect(collectMfIds({ mfReportId: "x", versionId: 0 })).toEqual({ reports: [], versions: [], ingredients: [], items: [], groups: [] });
  });
});

describe("라우터 연결", () => {
  const r = readFileSync(join(__dirname, "routers/production/mfReport.router.ts"), "utf-8");
  it("번호를 받는 프로시저는 모두 소유 검증을 거친다 (목록·회사 설정·맛 목록만 예외)", () => {
    const body = r.slice(r.indexOf("export const mfReportRouter"));
    const plain = Array.from(body.matchAll(/^    ([a-zA-Z]+): (adminProcedure|tenantRequiredProcedure)/gm)).map((m) => m[1]);
    expect(plain.sort()).toEqual(["list", "listFlavors", "massBasisFeature", "setMassBasisFeature"]);
    expect(body).toMatch(/update: mfAdmin/);
    expect(body).toMatch(/approveVersion: mfAdmin/);
  });
});
