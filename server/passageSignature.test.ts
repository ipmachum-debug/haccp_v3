/**
 * CCP-4P 통과 기록 비교 — 수 · 합계가 아니라 (품목, 수량, 단위) 목록 (Codex #590 R590-05)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expectedPassageEntries, passageMatches } from "./lib/haccp/passageSignature";

const src = (o: Record<string, unknown> = {}) => ({
  batch_id: 1126, sku_id: null, product_name: "시험제품", sku_name: null, sales_unit: null,
  sku_quantity: 0, sku_kg: null, planned_quantity: "2.000", ...o,
}) as any;

describe("expectedPassageEntries — 통과행 생성 규칙과 같음 (통과량 = 생산량)", () => {
  it("SKU 실적 없음 → 제품명 / kg", () => {
    expect(expectedPassageEntries([src()], "")).toEqual([{ name: "시험제품", qty: 2, unit: "kg" }]);
  });
  it("SKU 실적 있음 → SKU 이름 / 실적 수량 / 판매단위", () => {
    expect(expectedPassageEntries([src({ sku_id: 221, sku_name: "1kg 상자", sales_unit: "box", sku_quantity: "2", sku_kg: "2.000" })], ""))
      .toEqual([{ name: "1kg 상자", qty: 2, unit: "box" }]);
  });
});

describe("passageMatches", () => {
  it("Codex 재현: kg 2 → 상자 2 (수·합계 같음) 는 다른 기록 → 다시 만든다", () => {
    const existing = [{ name: "시험제품", qty: 2, unit: "kg" }];
    const expected = expectedPassageEntries([src({ sku_id: 221, sku_name: "1kg 상자", sales_unit: "box", sku_quantity: "2" })], "");
    expect(passageMatches(existing, expected)).toBe(false);
  });
  it("단위만 바뀜 → 다름, 순서만 다름 → 같음", () => {
    expect(passageMatches([{ name: "A", qty: 2, unit: "kg" }], [{ name: "A", qty: 2, unit: "pack" }])).toBe(false);
    expect(passageMatches([{ name: "A", qty: 2, unit: "kg" }, { name: "B", qty: 5, unit: "box" }], [{ name: "B", qty: 5, unit: "box" }, { name: "A", qty: 2, unit: "kg" }])).toBe(true);
  });
  it("수량 합이 같아도 행 구성이 다르면 다름 (3+5 vs 4+4)", () => {
    expect(passageMatches([{ name: "A", qty: 3, unit: "box" }, { name: "A", qty: 5, unit: "box" }], [{ name: "A", qty: 4, unit: "box" }, { name: "A", qty: 4, unit: "box" }])).toBe(false);
  });
  it("단위 컬럼 생성 전 DB 는 품목·수량만 비교", () => {
    expect(passageMatches([{ name: "A", qty: 2, unit: null }], [{ name: "A", qty: 2, unit: "kg" }], false)).toBe(true);
  });
  it("동기화가 이 비교를 쓴다 (개수·합계 비교 아님)", () => {
    const s = readFileSync(join(__dirname, "db/haccp/ccpFormSettings.ts"), "utf-8");
    expect(s).toMatch(/samePassage\(existing, expectedPassageEntries\(/);
    expect(s).not.toMatch(/COUNT\(\*\) AS n, COALESCE\(SUM\(pass_qty\), 0\) AS q/);
  });
});
