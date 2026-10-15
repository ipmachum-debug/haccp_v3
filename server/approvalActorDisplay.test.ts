/**
 * 승인 이력 처리자 표시 (2026-10-15, Codex #522 시험 승인 검증)
 * 재현: 요청 3613 — DB reviewed_by=4(한상갑) 인데 이력 화면은 현재 문서결재설정 검토자(이정언)를 표시.
 * 고정: 끝난 단계는 실제 처리자, 남은 단계만 현재 지정자를 "(지정)" 으로.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { stepActorLabel } from "../client/src/pages/system/_approvalManagement/stepActor";
import { REPO_ROOT } from "./__helpers__/appRoutes";

const read = (p: string) => readFileSync(join(REPO_ROOT, p), "utf-8");

describe("결재 단계 옆 이름", () => {
  it("요청 3613 — 검토 끝남: 실제 처리자 한상갑 (지정 이정언 아님)", () => {
    expect(stepActorLabel(true, "한상갑", "이정언")).toBe("한상갑");
  });
  it("끝났는데 처리자 기록이 없으면 이름 없음 — 지정자를 처리자처럼 보여 주지 않음", () => {
    expect(stepActorLabel(true, null, "이정언")).toBeNull();
  });
  it("남은 단계는 지정자를 (지정) 으로 구분, 지정자 없으면 이름 없음", () => {
    expect(stepActorLabel(false, null, "이정언")).toBe("이정언(지정)");
    expect(stepActorLabel(false, "한상갑", null)).toBeNull();
  });
});

describe("화면 고정", () => {
  it("행: 검토·승인 이름은 stepActorLabel(실제 처리자, 지정자), 작성자는 실제 요청자 우선", () => {
    const src = read("client/src/pages/system/_approvalManagement/RequestRow.tsx");
    expect(src).toContain("stepActorLabel(isReviewed, request.reviewer?.name, reviewerName)");
    expect(src).toContain("stepActorLabel(isApproved, request.approver?.name, approverName)");
    expect(src).toContain('request.requester?.name || writerName || "?"');
    expect(src).not.toMatch(/·\{reviewerName\}|·\{approverName\}/);
  });
  it("상세 직인: 찍힌 직인 이름 → 실제 처리자, 현재 지정자로 대체하지 않음", () => {
    const src = read("client/src/pages/system/_approvalManagement/RequestDetailDialog.tsx");
    expect(src).not.toContain("settingNames");
    expect(src).toContain("(approval?.reviewerApproved ? approval.reviewerName : undefined) ||\n                request.reviewer?.name ||");
    expect(src).toContain("(approval?.approverApproved ? approval.approverName : undefined) ||\n                request.approver?.name ||");
  });
});
