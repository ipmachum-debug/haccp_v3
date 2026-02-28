import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { receiveMaterial, getLotsByMaterialFefo, getInventoryTransactions } from "./db";
import { getDb } from "./db";
import { hMaterials, hInventoryLots, hInventoryTransactions } from "../drizzle/schema";
import { eq, inArray } from "drizzle-orm";

describe("Material Receipt & LOT Management", () => {
  let testMaterialId: number;
  let testLotId: number;

  beforeAll(async () => {
    // 테스트용 원재료 생성
    const db = await getDb();
    if (!db) throw new Error("Database connection failed");

    const uniqueCode = `TEST-MAT-${Date.now()}`;
    const [material] = await db.insert(hMaterials).values({
      materialName: '테스트 원재료',
      materialCode: uniqueCode,
      category: '테스트',
      unit: 'kg',
      supplierId: 1,
      unitPrice: '1000'
    } as any);
    testMaterialId = material.insertId;
  });

  afterAll(async () => {
    // 테스트 데이터 정리
    const db = await getDb();
    if (!db) return;

    await db.delete(hInventoryTransactions).where(eq(hInventoryTransactions.lotId, testLotId));
    await db.delete(hInventoryLots).where(eq(hInventoryLots.materialId, testMaterialId));
    await db.delete(hMaterials).where(eq(hMaterials.id, testMaterialId));
  });

  it("원재료 입고 시 LOT 생성, 재고 업데이트, 거래 기록 생성", async () => {
    const result = await receiveMaterial({
      materialId: testMaterialId,
      quantity: 100,
      unit: "kg",
      receiptDate: "2026-01-23",
      expiryDate: "2026-12-31",
      location: "A-01"
    });

    expect(result).toBeDefined();
    expect(result.lotId).toBeGreaterThan(0);
    expect(result.lotNumber).toBeDefined();

    testLotId = result.lotId;

    // LOT 생성 확인
    const db = await getDb();
    if (!db) throw new Error("Database connection failed");

    const lots = await db.select().from(hInventoryLots).where(eq(hInventoryLots.id, testLotId));
    const lotData = lots[0];

    expect(lotData).toBeDefined();
    expect(lotData.materialId).toBe(testMaterialId);
    expect(lotData.quantity).toBe("100.000");
    expect(lotData.availableQuantity).toBe("100.000");
    expect(lotData.unit).toBe("kg");
    expect(lotData.status).toBe("available");

    // 거래 기록 생성 확인
    const transactions = await db.select().from(hInventoryTransactions).where(
      eq(hInventoryTransactions.lotId, testLotId)
    );
    const txData = transactions.find(tx => tx.transactionType === 'receipt');

    expect(txData).toBeDefined();
    expect(txData!.quantity).toBe("100.000");
    expect(txData!.unit).toBe("kg");
    expect(txData!.referenceType).toBe("material_receipt");
  });

  it("FEFO 순서로 LOT 조회 (유통기한 가까운 순)", async () => {
    // 추가 LOT 생성 (유통기한 다름)
    const result1 = await receiveMaterial({
      materialId: testMaterialId,
      quantity: 50,
      unit: "kg",
      receiptDate: "2026-01-23",
      expiryDate: "2026-06-30", // 더 빠른 유통기한
    });

    const result2 = await receiveMaterial({
      materialId: testMaterialId,
      quantity: 30,
      unit: "kg",
      receiptDate: "2026-01-23",
      expiryDate: "2027-12-31", // 더 늦은 유통기한
    });

    const lots = await getLotsByMaterialFefo({ materialId: testMaterialId });

    expect(lots.length).toBeGreaterThanOrEqual(3);

    // FEFO 순서 확인 (유통기한 가까운 순)
    for (let i = 0; i < lots.length - 1; i++) {
      const currentExpiry = lots[i].expiryDate ? new Date(lots[i].expiryDate!) : new Date(0);
      const nextExpiry = lots[i + 1].expiryDate ? new Date(lots[i + 1].expiryDate!) : new Date(0);
      expect(currentExpiry.getTime()).toBeLessThanOrEqual(nextExpiry.getTime());
    }

    // 테스트 데이터 정리
    const db = await getDb();
    if (db) {
      await db.delete(hInventoryTransactions).where(
        inArray(hInventoryTransactions.lotId, [result1.lotId, result2.lotId])
      );
      await db.delete(hInventoryLots).where(
        inArray(hInventoryLots.id, [result1.lotId, result2.lotId])
      );
    }
  });

  it("재고 거래 내역 조회", async () => {
    const transactions = await getInventoryTransactions({
      materialId: testMaterialId
    });

    expect(transactions.length).toBeGreaterThan(0);

    const receiptTx = transactions.find(
      (tx) => tx.lotId === testLotId && tx.transactionType === "receipt"
    );

    expect(receiptTx).toBeDefined();
    expect(receiptTx!.quantity).toBe("100.000");
    expect(receiptTx!.unit).toBe("kg");
  });

  it("LOT 번호 자동 생성", async () => {
    const result = await receiveMaterial({
      materialId: testMaterialId,
      quantity: 20,
      unit: "kg",
      receiptDate: "2026-01-23",
      // lotNumber 미제공 → 자동 생성
    });

    expect(result.lotNumber).toBeDefined();
    expect(result.lotNumber).toMatch(/^LOT-\d+-[A-Z0-9]+$/);

    // 테스트 데이터 정리
    const db = await getDb();
    if (db) {
      await db.delete(hInventoryTransactions).where(eq(hInventoryTransactions.lotId, result.lotId));
      await db.delete(hInventoryLots).where(eq(hInventoryLots.id, result.lotId));
    }
  });

  it("사용자 지정 LOT 번호 사용", async () => {
    const customLotNumber = `CUSTOM-LOT-${Date.now()}`;

    const result = await receiveMaterial({
      materialId: testMaterialId,
      quantity: 15,
      unit: "kg",
      receiptDate: "2026-01-23",
      lotNumber: customLotNumber
    });

    expect(result.lotNumber).toBe(customLotNumber);

    // 테스트 데이터 정리
    const db = await getDb();
    if (db) {
      await db.delete(hInventoryTransactions).where(eq(hInventoryTransactions.lotId, result.lotId));
      await db.delete(hInventoryLots).where(eq(hInventoryLots.id, result.lotId));
    }
  });
});
