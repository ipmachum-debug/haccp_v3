import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";

import { formatLocalDate } from "./utils/timezone";

/**
 * 생산 일정 관리 및 재고 현황 대시보드 테스트
 */

const caller = appRouter.createCaller({
  user: { id: 1, email: "test@example.com", role: "admin" as const }
});

describe("생산 일정 관리 (Production Schedule)", () => {
  it("배치 일정 조회 (getBatchSchedule)", async () => {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 7);

    const result = await caller.productionSchedule.getBatchSchedule({
      startDate: formatLocalDate(startDate),
      endDate: formatLocalDate(endDate)
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });

  it("생산 능력 분석 (analyzeProductionCapacity)", async () => {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    const endDate = new Date();

    const result = await caller.productionSchedule.analyzeProductionCapacity({
      startDate: formatLocalDate(startDate),
      endDate: formatLocalDate(endDate),
      groupBy: "day"
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });

  it("제품별 생산 능력 분석 (analyzeProductionCapacityByProduct)", async () => {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    const endDate = new Date();

    const result = await caller.productionSchedule.analyzeProductionCapacityByProduct({
      startDate: formatLocalDate(startDate),
      endDate: formatLocalDate(endDate)
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("재고 현황 대시보드 (Inventory Dashboard)", () => {
  it("재고 현황 대시보드 조회 (getDashboard)", async () => {
    const result = await caller.inventory.getDashboard();

    expect(result).toBeDefined();
    expect(result.stats).toBeDefined();
    expect(result.stats.totalLots).toBeGreaterThanOrEqual(0);
    expect(typeof result.stats.totalValue).toBe("number");
    expect(result.stats.totalValue).toBeGreaterThanOrEqual(0);
    expect(result.stats.availableLots).toBeGreaterThanOrEqual(0);
    expect(result.stats.expiringSoonLots).toBeGreaterThanOrEqual(0);
    expect(result.stats.lowStockCount).toBeGreaterThanOrEqual(0);

    expect(result.materialStocks).toBeDefined();
    expect(Array.isArray(result.materialStocks)).toBe(true);

    expect(result.lowStockMaterials).toBeDefined();
    expect(Array.isArray(result.lowStockMaterials)).toBe(true);

    expect(result.expiringLots).toBeDefined();
    expect(Array.isArray(result.expiringLots)).toBe(true);
  });

  it("재고 이동 추이 조회 (getTrend)", async () => {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    const endDate = new Date();

    const result = await caller.inventory.getTrend({
      startDate: formatLocalDate(startDate),
      endDate: formatLocalDate(endDate)
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });

  it("재고 회전율 분석 조회 (getTurnoverAnalysis)", async () => {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    const endDate = new Date();

    const result = await caller.inventory.getTurnoverAnalysis({
      startDate: formatLocalDate(startDate),
      endDate: formatLocalDate(endDate)
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });
});
