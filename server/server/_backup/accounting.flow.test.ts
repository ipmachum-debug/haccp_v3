import { describe, it, expect, beforeAll } from "vitest";
import { getDb } from "./db";
import { createPurchase, createSale, updatePurchase, updateSale } from "./db/haccpIntegration";

describe("전체 회계 흐름 테스트", () => {
  let testUserId: number;
  let testPartnerId: number;
  let testAccountCategoryId: number;
  let testPurchaseId: number;
  let testSaleId: number;

  beforeAll(async () => {
    const db = await getDb();
    
    // 테스트 사용자 생성 또는 조회
    const users = await db.select().from((await import("../drizzle/schema")).users).limit(1);
    if (users.length > 0) {
      testUserId = users[0].id;
    } else {
      const [newUser] = await db.insert((await import("../drizzle/schema")).users).values({
        email: "test@haccp.com",
        password: "test123",
        name: "테스트 사용자",
        role: "admin"
      });
      testUserId = newUser.id;
    }

    // 테스트 거래처 생성 또는 조회
    const partners = await db.select().from((await import("../drizzle/schema")).partners).limit(1);
    if (partners.length > 0) {
      testPartnerId = partners[0].id;
    } else {
      const [newPartner] = await db.insert((await import("../drizzle/schema")).partners).values({
        name: "테스트 공급업체",
        type: "supplier",
        contactPerson: "홍길동",
        phone: "010-1234-5678",
        createdBy: testUserId
      });
      testPartnerId = newPartner.id;
    }

    // 테스트 계정 과목 생성 또는 조회
    const { accountingAccountCategories } = await import("../drizzle/schema");
    const categories = await db.select().from(accountingAccountCategories).limit(1);
    if (categories.length > 0) {
      testAccountCategoryId = categories[0].id;
    } else {
      const [newCategory] = await db.insert(accountingAccountCategories).values({
        name: "원재료 매입",
        code: "PURCHASE_001",
        categoryType: "purchases",
        description: "원재료 및 부자재 매입",
        createdBy: testUserId
      });
      testAccountCategoryId = newCategory.id;
    }
  });

  describe("1. 매입/매출 거래 생성 및 계정 과목 지정", () => {
    it("매입 거래를 생성하고 계정 과목을 지정할 수 있어야 함", async () => {
      const purchase = await createPurchase({
        transactionDate: new Date().toISOString().split("T")[0],
        partnerId: testPartnerId,
        itemName: "테스트 원재료",
        quantity: 100,
        unitPrice: 1000,
        amount: 100000,
        taxAmount: 10000,
        memo: "테스트 매입",
        accountCategoryId: testAccountCategoryId,
        createdBy: testUserId
      });

      expect(purchase).toBeDefined();
      expect(purchase.id).toBeDefined();
      testPurchaseId = purchase.id;
    });

    it("매출 거래를 생성하고 계정 과목을 지정할 수 있어야 함", async () => {
      const sale = await createSale({
        transactionDate: new Date().toISOString().split("T")[0],
        partnerId: testPartnerId,
        itemName: "테스트 제품",
        quantity: 50,
        unitPrice: 3000,
        amount: 150000,
        taxAmount: 15000,
        memo: "테스트 매출",
        accountCategoryId: testAccountCategoryId,
        createdBy: testUserId
      });

      expect(sale).toBeDefined();
      expect(sale.id).toBeDefined();
      testSaleId = sale.id;
    });

    it("매입 거래의 계정 과목을 수정할 수 있어야 함", async () => {
      const result = await updatePurchase(testPurchaseId, {
        accountCategoryId: testAccountCategoryId,
        notes: "계정 과목 수정 테스트"
      });

      expect(result.success).toBe(true);
    });

    it("매출 거래의 계정 과목을 수정할 수 있어야 함", async () => {
      const result = await updateSale(testSaleId, {
        accountCategoryId: testAccountCategoryId,
        notes: "계정 과목 수정 테스트"
      });

      expect(result.success).toBe(true);
    });
  });

  describe("2. 계정 과목 데이터 조회", () => {
    it("생성된 매입 거래에 계정 과목이 올바르게 저장되어야 함", async () => {
      const db = await getDb();
      const { accountingPurchases } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");

      const [purchase] = await db
        .select()
        .from(accountingPurchases)
        .where(eq(accountingPurchases.id, testPurchaseId));

      expect(purchase).toBeDefined();
      expect(purchase.accountCategoryId).toBe(testAccountCategoryId);
    });

    it("생성된 매출 거래에 계정 과목이 올바르게 저장되어야 함", async () => {
      const db = await getDb();
      const { accountingSales } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");

      const [sale] = await db
        .select()
        .from(accountingSales)
        .where(eq(accountingSales.id, testSaleId));

      expect(sale).toBeDefined();
      expect(sale.accountCategoryId).toBe(testAccountCategoryId);
    });
  });

  describe("3. 일일/월간 마감 데이터 집계", () => {
    it("일일 마감 데이터를 조회할 수 있어야 함", async () => {
      const db = await getDb();
      const { accountingPurchases, accountingSales } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");

      const today = new Date().toISOString().split("T")[0];

      const purchases = await db
        .select()
        .from(accountingPurchases)
        .where(eq(accountingPurchases.transactionDate, today));

      const sales = await db
        .select()
        .from(accountingSales)
        .where(eq(accountingSales.transactionDate, today));

      expect(purchases.length).toBeGreaterThan(0);
      expect(sales.length).toBeGreaterThan(0);
    });

    it("계정 과목별 집계가 가능해야 함", async () => {
      const db = await getDb();
      const { accountingPurchases } = await import("../drizzle/schema");
      const { eq, sum } = await import("drizzle-orm");

      const today = new Date().toISOString().split("T")[0];

      const categoryTotal = await db
        .select({
          categoryId: accountingPurchases.accountCategoryId,
          totalAmount: sum(accountingPurchases.totalAmount)
        })
        .from(accountingPurchases)
        .where(eq(accountingPurchases.transactionDate, today))
        .groupBy(accountingPurchases.accountCategoryId);

      expect(categoryTotal).toBeDefined();
      console.log("계정 과목별 집계:", categoryTotal);
    });
  });
});
