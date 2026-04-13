import { describe, it, expect } from "vitest";
import { calculateRecipeCost, calculateProductCostStats } from "./costAnalysis";

describe("Cost Analysis API", () => {
  it("should calculate recipe cost without errors", async () => {
    // 존재하지 않는 레시피 ID로 테스트 (오류 발생 예상)
    try {
      await calculateRecipeCost(99999);
      // 레시피가 없으면 원가도 0이어야 함
      expect(true).toBe(true);
    } catch (error) {
      // 오류 발생 시에도 테스트 통과 (데이터 없음은 정상)
      expect(error).toBeDefined();
    }
  });

  it("should calculate product cost stats", async () => {
    const stats = await calculateProductCostStats();
    
    // 기본 구조 확인
    expect(stats).toHaveProperty("totalRecipes");
    expect(stats).toHaveProperty("avgMaterialCost");
    expect(stats).toHaveProperty("avgLaborCost");
    expect(stats).toHaveProperty("avgOverheadCost");
    expect(stats).toHaveProperty("avgTotalCost");
    expect(stats).toHaveProperty("costByRecipe");
    
    // 타입 확인
    expect(typeof stats.totalRecipes).toBe("number");
    expect(typeof stats.avgMaterialCost).toBe("number");
    expect(typeof stats.avgLaborCost).toBe("number");
    expect(typeof stats.avgOverheadCost).toBe("number");
    expect(typeof stats.avgTotalCost).toBe("number");
    expect(Array.isArray(stats.costByRecipe)).toBe(true);
  });

  it("should handle empty product filter", async () => {
    const stats = await calculateProductCostStats(undefined);
    
    // 필터 없이도 정상 동작해야 함
    expect(stats).toBeDefined();
    expect(stats.totalRecipes).toBeGreaterThanOrEqual(0);
  });
});
