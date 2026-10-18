/**
 * CCP 기록지 CL — 기록지 스냅샷(공정그룹 설정) 우선, 표시·판정 같은 기준 (지티 QA F12)
 */
import { describe, it, expect } from "vitest";
import { clFromRecord, clSummary, clOk, clRange } from "../client/src/components/ccp/ccpCl";

describe("clFromRecord / clSummary", () => {
  it("공정그룹 기록지(75℃·1~10분, 압력 없음) → 그룹 기준 그대로, 기준서 기본값(0.12MPa·90℃·10~15분) 안 섞음", () => {
    const cl = clFromRecord({ ccpType: "CCP-1B", processGroupId: 7, clHeatTimeMinLo: 1, clHeatTimeMinHi: 10, clHeatTempLo: "75.00", clPressureMpaLo: null, clProductTempLo: null });
    expect(cl).toMatchObject({ heatTimeMinLo: 1, heatTimeMinHi: 10, heatTempLo: 75, pressureMpaLo: undefined, productTempLo: 75 });
    expect(clSummary("CCP-1B", cl)).toBe("가열시간 1~10분 · 품온 75°C 이상");
    // 기록 1분·85℃ → 적합 (그룹 기준), 기본값으로 보면 부적합이던 값
    expect(clOk(1, cl.heatTimeMinLo, cl.heatTimeMinHi) && clOk(NaN, cl.pressureMpaLo) && clOk(85, cl.productTempLo)).toBe(true);
    expect(clOk(11, cl.heatTimeMinLo, cl.heatTimeMinHi)).toBe(false);
  });
  it("그룹·스냅샷 없는 옛 기록지만 기준서 기본값", () => {
    const cl = clFromRecord({ ccpType: "CCP-1B", processGroupId: null });
    expect(clSummary("CCP-1B", cl)).toBe("가열시간 10~15분 · 압력 0.12MPa 이상 · 품온 90°C 이상");
  });
  it("CCP-2B 스냅샷, CCP-4P 금속 기준(스냅샷 우선, 없으면 기본)", () => {
    expect(clSummary("CCP-2B", clFromRecord({ ccpType: "CCP-2B", processGroupId: 3, clHeatTimeMinLo: 20, clHeatTimeMinHi: 25, clHeatTempLo: "180" }))).toBe("가열시간 20~25분 · 온도 180°C 이상");
    expect(clSummary("CCP-4P", clFromRecord({ ccpType: "CCP-4P", clFeMm: "1.5" }))).toBe("감도 130 · Fe 1.5mmΦ 불검출 · SUS 3mmΦ 불검출");
    expect(clRange(undefined, undefined, "분")).toBe("-");
  });
});
