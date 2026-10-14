/**
 * 결재란 이름 복원 규칙 (2026-10-15, Codex #511 검증)
 *
 * 이전: 저장된 기록을 열 때 "현재 담당자 설정(문서 결재 설정·직급)" 이 있으면 저장된 이름보다 우선 →
 *       실제로 검토한 한상갑 대신 지금 설정된 검토자 이정언이 직인 칸에 보였다 (작성자 이름도 설정으로 바뀌었다).
 * 지금: 기존 기록은 저장된 이름이 있으면 항상 저장된 이름 (직인·날짜와 함께 기록된 사실).
 *       현재 담당자 설정은 새 문서의 기본값, 또는 저장된 이름이 비어 있는 칸에만 쓴다.
 */
export type ApprovalRole = "writer" | "reviewer" | "approver";

export function resolveApprovalNames(_designated: Record<string, unknown>, stored: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!stored) return out;
  for (const role of ["writer", "reviewer", "approver"] as const) {
    const name = stored[`${role}Name`];
    if (typeof name === "string" && name.trim() !== "") {
      out[`${role}Id`] = stored[`${role}Id`] ?? null;
      out[`${role}Name`] = name;
    }
  }
  return out;
}

export type Assignee = { id: number | null; name: string };
export type Designated = { writer?: Assignee; reviewer?: Assignee; approver?: Assignee };

/**
 * 현재 담당자 — 문서 결재 설정(작성/검토/승인 직원 id) 우선, 없으면 직원의 결재 역할(reviewer/approver).
 * 저장된 과거 직인과 무관하게 계산한다 (재작성 때 다음 결재자로만 쓴다).
 */
export function designatedApprovers(
  setting: { authorEmployeeId?: number | null; reviewerEmployeeId?: number | null; approverEmployeeId?: number | null } | null | undefined,
  employees: ReadonlyArray<{ id: number; name: string; approvalRole?: string | null }>,
): Designated {
  const byId = (id?: number | null) => (id ? employees.find((e) => e.id === id) : undefined);
  const byRole = (role: string) => employees.find((e) => e.approvalRole === role);
  const pick = (e?: { id: number; name: string }) => (e ? { id: e.id, name: e.name } : undefined);
  return {
    writer: pick(byId(setting?.authorEmployeeId)),
    reviewer: pick(byId(setting?.reviewerEmployeeId) ?? (setting ? undefined : byRole("reviewer"))),
    approver: pick(byId(setting?.approverEmployeeId) ?? (setting ? undefined : byRole("approver"))),
  };
}

/**
 * 재작성(승인 절차가 진행된 문서 수정) 시 결재란 — 작성자는 그대로, 검토·승인 직인과 날짜는 지우고,
 * 다음 검토자·승인자는 현재 담당자(있으면). 현재 담당자가 없으면 기존 이름 유지.
 */
export function approvalOnRewrite<T extends Record<string, unknown>>(current: T, designated: Designated): T {
  return {
    ...current,
    reviewerApproved: false, approverApproved: false, reviewerDate: undefined, approverDate: undefined,
    ...(designated.reviewer ? { reviewerId: designated.reviewer.id, reviewerName: designated.reviewer.name } : {}),
    ...(designated.approver ? { approverId: designated.approver.id, approverName: designated.approver.name } : {}),
  };
}
