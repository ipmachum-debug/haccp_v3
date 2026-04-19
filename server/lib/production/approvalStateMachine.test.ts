/**
 * 승인 상태 전이 회귀 테스트 (Top 10 #10 — 승인 도메인 pure logic)
 *
 * 이 상태 머신이 잘못 흔들리면:
 *  - 검토 없이 바로 승인 처리되는 우회
 *  - 종결된 요청이 다시 열리는 감사로깅 혼란
 *  - 역할 없는 사용자가 승인 가능해지는 권한 경계 파손
 */
import { describe, it, expect } from "vitest";
import {
  canTransition,
  applyTransition,
  assertTransition,
  isTerminalStatus,
  isInProgress,
} from "./approvalStateMachine";

describe("승인 상태 머신 — 기본 전이", () => {
  it("draft → pending_review (submit, author)", () => {
    expect(applyTransition("draft", "submit", "author")).toBe("pending_review");
  });

  it("pending_review → pending_approval (review, reviewer)", () => {
    expect(applyTransition("pending_review", "review", "reviewer")).toBe("pending_approval");
  });

  it("pending_approval → approved (final_approve, approver)", () => {
    expect(applyTransition("pending_approval", "final_approve", "approver")).toBe("approved");
  });

  it("pending_review → rejected (reject_review, reviewer)", () => {
    expect(applyTransition("pending_review", "reject_review", "reviewer")).toBe("rejected");
  });

  it("pending_approval → rejected (reject_approval, approver)", () => {
    expect(applyTransition("pending_approval", "reject_approval", "approver")).toBe("rejected");
  });

  it("pending_review → approved (auto_review_approve, approver 일괄)", () => {
    expect(
      applyTransition("pending_review", "auto_review_approve", "approver"),
    ).toBe("approved");
  });

  it("cancelled → draft (restore, author 재시작)", () => {
    expect(applyTransition("cancelled", "restore", "author")).toBe("draft");
  });

  it("레거시 'pending' 은 pending_review 와 동일 전이", () => {
    expect(applyTransition("pending", "review", "reviewer")).toBe("pending_approval");
  });
});

describe("승인 상태 머신 — 불법 전이 차단", () => {
  it("draft 에서 직접 approved 로 갈 수 없음", () => {
    expect(applyTransition("draft", "final_approve", "approver")).toBeNull();
  });

  it("pending_review 에서 검토자 없이 final_approve 불가", () => {
    expect(applyTransition("pending_review", "final_approve", "approver")).toBeNull();
  });

  it("approved 는 종결 — 어떤 액션도 불가", () => {
    expect(applyTransition("approved", "final_approve", "approver")).toBeNull();
    expect(applyTransition("approved", "review", "reviewer")).toBeNull();
    expect(applyTransition("approved", "cancel", "admin")).toBeNull();
    expect(applyTransition("approved", "restore", "admin")).toBeNull();
  });

  it("rejected 도 종결 (cancel 만 허용 — 감사로깅)", () => {
    expect(applyTransition("rejected", "final_approve", "approver")).toBeNull();
    expect(applyTransition("rejected", "review", "reviewer")).toBeNull();
    expect(applyTransition("rejected", "restore", "admin")).toBeNull();
    // cancel 은 허용 (이미 거절된 건을 취소 표시)
    expect(applyTransition("rejected", "cancel", "admin")).toBe("cancelled");
  });

  it("cancelled 에서 바로 approved 불가", () => {
    expect(applyTransition("cancelled", "final_approve", "approver")).toBeNull();
  });
});

