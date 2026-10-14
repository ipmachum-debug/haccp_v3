/**
 * 근태 조회 범위 — 순수 함수 (2026-10-14, UI/UX 개편 0-3)
 *
 * 관리자(admin·super_admin)는 전체 또는 지정 직원, 그 외 역할은 **항상 본인**.
 * 이전에는 employeeId 를 넘기면 역할과 무관하게 그 직원 근태가 보여 일반 직원이 타인 출퇴근을 볼 수 있었다.
 */
export const ATTENDANCE_ADMIN_ROLES = ["admin", "super_admin"] as const;

export function isAttendanceAdmin(role: string | null | undefined): boolean {
  return (ATTENDANCE_ADMIN_ROLES as readonly string[]).includes(role ?? "");
}

/**
 * @returns 조회할 employee_id. null 이면 제한 없음(관리자 전체 조회).
 */
export function resolveAttendanceScope(params: {
  role: string | null | undefined;
  requestedEmployeeId?: number | null;
  myEmployeeId: number;
}): number | null {
  if (!isAttendanceAdmin(params.role)) return params.myEmployeeId;
  return params.requestedEmployeeId ?? null;
}
