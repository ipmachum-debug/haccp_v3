import { describe, it, expect, beforeAll } from "vitest";
import { postPurchase } from "../purchasePost";
import { cancelPurchase } from "../purchaseCancel";
import { allocateLotsFEFO } from "../fefoLotAllocation";
import { db } from "../../db";
import { accountingPurchases } from "../../../drizzle/schema_accounting_extended";
import { hInventoryTransactions, hInventoryLots, hInventory } from "../../../drizzle/schema/part2";
import { accountingTransactions } from "../../../drizzle/schema_inventory_accounting";
import { eq } from "drizzle-orm";

describe("재고-회계 통합 시스템 테스트", () => {
  let testInventoryId: number;
  let testPurchaseId: number;
  const testUserId = 1;

  beforeAll(async () => {
    if (!db) throw new Error("Database connection not available");

    // 테스트용 재고 아이템 생성
    const [newInventory] = await db.insert(hInventory).values({
      itemName: "테스트 원재료",
      category: "원재료",
      unit: "KG",
      currentStock: "0",
      minimumStock: "10",
      status: "active",
      createdBy: testUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    testInventoryId = newInventory.insertId;

    // 테스트용 매입 전표 생성
    const [newPurchase] = await db.insert(accountingPurchases).values({
      transactionDate: new Date().toISOString().split("T")[0],
      itemName: "테스트 원재료",
      inventoryId: testInventoryId,
      quantity: "100",
      unit: "KG",
      unitPrice: "5000",
      totalAmount: "500000",
      supplierId: null,
      status: "DRAFT",
      createdBy: testUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    testPurchaseId = newPurchase.insertId;
  });

  describe("매입 POST 로직", () => {
    it("DRAFT 상태의 매입 전표를 POSTED로 전환하고 원장 생성", async () => {
      // 매입 POST 실행
      await postPurchase(testPurchaseId, testUserId);

      // 1. 매입 전표 상태 확인
      const purchase = await db!
        .select()
        .from(accountingPurchases)
        .where(eq(accountingPurchases.id, testPurchaseId))
        .limit(1)
        .then((rows) => rows[0]);

      expect(purchase.status).toBe("paid");
      expect(purchase.postedAt).toBeTruthy();
      expect(purchase.postedBy).toBe(testUserId);

      // 2. LOT 생성 확인
      const lots = await db!
        .select()
        .from(hInventoryLots)
        .where(eq(hInventoryLots.inventoryId, testInventoryId));

      expect(lots.length).toBeGreaterThan(0);
      const lot = lots[0];
      expect(lot.currentQuantity).toBe("100");
      expect(lot.unit).toBe("KG");

      // 3. 재고 원장 생성 확인
      const inventoryTxs = await db!
        .select()
        .from(hInventoryTransactions)
        .where(eq(hInventoryTransactions.sourceId, `PURCHASE-${testPurchaseId}`));

      expect(inventoryTxs.length).toBe(1);
      expect(inventoryTxs[0].transactionType).toBe("receipt");
      expect(inventoryTxs[0].quantity).toBe("100");
      expect(inventoryTxs[0].actionType).toBe("POST");

      // 4. 회계 원장 생성 확인 (차변 원재료, 대변 매입채무)
      const accountingTxs = await db!
        .select()
        .from(accountingTransactions)
        .where(eq(accountingTransactions.sourceId, `PURCHASE-${testPurchaseId}`));

      expect(accountingTxs.length).toBe(2);

      const debitTx = accountingTxs.find((tx) => Number(tx.debitAmount) > 0);
      const creditTx = accountingTxs.find((tx) => Number(tx.creditAmount) > 0);

      expect(debitTx).toBeTruthy();
      expect(debitTx!.accountCode).toBe("1120"); // 원재료
      expect(debitTx!.debitAmount).toBe("500000.00");

      expect(creditTx).toBeTruthy();
      expect(creditTx!.accountCode).toBe("2110"); // 매입채무
      expect(creditTx!.creditAmount).toBe("500000.00");
    });

    it("중복 POST 시도 시 멱등성 오류 발생", async () => {
      await expect(postPurchase(testPurchaseId, testUserId)).rejects.toThrow("이미 확정된 전표입니다");
    });
  });

  describe("매입 CANCEL 로직", () => {
    it("POSTED 상태의 매입 전표를 CANCELED로 전환하고 역거래 생성", async () => {
      // 매입 CANCEL 실행
      await cancelPurchase(testPurchaseId, testUserId);

      // 1. 매입 전표 상태 확인
      const purchase = await db!
        .select()
        .from(accountingPurchases)
        .where(eq(accountingPurchases.id, testPurchaseId))
        .limit(1)
        .then((rows) => rows[0]);

      expect(purchase.status).toBe("cancelled");
      expect(purchase.canceledAt).toBeTruthy();
      expect(purchase.canceledBy).toBe(testUserId);

      // 2. 재고 역거래 확인
      const inventoryTxs = await db!
        .select()
        .from(hInventoryTransactions)
        .where(eq(hInventoryTransactions.sourceId, `PURCHASE-${testPurchaseId}`));

      expect(inventoryTxs.length).toBe(2); // POST + REVERSAL
      const reversalTx = inventoryTxs.find((tx) => tx.actionType === "REVERSAL");
      expect(reversalTx).toBeTruthy();
      expect(reversalTx!.quantity).toBe("-100"); // 음수

      // 3. 회계 역거래 확인
      const accountingTxs = await db!
        .select()
        .from(accountingTransactions)
        .where(eq(accountingTransactions.sourceId, `PURCHASE-${testPurchaseId}`));

      expect(accountingTxs.length).toBe(4); // POST 2개 + REVERSAL 2개

      const reversalTxs = accountingTxs.filter((tx) => tx.actionType === "REVERSAL");
      expect(reversalTxs.length).toBe(2);

      // 역거래는 DR/CR이 반대
      const reversalDebitTx = reversalTxs.find((tx) => Number(tx.debitAmount) > 0);
      const reversalCreditTx = reversalTxs.find((tx) => Number(tx.creditAmount) > 0);

      expect(reversalDebitTx!.accountCode).toBe("2110"); // 매입채무 (원본은 대변, 역거래는 차변)
      expect(reversalCreditTx!.accountCode).toBe("1120"); // 원재료 (원본은 차변, 역거래는 대변)
    });

    it("중복 CANCEL 시도 시 멱등성 오류 발생", async () => {
      await expect(cancelPurchase(testPurchaseId, testUserId)).rejects.toThrow("확정된 전표만 취소할 수 있습니다");
    });
  });

  describe("FEFO 로트 할당", () => {
    it("유통기한 빠른 순으로 LOT 할당", async () => {
      if (!db) throw new Error("Database connection not available");

      // 테스트용 LOT 3개 생성 (유통기한 다름)
      const today = new Date();
      const lot1Date = new Date(today.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]; // 10일 후
      const lot2Date = new Date(today.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]; // 5일 후
      const lot3Date = new Date(today.getTime() + 15 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]; // 15일 후

      await db.insert(hInventoryLots).values([
        {
          inventoryId: testInventoryId,
          lotNumber: "LOT-001",
          initialQuantity: "50",
          currentQuantity: "50",
          unit: "KG",
          unitCost: "5000",
          receivedDate: today.toISOString().split("T")[0],
          expiryDate: lot1Date,
          status: "active",
          createdBy: testUserId,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          inventoryId: testInventoryId,
          lotNumber: "LOT-002",
          initialQuantity: "30",
          currentQuantity: "30",
          unit: "KG",
          unitCost: "5000",
          receivedDate: today.toISOString().split("T")[0],
          expiryDate: lot2Date,
          status: "active",
          createdBy: testUserId,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          inventoryId: testInventoryId,
          lotNumber: "LOT-003",
          initialQuantity: "20",
          currentQuantity: "20",
          unit: "KG",
          unitCost: "5000",
          receivedDate: today.toISOString().split("T")[0],
          expiryDate: lot3Date,
          status: "active",
          createdBy: testUserId,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      // FEFO 할당 (60KG 요청)
      const allocations = await allocateLotsFEFO(testInventoryId, 60, "KG");

      // LOT-002 (5일 후) → LOT-001 (10일 후) 순으로 할당되어야 함
      expect(allocations.length).toBe(2);
      expect(allocations[0].quantity).toBe(30); // LOT-002 전체
      expect(allocations[1].quantity).toBe(30); // LOT-001 일부
    });

    it("재고 부족 시 오류 발생", async () => {
      await expect(allocateLotsFEFO(testInventoryId, 1000, "KG")).rejects.toThrow("재고 부족");
    });
  });
});
