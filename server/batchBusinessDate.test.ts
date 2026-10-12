import { describe, it, expect } from "vitest";
import { resolveBatchBusinessDate, toKstDateStr, todayKstDateStr } from "./lib/production/batchBusinessDate";

describe("batchBusinessDate — 업무일자 = 생산일", () => {
  it("planned_date 가 있으면 completed_at 보다 우선 (며칠 뒤 입력해도 생산일)", () => {
    expect(resolveBatchBusinessDate({ planned_date: "2026-10-08", completed_at: "2026-10-12 14:03:00" })).toBe("2026-10-08");
    expect(resolveBatchBusinessDate({ plannedDate: new Date("2026-10-08T00:00:00+09:00"), completedAt: new Date() })).toBe("2026-10-08");
  });

  it("planned_date 없으면 completed_at, 둘 다 없으면 오늘(KST)", () => {
    expect(resolveBatchBusinessDate({ completed_at: "2026-10-11 23:30:00" })).toBe("2026-10-11");
    expect(resolveBatchBusinessDate({})).toBe(todayKstDateStr());
    expect(resolveBatchBusinessDate(null)).toBe(todayKstDateStr());
  });

  it("DATE 문자열은 타임존 변환 없이 앞 10자리 그대로 (하루 밀림 방지)", () => {
    expect(toKstDateStr("2026-10-08")).toBe("2026-10-08");
    expect(toKstDateStr("2026-10-08T15:00:00.000Z")).toBe("2026-10-08"); // 문자열은 그대로
    // Date 객체는 KST 로 환산: UTC 15:00 = KST 다음날 00:00
    expect(toKstDateStr(new Date("2026-10-08T15:00:00.000Z"))).toBe("2026-10-09");
    expect(toKstDateStr(null)).toBeNull();
    expect(toKstDateStr("not a date")).toBeNull();
  });
});
