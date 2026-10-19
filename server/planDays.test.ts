/**
 * 여러 날 생산 계획 — 선택한 날짜로만 생성, 날짜별 요청 키 (2026-10-20, #611 추가 검토 P1)
 *   실제 함수 시험 (client/src/lib/planDays.ts). 화면은 이 함수 결과로만 요청을 만든다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { planDates, planCreateRequests, dayRequestKey } from "../client/src/lib/planDays";

describe("여러 날 계획 — 선택한 날짜", () => {
  it("기준일 10/20, 3일 중 10/22 하나만 남김 → 생성 요청은 10/22 하나 (기준일 아님)", () => {
    const dates = planDates("2026-10-20", 3, ["2026-10-20", "2026-10-21"]);
    expect(dates).toEqual(["2026-10-22"]);
    expect(planCreateRequests("wb-k", dates).map((r) => r.workDate)).toEqual(["2026-10-22"]);
  });
  it("모든 날짜를 빼면 생성 요청 0개 (기준일로 만들지 않음)", () => {
    const dates = planDates("2026-10-20", 2, ["2026-10-20", "2026-10-21"]);
    expect(dates).toEqual([]);
    expect(planCreateRequests("wb-k", dates)).toEqual([]);
  });
  it("같은 날짜는 선택 개수가 바뀌어도 같은 요청 키 — 일부 저장 뒤 날짜를 줄여 다시 눌러도 이미 만든 날은 재사용", () => {
    const base = "wb-mf3k2a1b-x9y8z7w6";
    const first = planCreateRequests(base, planDates("2026-10-20", 3, []));
    const retry = planCreateRequests(base, planDates("2026-10-20", 3, ["2026-10-20"]));
    const k = (rs: Array<{ workDate: string; requestKey: string }>, d: string) => rs.find((r) => r.workDate === d)?.requestKey;
    expect(k(retry, "2026-10-21")).toBe(k(first, "2026-10-21"));
    expect(k(retry, "2026-10-22")).toBe(k(first, "2026-10-22"));
    expect(new Set(first.map((r) => r.requestKey)).size).toBe(3); // 날짜마다 다름
    // 날짜 하나만 남겨도 같은 규칙의 키
    expect(planCreateRequests(base, ["2026-10-22"])[0].requestKey).toBe(k(first, "2026-10-22"));
  });
  it("요청 키는 서버 한도(8~64자) 안이고 날짜가 잘리지 않는다 — 긴 기본키여도", () => {
    const long = "x".repeat(80);
    const a = dayRequestKey(long, "2026-10-21"), b = dayRequestKey(long, "2026-10-22");
    expect(a.length).toBeLessThanOrEqual(64);
    expect(a).not.toBe(b);
    expect(a.endsWith("-20261021")).toBe(true);
  });
  it("화면은 이 함수로만 날짜·키를 만든다 (기준일 단독 생성 경로 없음, 날짜 0개면 버튼 막힘)", () => {
    const src = readFileSync(join(__dirname, "../client/src/pages/production/TodayProductionWorkbench.tsx"), "utf-8");
    expect(src).toMatch(/const reqs = planCreateRequests\(requestKey, dates\);/);
    expect(src).not.toMatch(/createMut\.mutate\(\{ requestKey, /);
    expect(src).toMatch(/!filled\.length \|\| !dates\.length \|\| dupLineIds\.size > 0/);
  });
});
