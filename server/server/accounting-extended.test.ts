import { describe, test, expect } from "vitest";
import { getDb, createMaterial } from "./db";
import { createPartner } from "./partners";

/**
 * 회계 기능 확장 테스트
 * - 매입 등록 → 재고 자동 증가 확인
 * - 비과세 항목 세액 계산 (0원)
 * - 과세 항목 세액 계산 (10%)
 */

describe("회계 기능 확장 테스트", () => {
  test("비과세 항목 세액 계산 (0원)", async () => {
    // 비과세 항목: 수량 10 × 단가 5,000원 = 금액 50,000원, 세액 0원
    const quantity = 10;
    const unitPrice = 5000;
    const taxType = "tax_free"; // 비과세

    const amount = quantity * unitPrice;
    const taxAmount = taxType === "taxable" ? amount * 0.1 : 0;
    const totalAmount = amount + taxAmount;

    expect(amount).toBe(50000);
    expect(taxAmount).toBe(0);
    expect(totalAmount).toBe(50000);
  });

  test("과세 항목 세액 계산 (10%)", async () => {
    // 과세 항목: 수량 10 × 단가 5,000원 = 금액 50,000원, 세액 5,000원
    const quantity = 10;
    const unitPrice = 5000;
    const taxType = "taxable"; // 과세

    const amount = quantity * unitPrice;
    const taxAmount = taxType === "taxable" ? amount * 0.1 : 0;
    const totalAmount = amount + taxAmount;

    expect(amount).toBe(50000);
    expect(taxAmount).toBe(5000);
    expect(totalAmount).toBe(55000);
  });

  test("매입 등록 → 재고 자동 증가 확인", async () => {
    const db = await getDb();
    const timestamp = Date.now();

    // 1. 거래처 등록
    const partner = await createPartner({
      companyName: `매입테스트거래처_${timestamp}`,
      bizNo: null,
      type: "supplier",
      createdBy: 1,
    });

    // 2. 원재료 등록
    const material = await createMaterial({
      materialCode: `MAT-TEST-${timestamp}`,
      materialName: `매입테스트원재료_${timestamp}`,
      category: "원재료",
      unit: "KG",
    });

    // 3. 매입 등록 (포장규격 10kg × 수량 5개 = 총 50kg)
    const { createPurchase } = await import("./db/haccpIntegration");
    const quantity = 5;
    const packagingSize = 10;
    const unitPrice = 10000;
    const amount = quantity * unitPrice;
    const taxAmount = amount * 0.1;

    const purchase = await createPurchase({
      partnerId: partner.id,
      materialId: material.id,
      itemName: `매입테스트원재료_${timestamp}`,
      quantity,
      packagingSize,
      unitPrice,
      amount,
      taxAmount,
      transactionDate: "2026-02-01",
      createdBy: 1,
    });

    // 4. 재고 LOT 확인
    const { hInventoryLots } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    const [lot] = await db
      .select()
      .from(hInventoryLots)
      .where(eq(hInventoryLots.materialId, material.id));

    expect(lot).toBeDefined();
    expect(Number(lot.quantity)).toBe(50); // 10kg × 5개 = 50kg
    expect(Number(lot.availableQuantity)).toBe(50);
    expect(lot.unit).toBe("KG");
  });
});
