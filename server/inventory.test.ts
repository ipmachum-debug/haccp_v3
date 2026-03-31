import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";
import { createUser, getUserByEmail } from "./db";
import { hashPassword } from "./_core/jwtAuth";
import type { TrpcContext } from "./_core/context";

import { toKSTDate, todayKST } from "./utils/timezone";

describe("Inventory Management", () => {
  let userId: number;
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeAll(async () => {
    // 테스트 사용자 생성
    const testEmail = `inventory-test-${Date.now()}@test.com`;
    const passwordHash = await hashPassword("testpassword123");
    
    await createUser({
      email: testEmail,
      passwordHash,
      name: "Inventory Test User",
      role: "user",
      isActive: 1
    });

    const user = await getUserByEmail(testEmail);
    if (!user) throw new Error("Failed to create test user");
    userId = user.id;

    // tRPC caller 생성
    const ctx: TrpcContext = {
      user,
      req: {
        protocol: "https",
        headers: {}
      } as TrpcContext["req"],
      res: {} as TrpcContext["res"]
    };
    caller = appRouter.createCaller(ctx);
  });

  it("should create inventory lot (재고 입고)", async () => {
    // 1. 원재료 목록 조회
    const materials = await caller.material.list();
    expect(materials.length).toBeGreaterThan(0);
    const material = materials[0];

    // 2. 재고 입고
    const lotNumber = `LOT-TEST-${Date.now()}`;
    const result = await caller.inventory.createLot({
      materialId: material.id,
      lotNumber,
      quantity: "100.000",
      unit: "kg",
      expiryDate: toKSTDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)), // 30일 후
      receiptDate: todayKST()
    });

    expect(result.success).toBe(true);
    expect(result.message).toBe("재고가 입고되었습니다");
    expect(result.lotId).toBeDefined();
  });

  it("should list all inventory lots (재고 목록 조회)", async () => {
    const lots = await caller.inventory.list();
    expect(Array.isArray(lots)).toBe(true);
    
    if (lots.length > 0) {
      const lot = lots[0];
      expect(lot).toHaveProperty("id");
      expect(lot).toHaveProperty("lotNumber");
      expect(lot).toHaveProperty("materialId");
      expect(lot).toHaveProperty("quantity");
      expect(lot).toHaveProperty("availableQuantity");
      expect(lot).toHaveProperty("unit");
      expect(lot).toHaveProperty("status");
      expect(lot).toHaveProperty("materialName");
      expect(lot).toHaveProperty("materialCode");
    }
  });

  it("should get lots by material ID (원재료별 재고 조회)", async () => {
    // 1. 원재료 목록 조회
    const materials = await caller.material.list();
    expect(materials.length).toBeGreaterThan(0);
    const material = materials[0];

    // 2. 해당 원재료의 재고 LOT 조회
    const lots = await caller.inventory.getLotsByMaterialId({ materialId: material.id });
    expect(Array.isArray(lots)).toBe(true);
    
    // 3. FEFO 순서 확인 (유통기한 가까운 순)
    if (lots.length > 1) {
      for (let i = 0; i < lots.length - 1; i++) {
        const currentExpiry = lots[i].expiryDate ? new Date(lots[i].expiryDate).getTime() : Infinity;
        const nextExpiry = lots[i + 1].expiryDate ? new Date(lots[i + 1].expiryDate).getTime() : Infinity;
        expect(currentExpiry).toBeLessThanOrEqual(nextExpiry);
      }
    }
  });

  it("should reduce available quantity after material input (원재료 투입 후 재고 차감)", async () => {
    // 1. 원재료 및 배치 준비
    const materials = await caller.material.list();
    const material = materials[0];
    
    // 재고 LOT 생성
    const lotNumber = `LOT-INPUT-TEST-${Date.now()}`;
    const createResult = await caller.inventory.createLot({
      materialId: material.id,
      lotNumber,
      quantity: "50.000",
      unit: "kg"
    });
    expect(createResult.success).toBe(true);

    // 배치 생성 (간단한 테스트용)
    const batches = await caller.batch.list();
    if (batches.length === 0) {
      throw new Error("No batches available for testing");
    }
    const batch = batches[0];

    // 2. 재고 투입 전 가용 수량 확인
    const lotsBeforeInput = await caller.inventory.getLotsByMaterialId({ materialId: material.id });
    const lotBeforeInput = lotsBeforeInput.find((l: any) => l.lotNumber === lotNumber);
    expect(lotBeforeInput).toBeDefined();
    const availableBeforeInput = parseFloat(lotBeforeInput!.availableQuantity);

    // 3. 원재료 투입
    const inputQuantity = "10.000";
    await caller.inventory.addMaterialInput({
      batchId: batch.id,
      materialId: material.id,
      lotId: lotBeforeInput!.id,
      quantity: inputQuantity,
      unit: "kg"
    });

    // 4. 재고 투입 후 가용 수량 확인
    const lotsAfterInput = await caller.inventory.getLotsByMaterialId({ materialId: material.id });
    const lotAfterInput = lotsAfterInput.find((l: any) => l.lotNumber === lotNumber);
    expect(lotAfterInput).toBeDefined();
    const availableAfterInput = parseFloat(lotAfterInput!.availableQuantity);

    // 5. 가용 수량이 투입 수량만큼 감소했는지 확인
    expect(availableAfterInput).toBe(availableBeforeInput - parseFloat(inputQuantity));
  });
});
