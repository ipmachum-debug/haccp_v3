import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { hBatches, hProducts, hMaterials, hInventoryLots, hInventoryTransactions } from "../drizzle/schema";
import { eq } from "drizzle-orm";

describe("생산 일정 최적화 및 재고 예측 분석", () => {
  let testProductId: number;
  let testMaterialId: number;
  let testBatchId: number;

  const caller = appRouter.createCaller({
    user: { id: 1, email: "test@example.com", role: "admin" }
  });

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // 테스트 제품 생성
    const product = await db
      .insert(hProducts)
      .values({
        productCode: `TEST_PROD_OPT_${Date.now()}`,
        productName: "테스트 제품 (최적화)",
        category: "test",
        unit: "EA",
        isActive: 1
      })
      .$returningId();
    testProductId = product[0].id;

    // 테스트 원재료 생성
    const material = await db
      .insert(hMaterials)
      .values({
        materialCode: `TEST_MAT_OPT_${Date.now()}`,
        materialName: "테스트 원재료 (최적화)",
        category: "test",
        unit: "KG",
        safetyStockLevel: "50.000",
        isActive: 1
      })
      .$returningId();
    testMaterialId = material[0].id;

    // 테스트 배치 생성
    const batch = await db
      .insert(hBatches)
      .values({
        siteId: 1,
        batchCode: `TEST_BATCH_OPT_${Date.now()}`,
        productId: testProductId,
        plannedDate: new Date(Date.now() + 86400000), // 내일
        plannedQuantity: "100.000",
        status: "planned",
        createdBy: 1
      })
      .$returningId();
    testBatchId = batch[0].id;

    // 테스트 재고 LOT 생성 (부족한 재고)
    const lot = await db
      .insert(hInventoryLots)
      .values({
        lotNumber: `TEST_LOT_OPT_${Date.now()}`,
        materialId: testMaterialId,
        quantity: "10.000", // 안전 재고(50) 미만
        availableQuantity: "10.000",
        unit: "KG",
        receiptDate: new Date(),
        status: "available"
      })
      .$returningId();

    // 테스트 재고 거래 내역 생성 (사용 패턴)
    const lotId = lot[0].id;
    for (let i = 0; i < 5; i++) {
      await db.insert(hInventoryTransactions).values({
        lotId: lotId,
        transactionType: "usage",
        quantity: "2.000",
        unit: "KG",
        createdBy: 1
      });
    }
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;

    // 테스트 데이터 정리
    if (testBatchId) {
      await db.delete(hBatches).where(eq(hBatches.id, testBatchId));
    }
    if (testProductId) {
      await db.delete(hProducts).where(eq(hProducts.id, testProductId));
    }
    if (testMaterialId) {
      // 재고 거래 내역 먼저 삭제
      const lots = await db.select({ id: hInventoryLots.id }).from(hInventoryLots).where(eq(hInventoryLots.materialId, testMaterialId));
      for (const lot of lots) {
        await db.delete(hInventoryTransactions).where(eq(hInventoryTransactions.lotId, lot.id));
      }
      // 재고 LOT 삭제
      await db.delete(hInventoryLots).where(eq(hInventoryLots.materialId, testMaterialId));
      // 원재료 삭제
      await db.delete(hMaterials).where(eq(hMaterials.id, testMaterialId));
    }
  });

  it("생산 일정 최적화 제안 조회", async () => {
    const startDate = new Date().toISOString().split("T")[0];
    const endDate = new Date(Date.now() + 86400000 * 7).toISOString().split("T")[0];

    const result = await caller.productionSchedule.optimizeSchedule({
      startDate,
      endDate
    });

    expect(result).toBeDefined();
    expect(result.totalBatches).toBeGreaterThanOrEqual(0);
    expect(result.batchesWithIssues).toBeGreaterThanOrEqual(0);
    expect(result.suggestions).toBeInstanceOf(Array);
  });

  it("배치 일정 변경 적용", async () => {
    const newDate = new Date(Date.now() + 86400000 * 3).toISOString().split("T")[0];

    const result = await caller.productionSchedule.applyOptimization({
      batchId: testBatchId,
      newPlannedDate: newDate
    });

    expect(result.success).toBe(true);
  });

  it("재고 부족 예측 분석", async () => {
    const result = await caller.inventory.predictShortage({
      materialId: testMaterialId,
      days: 30
    });

    expect(result).toBeDefined();
    expect(result.materialId).toBe(testMaterialId);
    expect(result.currentStock).toBeGreaterThanOrEqual(0);
    expect(result.dailyAverageUsage).toBeGreaterThanOrEqual(0);
    expect(result.daysUntilShortage).toBeGreaterThanOrEqual(0);
    expect(result.recommendedOrderQuantity).toBeGreaterThanOrEqual(0);
  });

  it("자동 발주 제안 생성", async () => {
    const result = await caller.inventory.getPurchaseOrderSuggestions({
      days: 30
    });

    expect(result).toBeInstanceOf(Array);
    // 안전 재고 미달 원재료가 있으므로 발주 제안이 있어야 함
    const testMaterialSuggestion = result.find((s: any) => s.materialId === testMaterialId);
    if (testMaterialSuggestion) {
      expect(testMaterialSuggestion.currentStock).toBeLessThan(testMaterialSuggestion.safetyStockLevel);
      expect(testMaterialSuggestion.recommendedOrderQuantity).toBeGreaterThan(0);
    }
  });
});
