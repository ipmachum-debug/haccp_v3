/**
 * 4단계 사용 측정 녹화기 — 순수 계산 (2026-10-14)
 *  - 같은 화면(쿼리만 바뀜)은 화면 이동으로 세지 않는다
 *  - 끝난 세션에는 더 기록하지 않는다
 *  - 요약·CSV·개편 전/후 비교
 */
import { describe, it, expect } from "vitest";
import {
  newSession, addEvent, endSession, summarize, toCsv, compareLayouts, SCENARIOS,
  type MeasureSession,
} from "../client/src/lib/measure/measureRecorder";

const T0 = Date.UTC(2026, 9, 14, 0, 0, 0);

function run(layout: "hub" | "tabs", clicks: number, routes: string[], sec: number, opts: { role?: string; scenario?: string; completed?: boolean } = {}): MeasureSession {
  let s = newSession({ scenario: opts.scenario ?? "C", role: opts.role ?? "worker", tester: " 작업자A ", layout, tenantId: 2, now: T0, path: "/dashboard/today-production" });
  let t = T0;
  for (const r of routes) s = addEvent(s, "route", r, (t += 1000));
  for (let i = 0; i < clicks; i++) s = addEvent(s, "click", `button:버튼${i}`, (t += 100));
  return endSession(s, opts.completed ?? true, T0 + sec * 1000);
}

describe("녹화기", () => {
  it("화면 이동: 같은 경로(쿼리·끝 슬래시만 다름)는 세지 않는다", () => {
    let s = newSession({ scenario: "C", role: "worker", tester: "a", layout: "hub", tenantId: 2, now: T0, path: "/dashboard/batch" });
    s = addEvent(s, "route", "/dashboard/batch?tab=2", T0 + 1);
    s = addEvent(s, "route", "/dashboard/batch/", T0 + 2);
    s = addEvent(s, "route", "/dashboard/ccp", T0 + 3);
    s = addEvent(s, "route", "/dashboard/batch", T0 + 4);
    const r = summarize(endSession(s, true, T0 + 5000));
    expect(r.screens).toBe(2);
    expect(r.path).toBe("/dashboard/batch > /dashboard/ccp > /dashboard/batch");
    expect(r.tester).toBe("a");
  });

  it("끝난 세션에는 기록이 더해지지 않고, 두 번 끝내도 처음 값 유지", () => {
    const s = run("hub", 2, [], 30);
    expect(addEvent(s, "click", "x", T0 + 99999)).toBe(s);
    expect(endSession(s, false, T0 + 99999)).toBe(s);
  });

  it("요약: 시간·클릭·막힘·오류·단계", () => {
    let s = newSession({ scenario: "Q", role: "inspector", tester: "품질", layout: "tabs", tenantId: 2, now: T0, path: "/dashboard" });
    s = addEvent(s, "click", "a:CCP", T0 + 1000);
    s = addEvent(s, "error", "저장 실패 — 서버가 응답하지 않습니다", T0 + 2000);
    s = addEvent(s, "blocked", "기록지를 못 찾음", T0 + 3000);
    s = addEvent(s, "step", "CCP 완료", T0 + 4000);
    const r = summarize(endSession(s, true, T0 + 95_400));
    expect(r).toMatchObject({ durationSec: 95, clicks: 1, errors: 1, blocked: 1, steps: 1, screens: 0, completed: true, blockedNotes: "기록지를 못 찾음" });
  });

  it("CSV: BOM + 머리글 + 쉼표·따옴표 이스케이프", () => {
    let s = newSession({ scenario: "C", role: "worker", tester: 'A "팀", 1', layout: "hub", tenantId: 2, now: T0, path: "/" });
    s = endSession(s, true, T0 + 1000);
    const csv = toCsv([s]);
    expect(csv.startsWith("﻿scenario,role,layout,tester,")).toBe(true);
    expect(csv).toContain('"A ""팀"", 1"');
    expect(csv.split("\n")).toHaveLength(2);
  });

  it("비교: 완료한 세션만, 시나리오·역할별 개편 전(tabs)/후(hub) 평균", () => {
    const list = [
      run("tabs", 20, ["/a", "/b", "/c"], 300),
      run("tabs", 30, ["/a", "/b", "/c", "/d"], 400),
      run("hub", 8, ["/a"], 120),
      run("hub", 99, ["/a"], 999, { completed: false }),
      run("hub", 5, [], 60, { role: "accountant", scenario: "E" }),
    ];
    const c = compareLayouts(list);
    expect(c).toEqual([
      { scenario: "C", role: "worker",
        before: { n: 2, durationSec: 350, clicks: 25, screens: 3.5, errors: 0, blocked: 0 },
        after: { n: 1, durationSec: 120, clicks: 8, screens: 1, errors: 0, blocked: 0 } },
      { scenario: "E", role: "accountant",
        before: { n: 0, durationSec: null, clicks: null, screens: null, errors: null, blocked: null },
        after: { n: 1, durationSec: 60, clicks: 5, screens: 0, errors: 0, blocked: 0 } },
    ]);
  });

  it("시나리오: 명세 13 §5 A~E + 품질 Q, 측정 순서는 작업자(C) 먼저", () => {
    expect(SCENARIOS.map((s) => s.key).sort()).toEqual(["A", "B", "C", "D", "E", "Q"]);
    expect(SCENARIOS[0].key).toBe("C");
  });
});
