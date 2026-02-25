import { z } from "zod";
import { getDb } from "../db";
import { recipes } from "../../drizzle/schema/recipe";
import { eq, and, desc } from "drizzle-orm";

/**
 * 품목제조보고 승인 API
 */

// 승인 대기 중인 품목제조보고 목록 조회
export async function getPendingRecipes() {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const pendingRecipes = await db
    .select()
    .from(recipes)
    .where(eq(recipes.approvalStatus, "DRAFT"))
    .orderBy(recipes.createdAt);

  return pendingRecipes;
}

// 품목제조보고 승인
export async function approveRecipe(input: { recipeId: number; userId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const [recipe] = await db
    .select()
    .from(recipes)
    .where(eq(recipes.id, input.recipeId))
    .limit(1);

  if (!recipe) {
    throw new Error("품목제조보고를 찾을 수 없습니다.");
  }

  if (recipe.approvalStatus !== "DRAFT") {
    throw new Error("승인 대기 중인 품목제조보고만 승인할 수 있습니다.");
  }

  await db
    .update(recipes)
    .set({
      approvalStatus: "APPROVED",
      approvedBy: input.userId,
      approvedAt: new Date(),
    })
    .where(eq(recipes.id, input.recipeId));

  return { success: true, message: "품목제조보고가 승인되었습니다." };
}

// 품목제조보고 반려
export async function rejectRecipe(input: {
  recipeId: number;
  userId: number;
  reason: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const [recipe] = await db
    .select()
    .from(recipes)
    .where(eq(recipes.id, input.recipeId))
    .limit(1);

  if (!recipe) {
    throw new Error("품목제조보고를 찾을 수 없습니다.");
  }

  if (recipe.approvalStatus !== "DRAFT") {
    throw new Error("승인 대기 중인 품목제조보고만 반려할 수 있습니다.");
  }

  await db
    .update(recipes)
    .set({
      approvalStatus: "REJECTED",
      rejectedBy: input.userId,
      rejectedAt: new Date(),
      rejectionReason: input.reason,
    })
    .where(eq(recipes.id, input.recipeId));

  return { success: true, message: "품목제조보고가 반려되었습니다." };
}

// 품목제조보고 상세 조회 (승인 정보 포함)
export async function getRecipeWithApprovalInfo(recipeId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const [recipe] = await db
    .select()
    .from(recipes)
    .where(eq(recipes.id, recipeId))
    .limit(1);

  if (!recipe) {
    throw new Error("품목제조보고를 찾을 수 없습니다.");
  }

  return recipe;
}

// 품목제조보고 승인 이력 조회
export async function getRecipeApprovalHistory(filters?: {
  approvalStatus?: string;
  startDate?: string;
  endDate?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  let query = db.select().from(recipes);

  if (filters?.approvalStatus) {
    query = query.where(eq(recipes.approvalStatus, filters.approvalStatus as "DRAFT" | "APPROVED" | "REJECTED")) as any;
  }

  const results = await query.orderBy(desc(recipes.createdAt));

  // DRAFT 상태 제외 (이미 승인/반려된 것만)
  return results.filter(
    (r) => r.approvalStatus === "APPROVED" || r.approvalStatus === "REJECTED"
  );
}
