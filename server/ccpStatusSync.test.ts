import { describe, it, expect } from "vitest";
import { shouldApplyStatus, isFormGovernedByBatchRequest } from "./db/haccp/ccpStatusSync";

describe("ccpStatusSync.isFormGovernedByBatchRequest — 배치 결재를 따르는 기록지 판정", () => {
  it("자기 요청이 없는 CCP-1B/2B 는 배치 요청을 따른다 (순인절미 #1102 케이스)", () => {
    expect(isFormGovernedByBatchRequest({ ccp_type: "CCP-1B", approval_request_id: null })).toBe(true);
    expect(isFormGovernedByBatchRequest({ ccp_type: "CCP-2B", approval_request_id: null })).toBe(true);
  });

  it("CCP-4P 일일 기록지는 자기 요청이 있으므로 제외", () => {
    expect(isFormGovernedByBatchRequest({ ccp_type: "CCP-4P", approval_request_id: null })).toBe(false);
    expect(isFormGovernedByBatchRequest({ ccp_type: "CCP-4P", approval_request_id: 10 })).toBe(false);
  });

  it("자기 요청(approval_request_id)이 있는 기록지는 그 요청이 정본이라 제외", () => {
    expect(isFormGovernedByBatchRequest({ ccp_type: "CCP-1B", approval_request_id: 55 })).toBe(false);
  });
});

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
