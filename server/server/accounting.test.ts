import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { Context } from "./_core/context";

// Mock context for admin user
const mockAdminContext: Context = {
  user: {
    id: 1,
    name: "Admin User",
    email: "admin@test.com",
    role: "admin"
  }
};

// Mock context for regular user
const mockUserContext: Context = {
  user: {
    id: 2,
    name: "Regular User",
    email: "user@test.com",
    role: "user"
  }
};

describe("Accounting API Tests", () => {
  let categoryId: number;
  let transactionId: number;

  beforeAll(async () => {
    // 기본 계정 과목 초기화
    const caller = appRouter.createCaller(mockAdminContext);
    try {
      await caller.accounting.initializeCategories();
    } catch (error) {
      // 이미 초기화된 경우 무시
    }
  });

  describe("Categories", () => {
    it("should list all categories", async () => {
      const caller = appRouter.createCaller(mockAdminContext);
      const categories = await caller.accounting.getCategories();
      
      expect(categories).toBeDefined();
      expect(Array.isArray(categories)).toBe(true);
      expect(categories.length).toBeGreaterThan(0);
      
      // 첫 번째 카테고리 저장 (거래 테스트에 사용)
      categoryId = categories[0].id;
    });

    it("should have income and expense categories", async () => {
      const caller = appRouter.createCaller(mockAdminContext);
      const categories = await caller.accounting.getCategories();
      
      const incomeCategories = categories.filter(c => c.type === "income");
      const expenseCategories = categories.filter(c => c.type === "expense");
      
      expect(incomeCategories.length).toBeGreaterThan(0);
      expect(expenseCategories.length).toBeGreaterThan(0);
    });
  });

  describe("Transactions", () => {
    it("should create a new transaction (admin only)", async () => {
      const caller = appRouter.createCaller(mockAdminContext);
      const result = await caller.accounting.createTransaction({
        transactionDate: "2026-01-30",
        type: "expense",
        amount: "50000",
        categoryId: categoryId,
        description: "테스트 지출"
      });
      
      expect(result.success).toBe(true);
      expect(result.transactionId).toBeDefined();
      transactionId = result.transactionId;
    });

    it("should list transactions", async () => {
      const caller = appRouter.createCaller(mockAdminContext);
      const transactions = await caller.accounting.listTransactions({
        startDate: "2026-01-01",
        endDate: "2026-12-31"
      });
      
      expect(Array.isArray(transactions)).toBe(true);
      expect(transactions.length).toBeGreaterThan(0);
    });

    it("should filter transactions by type", async () => {
      const caller = appRouter.createCaller(mockAdminContext);
      const expenseTransactions = await caller.accounting.listTransactions({
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        type: "expense"
      });
      
      expect(Array.isArray(expenseTransactions)).toBe(true);
      expenseTransactions.forEach(t => {
        expect(t.type).toBe("expense");
      });
    });

    it("should get transaction by id", async () => {
      const caller = appRouter.createCaller(mockAdminContext);
      const transaction = await caller.accounting.getTransaction({ id: transactionId });
      
      expect(transaction).toBeDefined();
      expect(transaction.id).toBe(transactionId);
      expect(transaction.amount).toBe("50000");
    });

    it("should update a transaction (admin only)", async () => {
      const caller = appRouter.createCaller(mockAdminContext);
      const result = await caller.accounting.updateTransaction({
        id: transactionId,
        amount: "60000",
        description: "테스트 지출 (수정됨)"
      });
      
      expect(result.success).toBe(true);
      
      // 수정 확인
      const updated = await caller.accounting.getTransaction({ id: transactionId });
      expect(updated.amount).toBe("60000");
      expect(updated.description).toBe("테스트 지출 (수정됨)");
    });

    it("should delete a transaction (admin only)", async () => {
      const caller = appRouter.createCaller(mockAdminContext);
      const result = await caller.accounting.deleteTransaction({ id: transactionId });
      
      expect(result.success).toBe(true);
    });
  });

  describe("Financial Overview", () => {
    it("should get financial overview", async () => {
      const caller = appRouter.createCaller(mockAdminContext);
      
      // 테스트 데이터 생성
      await caller.accounting.createTransaction({
        transactionDate: "2026-01-30",
        type: "income",
        amount: "100000",
        categoryId: categoryId,
        description: "테스트 수입"
      });
      
      await caller.accounting.createTransaction({
        transactionDate: "2026-01-30",
        type: "expense",
        amount: "30000",
        categoryId: categoryId,
        description: "테스트 지출"
      });
      
      const overview = await caller.accounting.getFinancialOverview({
        startDate: "2026-01-01",
        endDate: "2026-01-31"
      });
      
      expect(overview).toBeDefined();
      expect(overview.totalIncome).toBeGreaterThan(0);
      expect(overview.totalExpense).toBeGreaterThan(0);
      expect(overview.netCashFlow).toBeDefined();
      expect(overview.incomeCount).toBeGreaterThan(0);
      expect(overview.expenseCount).toBeGreaterThan(0);
    });

    it("should get category breakdown", async () => {
      const caller = appRouter.createCaller(mockAdminContext);
      const breakdown = await caller.accounting.getCategoryBreakdown({
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        type: "expense"
      });
      
      expect(Array.isArray(breakdown)).toBe(true);
      if (breakdown.length > 0) {
        expect(breakdown[0].categoryName).toBeDefined();
        expect(breakdown[0].totalAmount).toBeDefined();
        expect(breakdown[0].transactionCount).toBeDefined();
      }
    });

    it("should get monthly summary", async () => {
      const caller = appRouter.createCaller(mockAdminContext);
      const summary = await caller.accounting.getMonthlySummary({
        year: 2026,
        month: 1
      });
      
      expect(summary).toBeDefined();
      expect(summary.year).toBe(2026);
      expect(summary.month).toBe(1);
      expect(summary.totalIncome).toBeDefined();
      expect(summary.totalExpense).toBeDefined();
      expect(summary.netCashFlow).toBeDefined();
      expect(summary.transactionCount).toBeGreaterThan(0);
    });
  });

  describe("Permissions", () => {
    it("should allow regular users to view categories", async () => {
      const caller = appRouter.createCaller(mockUserContext);
      const categories = await caller.accounting.getCategories();
      
      expect(categories).toBeDefined();
      expect(Array.isArray(categories)).toBe(true);
    });

    it("should allow regular users to view transactions", async () => {
      const caller = appRouter.createCaller(mockUserContext);
      const transactions = await caller.accounting.listTransactions({
        startDate: "2026-01-01",
        endDate: "2026-12-31"
      });
      
      expect(Array.isArray(transactions)).toBe(true);
    });

    it("should prevent regular users from creating transactions", async () => {
      const caller = appRouter.createCaller(mockUserContext);
      
      await expect(
        caller.accounting.createTransaction({
          transactionDate: "2026-01-30",
          type: "expense",
          amount: "10000",
          categoryId: categoryId,
          description: "Unauthorized attempt"
        })
      ).rejects.toThrow();
    });

    it("should prevent regular users from updating transactions", async () => {
      const caller = appRouter.createCaller(mockUserContext);
      
      await expect(
        caller.accounting.updateTransaction({
          id: 1,
          amount: "99999"
        })
      ).rejects.toThrow();
    });

    it("should prevent regular users from deleting transactions", async () => {
      const caller = appRouter.createCaller(mockUserContext);
      
      await expect(
        caller.accounting.deleteTransaction({ id: 1 })
      ).rejects.toThrow();
    });
  });
});
