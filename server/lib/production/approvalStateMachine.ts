/**
 * 승인 요청 상태 머신 (Top 10 #10 — 승인 흐름 pure logic)
 *
 * autoApprovalRequest.ts 의 SQL UPDATE WHERE 조건에 흩어져 있던
 * 상태 전이 규칙을 pure function 으로 집약.
 *
 * 전이 규칙:
 *   draft         → pending_review (submit)
 *   pending_review → pending_approval (review)
 *   pending_review → rejected (reject_review)
 *   pending_approval → approved (final_approve)
 *   pending_approval → rejected (reject_approval)
 *   pending_review → approved (auto_review_approve, 일부 흐름)
 *   (*)           → cancelled (cancel)
 *
 * 종결 상태: approved / rejected / cancelled
 */

export type ApprovalStatus =
  | "draft"
  | "pending"
  | "pending_review"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "cancelled";

export type ApprovalAction =
  | "submit" // draft → pending_review
  | "review" // pending_review → pending_approval
  | "reject_review" // pending_review → rejected
  | "final_approve" // pending_approval → approved
  | "reject_approval" // pending_approval → rejected
  | "auto_review_approve" // pending_review → approved (자동 검토+승인 일괄 처리)
  | "cancel" // (*) → cancelled
  | "restore"; // cancelled → draft (재시작)

export type ApprovalRole = "author" | "reviewer" | "approver" | "admin";

/** 종결 상태 판정 — 상태 변경 불가 */
export function isTerminalStatus(status: ApprovalStatus): boolean {
  return status === "approved" || status === "rejected";
}

/** 전이 표 (from → action → to) */
const TRANSITIONS: Record<
  ApprovalStatus,
  Partial<Record<ApprovalAction, ApprovalStatus>>
> = {
  draft: {
    submit: "pending_review",
    cancel: "cancelled",
  },
  // 레거시 'pending' 은 'pending_review' 와 동일 취급
  pending: {
    review: "pending_approval",
    reject_review: "rejected",
    auto_review_approve: "approved",
    cancel: "cancelled",
  },
  pending_review: {
    review: "pending_approval",
    reject_review: "rejected",
    auto_review_approve: "approved",
    cancel: "cancelled",
  },
  pending_approval: {
    final_approve: "approved",
    reject_approval: "rejected",
    cancel: "cancelled",
  },
  approved: {
    // 종결. 복구(restore)는 허용하지 않음 (새 요청 생성 필요)
  },
  rejected: {
    // 종결. 복구는 cancel → draft 경유
    cancel: "cancelled", // 이미 거절된 건도 취소 표시는 허용 (감사로깅용)
  },
  cancelled: {
    restore: "draft",
  },
};

/** 역할별 수행 가능 액션 */
const ROLE_ACTIONS: Record<ApprovalRole, ReadonlySet<ApprovalAction>> = {
  author: new Set<ApprovalAction>(["submit", "cancel", "restore"]),
  reviewer: new Set<ApprovalAction>(["review", "reject_review", "auto_review_approve"]),
  approver: new Set<ApprovalAction>(["final_approve", "reject_approval", "auto_review_approve"]),
  admin: new Set<ApprovalAction>([
    "submit",
    "review",
    "reject_review",
    "final_approve",
    "reject_approval",
    "auto_review_approve",
    "cancel",
    "restore",
  ]),
};

/**
 * 전이 가능 여부 확인
 */
export function canTransition(
  from: ApprovalStatus,
  action: ApprovalAction,
  role: ApprovalRole,
): boolean {
  if (!ROLE_ACTIONS[role]?.has(action)) return false;
  return TRANSITIONS[from]?.[action] !== undefined;
}

/**
 * 전이 실행 — 불가능하면 null 반환 (호출 측에서 에러 처리)
 */
export function applyTransition(
  from: ApprovalStatus,
  action: ApprovalAction,
  role: ApprovalRole,
): ApprovalStatus | null {
  if (!canTransition(from, action, role)) return null;
  return TRANSITIONS[from][action] ?? null;
}

/**
 * 엄격 전이 — 불가능하면 throw (SQL 전이 전 가드)
 */
export function assertTransition(
  from: ApprovalStatus,
  action: ApprovalAction,
  role: ApprovalRole,
): ApprovalStatus {
  const to = applyTransition(from, action, role);
  if (to === null) {
    throw new Error(
      `[approval] 허용되지 않은 전이: from=${from}, action=${action}, role=${role}`,
    );
  }
  return to;
}

/**
 * 진행 중 상태 여부 (종결 이전)
 */
export function isInProgress(status: ApprovalStatus): boolean {
  return (
    status === "draft" ||
    status === "pending" ||
    status === "pending_review" ||
    status === "pending_approval"
  );
}
