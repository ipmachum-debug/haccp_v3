/**
 * 오늘 배치 목록 — '지금 할 일' 한 가지 (2026-10-18, PR-B)
 *
 * CEO 설계: 배치 생성 / 실제 생산 완료 / 품질 승인 / 재고·회계 확정은 같은 사건이 아니다.
 *   생성만 했다면 완료로 보이지 않는다. 품질 미확인·승인 대기는 따로 보인다. 순수 함수 — DB 없음.
 */
export interface BoardRow {
  status: string;
  approvalStatus: string | null;
  ccpForms: { total: number; unconfirmed: number; approved: number };
  /** 미래 날짜로 만든 예정 생산 건 — 그날 확인하면 시작·원료 출고 (현장 1) */
  planOnly?: boolean;
  /** 이력 보존형 복구로 무효 처리된 중복 생산 건 — 대체 생산 건 번호 (0 = 대체 없음) */
  voidedSupersededBy?: number | null;
  /** 자동 검사 (dayChecks) — 있으면 '지금 할 일' 에 먼저 반영 (2026-10-20 생산 화면 하나로) */
  check?: { setupPending: boolean; rows: { total: number; confirmed: number }; issueLines: number };
}

export interface NextAction {
  /** 화면 표시 */
  label: string;
  /** 색 구분 */
  tone: "todo" | "wait" | "done" | "stop";
}

export function nextBatchAction(r: BoardRow): NextAction {
  if (r.voidedSupersededBy != null) return { label: r.voidedSupersededBy ? `무효(중복) — #${r.voidedSupersededBy} 로 대체, 원본 보존` : "무효(중복) — 원본 보존", tone: "stop" };
  if (r.status === "cancelled") return { label: "취소됨", tone: "stop" };
  if (r.status === "failed") return { label: "실패 — 확인 필요", tone: "stop" };
  if (r.check?.setupPending) return { label: "준비 미완 — 같은 수정을 다시 저장하면 이어서 준비", tone: "stop" };
  if (r.planOnly) return { label: "예정 — 그날 첫 확인에서 시작 (원료는 그때 출고)", tone: "wait" };
  if (r.check && r.check.issueLines > 0) return { label: `원료 출고 확인 ${r.check.issueLines}줄`, tone: "stop" };
  const rowsLeft = r.check ? r.check.rows.total - r.check.rows.confirmed : 0;
  if (rowsLeft > 0 && !["completed", "shipped", "archived"].includes(r.status)) return { label: `현장 확인 ${rowsLeft}건 남음`, tone: "todo" };
  if (r.ccpForms.unconfirmed > 0) return { label: `CCP 기록지 확인 제출 ${r.ccpForms.unconfirmed}건`, tone: "todo" };
  if (r.status === "completed" || r.status === "shipped" || r.status === "archived") return { label: "완료", tone: "done" };
  // 현장 확인이 다 끝난 진행 중 생산 건 — 다음은 생산 완료 입력 (승인 요청이 먼저 만들어져 있어도)
  if (r.check && r.check.rows.total > 0 && rowsLeft === 0 && (r.status === "in_progress" || r.status === "paused")) return { label: "생산 완료 입력", tone: "todo" };
  if (r.approvalStatus && /^pending/.test(r.approvalStatus)) return { label: "승인 대기", tone: "wait" };
  if (r.approvalStatus === "rejected") return { label: "반려 — 수정 필요", tone: "stop" };
  if (r.status === "in_progress" || r.status === "paused" || r.status === "under_review") return { label: "작업 중", tone: "todo" };
  return { label: "작업 전", tone: "todo" };
}
