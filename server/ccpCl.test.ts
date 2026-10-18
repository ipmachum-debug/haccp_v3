/**
 * CCP 기록지 CL — 기록지 스냅샷(공정그룹 설정)만 쓴다, 코드 기본값 없음 (지티 QA F12 · 2026-10-18 단지 전용 제거)
 */
import { describe, it, expect } from "vitest";
import { clFromRecord, clSummary, clOk, clRange, clHasAny, CCP_CL_DEFAULTS } from "../client/src/components/ccp/ccpCl";

describe("clFromRecord / clSummary", () => {
  it("코드에 회사별 기본값이 없다", () => {
    expect(CCP_CL_DEFAULTS).toEqual({});
  });
  it("공정그룹 기록지(75℃·1~10분, 압력 없음) → 그룹 기준 그대로", () => {
    const cl = clFromRecord({ ccpType: "CCP-1B", processGroupId: 7, clHeatTimeMinLo: 1, clHeatTimeMinHi: 10, clHeatTempLo: "75.00", clPressureMpaLo: null, clProductTempLo: null });
    expect(cl).toMatchObject({ heatTimeMinLo: 1, heatTimeMinHi: 10, heatTempLo: 75, pressureMpaLo: undefined, productTempLo: 75 });
    expect(clSummary("CCP-1B", cl)).toBe("가열시간 1~10분 · 품온 75°C 이상");
    expect(clOk(1, cl.heatTimeMinLo, cl.heatTimeMinHi) && clOk(NaN, cl.pressureMpaLo) && clOk(85, cl.productTempLo)).toBe(true);
    expect(clOk(11, cl.heatTimeMinLo, cl.heatTimeMinHi)).toBe(false);
  });
  it("스냅샷이 전혀 없으면 '-' 이고 자동 판정 대상이 아니다 (전부 적합으로 찍히지 않게)", () => {
    const cl = clFromRecord({ ccpType: "CCP-1B", processGroupId: null });
    expect(clSummary("CCP-1B", cl)).toBe("가열시간 - · 품온 -");
    expect(clHasAny(cl, ["heatTimeMinLo", "heatTimeMinHi", "pressureMpaLo", "productTempLo"])).toBe(false);
  });
  it("CCP-2B 스냅샷, CCP-4P 금속 기준은 스냅샷만 (없으면 비움)", () => {
    expect(clSummary("CCP-2B", clFromRecord({ ccpType: "CCP-2B", processGroupId: 3, clHeatTimeMinLo: 20, clHeatTimeMinHi: 25, clHeatTempLo: "180" }))).toBe("가열시간 20~25분 · 온도 180°C 이상");
    expect(clFromRecord({ ccpType: "CCP-4P", clFeMm: "1.5" })).toEqual({ metalSensitivity: undefined, feMm: 1.5, susMm: undefined });
    expect(clRange(undefined, undefined, "분")).toBe("-");
  });
});
