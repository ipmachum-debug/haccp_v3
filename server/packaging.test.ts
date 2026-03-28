import { describe, it, expect, beforeAll } from "vitest";
import { createPurchase } from "./db/haccpIntegration";
import { getDb } from "./db";
import { hMaterials, partners } from "../drizzle/schema";
import { eq } from "drizzle-orm";

describe("포장규격 관련 기능 테스트", () => {
  let testMaterialId: number;
  let testPartnerId: number;
  let testUserId = 1; // 테스트용 사용자 ID

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DB 연결 실패");

    // 고유한 코드 생성 (타임스탬프 사용)
    const timestamp = Date.now();

    // 테스트용 거래처 생성 (사업자번호 없음)
    const [partner] = await db.insert(partners).values({
      companyName: `테스트거래처_${timestamp}`,
      bizNo: null, // 사업자번호 없음
      contactPerson: "테스트담당자",
      phone: "010-1234-5678",
      createdBy: testUserId,
    });
    testPartnerId = partner.insertId as number;

    // 테스트용 원재료 생성 (기본 포장규격 5kg)
    const [material] = await db.insert(hMaterials).values({
      materialCode: `TEST-MAT-${timestamp}`,
      materialName: `테스트원재료_팥앙금_${timestamp}`,
      kind: "RAW",
      unit: "KG",
      defaultPackagingSize: "5.00", // 5kg 포장
      safetyStockLevel: "0.000",
      unitPrice: "10000.00",
      isActive: 1,
    });
    testMaterialId = material.insertId as number;
  });

  it("포장규격 × 수량 = 총 재고량 계산 (5kg × 10개 = 50kg)", async () => {
    const result = await createPurchase({
      transactionDate: "2026-02-01",
      partnerId: testPartnerId,
      itemName: "테스트원재료_팥앙금",
      materialId: testMaterialId,
      quantity: 10, // 10개
      packagingSize: 5, // 5kg 포장
      unitPrice: 10000,
      amount: 100000,
      taxAmount: 10000,
      memo: "포장규격 테스트",
      createdBy: testUserId,
    });

    expect(result).toBeDefined();

    // h_inventory_lots에서 재고량 확인
    const db = await getDb();
    if (!db) throw new Error("DB 연결 실패");

    const { hInventoryLots } = await import("../drizzle/schema");
    const [lot] = await db
      .select()
      .from(hInventoryLots)
      .where(eq(hInventoryLots.materialId, testMaterialId))
      .orderBy(hInventoryLots.id)
      .limit(1);

    expect(lot).toBeDefined();
    expect(Number(lot.quantity)).toBe(50); // 5kg × 10개 = 50kg
  });

  it("포장규격 없이 매입 등록 시 기본값 1 적용 (수량 그대로)", async () => {
    const result = await createPurchase({
      transactionDate: "2026-02-01",
      partnerId: testPartnerId,
      itemName: "테스트원재료_팥앙금",
      materialId: testMaterialId,
      quantity: 20, // 20개
      packagingSize: undefined, // 포장규격 없음 → 기본값 1
      unitPrice: 10000,
      amount: 200000,
      taxAmount: 20000,
      memo: "포장규격 없음 테스트",
      createdBy: testUserId,
    });

    expect(result).toBeDefined();

    // h_inventory_lots에서 재고량 확인
    const db = await getDb();
    if (!db) throw new Error("DB 연결 실패");

    const { hInventoryLots } = await import("../drizzle/schema");
    const lots = await db
      .select()
      .from(hInventoryLots)
      .where(eq(hInventoryLots.materialId, testMaterialId))
      .orderBy(hInventoryLots.id);

    const latestLot = lots[lots.length - 1];
    expect(latestLot).toBeDefined();
    expect(Number(latestLot.quantity)).toBe(20); // 1 × 20개 = 20kg
  });

  it("거래처 등록 시 사업자번호 없이 등록 가능", async () => {
    const db = await getDb();
    if (!db) throw new Error("DB 연결 실패");

    const timestamp = Date.now();
    const [partner] = await db.insert(partners).values({
      companyName: `사업자번호없는거래처_${timestamp}`,
      bizNo: null, // 사업자번호 없음
      contactPerson: "개인사업자",
      phone: "010-9999-8888",
      createdBy: testUserId,
    });

    expect(partner.insertId).toBeDefined();

    // 등록된 거래처 조회
    const [registeredPartner] = await db
      .select()
      .from(partners)
      .where(eq(partners.id, partner.insertId as number));

    expect(registeredPartner).toBeDefined();
    expect(registeredPartner.companyName).toContain("사업자번호없는거래처");
    expect(registeredPartner.bizNo).toBeNull();
  });

  it("원재료 등록 시 기본 포장규격 저장", async () => {
    const db = await getDb();
    if (!db) throw new Error("DB 연결 실패");

    const timestamp = Date.now();
    const [material] = await db.insert(hMaterials).values({
      materialCode: `TEST-MAT-RICE-${timestamp}`,
      materialName: `테스트원재료_쌌_${timestamp}`,
      kind: "RAW",
      unit: "KG",
      defaultPackagingSize: "20.00", // 20kg 포장
      safetyStockLevel: "0.000",
      unitPrice: "50000.00",
      isActive: 1,
    });

    expect(material.insertId).toBeDefined();

    // 등록된 원재료 조회
    const [registeredMaterial] = await db
      .select()
      .from(hMaterials)
      .where(eq(hMaterials.id, material.insertId as number));

    expect(registeredMaterial).toBeDefined();
    expect(registeredMaterial.materialName).toContain("테스트원재료_쌌");
    expect(Number(registeredMaterial.defaultPackagingSize)).toBe(20);
  });
});
