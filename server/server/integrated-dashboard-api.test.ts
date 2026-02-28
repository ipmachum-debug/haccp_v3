import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createTestContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "admin",
    siteId: 1
    lastSignedIn: new Date()
  };

  return {
    user,
    req: {} as any,
    res: {} as any
  };
}

describe("통합 대시보드 API 최적화 테스트", () => {
  const ctx = createTestContext();
  const caller = appRouter.createCaller(ctx);
  const testSiteId = 1; // ctx.user.siteId 사용

  it("생산 효율성 탭 통합 API 호출 성공", async () => {
    const result = await caller.dashboard.getProductionEfficiencyData({
      siteId: testSiteId,
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      endDate: new Date().toISOString().split("T")[0]
    });

    expect(result).toBeDefined();
    expect(result.costAnalysis).toBeDefined();
    expect(result.timeAnalysis).toBeDefined();
    expect(result.defectAnalysis).toBeDefined();
    expect(Array.isArray(result.costAnalysis)).toBe(true);
    expect(Array.isArray(result.timeAnalysis)).toBe(true);
    expect(Array.isArray(result.defectAnalysis)).toBe(true);
  });

  it("재고 추이 탭 통합 API 호출 성공", async () => {
    const result = await caller.dashboard.getInventoryTrendData({
      siteId: testSiteId,
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      endDate: new Date().toISOString().split("T")[0]
    });

    expect(result).toBeDefined();
    expect(result.inventoryTrend).toBeDefined();
    expect(result.turnoverAnalysis).toBeDefined();
    expect(result.expiringMaterials).toBeDefined();
    expect(Array.isArray(result.inventoryTrend)).toBe(true);
    expect(Array.isArray(result.turnoverAnalysis)).toBe(true);
    expect(Array.isArray(result.expiringMaterials)).toBe(true);
  });

  it("생산 효율성 탭 통합 API - siteId 없이 호출 시 ctx.user.siteId 사용", async () => {
    const result = await caller.dashboard.getProductionEfficiencyData({
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      endDate: new Date().toISOString().split("T")[0]
    });

    expect(result).toBeDefined();
    expect(result.costAnalysis).toBeDefined();
  });

  it("재고 추이 탭 통합 API - materialId 필터 적용", async () => {
    const result = await caller.dashboard.getInventoryTrendData({
      siteId: testSiteId,
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      endDate: new Date().toISOString().split("T")[0],
      materialId: 1, // 테스트 원재료 ID
    });

    expect(result).toBeDefined();
    expect(result.inventoryTrend).toBeDefined();
  });
});
