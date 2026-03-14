import { getDb } from "../db";
import { recipes, recipeLines, recipeVersions } from "../../drizzle/schema/recipe";
import { eq, and, desc } from "drizzle-orm";

/**
 * 레시피 목록 조회
 */
export async function getRecipes(filters: {
  productId?: number;
  isActive?: boolean;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  let query = db.select().from(recipes);
  
  const conditions: any[] = [eq(recipes.tenantId, filters.tenantId)];
  if (filters.productId) {
    conditions.push(eq(recipes.productId, filters.productId));
  }
  if (filters.isActive !== undefined) {
    conditions.push(eq(recipes.isActive, filters.isActive ? 1 : 0));
  }
  
  query = query.where(and(...conditions)) as any;
  
  return await query.orderBy(desc(recipes.createdAt));
}

/**
 * 레시피 상세 조회 (라인 포함)
 */
export async function getRecipeById(recipeId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const conditions: any[] = [eq(recipes.id, recipeId)];
  if (tenantId) {
    conditions.push(eq(recipes.tenantId, tenantId));
  }
  
  const recipe = await db.select().from(recipes).where(and(...conditions)).limit(1);
  if (!recipe || recipe.length === 0) return null;
  
  const lines = await db.select().from(recipeLines)
    .where(eq(recipeLines.recipeId, recipeId))
    .orderBy(recipeLines.sortOrder);
  
  return {
    ...recipe[0],
    lines
  };
}

/**
 * 제품별 레시피 조회
 */
export async function getRecipesByProductId(productId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const conditions: any[] = [
    eq(recipes.productId, productId),
    eq(recipes.isActive, 1)
  ];
  if (tenantId) {
    conditions.push(eq(recipes.tenantId, tenantId));
  }
  
  return await db.select().from(recipes)
    .where(and(...conditions))
    .orderBy(desc(recipes.createdAt));
}

/**
 * 레시피 생성
 */
export async function createRecipe(data: {
  productId: number;
  recipeName: string;
  version: string;
  description?: string;
  batchSize: string;
  batchUnit: string;
  yieldRate?: string;
  preparationTime?: number;
  cookingTime?: number;
  totalTime?: number;
  createdBy: number;
  tenantId: number;
  lines: Array<{
    materialId: number;
    quantity: string;
    unit: string;
    percentage?: string;
    sortOrder: number;
    notes?: string;
  }>;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { lines, ...recipeData } = data;
  
  // 레시피 헤더 생성
  const result = await db.insert(recipes).values(recipeData);
  const recipeId = Number(result[0].insertId);
  
  // 레시피 라인 생성
  if (lines && lines.length > 0) {
    await db.insert(recipeLines).values(
      lines.map(line => ({
        ...line,
        recipeId
      })) as any);
  }
  
  return { id: recipeId, success: true };
}

/**
 * 레시피 수정
 */
export async function updateRecipe(
  recipeId: number,
  data: Partial<{
    recipeName: string;
    version: string;
    description: string;
    batchSize: string;
    batchUnit: string;
    yieldRate: string;
    preparationTime: number;
    cookingTime: number;
    totalTime: number;
    isActive: number;
  }>,
  lines?: Array<{
    id?: number;
    materialId: number;
    quantity: string;
    unit: string;
    percentage?: string;
    sortOrder: number;
    notes?: string;
  }>,
  tenantId?: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const conditions: any[] = [eq(recipes.id, recipeId)];
  if (tenantId) {
    conditions.push(eq(recipes.tenantId, tenantId));
  }
  
  // 레시피 헤더 수정
  if (Object.keys(data).length > 0) {
    await db.update(recipes).set(data).where(and(...conditions));
  }
  
  // 레시피 라인 수정 (기존 라인 삭제 후 재생성)
  if (lines) {
    await db.delete(recipeLines).where(eq(recipeLines.recipeId, recipeId));
    
    if (lines.length > 0) {
      await db.insert(recipeLines).values(
        lines.map(line => ({
          ...line,
          recipeId
        })) as any);
    }
  }
  
  return { success: true };
}

/**
 * 레시피 삭제 (소프트 삭제)
 */
export async function deleteRecipe(recipeId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const conditions: any[] = [eq(recipes.id, recipeId)];
  if (tenantId) {
    conditions.push(eq(recipes.tenantId, tenantId));
  }
  
  await db.update(recipes).set({ isActive: 0 }).where(and(...conditions));
  return { success: true };
}

/**
 * 레시피 버전 이력 생성
 */
export async function createRecipeVersion(data: {
  recipeId: number;
  version: string;
  changeDescription?: string;
  createdBy: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 현재 레시피 스냅샷 저장
  const recipe = await getRecipeById(data.recipeId);
  
  await db.insert(recipeVersions).values({
    ...data,
    snapshotData: JSON.stringify(recipe)
  } as any);
  
  return { success: true };
}

/**
 * 레시피 버전 이력 조회
 */
export async function getRecipeVersions(recipeId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.select().from(recipeVersions)
    .where(eq(recipeVersions.recipeId, recipeId))
    .orderBy(desc(recipeVersions.createdAt));
}

/**
 * 레시피 복제
 */
export async function duplicateRecipe(
  recipeId: number,
  newRecipeName: string,
  createdBy: number,
  tenantId: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 기존 레시피 조회
  const recipe = await getRecipeById(recipeId, tenantId);
  if (!recipe) throw new Error("Recipe not found");
  
  // 새 레시피 생성
  const { id, lines, createdAt, updatedAt, ...recipeData } = recipe;
  
  return await createRecipe({
    ...recipeData,
    recipeName: newRecipeName,
    version: "1.0",
    description: recipeData.description || undefined,
    yieldRate: recipeData.yieldRate || undefined,
    preparationTime: recipeData.preparationTime || undefined,
    cookingTime: recipeData.cookingTime || undefined,
    totalTime: recipeData.totalTime || undefined,
    createdBy,
    tenantId,
    lines: lines.map(({ id, recipeId, createdAt, updatedAt, ...lineData }: any) => lineData)
  });
}

export async function createAuditLog(data: any) {
  // 감사 로그는 server/db.ts에서 처리
  return { success: true };
}
