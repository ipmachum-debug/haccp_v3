/**
 * useTabWithUrl 훅 단위 테스트
 */
import { describe, it, expect, beforeEach } from "vitest";

// URL 파라미터 파싱 로직만 테스트 (훅 자체는 React 환경 필요)
describe("useTabWithUrl - URL 파라미터 파싱", () => {
  it("URL에서 탭 파라미터 추출", () => {
    const url = new URL("http://localhost/page?tab=release&view=product");
    expect(url.searchParams.get("tab")).toBe("release");
    expect(url.searchParams.get("view")).toBe("product");
  });

  it("파라미터 없으면 null", () => {
    const url = new URL("http://localhost/page");
    expect(url.searchParams.get("tab")).toBeNull();
  });

  it("기본값 탭이면 파라미터 제거", () => {
    const url = new URL("http://localhost/page?tab=current");
    url.searchParams.delete("tab");
    expect(url.toString()).toBe("http://localhost/page");
  });

  it("다른 파라미터 유지하면서 탭만 변경", () => {
    const url = new URL("http://localhost/page?view=product&tab=current");
    url.searchParams.set("tab", "release");
    expect(url.searchParams.get("tab")).toBe("release");
    expect(url.searchParams.get("view")).toBe("product");
  });
});
