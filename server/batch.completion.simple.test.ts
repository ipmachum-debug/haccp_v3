/**
 * 배치 완료 플로우 간소화 통합 테스트
 * 시나리오: 배치 생성 → 원재료 투입 → 완료
 */

import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { Context } from "./_core/context";

import { todayKST } from "./utils/timezone";

// 테스트용 컨텍스트 생성 (admin 권한)
const createTestContext = (): Context => ({
  user: {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "테스트 사용자",
    role: "admin" as const
  }
});

describe("배치 완료 플로우 간소화 통합 테스트", () => {
  let testBatchId: number;
  let testMaterialId: number;
  let testLotId: number;
  let testProductId: number;
  const testSiteId = 1;

  const ctx = createTestContext();
  const caller = appRouter.createCaller(ctx);

  beforeAll(async () => {
    // 제품 생성
    const product = await caller.product.create({
      productName: `테스트 제품 ${Date.now()}`,
      productCode: `TEST-PROD-${Date.now()}`,
      category: "식품",
      unit: "kg",
      shelfLifeMonths: 1
    });
    testProductId = product.id;

    // 원재료 생성
    const material = await caller.material.create({
      materialName: `테스트 원재료 ${Date.now()}`,
      materialCode: `TEST-MAT-${Date.now()}`,
      category: "원료",
      unit: "kg",
      safetyStock: 10
    });
    testMaterialId = material.id;

    // 재고 LOT 생성
    const lot = await caller.inventory.createLot({
      materialId: testMaterialId,
      lotNumber: `TEST-LOT-${Date.now()}`,
      quantity: "1000",
      unit: "kg",
      productionDate: todayKST(),
      supplierName: "테스트 공급업체"
    });
    testLotId = lot.id;
  });

  it("배치 생성 → 원재료 투입 → 완료 시나리오", async () => {
    console.log("\n=== 배치 완료 플로우 통합 테스트 시작 ===\n");

    // 1. 배치 생성
    const batch = await caller.batch.create({
      siteId: testSiteId,
      productId: testProductId,
      batchNumber: `TEST-BATCH-${Date.now()}`,
      plannedQuantity: 100,
      plannedStartDate: new Date(),
      mode: "auto" as const
    });
    testBatchId = batch.batchId;

    expect(testBatchId).toBeDefined();
    console.log(`✅ 1. 배치 생성 완료: ID ${testBatchId}`);

    // 2. 배치 상태를 "진행 중"으로 변경
    await caller.batch.updateStatus({
      id: testBatchId,
      status: "in_progress"
    });

    const batchInProgress = await caller.batch.getById({ id: testBatchId });
    expect(batchInProgress.status).toBe("in_progress");
    console.log(`✅ 2. 배치 상태 변경: in_progress`);

    // 3. 원재료 투입
    const inputResult = await caller.inventory.addMaterialInput({
      batchId: testBatchId,
      materialId: testMaterialId,
      lotId: testLotId,
      quantity: 50,
      unit: "kg"
    });

    expect(inputResult.success).toBe(true);
    console.log(`✅ 3. 원재료 투입 완료: 50kg`);

    // 4. 배치 완료 전 체크리스트 확인
    const checklist = await caller.batch.checkCompletionReadiness({
      batchId: testBatchId
    });

    expect(checklist.checks.hasMaterialInputs.passed).toBe(true);
    expect(checklist.canComplete).toBe(true);
    console.log(`✅ 4. 완료 전 체크리스트 확인 완료`);
    console.log(`   - ${checklist.checks.hasMaterialInputs.message}`);
    console.log(`   - ${checklist.checks.ccpCompleted.message}`);

    // 5. 배치 완료
    const completionResult = await caller.batch.complete({
      batchId: testBatchId,
      actualQuantity: 95,
      defectQuantity: 5,
      revenue: 1000000,
      completionNotes: "테스트 완료"
    });

    expect(completionResult.success).toBe(true);
    console.log(`✅ 5. 배치 완료 처리 완료`);
    console.log(`   - 실제 생산량: 95`);
    console.log(`   - 불량 수량: 5`);
    console.log(`   - 매출액: 1,000,000`);

    // 6. 완료된 배치 상태 확인
    const completedBatch = await caller.batch.getById({ id: testBatchId });
    expect(completedBatch.status).toBe("completed");
    expect(completedBatch.actualQuantity).toBe("95.00");
    expect(completedBatch.endTime).toBeDefined();
    console.log(`✅ 6. 완료된 배치 상태 확인 완료`);

    // 7. 재고 차감 확인
    const lot = await caller.inventory.getLotById({ id: testLotId });
    expect(parseFloat(lot.quantity)).toBeLessThan(1000);
    console.log(`✅ 7. 재고 차감 확인 완료: ${lot.quantity}kg (초기: 1000kg)`);

    console.log(`\n🎉 배치 완료 플로우 통합 테스트 성공!\n`);
  }, 60000); // 60초 타임아웃
});
