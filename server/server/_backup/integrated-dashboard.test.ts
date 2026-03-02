import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { Context } from "./_core/context";

describe("통합 대시보드 API 테스트", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;
  let testSiteId: number;
  let testUserId: number;

  beforeAll(async () => {
    // Mock context 생성
    const mockContext: Context = {
      user: {
        id: 1,
        openId: "test-user",
        name: "Test User",
        email: "test@example.com",
        role: "admin"
      }
    };

    caller = appRouter.createCaller(mockContext);
    testSiteId = 1;
    testUserId = 1;
  });

  it("재고 추이 분석 API 호출 성공", async () => {
    const result = await caller.inventory.getTrend({
      startDate: "2024-01-01",
      endDate: "2024-12-31"
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });

  it("재고 회전율 분석 API 호출 성공", async () => {
    const result = await caller.inventory.getTurnoverAnalysis({
      startDate: "2024-01-01",
      endDate: "2024-12-31"
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });

  it("유통기한 임박 재고 조회 API 호출 성공", async () => {
    const result = await caller.inventory.getExpiringStock();

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });

  it("발주 제안 이력 조회 API 호출 성공", async () => {
    const result = await caller.inventory.getPurchaseProposalHistory({
      startDate: "2024-01-01",
      endDate: "2024-12-31"
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });

  it("생산 효율성 - 배치별 원가 분석 API 호출 성공", async () => {
    const result = await caller.productionSchedule.getCostAnalysis({
      startDate: "2024-01-01",
      endDate: "2024-12-31"
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });

  it("생산 효율성 - 생산 시간 추이 API 호출 성공", async () => {
    const result = await caller.productionSchedule.getProductionTimeAnalysis({
      startDate: "2024-01-01",
      endDate: "2024-12-31"
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });

  it("생산 효율성 - 불량률 분석 API 호출 성공", async () => {
    const result = await caller.productionSchedule.getDefectRateAnalysis({
      startDate: "2024-01-01",
      endDate: "2024-12-31"
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });
});
