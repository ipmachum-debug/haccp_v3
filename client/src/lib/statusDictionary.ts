/**
 * 상태 사전 — 상태 문구·색의 단일 출처 (UI/UX 개편 3-a, 2026-10-14)
 *
 * 명세 §5: 작성 중 · 대기 · 검토 대기 · 승인 대기 · 승인 · 완료 · 반려 · 취소 · 오류 → 색·문구 고정.
 * 같은 `pending` 이 화면마다 "대기"/"검토중"/"요청"으로 다르게 보이던 것을 여기서 한 번에 정한다.
 * 화면의 원래 상태 코드(DB 값)는 그대로 두고, 표시만 이 사전을 거친다 (데이터 변경 없음).
 */

/** 표준 상태 9종 + 진행 중 */
export type StatusKind =
  | "draft" | "pending" | "in_progress" | "pending_review" | "pending_approval"
  | "approved" | "completed" | "rejected" | "cancelled" | "error";

export type StatusTone = "slate" | "amber" | "blue" | "violet" | "emerald" | "red" | "zinc";

export const STATUS_KINDS: Readonly<Record<StatusKind, { label: string; tone: StatusTone }>> = {
  draft: { label: "작성 중", tone: "slate" },
  pending: { label: "대기", tone: "amber" },
  in_progress: { label: "진행 중", tone: "blue" },
  pending_review: { label: "검토 대기", tone: "amber" },
  pending_approval: { label: "승인 대기", tone: "violet" },
  approved: { label: "승인", tone: "emerald" },
  completed: { label: "완료", tone: "emerald" },
  rejected: { label: "반려", tone: "red" },
  cancelled: { label: "취소", tone: "zinc" },
  error: { label: "오류", tone: "red" },
};

/**
 * 앱 곳곳의 원래 상태 코드 → 표준 상태. 여기에 없는 코드는 원문 그대로 회색으로 보인다 (숨기지 않음).
 * 업무별로 뜻이 다른 코드(예: CCP 기록지 submitted = 검토 대기)는 도메인을 붙여 따로 정할 수 있다 → resolveStatus(code, domain)
 */
export const STATUS_ALIASES: Readonly<Record<string, StatusKind>> = {
  draft: "draft", writing: "draft", temp: "draft", temporary: "draft",
  pending: "pending", waiting: "pending", requested: "pending", open: "pending", planned: "pending", detected: "pending",
  in_progress: "in_progress", processing: "in_progress", running: "in_progress", investigating: "in_progress", under_investigation: "in_progress",
  pending_writer: "pending", pending_review: "pending_review", submitted: "pending_review", review: "pending_review", reviewing: "pending_review",
  pending_approval: "pending_approval", approval_pending: "pending_approval", pending_disposal: "pending_approval",
  approved: "approved", confirmed: "approved", posted: "approved",
  completed: "completed", done: "completed", closed: "completed", disposed: "completed", finished: "completed", received: "completed",
  rejected: "rejected", returned: "rejected", denied: "rejected",
  cancelled: "cancelled", canceled: "cancelled", void: "cancelled", voided: "cancelled",
  error: "error", failed: "error", failure: "error",
};

/** 도메인별 예외 — 같은 코드가 업무마다 다른 뜻일 때만 */
export const DOMAIN_STATUS_OVERRIDES: Readonly<Record<string, Readonly<Record<string, StatusKind>>>> = {
  // 매출·매입: pending 은 '확정 대기' — 승인 대기로 보인다
  sale: { pending: "pending_approval" },
  purchase: { pending: "pending_approval" },
};

export interface ResolvedStatus { kind: StatusKind | null; label: string; tone: StatusTone }

export function resolveStatus(code: string | null | undefined, domain?: string): ResolvedStatus {
  const raw = String(code ?? "").trim();
  const key = raw.toLowerCase();
  const kind = (domain && DOMAIN_STATUS_OVERRIDES[domain]?.[key]) || STATUS_ALIASES[key] || null;
  if (!kind) return { kind: null, label: raw || "-", tone: "zinc" };
  return { kind, ...STATUS_KINDS[kind] };
}

/** 톤 → 배지 클래스 (라이트·다크) */
export const STATUS_TONE_CLASS: Readonly<Record<StatusTone, string>> = {
  slate: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-500/15 dark:text-slate-300 dark:border-slate-500/30",
  amber: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
  blue: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30",
  violet: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30",
  red: "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30",
  zinc: "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-500/15 dark:text-zinc-300 dark:border-zinc-500/30",
};
