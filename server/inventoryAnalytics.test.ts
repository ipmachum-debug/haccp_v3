import { describe, it, expect } from "vitest";
import { calculateInventoryTurnover, calculateEfficiencyMetrics } from "./db/inventory/inventoryAnalytics";
import { analyzePriceTrend, recommendPurchaseTiming, recommendAlternativeSuppliers, generateCostSavingProposal } from "./db/production/costSavingAI";

describe("Inventory Analytics", () => {
  it("should calculate inventory turnover", async () => {
    const startDate = new Date("2024-01-01");
    const endDate = new Date("2024-12-31");
    const result = await calculateInventoryTurnover(startDate, endDate);
    expect(Array.isArray(result)).toBe(true);
    if (result.length > 0) {
      expect(result[0]).toHaveProperty("materialId");
      expect(result[0]).toHaveProperty("turnoverRate");
      expect(result[0]).toHaveProperty("averageHoldingPeriod");
      expect(result[0]).toHaveProperty("efficiency");
    }
  });

  it("should calculate efficiency metrics", async () => {
    const startDate = new Date("2024-01-01");
    const endDate = new Date("2024-12-31");
    const result = await calculateEfficiencyMetrics(startDate, endDate);
    expect(result).toHaveProperty("averageTurnoverRate");
    expect(result).toHaveProperty("averageHoldingPeriod");
    expect(result).toHaveProperty("highEfficiencyCount");
    expect(result).toHaveProperty("lowEfficiencyCount");
  });
});

describe("Cost Saving AI", () => {
  it("should analyze price trend", async () => {
    const materialId = 1;
    const startDate = new Date("2024-01-01");
    const endDate = new Date("2024-12-31");
    const result = await analyzePriceTrend(materialId, startDate, endDate);
    expect(result).toHaveProperty("materialId");
    expect(result).toHaveProperty("trend");
    expect(result).toHaveProperty("currentPrice");
    expect(result).toHaveProperty("avgPrice");
    expect(["increasing", "decreasing", "stable"]).toContain(result.trend);
  });

  it("should recommend purchase timing", async () => {
    const materialId = 1;
    const result = await recommendPurchaseTiming(materialId);
    expect(result).toHaveProperty("materialId");
    expect(result).toHaveProperty("recommendedAction");
    expect(result).toHaveProperty("reason");
    expect(["buy_now", "wait", "monitor"]).toContain(result.recommendedAction);
  });

  it("should recommend alternative suppliers", async () => {
    const materialId = 1;
    const result = await recommendAlternativeSuppliers(materialId);
    expect(result).toHaveProperty("materialId");
    expect(result).toHaveProperty("alternativeSuppliers");
    expect(Array.isArray(result.alternativeSuppliers)).toBe(true);
  });

  it("should generate cost saving proposal", async () => {
    const materialId = 1;
    const result = await generateCostSavingProposal(materialId);
    expect(result).toHaveProperty("materialId");
    expect(result).toHaveProperty("currentCost");
    expect(result).toHaveProperty("proposedActions");
    expect(result).toHaveProperty("totalEstimatedSavings");
    expect(result).toHaveProperty("aiInsights");
    expect(Array.isArray(result.proposedActions)).toBe(true);
  });
});
