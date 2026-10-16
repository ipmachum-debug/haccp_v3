/**
 * 묶음 순차 측정시각 (2026-10-16, 증숙 CCP 기록지 정정) — 운영 기록 9/14 로 검증
 */
import { describe, it, expect } from "vitest";
import { groupedTimeFor, addMinutes, isHHmm } from "./_lib/ccpGroupedTimes";
import { diffAuditedGroupFields } from "../server/lib/haccp/processGroupAudit";

const steam = (startTime: string, equipCount: number) => ({ startTime, equipCount, cycleMin: 34, intervalMin: 10, batchSize: 3 });
const times = (n: number, p: ReturnType<typeof steam>) => Array.from({ length: n }, (_, i) => groupedTimeFor(i + 1, p));

describe("증숙 묶음 순차 (1·2·3호 동시, 4·5·6호 10분 뒤, 다음 회차는 사이클 뒤)", () => {
  it("9/14 우유설기 5행 (현재 08:44~09:24 10분씩) → 08:44 ×3, 08:54 ×2", () => {
    expect(times(5, steam("08:44", 5))).toEqual(["08:44", "08:44", "08:44", "08:54", "08:54"]);
  });
  it("9/14 꿀설기 10행 (설비 6대) → 09:19 ×3, 09:29 ×3, 다음 회차 09:53 ×3, 10:03", () => {
    expect(times(10, steam("09:19", 6))).toEqual(["09:19", "09:19", "09:19", "09:29", "09:29", "09:29", "09:53", "09:53", "09:53", "10:03"]);
  });
  it("약식류 2행 (설비 2대) → 같은 시각", () => {
    expect(times(2, { ...steam("08:49", 2), cycleMin: 59 })).toEqual(["08:49", "08:49"]);
  });
  it("묶음 크기 1 이면 순차와 같다 (회귀 기준)", () => {
    expect(times(7, { ...steam("08:44", 6), batchSize: 1 })).toEqual(["08:44", "08:54", "09:04", "09:14", "09:24", "09:34", "09:18"]);
  });
  it("자정 넘김·형식 검사", () => {
    expect(addMinutes("23:50", 20)).toBe("00:10");
    expect(isHHmm("08:44")).toBe(true);
    expect(isHHmm("8시")).toBe(false);
    expect(isHHmm(null)).toBe(false);
  });
});

describe("공정 그룹 설정 변경 이력 diff", () => {
  it("운영 방식 grouped → sequential, 묶음 3 → 1 만 잡고, 90 과 '90.00' 은 같은 값", () => {
    const before = { name: "증숙(설기류)공정", temperature_min: "90.00", equip_group_mode: "grouped", equip_batch_size: 3, equip_interval_min: 10 };
    const after = { name: "증숙(설기류)공정", temperature_min: 90, equip_group_mode: "sequential", equip_batch_size: 1, equip_interval_min: 10 };
    expect(diffAuditedGroupFields(before, after)).toEqual({
      equip_group_mode: { before: "grouped", after: "sequential" },
      equip_batch_size: { before: 3, after: 1 },
    });
  });
  it("바뀐 게 없으면 null (이력 안 남김)", () => {
    expect(diffAuditedGroupFields({ equip_group_mode: "grouped" }, { equip_group_mode: "grouped" })).toBeNull();
    expect(diffAuditedGroupFields(null, { equip_group_mode: "grouped" })).toBeNull();
  });
});
