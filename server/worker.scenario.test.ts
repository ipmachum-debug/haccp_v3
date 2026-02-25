import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

/**
 * Worker 계정 시나리오 테스트
 * 
 * 테스트 시나리오:
 * 1. Worker 역할 계정 생성
 * 2. CCP 점검 기록 작성 권한 테스트
 * 3. 원재료 투입 권한 테스트
 * 4. 배치 완료 권한 테스트 (권한 없음 확인)
 */

describe("Worker 계정 시나리오 테스트", () => {
  let workerContext: TrpcContext;
  let testBatchId: number;
  let testCcpInstanceId: number;

  beforeAll(async () => {
    // Worker 역할 계정 컨텍스트 생성
    workerContext = {
      user: {
        id: 2,
        email: "worker@test.com",
        passwordHash: "$2b$10$dummyhashfortest",
        name: "테스트 작업자",
        role: "worker", // Worker 역할
        siteId: null,
        isActive: 1
        lastLoginAt: null
      }
    } as TrpcContext;

    // 테스트용 배치 ID (실제 존재하는 배치 사용)
    testBatchId = 240004; // 진행 중인 배치
    testCcpInstanceId = 4; // 해당 배치의 CCP 인스턴스
  });

  it("1. Worker 역할 계정 생성 확인", () => {
    expect(workerContext.user).toBeDefined();
    expect(workerContext.user?.role).toBe("worker");
    expect(workerContext.user?.name).toBe("테스트 작업자");
  });

  it("2. CCP 점검 기록 작성 권한 테스트", async () => {
    const caller = appRouter.createCaller(workerContext);

    try {
      // CCP 점검 기록 작성 시도
      const result = await caller.ccp.createRecord({
        instanceId: testCcpInstanceId,
        measuredValue: "75",
        result: "pass",
        notes: "Worker 계정 테스트 - CCP 점검 기록"
      });

      expect(result).toBeDefined();
      console.log("✅ Worker 계정 CCP 점검 기록 작성 성공:", result);
    } catch (error: any) {
      console.error("❌ Worker 계정 CCP 점검 기록 작성 실패:", error.message);
      
      // workerProcedure가 적용되어 있으면 성공해야 함
      // 만약 실패한다면 권한 설정 확인 필요
      throw error;
    }
  });

  it("3. 원재료 투입 권한 테스트", async () => {
    const caller = appRouter.createCaller(workerContext);

    try {
      // 원재료 투입 시도
      const result = await caller.inventory.addMaterialInput({
        batchId: testBatchId,
        materialId: 1,
        lotId: 1,
        quantity: "10",
        unit: "kg"
      });

      expect(result).toBeDefined();
      console.log("✅ Worker 계정 원재료 투입 성공:", result);
    } catch (error: any) {
      console.error("❌ Worker 계정 원재료 투입 실패:", error.message);
      
      // workerProcedure가 적용되어 있으면 성공해야 함
      throw error;
    }
  });

  it("4. 배치 완료 권한 테스트 (권한 없음 확인)", async () => {
    const caller = appRouter.createCaller(workerContext);

    try {
      // 배치 완료 시도 (실패해야 함)
      await caller.batch.complete({
        batchId: testBatchId,
        actualQuantity: 100,
        defectQuantity: 5,
        revenue: 1000000,
        completionNotes: "Worker 계정 테스트 - 배치 완료 시도",
        idempotencyKey: `worker-test-${Date.now()}`
      });

      // 여기까지 오면 안 됨 (권한이 없어야 함)
      throw new Error("Worker 계정이 배치 완료 권한을 가지고 있습니다!");
    } catch (error: any) {
      // FORBIDDEN 에러가 발생해야 정상
      if (error.code === "FORBIDDEN" || error.message.includes("권한")) {
        console.log("✅ Worker 계정 배치 완료 권한 차단 확인:", error.message);
        expect(error.code).toBe("FORBIDDEN");
      } else {
        console.error("❌ 예상치 못한 에러:", error.message);
        throw error;
      }
    }
  });

  it("5. 전체 워크플로우 시나리오 테스트", async () => {
    const caller = appRouter.createCaller(workerContext);

    console.log("\n=== Worker 계정 전체 워크플로우 시나리오 테스트 ===\n");

    // 1. 배치 조회
    console.log("1. 배치 조회...");
    const batch = await caller.batch.getById({ id: testBatchId });
    expect(batch).toBeDefined();
    console.log(`✅ 배치 조회 성공: ${batch.batchCode}`);

    // 2. CCP 점검 기록 작성
    console.log("\n2. CCP 점검 기록 작성...");
    const ccpRecord = await caller.ccp.createRecord({
      instanceId: testCcpInstanceId,
      measuredValue: "75",
      result: "pass",
      notes: "Worker 워크플로우 테스트 - CCP 점검"
    });
    expect(ccpRecord).toBeDefined();
    console.log("✅ CCP 점검 기록 작성 성공");

    // 3. 원재료 투입
    console.log("\n3. 원재료 투입...");
    const materialInput = await caller.inventory.addMaterialInput({
      batchId: testBatchId,
      materialId: 1,
      lotId: 1,
      quantity: "5",
      unit: "kg"
    });
    expect(materialInput).toBeDefined();
    console.log("✅ 원재료 투입 성공");

    // 4. 배치 완료 시도 (실패 확인)
    console.log("\n4. 배치 완료 시도 (권한 없음 확인)...");
    try {
      await caller.batch.complete({
        batchId: testBatchId,
        actualQuantity: 100,
        defectQuantity: 5,
        revenue: 1000000,
        completionNotes: "Worker 워크플로우 테스트 - 배치 완료 시도",
        idempotencyKey: `worker-workflow-test-${Date.now()}`
      });
      throw new Error("Worker 계정이 배치 완료 권한을 가지고 있습니다!");
    } catch (error: any) {
      if (error.code === "FORBIDDEN" || error.message.includes("권한")) {
        console.log("✅ 배치 완료 권한 차단 확인");
      } else {
        throw error;
      }
    }

    console.log("\n=== Worker 계정 전체 워크플로우 시나리오 테스트 완료 ===\n");
  });
});
