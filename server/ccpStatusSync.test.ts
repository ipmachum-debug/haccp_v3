import { describe, it, expect } from "vitest";
import { shouldApplyStatus } from "./db/haccp/ccpStatusSync";

describe("ccpStatusSync.shouldApplyStatus — 기록지 → 인스턴스 상태는 올라가기만, 반려는 항상", () => {
  it("draft 인스턴스에 submitted / approved 는 반영", () => {
    expect(shouldApplyStatus("draft", "submitted")).toBe(true);
    expect(shouldApplyStatus("draft", "approved")).toBe(true);
    expect(shouldApplyStatus(null, "submitted")).toBe(true);
  });

  it("같은 상태나 내려가는 상태는 반영하지 않음 (completeBatch 가 올린 approved 보호)", () => {
    expect(shouldApplyStatus("submitted", "submitted")).toBe(false);
    expect(shouldApplyStatus("approved", "submitted")).toBe(false);
    expect(shouldApplyStatus("approved", "draft")).toBe(false);
    expect(shouldApplyStatus("submitted", "draft")).toBe(false);
  });

  it("rejected 는 현재 상태와 무관하게 반영, 이미 rejected 면 생략", () => {
    expect(shouldApplyStatus("approved", "rejected")).toBe(true);
    expect(shouldApplyStatus("draft", "rejected")).toBe(true);
    expect(shouldApplyStatus("rejected", "rejected")).toBe(false);
  });

  it("rejected 인스턴스에 submitted 가 오면 재제출로 보고 반영", () => {
    expect(shouldApplyStatus("rejected", "submitted")).toBe(true);
  });

  it("알 수 없는 값은 무시", () => {
    expect(shouldApplyStatus("draft", "completed")).toBe(false);
    expect(shouldApplyStatus("draft", null)).toBe(false);
  });
});
