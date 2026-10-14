import { describe, it, expect } from "vitest";
import { resolveAttendanceScope, isAttendanceAdmin } from "./lib/hr/attendanceScope";

describe("근태 조회 범위 (0-3) — 일반 직원은 본인만", () => {
  it("employee 가 다른 직원 id 를 넘겨도 본인 id 로 바뀐다", () => {
    expect(resolveAttendanceScope({ role: "employee", requestedEmployeeId: 99, myEmployeeId: 7 })).toBe(7);
  });

  it("worker · inspector · monitor · accountant 도 본인만", () => {
    for (const role of ["worker", "inspector", "monitor", "accountant"]) {
      expect(resolveAttendanceScope({ role, requestedEmployeeId: 99, myEmployeeId: 7 })).toBe(7);
      expect(resolveAttendanceScope({ role, myEmployeeId: 7 })).toBe(7);
    }
  });

  it("admin 은 지정 직원 또는 전체(null) — 기존 동작 유지", () => {
    expect(resolveAttendanceScope({ role: "admin", requestedEmployeeId: 99, myEmployeeId: 7 })).toBe(99);
    expect(resolveAttendanceScope({ role: "admin", myEmployeeId: 7 })).toBeNull();
    expect(resolveAttendanceScope({ role: "super_admin", myEmployeeId: 7 })).toBeNull();
  });

  it("역할이 비어 있으면 관리자가 아니다", () => {
    expect(isAttendanceAdmin(undefined)).toBe(false);
    expect(isAttendanceAdmin("")).toBe(false);
    expect(resolveAttendanceScope({ role: null, requestedEmployeeId: 99, myEmployeeId: 7 })).toBe(7);
  });
});
