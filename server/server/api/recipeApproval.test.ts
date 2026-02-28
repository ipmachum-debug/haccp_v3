import { describe, it, expect } from "vitest";
import { getPendingRecipes, getRecipeWithApprovalInfo } from "./recipeApproval";

describe("Recipe Approval API", () => {
  it("should get pending recipes", async () => {
    const pendingRecipes = await getPendingRecipes();
    expect(pendingRecipes).toBeInstanceOf(Array);
    // 데이터가 없을 수도 있으므로 배열인지만 확인
  });

  it("should throw error for non-existent recipe", async () => {
    await expect(
      getRecipeWithApprovalInfo(999999)
    ).rejects.toThrow("품목제조보고를 찾을 수 없습니다");
  });
});
