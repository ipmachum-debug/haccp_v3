/**
 * 생산 자동화 에이전트 — 제품 이름 매칭 점수 테스트
 *
 * 배경: 자연어 입력의 제품명이 잘못 매칭되면 엉뚱한 배치가 만들어진다.
 *       점수 체계가 "완전일치 > 부분포함 > 토큰" 순서를 유지하는지 고정한다.
 */
import { describe, it, expect } from "vitest";
import { scoreProduct } from "../autoAgent.router";

describe("scoreProduct", () => {
  it("완전 일치는 100점", () => {
    expect(scoreProduct("초코크림 케이크", "초코크림 케이크")).toBe(100);
  });

  it("공백/괄호/하이픈 차이는 무시하고 완전 일치로 본다", () => {
    expect(scoreProduct("초코크림케이크", "초코크림 케이크")).toBe(100);
    expect(scoreProduct("흑임자-인절미", "흑임자 인절미")).toBe(100);
  });

  it("부분 포함은 100점 미만이지만 유의미한 점수", () => {
    const s = scoreProduct("초코크림", "초코크림 케이크");
    expect(s).toBeGreaterThan(30);
    expect(s).toBeLessThan(100);
  });

  it("완전 일치가 부분 일치보다 항상 높다", () => {
    const exact = scoreProduct("앙버터", "앙버터");
    const partial = scoreProduct("앙버터", "앙버터 크림빵");
    expect(exact).toBeGreaterThan(partial);
  });

  it("전혀 관련 없는 이름은 0점", () => {
    expect(scoreProduct("초코크림 케이크", "멥쌀")).toBe(0);
  });

  it("빈 입력은 0점", () => {
    expect(scoreProduct("", "초코크림 케이크")).toBe(0);
    expect(scoreProduct("초코크림 케이크", "")).toBe(0);
  });

  it("토큰이 더 많이 겹치는 후보가 더 높은 점수를 받는다", () => {
    const better = scoreProduct("딸기 생크림 케이크", "딸기 생크림 케이크(대)");
    const worse = scoreProduct("딸기 생크림 케이크", "초코 생크림 롤");
    expect(better).toBeGreaterThan(worse);
  });
});
