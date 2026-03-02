import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { Context } from "./_core/context";

// 테스트용 컨텍스트 생성
function createTestContext(): Context {
  return {
    user: {
      id: 1,
      email: "test@example.com",
      role: "admin",
      name: "Test User"
    },
    req: {} as any,
    res: {} as any
  };
}

describe("CCP 자동 생성 테스트", () => {
  let testBatchId: number;
  let testProductId: number;
  let testRecipeId: number;
  const timestamp = Date.now();

  beforeAll(async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    // 1. 테스트용 제품 생성
    const { createProduct } = await import("./db");
    testProductId = await createProduct({
      productCode: `TEST-CCP-${timestamp}`,
      productName: "CCP 테스트 제품",
      productType: "완제품",
      unit: "kg",
      shelfLifeDays: 365,
      storageCondition: "냉장",
      isActive: 1,
      createdBy: ctx.user.id
    });

    // 2. 테스트용 레시피 생성
    const { createRecipe } = await import("./db");
    testRecipeId = await createRecipe({
      productId: testProductId,
      recipeCode: `RCP-CCP-${timestamp}`,
      recipeName: "CCP 테스트 레시피",
      version: 1,
      isActive: 1,
      createdBy: ctx.user.id
    });

    // 3. 레시피에 CCP 정보 추가
    const { addRecipeCcp } = await import("./db");
    await addRecipeCcp({
      recipeId: testRecipeId,
      ccpType: "STEAM",
      stepNumber: 1,
      criticalLimitMin: "85.0",
      criticalLimitMax: "95.0",
      unit: "℃",
      monitoringFrequency: "매 배치",
      correctiveAction: "온도 재조정 후 재가열"
    });

    await addRecipeCcp({
      recipeId: testRecipeId,
      ccpType: "METAL",
      stepNumber: 2,
      criticalLimitMin: null,
      criticalLimitMax: null,
      unit: null,
      monitoringFrequency: "매 배치",
      correctiveAction: "금속 이물 제거 후 재검사"
    });

    // 4. 테스트용 배치 생성
    const result = await caller.batch.create({
      siteId: 1,
      productId: testProductId,
      batchNumber: `CCP-TEST-${timestamp}`,
      plannedQuantity: 1000,
      plannedStartDate: new Date()
    });

    testBatchId = result.batchId;
  });

  it("배치에 대해 CCP를 자동 생성할 수 있어야 한다", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.batch.generateCcp({
      batchId: testBatchId
    });

    expect(result.success).toBe(true);
    expect(result.ccps).toBeDefined();
    expect(result.ccps.length).toBeGreaterThan(0);
    expect(result.message).toContain("CCP가 생성되었습니다");
  });

  it("생성된 CCP는 레시피의 CCP 정보를 포함해야 한다", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.batch.generateCcp({
      batchId: testBatchId
    });

    const steamCcp = result.ccps.find((ccp) => ccp.ccpType === "STEAM");
    expect(steamCcp).toBeDefined();
    expect(steamCcp?.criticalLimitMin).toBe("85.000");
    expect(steamCcp?.criticalLimitMax).toBe("95.000");
    expect(steamCcp?.unit).toBe("℃");

    const metalCcp = result.ccps.find((ccp) => ccp.ccpType === "METAL");
    expect(metalCcp).toBeDefined();
  });

  it("레시피가 없는 제품에 대해서는 오류를 반환해야 한다", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    // 레시피가 없는 제품으로 배치 생성
    const { createProduct, createBatch } = await import("./db");
    const noRecipeProductId = await createProduct({
      productCode: `NO-RECIPE-${timestamp}`,
      productName: "레시피 없는 제품",
      productType: "완제품",
      unit: "kg",
      shelfLifeDays: 365,
      storageCondition: "냉장",
      isActive: 1,
      createdBy: ctx.user.id
    });

    const noRecipeBatchId = await createBatch({
      siteId: 1,
      productId: noRecipeProductId,
      batchNumber: `NO-RECIPE-BATCH-${timestamp}`,
      plannedQuantity: 1000,
      plannedStartDate: new Date(),
      createdBy: ctx.user.id
    });

    await expect(
      caller.batch.generateCcp({
        batchId: noRecipeBatchId
      })
    ).rejects.toThrow("No recipe found for this product");
  });
});
