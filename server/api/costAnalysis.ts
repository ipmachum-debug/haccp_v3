import { getDb } from "../db";
import { recipes, recipeLines } from "../../drizzle/schema/recipe";
import { hMaterials } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

/** 정제수(purified water) 여부 판별 - 가격 계산에서 제외 대상 */
function isWaterMaterial(materialName: string | null | undefined): boolean {
  if (!materialName) return false;
  const name = materialName.toLowerCase();
  return name.includes("정제수") || name.includes("purified water");
}

/**
 * 레시피 기반 배치 원가 계산
 */
export async function calculateRecipeCost(recipeId: number, _tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 레시피 라인 조회 (원재료 정보 포함)
  const lines = await db
    .select({
      materialId: recipeLines.materialId,
      quantity: recipeLines.quantity,
      unit: recipeLines.unit,
      materialName: hMaterials.materialName,
      materialPrice: hMaterials.unitPrice,
      materialUnit: hMaterials.unit,
    })
    .from(recipeLines)
    .leftJoin(hMaterials, eq(recipeLines.materialId, hMaterials.id))
    .where(eq(recipeLines.recipeId, recipeId));

  // 원재료비 계산 (정제수 제외)
  let totalMaterialCost = 0;
  for (const line of lines) {
    if (isWaterMaterial(line.materialName)) continue;
    const quantity = parseFloat(line.quantity || "0");
    const unitPrice = parseFloat(line.materialPrice || "0");
    totalMaterialCost += quantity * unitPrice;
  }

  // 인건비 추정 (레시피 총 시간 기반)
  const recipe = await db
    .select()
    .from(recipes)
    .where(eq(recipes.id, recipeId))
    .limit(1);

  const totalTime = recipe[0]?.totalTime || 0; // 분 단위
  const laborCostPerHour = 15000; // 시간당 인건비 (설정값)
  const laborCost = (totalTime / 60) * laborCostPerHour;

  // 간접비 추정 (원재료비의 20%)
  const overheadCost = totalMaterialCost * 0.2;

  return {
    materialCost: Math.round(totalMaterialCost),
    laborCost: Math.round(laborCost),
    overheadCost: Math.round(overheadCost),
    totalCost: Math.round(totalMaterialCost + laborCost + overheadCost),
  };
}

/**
 * 제품별 원가 통계 계산
 */
export async function calculateProductCostStats(productId?: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 레시피 목록 조회
  let queryBuilder = db.select().from(recipes);

  const conditions: any[] = [eq(recipes.isActive, 1)];
  if (tenantId) {
    conditions.push(eq(recipes.tenantId, tenantId));
  }
  if (productId) {
    conditions.push(eq(recipes.productId, productId));
  }
  
  const query = queryBuilder.where(and(...conditions)) as any;

  const recipeList = await query;

  if (recipeList.length === 0) {
    return {
      totalRecipes: 0,
      avgMaterialCost: 0,
      avgLaborCost: 0,
      avgOverheadCost: 0,
      avgTotalCost: 0,
      costByRecipe: [],
    };
  }

  // 각 레시피별 원가 계산
  const costByRecipe = [];
  let totalMaterialCost = 0;
  let totalLaborCost = 0;
  let totalOverheadCost = 0;

  for (const recipe of recipeList) {
    const cost = await calculateRecipeCost(recipe.id);
    costByRecipe.push({
      recipeId: recipe.id,
      recipeName: recipe.recipeName,
      ...cost,
    });

    totalMaterialCost += cost.materialCost;
    totalLaborCost += cost.laborCost;
    totalOverheadCost += cost.overheadCost;
  }

  const count = recipeList.length;

  return {
    totalRecipes: count,
    avgMaterialCost: Math.round(totalMaterialCost / count),
    avgLaborCost: Math.round(totalLaborCost / count),
    avgOverheadCost: Math.round(totalOverheadCost / count),
    avgTotalCost: Math.round((totalMaterialCost + totalLaborCost + totalOverheadCost) / count),
    costByRecipe,
  };
}
