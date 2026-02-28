import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { users } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";

describe("Recipe Management API", () => {
  let adminCaller: ReturnType<typeof appRouter.createCaller>;
  let testProductId: number;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // 관리자 사용자 생성 또는 조회
    const existingAdmin = await db
      .select()
      .from(users)
      .where(eq(users.email, "admin@test.com"))
      .limit(1);

    let adminUser;
    if (existingAdmin.length === 0) {
      const hashedPassword = await bcrypt.hash("password123", 10);
      const [newAdmin] = await db.insert(users).values({
        email: "admin@test.com",
        password: hashedPassword,
        name: "Admin User",
        role: "admin"
      });
      adminUser = { id: newAdmin.insertId, email: "admin@test.com", role: "admin", name: "Admin User" };
    } else {
      adminUser = existingAdmin[0];
    }

    adminCaller = appRouter.createCaller({ user: adminUser });

    // 테스트용 제품 생성
    const { hProducts } = await import("../drizzle/schema");
    const [product] = await db.insert(hProducts).values({
      productCode: "TEST-RECIPE-001",
      productName: "테스트 제품",
      category: "식품",
      unit: "kg",
      shelfLife: 365,
      storageConditions: "냉장",
      isActive: 1,
      createdBy: adminUser.id
    });
    testProductId = product.insertId;
  });

  it("should create a new recipe", async () => {
    const result = await adminCaller.recipeManagement.create({
      productId: testProductId,
      recipeName: "테스트 레시피",
      version: "1.0",
      description: "테스트용 레시피입니다",
      batchSize: "100",
      batchUnit: "kg",
      yieldRate: "95.00",
      preparationTime: 30,
      cookingTime: 60,
      totalTime: 90,
      lines: [
        {
          materialId: 1,
          quantity: "50",
          unit: "kg",
          percentage: "50.00",
          sortOrder: 1,
          notes: "주원료"
        },
        {
          materialId: 2,
          quantity: "30",
          unit: "kg",
          percentage: "30.00",
          sortOrder: 2,
          notes: "부원료"
        },
      ]
    });

    expect(result).toHaveProperty("id");
    expect(result).toHaveProperty("recipeName", "테스트 레시피");
  });

  it("should list recipes", async () => {
    const result = await adminCaller.recipeManagement.list({});

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it("should get recipe by id", async () => {
    const recipes = await adminCaller.recipeManagement.list({});
    const firstRecipe = recipes[0];

    const result = await adminCaller.recipeManagement.getById({ id: firstRecipe.id });

    expect(result).toHaveProperty("id", firstRecipe.id);
    expect(result).toHaveProperty("recipeName");
    expect(result).toHaveProperty("lines");
    expect(Array.isArray(result.lines)).toBe(true);
  });

  it("should update recipe", async () => {
    const recipes = await adminCaller.recipeManagement.list({});
    const firstRecipe = recipes[0];

    const result = await adminCaller.recipeManagement.update({
      id: firstRecipe.id,
      recipeName: "수정된 레시피",
      version: "1.1"
    });

    expect(result).toHaveProperty("success", true);
  });

  it("should toggle recipe active status", async () => {
    const recipes = await adminCaller.recipeManagement.list({});
    const firstRecipe = recipes[0];

    const result = await adminCaller.recipeManagement.toggleActive({
      id: firstRecipe.id,
      isActive: false
    });

    expect(result).toHaveProperty("success", true);
  });

  it("should duplicate recipe", async () => {
    const recipes = await adminCaller.recipeManagement.list({});
    const firstRecipe = recipes[0];

    const result = await adminCaller.recipeManagement.duplicate({
      id: firstRecipe.id,
      newRecipeName: "복제된 레시피"
    });

    expect(result).toHaveProperty("id");
    expect(result).toHaveProperty("recipeName", "복제된 레시피");
  });

  it("should get recipe versions", async () => {
    const recipes = await adminCaller.recipeManagement.list({});
    const firstRecipe = recipes[0];

    const result = await adminCaller.recipeManagement.getVersions({ recipeId: firstRecipe.id });

    expect(Array.isArray(result)).toBe(true);
  });
});
