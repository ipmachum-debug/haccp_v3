import { describe, it, expect } from "vitest";
import { summarizeBatches, splitForms, unresolvedOnly } from "../client/src/lib/todaySummary";

describe("Today 집계 (0-1) — 업무일자 기준 목록을 받아 세는 규칙", () => {
  it("배치: 진행(in_progress·paused) 과 완료(completed·shipped) 만 센다", () => {
    const r = summarizeBatches([
      { status: "planned" }, { status: "in_progress" }, { status: "paused" },
      { status: "completed" }, { status: "shipped" }, { status: "cancelled" },
    ]);
    expect(r).toEqual({ total: 6, inProgress: 2, completed: 2 });
  });

  it("배치: 목록이 비면 전부 0 — 생성일 기준으로 끌어온 배치는 애초에 목록에 없다", () => {
    expect(summarizeBatches([])).toEqual({ total: 0, inProgress: 0, completed: 0 });
  });

  it("기록지: 공식 기록지 status 로 작성 중만 분리 (제출·승인·반려는 미작성 아님)", () => {
    const r = splitForms([
      { status: "draft" }, { status: "submitted" }, { status: "approved" }, { status: "rejected" }, { status: "draft" },
    ]);
    expect(r.drafts).toHaveLength(2);
    expect(r.others).toHaveLength(3);
    expect(r.total).toBe(5);
  });

  it("이탈: 미해결만 남긴다 (isResolved 가 없으면 미해결로 본다)", () => {
    const r = unresolvedOnly([{ isResolved: true }, { isResolved: false }, {}, { isResolved: null }]);
    expect(r).toHaveLength(3);
  });
});
