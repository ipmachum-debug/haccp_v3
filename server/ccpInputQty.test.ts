/**
 * CCP 회차별 투입량 — 부분 배치에 BOM 기준량(10kg)을 통째로 넣지 않음 (지티 QA B05, 2026-10-18)
 */
import { describe, it, expect, vi } from "vitest";
vi.mock("./db/connection", () => ({ getRawConnection: vi.fn(), getDb: vi.fn() }));
import { splitCcpInputQty } from "./db/haccp/ccpFormSettings";

describe("splitCcpInputQty", () => {
  it("BOM 10kg 기준 공정 투입 8kg, 5kg 생산 1회차 → 4kg", () => {
    expect(splitCcpInputQty((8 * 5) / 10, 8, 1, 1)).toBe(4);
  });
  it("300kg = 100kg × 3회차 → 100·100·100 (이전과 같음)", () => {
    expect([1, 2, 3].map((s) => splitCcpInputQty(300, 100, 3, s))).toEqual([100, 100, 100]);
  });
  it("250kg, 회차 3 → 100·100·50 (마지막 회차는 남은 양)", () => {
    expect([1, 2, 3].map((s) => splitCcpInputQty(250, 100, 3, s))).toEqual([100, 100, 50]);
  });
  it("설비 회차가 따로 정해져 맞지 않으면 균등, 총량 모르면 기준량 그대로", () => {
    expect(splitCcpInputQty(10, 10, 4, 2)).toBe(2.5);
    expect(splitCcpInputQty(null, 10, 1, 1)).toBe(10);
  });
});
