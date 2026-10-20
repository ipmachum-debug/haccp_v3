/**
 * 작업 위치 보존 — URL 쿼리·돌아갈 주소 순수 함수 (2026-10-21)
 */
import { describe, it, expect } from "vitest";
import { patchSearch, pickAllowed, pickPage, pickDate, pickMonth, safeReturnTo, withReturnTo, returnToFromSearch } from "../client/src/lib/urlState";

describe("patchSearch — 바꿀 키만, 나머지 키는 그대로", () => {
  it("설정·삭제·다른 키 보존", () => {
    expect(patchSearch("?tab=a&q=x", { tab: "b" })).toBe("?tab=b&q=x");
    expect(patchSearch("?tab=a&q=x", { tab: null })).toBe("?q=x");
    expect(patchSearch("tab=a", { q: "" })).toBe("?tab=a");
    expect(patchSearch("", { page: 2 })).toBe("?page=2");
    expect(patchSearch("?a=1", { a: undefined })).toBe("");
  });
});

describe("pickAllowed·pickPage — 잘못된 쿼리는 안전한 기본값", () => {
  it("허용 목록 밖·빈 값은 기본", () => {
    expect(pickAllowed("mf-reports", "material-ledger", ["material-ledger", "mf-reports"])).toBe("mf-reports");
    expect(pickAllowed("hack", "material-ledger", ["material-ledger", "mf-reports"])).toBe("material-ledger");
    expect(pickAllowed(null, "x")).toBe("x");
    expect(pickAllowed("free", "x")).toBe("free"); // 목록 없으면 그대로
  });
  it("페이지는 1 이상의 정수만", () => {
    expect(pickPage("3")).toBe(3);
    for (const bad of ["0", "-1", "1.5", "abc", "", null, "999999999"]) expect(pickPage(bad as any)).toBe(1);
  });
});

describe("pickDate·pickMonth — 실제 있는 날짜·월만", () => {
  it("모양·달력이 맞으면 그대로, 아니면 기본", () => {
    expect(pickDate("2026-09-14", "x")).toBe("2026-09-14");
    expect(pickDate("2024-02-29", "x")).toBe("2024-02-29");
    for (const bad of ["2026-02-31", "2026-13-01", "2026-9-14", "20260914", "", null, "2026-09-14T00:00"]) expect(pickDate(bad as any, "x")).toBe("x");
    expect(pickMonth("2026-09", "m")).toBe("2026-09");
    for (const bad of ["2026-00", "2026-13", "2026-9", "", null]) expect(pickMonth(bad as any, "m")).toBe("m");
  });
});

describe("safeReturnTo — 같은 사이트의 상대 경로만 (외부·프로토콜 상대 주소 거절)", () => {
  const fb = "/dashboard/manufacturing-standards?tab=mf-reports";
  it("상대 경로는 그대로", () => {
    expect(safeReturnTo("/dashboard/manufacturing-standards?tab=mf-reports&mfQ=떡", fb)).toBe("/dashboard/manufacturing-standards?tab=mf-reports&mfQ=떡");
    expect(safeReturnTo("/dashboard/batch-management?view=calendar&month=2026-09&day=2026-09-14", fb)).toContain("month=2026-09");
  });
  it("외부·위험한 값은 기본 복귀", () => {
    for (const bad of ["https://evil.example/x", "//evil.example/x", "/\\evil.example", "javascript:alert(1)", "/javascript:alert(1)",
      "dashboard/x", " /dashboard", "/a\nb", "", null, undefined, "/" + "a".repeat(2100)]) {
      expect(safeReturnTo(bad as any, fb)).toBe(fb);
    }
  });
  it("withReturnTo → returnToFromSearch 왕복", () => {
    const from = "/dashboard/manufacturing-standards?tab=mf-reports&mfQ=a b&mfStatus=ALL";
    const to = withReturnTo("/dashboard/mf-report/modify/444", from);
    expect(to.startsWith("/dashboard/mf-report/modify/444?returnTo=")).toBe(true);
    expect(returnToFromSearch(to.slice(to.indexOf("?")), fb)).toBe(from);
    expect(withReturnTo("/design/recipes/1?version=2", "/design/recipes?signal=red")).toBe(`/design/recipes/1?version=2&returnTo=${encodeURIComponent("/design/recipes?signal=red")}`);
    expect(returnToFromSearch("?returnTo=https%3A%2F%2Fevil.example", fb)).toBe(fb);
    expect(returnToFromSearch("", fb)).toBe(fb);
  });
});
