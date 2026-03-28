import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb, predictAllInventoryShortage, generatePurchaseOrderSuggestions, getBatchCostAnalysis, getProductionTimeAnalysis, getDefectRateAnalysis } from "./db";
import { hMaterials, hInventoryLots, hInventoryTransactions, hBatches, hProducts } from "../drizzle/schema_main";
import { eq } from "drizzle-orm";

import { toKSTDate, todayKST } from "./utils/timezone";

describe("Phase 119-121: 재고 예측, LLM 최적화, 생산 효율성 대시보드", () => {
  let testMaterialId: number;
  let testProductId: number;
  let testBatchId: number;
  let testLotId: number;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DB 연결 실패");

    // 테스트 원재료 생성
    const material = await db.insert(hMaterials).values({
      materialCode: `TEST-MAT-${Date.now()}`,
      materialName: "테스트 원재료",
      category: "원재료",
      unit: "kg",
      safetyStockLevel: 100,
      siteId: 1
    });
    testMaterialId = Number(material[0].insertId);

    // 테스트 제품 생성
    const product = await db.insert(hProducts).values({
      productCode: `TEST-PROD-${Date.now()}`,
      productName: "테스트 제품",
      category: "완제품",
      unit: "EA",
      siteId: 1
    });
    testProductId = Number(product[0].insertId);

    // 테스트 LOT 생성
    const lot = await db.insert(hInventoryLots).values({
      lotNumber: `LOT-${Date.now()}`,
      materialId: testMaterialId,
      quantity: 1000,
      availableQuantity: 1000,
      unit: "kg",
      receiptDate: new Date(),
      expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30일 후
      status: "available"
    });
    testLotId = Number(lot[0].insertId);

    // 테스트 배치 생성
    const batch = await db.insert(hBatches).values({
      batchCode: `BATCH-${Date.now()}`,
      productId: testProductId,
      plannedQuantity: 100,
      actualQuantity: 95,
      plannedDate: new Date(),
      startTime: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2시간 전
      endTime: new Date(),
      status: "completed",
      siteId: 1,
      createdBy: 1
    });
    testBatchId = Number(batch[0].insertId);

    // 테스트 재고 거래 내역 생성 (배치에 사용된 원재료)
    await db.insert(hInventoryTransactions).values({
      lotId: testLotId,
      transactionType: "usage",
      quantity: -50,
      unit: "kg",
      referenceType: "batch",
      referenceId: testBatchId,
      createdBy: 1
    });
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;

    // 테스트 데이터 정리
    await db.delete(hInventoryTransactions).where(eq(hInventoryTransactions.lotId, testLotId));
    await db.delete(hInventoryLots).where(eq(hInventoryLots.id, testLotId));
    await db.delete(hBatches).where(eq(hBatches.id, testBatchId));
    await db.delete(hProducts).where(eq(hProducts.id, testProductId));
    await db.delete(hMaterials).where(eq(hMaterials.id, testMaterialId));
  });

  it("재고 부족 예측 (predictAllShortage)", async () => {
    const result = await predictAllInventoryShortage(30);
    
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    // 예측 결과가 있을 경우 구조 검증
    if (result.length > 0) {
      expect(result[0]).toHaveProperty("materialId");
      expect(result[0]).toHaveProperty("materialName");
      expect(result[0]).toHaveProperty("currentStock");
      expect(result[0]).toHaveProperty("dailyAverageUsage");
      expect(result[0]).toHaveProperty("daysUntilShortage");
    }
  });

  it("자동 발주 제안 생성 (getPurchaseOrderSuggestions)", async () => {
    const result = await generatePurchaseOrderSuggestions(30);
    
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    // 발주 제안이 있을 경우 구조 검증
    if (result.length > 0) {
      expect(result[0]).toHaveProperty("materialId");
      expect(result[0]).toHaveProperty("materialName");
      expect(result[0]).toHaveProperty("recommendedOrderQuantity");
      expect(result[0]).toHaveProperty("priority");
    }
  });

  it("배치별 원가 분석 (getCostAnalysis)", async () => {
    const startDate = toKSTDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
    const endDate = todayKST();
    
    const result = await getBatchCostAnalysis({ startDate, endDate });
    
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    // 원가 분석 결과가 있을 경우 구조 검증
    if (result.length > 0) {
      expect(result[0]).toHaveProperty("batchCode");
      expect(result[0]).toHaveProperty("materialCost");
      expect(result[0]).toHaveProperty("unitCost");
      expect(result[0]).toHaveProperty("productionTime");
    }
  });

  it("생산 시간 추이 분석 (getProductionTimeAnalysis)", async () => {
    const startDate = toKSTDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
    const endDate = todayKST();
    
    const result = await getProductionTimeAnalysis({ startDate, endDate });
    
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    // 생산 시간 추이 결과가 있을 경우 구조 검증
    if (result.length > 0) {
      expect(result[0]).toHaveProperty("date");
      expect(result[0]).toHaveProperty("avgProductionTime");
      expect(result[0]).toHaveProperty("totalBatches");
    }
  });

  it("불량률 분석 (getDefectRateAnalysis)", async () => {
    const startDate = toKSTDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
    const endDate = todayKST();
    
    const result = await getDefectRateAnalysis({ startDate, endDate });
    
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    // 불량률 분석 결과가 있을 경우 구조 검증
    if (result.length > 0) {
      expect(result[0]).toHaveProperty("productName");
      expect(result[0]).toHaveProperty("totalPlanned");
      expect(result[0]).toHaveProperty("totalActual");
      expect(result[0]).toHaveProperty("defectRate");
    }
  });
});
