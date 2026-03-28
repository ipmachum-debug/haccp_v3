/**
 * 배치 관리 통합 테스트
 * 
 * 배치 수정, 원재료 투입 수정/삭제, CCP 일괄 삭제 기능 테스트
 */

import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/trpc";
import { getDb } from "./db";
import { users } from "../drizzle/schema";

describe("Batch Management Integration Tests", () => {
  let adminCaller: ReturnType<typeof appRouter.createCaller>;
  let workerCaller: ReturnType<typeof appRouter.createCaller>;
  let testProductId: number;
  let testMaterialId: number;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DB 연결 실패");

    const timestamp = Date.now();
    
    // 테스트용 원재료 생성
    const { hMaterials } = await import("../drizzle/schema");
    const [material] = await db
      .insert(hMaterials)
      .values({
        materialCode: `MAT-TEST-${timestamp}`,
        materialName: "Test Material",
        category: "raw",
        unit: "kg",
        safetyStock: "10.000",
        reorderPoint: "5.000"
      })
      .$returningId();
    testMaterialId = material.id;
    
    // 테스트용 제품 생성
    const { hProducts } = await import("../drizzle/schema");
    const [product] = await db
      .insert(hProducts)
      .values({
        productCode: `PROD-TEST-${timestamp}`,
        productName: "Test Product",
        category: "finished",
        unit: "kg"
      })
      .$returningId();
    testProductId = product.id;
    
    // 테스트용 레시피 생성 (CCP 자동 생성을 위해 필요)
    const { hRecipeHeaders } = await import("../drizzle/schema");
    const [recipe] = await db
      .insert(hRecipeHeaders)
      .values({
        recipeCode: `RECIPE-TEST-${timestamp}`,
        productId: testProductId,
        recipeName: "Test Recipe",
        version: "1.0",
        isActive: true
      })
      .$returningId();

    // Admin 사용자 생성
    const [admin] = await db
      .insert(users)
      .values({
        email: `admin-batch-mgmt-${timestamp}@test.com`,
        name: "Admin Batch Management",
        passwordHash: "test",
        role: "admin",
        isActive: true
      })
      .$returningId();

    // Worker 사용자 생성
    const [worker] = await db
      .insert(users)
      .values({
        email: `worker-batch-mgmt-${timestamp}@test.com`,
        name: "Worker Batch Management",
        passwordHash: "test",
        role: "worker",
        isActive: true
      })
      .$returningId();

    // Caller 생성
    const createMockContext = (userId: number, email: string, role: string): TrpcContext => ({
      user: {
        id: userId,
        openId: `test-${userId}`,
        email,
        name: email.split("@")[0],
        loginMethod: "manus" as const,
        role: role as any
        lastSignedIn: new Date()
      },
      req: {} as any,
      res: {} as any
    });

    adminCaller = appRouter.createCaller(createMockContext(admin.id, `admin-batch-mgmt-${timestamp}@test.com`, "admin"));
    workerCaller = appRouter.createCaller(createMockContext(worker.id, `worker-batch-mgmt-${timestamp}@test.com`, "worker"));
  });

  describe("배치 수정 (batch.update)", () => {
    it("배치 정보를 수정할 수 있어야 함", async () => {
      const timestamp = Date.now();
      // 1. 배치 생성
      const batch = await workerCaller.batch.create({
        siteId: 1,
        productId: testProductId,
        batchNumber: `TEST-BATCH-UPDATE-${timestamp}`,
        plannedQuantity: 100,
        plannedStartDate: new Date()
      });

      expect(batch.success).toBe(true);
      expect(batch.batchId).toBeDefined();

      // 2. 배치 수정
      const updateResult = await workerCaller.batch.update({
        id: batch.batchId!,
        batchNumber: `TEST-BATCH-UPDATE-${timestamp}-MODIFIED`,
        plannedQuantity: 150
      });

      expect(updateResult.success).toBe(true);

      // 3. 수정된 배치 조회
      const updatedBatch = await workerCaller.batch.getById({ id: batch.batchId! });
      expect(updatedBatch.batchNumber).toBe(`TEST-BATCH-UPDATE-${timestamp}-MODIFIED`);
      expect(updatedBatch.plannedQuantity).toBe(150);
    });
  });

  describe("원재료 투입 삭제 (inventory.deleteMaterialInput)", () => {
    it("원재료 투입 내역을 삭제하면 재고가 복구되어야 함", async () => {
      const timestamp = Date.now();
      // 1. 배치 생성
      const batch = await workerCaller.batch.create({
        siteId: 1,
        productId: testProductId,
        batchNumber: `TEST-BATCH-INPUT-DELETE-${timestamp}`,
        plannedQuantity: 100,
        plannedStartDate: new Date()
      });

      // 2. 재고 LOT 생성
      const lot = await workerCaller.inventory.createLot({
        materialId: testMaterialId,
        lotNumber: `LOT-DELETE-TEST-${timestamp}`,
        quantity: "100.000",
        unit: "kg"
      });

      expect(lot.success).toBe(true);

      // 3. 원재료 투입
      const inputResult = await workerCaller.inventory.addMaterialInput({
        batchId: batch.batchId!,
        materialId: testMaterialId,
        lotId: lot.lotId!,
        quantity: "50.000",
        unit: "kg"
      });

      expect(inputResult.success).toBe(true);

      // 4. 투입 내역 조회
      const inputs = await workerCaller.inventory.getBatchInputs({ batchId: batch.batchId! });
      expect(inputs.length).toBeGreaterThan(0);
      const inputId = inputs[0].id;

      // 5. 재고 확인 (투입 후)
      const lotsAfterInput = await workerCaller.inventory.getLotsByMaterialId({ materialId: testMaterialId });
      const lotAfterInput = lotsAfterInput.find((l: any) => l.id === lot.lotId);
      expect(parseFloat(lotAfterInput.availableQuantity)).toBe(50); // 100 - 50 = 50

      // 6. 투입 내역 삭제
      const deleteResult = await workerCaller.inventory.deleteMaterialInput({ inputId });
      expect(deleteResult.success).toBe(true);

      // 7. 재고 확인 (삭제 후 - 재고 복구됨)
      const lotsAfterDelete = await workerCaller.inventory.getLotsByMaterialId({ materialId: testMaterialId });
      const lotAfterDelete = lotsAfterDelete.find((l: any) => l.id === lot.lotId);
      expect(parseFloat(lotAfterDelete.availableQuantity)).toBe(100); // 50 + 50 = 100 (복구됨)
    });
  });

  describe("CCP 일괄 삭제 (ccp.bulkDelete)", () => {
    it("여러 CCP를 한번에 삭제할 수 있어야 함", async () => {
      const timestamp = Date.now();
      // 1. 배치 생성
      const batch = await workerCaller.batch.create({
        siteId: 1,
        productId: testProductId,
        batchNumber: `TEST-BATCH-CCP-BULK-DELETE-${timestamp}`,
        plannedQuantity: 100,
        plannedStartDate: new Date()
      });

      // 2. CCP 자동 생성
      const ccpResult = await workerCaller.batch.generateCcp({
        batchId: batch.batchId!
      });

      expect(ccpResult.success).toBe(true);
      expect(ccpResult.ccps.length).toBeGreaterThan(0);

      // 3. 생성된 CCP 조회
      const ccps = await workerCaller.ccp.getByBatchId({ batchId: batch.batchId! });
      expect(ccps.length).toBeGreaterThan(0);

      // 4. 모든 CCP ID 수집
      const ccpIds = ccps.map((ccp: any) => ccp.id);

      // 5. CCP 일괄 삭제
      const deleteResult = await workerCaller.ccp.bulkDelete({ instanceIds: ccpIds });
      expect(deleteResult.success).toBe(true);
      expect(deleteResult.deletedCount).toBe(ccpIds.length);

      // 6. 삭제 확인
      const ccpsAfterDelete = await workerCaller.ccp.getByBatchId({ batchId: batch.batchId! });
      expect(ccpsAfterDelete.length).toBe(0);
    });
  });
});
