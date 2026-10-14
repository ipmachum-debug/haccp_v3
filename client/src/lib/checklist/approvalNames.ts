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
