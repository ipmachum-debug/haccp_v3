/** --only 파싱 (Codex #541 재검증 P1: 오입력이 전체 범위로 번지지 않게) */
import { describe, it, expect } from "vitest";
import { parseOnlyIds } from "./_lib/onlyIds";

describe("parseOnlyIds", () => {
  it("미지정이면 null (전체), 정상 목록은 그대로 (중복 제거)", () => {
    expect(parseOnlyIds(["node", "x", "--apply"])).toBeNull();
    expect(parseOnlyIds(["--only=1717"])).toEqual([1717]);
    expect(parseOnlyIds(["--only=1717, 1718,1717"])).toEqual([1717, 1718]);
  });
  it("잘못된 값은 오류 — 빈 값·숫자 아님·0·음수·소수·빈 항목·값 없는 --only·두 번 지정", () => {
    for (const a of [["--only="], ["--only=abc"], ["--only=0"], ["--only=-5"], ["--only=1.5"], ["--only=1717,"], ["--only=,1717"], ["--only"], ["--only=1", "--only=2"], ["--only=99999999999999999999"]]) {
      expect(() => parseOnlyIds(a), a.join(" ")).toThrow();
    }
  });
});
