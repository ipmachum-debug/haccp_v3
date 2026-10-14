/**
 * Today 집계 — 순수 함수 (2026-10-14, UI/UX 개편 0-1)
 *
 * 화면에서 떼어내 테스트 가능하게 둔 집계 규칙.
 *  - 배치: 업무일자(planned_date) 가 오늘인 목록을 받아 진행·완료만 센다 (날짜 판정은 서버 businessDate + batch.list fromDate/toDate).
 *  - 기록지: 공식 기록지(h_ccp_form_records) 상태로 작성 중 / 그 외를 가른다.
 *  - 이탈: 미해결(isResolved=false) 만.
 */

export type TodayBatchLike = { status: string };
export type TodayFormLike = { status: "draft" | "submitted" | "approved" | "rejected" };
export type TodayDeviationLike = { isResolved?: boolean | null };

export const IN_PROGRESS_STATUSES = ["in_progress", "paused"] as const;
export const COMPLETED_STATUSES = ["completed", "shipped"] as const;

export function summarizeBatches<T extends TodayBatchLike>(items: readonly T[]) {
  let inProgress = 0;
  let completed = 0;
  for (const b of items) {
    if ((IN_PROGRESS_STATUSES as readonly string[]).includes(b.status)) inProgress++;
    else if ((COMPLETED_STATUSES as readonly string[]).includes(b.status)) completed++;
  }
  return { total: items.length, inProgress, completed };
}

export function splitForms<T extends TodayFormLike>(forms: readonly T[]) {
  const drafts = forms.filter((f) => f.status === "draft");
  const others = forms.filter((f) => f.status !== "draft");
  return { drafts, others, total: forms.length };
}

export function unresolvedOnly<T extends TodayDeviationLike>(list: readonly T[]): T[] {
  return list.filter((d) => !d.isResolved);
}