describe("승인 상태 머신 — 역할 기반 권한", () => {
  it("author 는 reviewer 의 review 액션 불가", () => {
    expect(canTransition("pending_review", "review", "author")).toBe(false);
    expect(applyTransition("pending_review", "review", "author")).toBeNull();
  });

  it("reviewer 는 approver 의 final_approve 불가", () => {
    expect(canTransition("pending_approval", "final_approve", "reviewer")).toBe(false);
  });

  it("approver 는 author 의 submit 불가", () => {
    expect(canTransition("draft", "submit", "approver")).toBe(false);
  });

  it("admin 은 모든 액션 가능 (긴급 권한)", () => {
    expect(applyTransition("draft", "submit", "admin")).toBe("pending_review");
    expect(applyTransition("pending_review", "review", "admin")).toBe("pending_approval");
    expect(applyTransition("pending_approval", "final_approve", "admin")).toBe("approved");
    expect(applyTransition("pending_review", "reject_review", "admin")).toBe("rejected");
  });

  it("reviewer + auto_review_approve 는 허용 (일괄 처리 권한)", () => {
    expect(canTransition("pending_review", "auto_review_approve", "reviewer")).toBe(true);
  });
});

describe("승인 상태 머신 — assertTransition (SQL 가드)", () => {
  it("성공 전이는 next status 반환", () => {
    expect(assertTransition("draft", "submit", "author")).toBe("pending_review");
  });

  it("실패 전이는 throw (상세 메시지 포함)", () => {
    expect(() => assertTransition("approved", "review", "reviewer")).toThrow(
      /허용되지 않은 전이.*from=approved.*action=review.*role=reviewer/,
    );
  });

  it("역할 미매칭도 throw", () => {
    expect(() => assertTransition("pending_approval", "final_approve", "author")).toThrow(
      /role=author/,
    );
  });
});

describe("승인 상태 머신 — 유틸", () => {
  it("isTerminalStatus: approved / rejected 만 true", () => {
    expect(isTerminalStatus("approved")).toBe(true);
    expect(isTerminalStatus("rejected")).toBe(true);
    expect(isTerminalStatus("cancelled")).toBe(false); // cancelled 는 restore 가능
    expect(isTerminalStatus("pending_review")).toBe(false);
    expect(isTerminalStatus("draft")).toBe(false);
  });

  it("isInProgress: draft / pending* 는 true", () => {
    expect(isInProgress("draft")).toBe(true);
    expect(isInProgress("pending")).toBe(true);
    expect(isInProgress("pending_review")).toBe(true);
    expect(isInProgress("pending_approval")).toBe(true);
    expect(isInProgress("approved")).toBe(false);
    expect(isInProgress("rejected")).toBe(false);
    expect(isInProgress("cancelled")).toBe(false);
  });
});

describe("승인 상태 머신 — 통합 시나리오", () => {
  it("정상 흐름: draft → review → approval → approved", () => {
    let status = "draft" as const;
    const s1 = assertTransition(status, "submit", "author");
    expect(s1).toBe("pending_review");
    const s2 = assertTransition(s1, "review", "reviewer");
    expect(s2).toBe("pending_approval");
    const s3 = assertTransition(s2, "final_approve", "approver");
    expect(s3).toBe("approved");
    expect(isTerminalStatus(s3)).toBe(true);
  });

  it("반려 후 재제출: pending_review → rejected → (cancelled) → draft → resubmit", () => {
    const s1 = assertTransition("pending_review", "reject_review", "reviewer");
    expect(s1).toBe("rejected");
    const s2 = assertTransition(s1, "cancel", "admin");
    expect(s2).toBe("cancelled");
    const s3 = assertTransition(s2, "restore", "author");
    expect(s3).toBe("draft");
    const s4 = assertTransition(s3, "submit", "author");
    expect(s4).toBe("pending_review");
  });

  it("일괄 자동 승인: pending_review → approved (approver 권한)", () => {
    const s1 = assertTransition("pending_review", "auto_review_approve", "approver");
    expect(s1).toBe("approved");
    expect(isTerminalStatus(s1)).toBe(true);
  });

  it("승인 이후에는 어떤 경로로도 상태 못 바꿈", () => {
    expect(() => assertTransition("approved", "submit", "author")).toThrow();
    expect(() => assertTransition("approved", "review", "admin")).toThrow();
    expect(() => assertTransition("approved", "reject_approval", "admin")).toThrow();
  });
});
