/**
 * autoMaterialIssueDispatcher — feature flag 분기 단위 테스트 (F2-2-d).
 *
 * v1 / v2 호출은 mock — 분기 로직만 검증.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const mockV1 = vi.fn(async (..._args: any[]) => ({
  success: true,
  source: "v1",
  issuedMaterials: [],
  totalCost: 0,
  warnings: [],
  errors: [],
}));
const mockV2 = vi.fn(async (..._args: any[]) => ({
  success: true,
  source: "v2",
  issuedMaterials: [],
  totalCost: 0,
  warnings: [],
  errors: [],
}));

vi.mock("./autoMaterialIssue", () => ({
  autoIssueMaterialsForBatch: (batchId: number, userId: number) =>
    mockV1(batchId, userId),
}));

vi.mock("./autoMaterialIssueV2", () => ({
  autoIssueMaterialsForBatchV2: (batchId: number, userId: number) =>
    mockV2(batchId, userId),
}));

import {
  autoIssueMaterialsDispatch,
  shouldUseV2,
} from "./autoMaterialIssueDispatcher";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  mockV1.mockClear();
  mockV2.mockClear();
  // env 정리
  delete process.env.USE_AUTO_ISSUE_V2;
  delete process.env.USE_AUTO_ISSUE_V2_TENANTS;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("shouldUseV2", () => {
  it("env 미설정 시 false (운영 안전 기본값)", () => {
    expect(shouldUseV2()).toBe(false);
    expect(shouldUseV2(2)).toBe(false);
  });

  it("USE_AUTO_ISSUE_V2=true 시 true", () => {
    process.env.USE_AUTO_ISSUE_V2 = "true";
    expect(shouldUseV2()).toBe(true);
    expect(shouldUseV2(2)).toBe(true);
  });

  it("USE_AUTO_ISSUE_V2=1 / yes 도 true", () => {
    process.env.USE_AUTO_ISSUE_V2 = "1";
    expect(shouldUseV2()).toBe(true);
    process.env.USE_AUTO_ISSUE_V2 = "yes";
    expect(shouldUseV2()).toBe(true);
    process.env.USE_AUTO_ISSUE_V2 = "TRUE";
    expect(shouldUseV2()).toBe(true);
  });

  it("USE_AUTO_ISSUE_V2=false 명시 시 false", () => {
    process.env.USE_AUTO_ISSUE_V2 = "false";
    expect(shouldUseV2()).toBe(false);
    expect(shouldUseV2(2)).toBe(false);
  });

  describe("USE_AUTO_ISSUE_V2_TENANTS — per-tenant 점진 전환", () => {
    it("매칭 tenant 만 true", () => {
      process.env.USE_AUTO_ISSUE_V2_TENANTS = "2,5,7";
      expect(shouldUseV2(2)).toBe(true);
      expect(shouldUseV2(5)).toBe(true);
      expect(shouldUseV2(7)).toBe(true);
      expect(shouldUseV2(3)).toBe(false);
      expect(shouldUseV2(99)).toBe(false);
    });

    it("tenant 미제공 시 false (목록 매칭 불가)", () => {
      process.env.USE_AUTO_ISSUE_V2_TENANTS = "2,5";
      expect(shouldUseV2()).toBe(false);
    });

    it("USE_AUTO_ISSUE_V2_TENANTS 가 USE_AUTO_ISSUE_V2 보다 우선", () => {
      process.env.USE_AUTO_ISSUE_V2 = "true";
      process.env.USE_AUTO_ISSUE_V2_TENANTS = "5";
      // tenant=2 는 목록에 없음 → false (전체 플래그 무시)
      expect(shouldUseV2(2)).toBe(false);
      // tenant=5 는 목록 매칭
      expect(shouldUseV2(5)).toBe(true);
    });

    it("공백 / 빈 항목 처리", () => {
      process.env.USE_AUTO_ISSUE_V2_TENANTS = " 2 , 5 , ";
      expect(shouldUseV2(2)).toBe(true);
      expect(shouldUseV2(5)).toBe(true);
      expect(shouldUseV2(3)).toBe(false);
    });

    it("비숫자 항목은 무시 — 빈 목록이면 fallback to USE_AUTO_ISSUE_V2", () => {
      process.env.USE_AUTO_ISSUE_V2 = "true";
      process.env.USE_AUTO_ISSUE_V2_TENANTS = "abc,xyz";
      // 비숫자만 있으면 enabledTenants.length == 0 → 전체 플래그로 fallback
      expect(shouldUseV2(2)).toBe(true);
    });
  });
});

describe("autoIssueMaterialsDispatch", () => {
  it("env 기본 (미설정) 시 v1 호출", async () => {
    const result = await autoIssueMaterialsDispatch(100, 1, 2);
    expect(mockV1).toHaveBeenCalledWith(100, 1);
    expect(mockV2).not.toHaveBeenCalled();
    expect((result as any).source).toBe("v1");
  });

  it("USE_AUTO_ISSUE_V2=true 시 v2 호출", async () => {
    process.env.USE_AUTO_ISSUE_V2 = "true";
    const result = await autoIssueMaterialsDispatch(100, 1, 2);
    expect(mockV2).toHaveBeenCalledWith(100, 1);
    expect(mockV1).not.toHaveBeenCalled();
    expect((result as any).source).toBe("v2");
  });

  it("USE_AUTO_ISSUE_V2_TENANTS 매칭 시 v2", async () => {
    process.env.USE_AUTO_ISSUE_V2_TENANTS = "2,5";
    await autoIssueMaterialsDispatch(100, 1, 2);
    expect(mockV2).toHaveBeenCalled();
    expect(mockV1).not.toHaveBeenCalled();
  });

  it("USE_AUTO_ISSUE_V2_TENANTS 비매칭 시 v1", async () => {
    process.env.USE_AUTO_ISSUE_V2_TENANTS = "5,7";
    await autoIssueMaterialsDispatch(100, 1, 2);
    expect(mockV1).toHaveBeenCalled();
    expect(mockV2).not.toHaveBeenCalled();
  });

  it("tenantId 미제공 + 전체 플래그 시 v2", async () => {
    process.env.USE_AUTO_ISSUE_V2 = "true";
    await autoIssueMaterialsDispatch(100, 1);
    expect(mockV2).toHaveBeenCalled();
  });
});
