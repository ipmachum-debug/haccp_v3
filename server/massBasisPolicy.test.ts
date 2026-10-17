import { describe, it, expect } from "vitest";
import { isTenantFeatureEnabled, MASS_BASIS_FEATURE } from "./lib/production/massBasisPolicy";

// Codex #547 배포 검토 P1 — 조회 실패를 '꺼짐' 으로 보면 기존 계산(과다 차감) 으로 배치가 만들어진다
const conn = (impl: () => Promise<any>) => ({ execute: impl });

describe("회사 기능 설정 조회 — 판정 불가는 꺼짐이 아니다", () => {
  it("행 있음 enabled=1 → true / enabled=0 → false / 행 없음 → false", async () => {
    expect(await isTenantFeatureEnabled(conn(async () => [[{ enabled: 1 }]]), 2, MASS_BASIS_FEATURE)).toBe(true);
    expect(await isTenantFeatureEnabled(conn(async () => [[{ enabled: 0 }]]), 2, MASS_BASIS_FEATURE)).toBe(false);
    expect(await isTenantFeatureEnabled(conn(async () => [[]]), 2, MASS_BASIS_FEATURE)).toBe(false);
  });

  it.each(["ER_LOCK_WAIT_TIMEOUT", "ER_NO_SUCH_TABLE", "ER_TABLEACCESS_DENIED_ERROR", "PROTOCOL_CONNECTION_LOST"])(
    "조회 오류 %s → throw", async (code) => {
      const failing = conn(async () => { throw Object.assign(new Error(code), { code }); });
      await expect(isTenantFeatureEnabled(failing, 2, MASS_BASIS_FEATURE)).rejects.toThrow(/사용 여부를 확인할 수 없습니다/);
    },
  );
});
