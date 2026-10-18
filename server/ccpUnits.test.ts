/**
 * CCP 단위·의미 (2026-10-18, PR-A3) — 압력 MPa↔bar, 가열시간 ≠ 점유시간, 공정별 인스턴스
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf-8");

describe("기록지 행 → h_ccp_rows 역동기화", () => {
  const src = read("server/db/haccp/ccpFormRowsOps.ts");
  it("압력 MPa → bar ×10 (이전엔 그대로 복사해 1/10)", () => {
    expect(src).toMatch(/parseFloat\(String\(data\.pressureMpa\)\) \* 10/);
  });
  it("가열시간은 heating_min 에 (점유시간 duration_min 에 쓰지 않음)", () => {
    expect(src).toMatch(/UPDATE h_ccp_rows SET temp_c = \?, heating_min = \?/);
    expect(src).not.toMatch(/SET temp_c = \?, duration_min = \?/);
  });
  it("같은 공정의 인스턴스 (공정 두 개인 배치)", () => {
    expect(src).toMatch(/AND process_group_id = \?/);
  });
});

describe("기록지 가열시간·압력 칸", () => {
  it("가열시간은 가열 운전시간만 — 비면 점유시간으로 채우지 않음", () => {
    const s = read("server/db/haccp/ccpFormSettings.ts");
    expect(s).toMatch(/row\.heating_min \?\? null, \/\/ 가열 운전시간만/);
    expect(s).not.toMatch(/row\.heating_min \?\? row\.duration_min/);
  });
  it("압력 칸은 MPa 소수 3자리로 넓힘", () => {
    expect(read("server/db/startupMigrations.ts")).toMatch(/MODIFY COLUMN \\`\$\{col\}\\` decimal\(6,3\)/);
  });
});
