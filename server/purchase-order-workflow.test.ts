import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "./db";
import { hMaterials, hInventoryLots, hInventoryTransactions } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { approvePurchaseOrderSuggestion, rejectPurchaseOrderSuggestion } from "./db";

describe("Phase 123: 발주 제안 승인/거부 워크플로우", () => {
  let testMaterialId: number;
  
  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database connection failed");
    
    // 테스트 원재료 생성
    const [material] = await db
      .insert(hMaterials)
      .values({
        materialCode: `TEST-PO-${Date.now()}`,
        materialName: "테스트 발주 원재료",
        category: "원료",
        unit: "kg",
        safetyStockLevel: "100.000",
        siteId: 1
      })
      .$returningId();
    
    testMaterialId = material.id;
  });
  
  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    
    // 테스트 데이터 정리
    await db.delete(hInventoryTransactions).where(eq(hInventoryTransactions.createdBy, 9999));
    await db.delete(hInventoryLots).where(eq(hInventoryLots.materialId, testMaterialId));
    await db.delete(hMaterials).where(eq(hMaterials.id, testMaterialId));
  });
  
  it("발주 제안 승인 시 LOT 생성 및 거래 내역 기록", async () => {
    const result = await approvePurchaseOrderSuggestion({
      materialId: testMaterialId,
      quantity: 500,
      approvedBy: 9999
    });
    
    expect(result.success).toBe(true);
    expect(result.lotId).toBeTypeOf("number");
    expect(result.message).toContain("승인");
    
    // LOT 생성 확인
    const db = await getDb();
    if (!db) throw new Error("Database connection failed");
    
    const [lot] = await db
      .select()
      .from(hInventoryLots)
      .where(eq(hInventoryLots.id, result.lotId));
    
    expect(lot).toBeDefined();
    expect(lot.materialId).toBe(testMaterialId);
    expect(parseFloat(lot.quantity)).toBe(500);
    expect(lot.lotNumber).toContain("PO-");
    
    // 거래 내역 확인
    const [transaction] = await db
      .select()
      .from(hInventoryTransactions)
      .where(eq(hInventoryTransactions.lotId, result.lotId));
    
    expect(transaction).toBeDefined();
    expect(transaction.transactionType).toBe("receipt");
    expect(parseFloat(transaction.quantity)).toBe(500);
    expect(transaction.createdBy).toBe(9999);
    expect(transaction.notes).toContain("발주 제안 승인");
  });
  
  it("발주 제안 거부 시 성공 메시지 반환", async () => {
    const result = await rejectPurchaseOrderSuggestion({
      materialId: testMaterialId,
      rejectedBy: 9999,
      reason: "재고 충분"
    });
    
    expect(result.success).toBe(true);
    expect(result.message).toContain("거부");
  });
  
  it("존재하지 않는 원재료 ID로 승인 시 오류 발생", async () => {
    await expect(
      approvePurchaseOrderSuggestion({
        materialId: 999999,
        quantity: 100,
        approvedBy: 9999
      })
    ).rejects.toThrow("원재료를 찾을 수 없습니다");
  });
});
