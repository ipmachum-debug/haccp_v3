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
  if (r.planOnly) return { label: "예정 — 그날 확인하면 시작 (원료는 그때 출고)", tone: "wait" };
  if (r.ccpForms.unconfirmed > 0) return { label: `CCP 기록지 확인 제출 ${r.ccpForms.unconfirmed}건`, tone: "todo" };
  if (r.status === "completed" || r.status === "shipped" || r.status === "archived") return { label: "완료", tone: "done" };
  if (r.approvalStatus && /^pending/.test(r.approvalStatus)) return { label: "승인 대기", tone: "wait" };
  if (r.approvalStatus === "rejected") return { label: "반려 — 수정 필요", tone: "stop" };
  if (r.status === "in_progress" || r.status === "paused" || r.status === "under_review") return { label: "작업 중", tone: "todo" };
  return { label: "작업 전", tone: "todo" };
}
