/**
 * CCP 가열 운전시간 규칙 (2026-10-18) — 공정 시간 프로필 → 설비 기본 → 비움, 한계 하한(time_min) 은 쓰지 않음
 *   #586 에서 설비 기본(10분)만 쓰도록 바꿔 약식(프로필 35분)이 10분으로 찍힐 뻔했다 — 회귀 방지.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf-8");

describe("가열 운전시간 출처", () => {
  it("행 생성(ccp-batch → 하루 계획 planDay): 프로필 → 설비 기본, 점유 = 사이클 + (가열 − 설비 기본) — 약식 34 + (35 − 10) = 59", () => {
    // 계산 자체는 ccpDayPlanner.test.ts 가 값으로 확인. 여기서는 연결만
    const src = read("server/services/ccp-batch.ts");
    expect(src).toMatch(/profileTimeMin: g\.profile_time_min \?\? null/);
    expect(src).toMatch(/insertPlannedRows\(instanceId, proc, conn, tenantId\)/);
    const planner = read("server/lib/production/ccpDayPlanner.ts");
    expect(planner).toMatch(/const heat = e \? \(heatingMin \?\? e\.defaultTimeMin\) : heatingMin;/);
    expect(planner).toMatch(/eq\.cycleTotalMin \+ \(heatingMin - eq\.defaultTimeMin\)/);
    expect(src).not.toMatch(/group\.time_min\s*\?\?/); // 한계 하한을 운전시간으로 쓰지 않음
    expect(src).not.toMatch(/group\.temperature_min\.toString\(\)|group\.pressure_min \* 10/); // 설정값 칸을 한계 하한으로 채우지 않음
    expect(src.match(/AS profile_time_min/g)?.length).toBe(3);
    expect(src).toMatch(/Number\(r\.profile_count\) === 1/); // 여러 개면 임의 선택 안 함
  });
  it("행 동기화 폴백(ccpFormSettings)도 같은 규칙", () => {
    const src = read("server/db/haccp/ccpFormSettings.ts");
    expect(src).toMatch(/Number\(eq\.profile_count\) === 1 \? n\(eq\.profile_time_min\) : null\) \?\? n\(eq\.eq_heat_min\)/);
    expect(src).toMatch(/cycle \+ \(heat - eqHeat\)/);
  });
});
