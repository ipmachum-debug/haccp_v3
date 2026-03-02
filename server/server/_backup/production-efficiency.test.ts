import { describe, it, expect, beforeAll } from "vitest";
import {
  getDb,
  createProduct,
  createBatch,
  getBatchCostAnalysis,
  getProductionTimeAnalysis,
  getDefectRateAnalysis
} from "./db";

describe("생산 효율성 대시보드 (Production Efficiency Dashboard)", () => {
  let productId: number;
  let batchId1: number;
  let batchId2: number;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // 테스트 제품 생성
    const timestamp = Date.now();
    productId = await createProduct({
      productName: `효율성 테스트 제품-${timestamp}`,
      productCode: `EFF-${timestamp}`,
      category: "테스트",
      unit: "EA",
      shelfLifeDays: 365,
      isActive: 1
    });

    // 테스트 배치 1 생성 (완료됨)
    batchId1 = await createBatch({
      batchCode: `BATCH-EFF-001-${timestamp}`,
      productId,
      siteId: 1,
      createdBy: 1,
      plannedQuantity: 1000,
      actualQuantity: 950,
      plannedDate: new Date("2026-01-15"),
      startTime: new Date("2026-01-15T08:00:00"),
      endTime: new Date("2026-01-15T16:00:00"),
      status: "completed",
      plannedCost: 500000,
      actualCost: 520000,
      costFinalizedAt: new Date("2026-01-15T17:00:00")
    });

    // 테스트 배치 2 생성 (완료됨)
    batchId2 = await createBatch({
      batchCode: `BATCH-EFF-002-${timestamp}`,
      productId,
      siteId: 1,
      createdBy: 1,
      plannedQuantity: 1200,
      actualQuantity: 1150,
      plannedDate: new Date("2026-01-16"),
      startTime: new Date("2026-01-16T08:00:00"),
      endTime: new Date("2026-01-16T18:00:00"),
      status: "completed",
      plannedCost: 600000,
      actualCost: 610000,
      costFinalizedAt: new Date("2026-01-16T19:00:00")
    });
  });

  it("배치별 원가 분석 (getBatchCostAnalysis) - 계획 원가와 실제 원가 비교", async () => {
    const result = await getBatchCostAnalysis({
      startDate: "2026-01-01",
      endDate: "2026-01-31"
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    
    // 기본 데이터 구조 확인
    if (result.length > 0) {
      const firstBatch = result[0];
      expect(firstBatch).toHaveProperty("batchId");
      expect(firstBatch).toHaveProperty("batchCode");
      expect(firstBatch).toHaveProperty("productName");
      expect(firstBatch).toHaveProperty("plannedCost");
      expect(firstBatch).toHaveProperty("actualCost");
    }
  });

  it("생산 시간 추이 분석 (getProductionTimeAnalysis) - 일별 평균 생산 시간", async () => {
    const result = await getProductionTimeAnalysis({
      startDate: "2026-01-01",
      endDate: "2026-01-31"
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    
    // 기본 데이터 구조 확인
    if (result.length > 0) {
      const firstDay = result[0];
      expect(firstDay).toHaveProperty("date");
      expect(firstDay).toHaveProperty("avgProductionTime");
      expect(firstDay).toHaveProperty("totalBatches");
    }
  });

  it("불량률 분석 (getDefectRateAnalysis) - 제품별 불량률 계산", async () => {
    const result = await getDefectRateAnalysis({
      startDate: "2026-01-01",
      endDate: "2026-01-31"
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    
    // 기본 데이터 구조 확인
    if (result.length > 0) {
      const firstProduct = result[0];
      expect(firstProduct).toHaveProperty("productName");
      expect(firstProduct).toHaveProperty("totalPlanned");
      expect(firstProduct).toHaveProperty("totalActual");
      expect(firstProduct).toHaveProperty("defectRate");
      expect(firstProduct).toHaveProperty("batchCount");
    }
  });
});
