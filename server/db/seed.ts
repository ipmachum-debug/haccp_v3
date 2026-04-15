/**
 * 데이터베이스 샘플 데이터 생성 스크립트
 * 테스트 및 데모 목적으로 사용
 */

import { getDb } from "../db.js";

export async function seedSampleData() {
  const db = await getDb();
  if (!db) {
    throw new Error("데이터베이스 연결 실패");
  }

  const {
    hProductsV2,
    hMaterials,
    hBatches,
    users
  } = await import("../../drizzle/schema.js");
  const { hashPassword } = await import("../_core/jwtAuth.js");

  // 1. 테스트 사용자 생성 (admin 권한)
  const { eq } = await import("drizzle-orm");
  const existingUser = await db.select().from(users).where(eq(users.email, "admin@haccp.com"));
  
  let adminUserId: number;
  if (existingUser.length === 0) {
    const passwordHash = await hashPassword("admin1234");
    const result = await db.insert(users).values({
      email: "admin@haccp.com",
      passwordHash,
      name: "관리자",
      role: "admin"
    });
    adminUserId = Number(result[0].insertId);
  } else {
    adminUserId = existingUser[0].id;
  }

  // 2. 샘플 제품 생성
  const products = [
    {
      productCode: "PROD-001",
      productName: "프리미엄 식빵",
      category: "완제품",
      description: "고급 밀가루로 만든 프리미엄 식빵",
      unit: "ea"
    },
    {
      productCode: "PROD-002",
      productName: "크로와상",
      category: "완제품",
      description: "버터가 풍부한 프랑스식 크로와상",
      unit: "ea"
    },
    {
      productCode: "PROD-003",
      productName: "베이글",
      category: "완제품",
      description: "쌍깃한 식감의 베이글",
      unit: "ea"
    },
  ];

  const insertedProducts = [];
  for (const product of products) {
    const existing = await db.select().from(hProductsV2).where(eq(hProductsV2.productCode, product.productCode));
    if (existing.length === 0) {
      const result = await db.insert(hProductsV2).values(product);
      const [inserted] = await db.select().from(hProductsV2).where(eq(hProductsV2.productCode, product.productCode));
      insertedProducts.push(inserted);
    } else {
      insertedProducts.push(existing[0]);
    }
  }

  // 3. 샘플 원재료 생성
  const materials = [
    {
      materialCode: "MAT-001",
      materialName: "밀가루",
      category: "원재료",
      unit: "kg",
      safetyStock: "100",
      expiryWarningDays: 7
    },
    {
      materialCode: "MAT-002",
      materialName: "설탕",
      category: "원재료",
      unit: "kg",
      safetyStock: "50",
      expiryWarningDays: 7
    },
    {
      materialCode: "MAT-003",
      materialName: "버터",
      category: "원재료",
      unit: "kg",
      safetyStock: "20",
      expiryWarningDays: 3
    },
    {
      materialCode: "MAT-004",
      materialName: "계란",
      category: "원재료",
      unit: "ea",
      safetyStock: "500",
      expiryWarningDays: 7
    },
    {
      materialCode: "MAT-005",
      materialName: "이스트",
      category: "원재료",
      unit: "g",
      safetyStock: "1000",
      expiryWarningDays: 7
    },
  ];

  const insertedMaterials = [];
  for (const material of materials) {
    const existing = await db.select().from(hMaterials).where(eq(hMaterials.materialCode, material.materialCode));
    if (existing.length === 0) {
      const result = await db.insert(hMaterials).values(material);
      const [inserted] = await db.select().from(hMaterials).where(eq(hMaterials.materialCode, material.materialCode));
      insertedMaterials.push(inserted);
    } else {
      insertedMaterials.push(existing[0]);
    }
  }

  // 4. 샘플 배치 생성
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const batches = [
    {
      siteId: 1,
      batchCode: `BATCH-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}-001`,
      productId: insertedProducts[0].id,
      plannedQuantity: "100",
      plannedDate: today,
      status: "planned" as const,
      createdBy: adminUserId
    },
    {
      siteId: 1,
      batchCode: `BATCH-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}-002`,
      productId: insertedProducts[1].id,
      plannedQuantity: "50",
      plannedDate: today,
      status: "in_progress" as const,
      startTime: new Date(),
      createdBy: adminUserId
    },
  ];

  const insertedBatches = [];
  for (const batch of batches) {
    const existing = await db.select().from(hBatches).where(eq(hBatches.batchCode, batch.batchCode));
    if (existing.length === 0) {
      const result = await db.insert(hBatches).values(batch);
      const [inserted] = await db.select().from(hBatches).where(eq(hBatches.batchCode, batch.batchCode));
      insertedBatches.push(inserted);
    } else {
      insertedBatches.push(existing[0]);
    }
  }

  return {
    success: true,
    message: "샘플 데이터 생성 완료",
    data: {
      users: 1,
      products: insertedProducts.length,
      materials: insertedMaterials.length,
      batches: insertedBatches.length
    }
  };
}
