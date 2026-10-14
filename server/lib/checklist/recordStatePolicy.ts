/**
 * 공통 일지 상태 정책 — 서버가 강제 (2026-10-15, Codex 발견)
 *
 * 문제
 *  - create / update 가 화면이 보낸 status 를 그대로 저장 → 승인 절차 없이 '승인대기'·'승인완료' 가 될 수 있었다
 *  - submitForReview 는 ① 일지를 submitted 로 바꾼 뒤 ② 승인 요청 INSERT — 묶여 있지 않아 ② 가 실패하면
 *    승인 요청 없는 '승인대기' 가 남는다 (덤프 10/14: #15 #18 #79 #86 #91 #93 #95 #750 #765, 승인관리에 안 보임)
 *  - delete 는 상태 제한이 없어 화면(작성중만 삭제)과 정책이 달랐다
 *  - 건강일지는 승인된 문서를 고쳐도 승인완료로 남았다
 *
 * 정책
 *  - 새 기록은 항상 작성중(draft). 상태는 승인 요청·검토·승인·재작성 절차로만 바뀐다
 *  - 작성중이 아닌 기록을 고치면 재작성: 작성중으로 돌리고, 연결된 진행 중 승인 요청은 취소, 검토·승인 직인은 지운다
 *  - 삭제는 작성중만
 *  - 승인 요청은 한 트랜잭션: 진행 중 요청이 없을 때만 요청을 만들고 그다음 상태를 바꾼다
 *    승인 요청 없이 '승인대기' 인 기록(위 오류로 생긴 것)은 다시 요청할 수 있다
 */
export type RecordStatus = "draft" | "submitted" | "approved" | "rejected";

export const ACTIVE_REQUEST_STATUSES = ["pending_writer", "pending_review", "pending_approval", "pending"] as const;
/** 공통 일지를 가리키는 승인 요청 (주기 일지 포함 — 모두 h_generic_checklist_records.id) */
export const CHECKLIST_REFERENCE_TYPES = ["checklist", "generic_checklist"] as const;

export const STATUS_KO: Record<string, string> = { draft: "작성중", submitted: "승인대기", approved: "승인완료", rejected: "반려" };

/** 내용 수정 저장 — 다음 상태와 재작성 여부 (요청된 status 는 'draft' 가 아니면 무시) */
export function decideUpdate(current: RecordStatus): { nextStatus: "draft"; reopen: boolean } {
  return { nextStatus: "draft", reopen: current !== "draft" };
}

export function decideDelete(current: RecordStatus): { ok: true } | { ok: false; message: string } {
  if (current === "draft") return { ok: true };
  return {
    ok: false,
    message: `${STATUS_KO[current] ?? current} 상태의 기록은 삭제할 수 없습니다. 작성중인 기록만 삭제할 수 있습니다 (수정하면 재작성되어 작성중이 됩니다).`,
  };
}

export function decideSubmit(current: RecordStatus, activeRequestIds: readonly number[]):
  { ok: true; recovering: boolean } | { ok: false; message: string } {
  if (activeRequestIds.length > 0) {
    return { ok: false, message: `이미 승인 요청이 진행 중입니다 (요청 #${activeRequestIds.join(", #")}). 승인관리에서 확인하세요.` };
  }
  if (current === "draft" || current === "rejected") return { ok: true, recovering: false };
  // 승인 요청 없이 승인대기 — 이전 오류로 생긴 기록. 요청을 다시 만들어 승인관리에 보이게 한다
  if (current === "submitted") return { ok: true, recovering: true };
  return { ok: false, message: "승인완료된 기록입니다. 고치려면 수정해 재작성한 뒤 다시 요청하세요." };
}

/** 재작성 때 form_data 의 검토·승인 직인 제거 (작성자 직인은 유지) — reopenForEdit 와 같은 규칙 */
export function clearReviewStamps(formData: unknown): unknown {
  if (!formData || typeof formData !== "object") return formData;
  const fd = { ...(formData as Record<string, unknown>) };
  if (fd.approval && typeof fd.approval === "object") {
    fd.approval = { ...(fd.approval as Record<string, unknown>), reviewerApproved: false, approverApproved: false, reviewerDate: null, approverDate: null };
  }
  return fd;
}
