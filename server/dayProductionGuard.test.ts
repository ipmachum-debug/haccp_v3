/**
 * 하루 생산 입력 회귀 (2026-10-19, Codex 단지 F-PROD-01·02) — 입력량 = 하루 총생산량, 시작시각 유지
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { duplicateLineProblems, shouldStampStartNow, existingRunProblem } from "./lib/production/dayProductionGuard";

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf-8");

describe("같은 제품 여러 줄 — 기본은 막고, 별도 생산 건만 허용", () => {
  it("왕찹쌀떡 475kg 을 5줄로 보내면 2~5번 줄이 막힌다", () => {
    const items = Array.from({ length: 5 }, () => ({ productId: 7 }));
    const p = duplicateLineProblems(items, () => "왕찹쌀떡");
    expect(Array.from(p.keys())).toEqual([1, 2, 3, 4]);
    expect(p.get(1)).toMatch(/왕찹쌀떡 이\(가\) 1번 줄에도 있습니다 — 하루 총생산량을 한 줄에/);
  });
  it("다른 제품은 각각 한 줄 — 문제 없음, 별도 생산 건을 명시한 줄은 통과", () => {
    expect(duplicateLineProblems([{ productId: 7 }, { productId: 8 }, { productId: 9 }]).size).toBe(0);
    expect(duplicateLineProblems([{ productId: 7 }, { productId: 7, separateRun: true }]).size).toBe(0);
  });
  it("이미 있는 생산 건 안내 — 원료 재차감 경고와 생산 건 번호", () => {
    expect(existingRunProblem("왕찹쌀떡", ["B1", "B2", "B3", "B4", "B5"])).toMatch(/B1, B2, B3 외 2건.*원료가 한 번 더 차감/);
  });
});

describe("시작시각 — 자동 시작·과거 업무일은 계획 시각 유지", () => {
  const today = "2026-10-19";
  it.each([
    [{ hasStartTime: true, plannedDate: "2026-10-15", todayKst: today }, false],
    [{ hasStartTime: true, plannedDate: today, todayKst: today, keepPlanned: true }, false],
    [{ hasStartTime: true, plannedDate: today, todayKst: today }, true],
    [{ hasStartTime: false, plannedDate: "2026-10-15", todayKst: today }, true],
  ])("%j → %s", (a, want) => expect(shouldStampStartNow(a as any)).toBe(want));
});

describe("연결", () => {
  it("입력표: 하루 총생산량 한 칸, 배치 수·배치당 kg 없음, 같은 제품 줄은 생성 차단", () => {
    const w = read("client/src/pages/production/TodayProductionWorkbench.tsx");
    expect(w).toMatch(/하루 총생산량 \(kg\)/);
    expect(w).not.toMatch(/>배치 수</);
    expect(w).not.toMatch(/>배치당 kg</);
    expect(w).not.toMatch(/rowKeys/);
    expect(w).toMatch(/plannedQuantityKg: parseFloat\(e\.line\.totalKg\)/);
    expect(w).toMatch(/disabled=\{[^\n]*dupLineIds\.size > 0/);
    expect(w).toMatch(/\(이미 선택됨\)/);
    expect(w).toMatch(/ex\.totalKg = String\(\(parseFloat\(ex\.totalKg\) \|\| 0\) \+/); // AI 같은 제품 합산
    expect(w).not.toMatch(/별도 생산 건으로 따로 만들기/);
    // 미리보기: 계산된 운영 기본값(온도·압력·가열)을 보여 준다 — 다시 입력받지 않음
    expect(w).toMatch(/rd\.tempC/);
  });
  it("서버: 생성·미리보기 모두 같은 규칙 (같은 요청 중복 거부, 같은 업무일 기존 생산 건은 그 줄 실패)", () => {
    const c = read("server/routers/production/batch.crud.router.ts");
    expect(c).toMatch(/duplicateLineProblems\(input\.items\)/);
    expect(c).toMatch(/existingSameDayRuns\(conn, ctx\.tenantId, input\.workDate, .*, dayBatchGroup\)/);
    expect(c).toMatch(/if \(already && !item\.separateRun\)/);
    const p = read("server/routers/production/batch.plan.router.ts");
    expect(p).toMatch(/duplicateLineProblems\(input\.items/);
    expect(p).toMatch(/existingRunProblem\(/);
  });
  it("자동 시작은 계획 시작시각 유지 옵션으로", () => {
    expect(read("server/services/batchOrchestrator.ts")).toMatch(/updateBatchStatus\(batchId, "in_progress", input\.tenantId, \{ keepPlannedStart: true \}\)/);
    expect(read("server/db/production/batchCRUD.ts")).toMatch(/shouldStampStartNow\(/);
  });
});
