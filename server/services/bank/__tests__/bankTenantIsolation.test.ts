/**
 * Bank 도메인 - 테넌트 격리 최소 회귀 테스트
 *
 * 이 테스트는 DB 접근 없이 서비스 레이어의 tenant 격리 로직을 검증합니다.
 * 실제 DB 테스트는 통합 테스트 환경에서 수행합니다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock getDb
const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockResolvedValue([{ insertId: 1 }]),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  execute: vi.fn().mockResolvedValue([]),
};

vi.mock("../../../db", () => ({
  getDb: vi.fn().mockResolvedValue(mockDb),
}));

vi.mock("../../../../drizzle/schema", () => ({
  bankAccounts: {
    id: "bankAccounts.id",
    tenantId: "bankAccounts.tenantId",
    isActive: "bankAccounts.isActive",
    createdAt: "bankAccounts.createdAt",
  },
  bankTransactions: {
    id: "bankTransactions.id",
    tenantId: "bankTransactions.tenantId",
    bankAccountId: "bankTransactions.bankAccountId",
    transactionDate: "bankTransactions.transactionDate",
    transactionType: "bankTransactions.transactionType",
    amount: "bankTransactions.amount",
    description: "bankTransactions.description",
    memo: "bankTransactions.memo",
    matchingStatus: "bankTransactions.matchingStatus",
    approvalStatus: "bankTransactions.approvalStatus",
    isLargeAmount: "bankTransactions.isLargeAmount",
    accountingAccountId: "bankTransactions.accountingAccountId",
    matchedBy: "bankTransactions.matchedBy",
    matchedAt: "bankTransactions.matchedAt",
    rejectionReason: "bankTransactions.rejectionReason",
  },
  matchingRules: {
    tenantId: "matchingRules.tenantId",
    isActive: "matchingRules.isActive",
    priority: "matchingRules.priority",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: (a: any, b: any) => ({ type: "eq", field: a, value: b }),
  and: (...args: any[]) => ({ type: "and", conditions: args }),
  or: (...args: any[]) => ({ type: "or", conditions: args }),
  gte: (a: any, b: any) => ({ type: "gte", field: a, value: b }),
  lte: (a: any, b: any) => ({ type: "lte", field: a, value: b }),
  like: (a: any, b: any) => ({ type: "like", field: a, value: b }),
  sql: (strings: TemplateStringsArray, ...values: any[]) => ({ type: "sql", strings, values }),
  desc: (a: any) => ({ type: "desc", field: a }),
  inArray: (a: any, b: any[]) => ({ type: "inArray", field: a, values: b }),
  asc: (a: any) => ({ type: "asc", field: a }),
}));

describe("Bank Tenant Isolation", () => {
  const TENANT_A = 1;
  const TENANT_B = 2;

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no results (empty array)
    mockDb.limit.mockResolvedValue([]);
    mockDb.where.mockReturnValue(mockDb);
    mockDb.set.mockReturnValue(mockDb);
    mockDb.from.mockReturnValue(mockDb);
    mockDb.select.mockReturnValue(mockDb);
  });

  describe("1. assertBankAccountOwned - 다른 tenant 계좌 접근 차단", () => {
    it("should throw FORBIDDEN when account belongs to different tenant", async () => {
      const { assertBankAccountOwned } = await import("../bankAccount.service");

      // 계좌가 없는 것처럼 응답 (다른 tenant 소유)
      mockDb.limit.mockResolvedValue([]);

      await expect(
        assertBankAccountOwned(TENANT_A, 999)
      ).rejects.toThrow("해당 계좌에 접근할 수 없습니다.");
    });

    it("should pass when account belongs to same tenant", async () => {
      const { assertBankAccountOwned } = await import("../bankAccount.service");

      mockDb.limit.mockResolvedValue([{ id: 1 }]);

      await expect(
        assertBankAccountOwned(TENANT_A, 1)
      ).resolves.toBeUndefined();
    });
  });

  describe("2. createTransaction - 다른 tenant 계좌로 거래 생성 차단", () => {
    it("should verify account ownership before creating transaction", async () => {
      const { createTransaction } = await import("../bankTransaction.service");

      // 계좌 소유권 검증 실패 (빈 배열 반환)
      mockDb.limit.mockResolvedValue([]);

      await expect(
        createTransaction(TENANT_A, {
          bankAccountId: 999, // TENANT_B의 계좌
          transactionDate: "2026-01-01",
          transactionType: "deposit",
          amount: 100000,
        })
      ).rejects.toThrow("해당 계좌에 접근할 수 없습니다.");
    });
  });

  describe("3. approveTransaction - 고액거래 금액 검증", () => {
    it("should require confirmedAmount for large transactions", async () => {
      const { approveTransaction } = await import("../bankTransaction.service");

      // 거래 조회 결과: 고액 거래
      mockDb.limit.mockResolvedValue([{
        id: 1,
        amount: 10000000,
        isLargeAmount: "Y",
        tenantId: TENANT_A,
      }]);

      await expect(
        approveTransaction(TENANT_A, 1) // confirmedAmount 없음
      ).rejects.toThrow("고액 거래는 금액 재확인이 필요합니다.");
    });

    it("should reject mismatched confirmed amount", async () => {
      const { approveTransaction } = await import("../bankTransaction.service");

      mockDb.limit.mockResolvedValue([{
        id: 1,
        amount: 10000000,
        isLargeAmount: "Y",
        tenantId: TENANT_A,
      }]);

      await expect(
        approveTransaction(TENANT_A, 1, 5000000) // 금액 불일치
      ).rejects.toThrow("확인된 금액이 일치하지 않습니다.");
    });
  });

  describe("4. deleteAllByAccount - 계좌 소유권 검증 후 삭제", () => {
    it("should verify account ownership before bulk delete", async () => {
      const { deleteAllByAccount } = await import("../bankTransaction.service");

      mockDb.limit.mockResolvedValue([]);

      await expect(
        deleteAllByAccount(TENANT_A, 999)
      ).rejects.toThrow("해당 계좌에 접근할 수 없습니다.");
    });
  });

  describe("5. getTransactionById - 조회 시 tenant 격리", () => {
    it("should throw NOT_FOUND when transaction doesn't belong to tenant", async () => {
      const { getTransactionById } = await import("../bankTransaction.service");

      mockDb.limit.mockResolvedValue([]);

      await expect(
        getTransactionById(TENANT_A, 999)
      ).rejects.toThrow("거래 내역을 찾을 수 없습니다.");
    });
  });

  describe("6. getAccountStats - 소유 계좌만 조회", () => {
    it("should throw when accessing stats of another tenant's account", async () => {
      const { getAccountStats } = await import("../bankAccount.service");

      mockDb.limit.mockResolvedValue([]);

      await expect(
        getAccountStats(TENANT_A, 999)
      ).rejects.toThrow("해당 계좌에 접근할 수 없습니다.");
    });
  });
});

describe("omitUndefined utility", () => {
  it("should remove undefined values", async () => {
    // Directly test the utility
    const { omitUndefined } = await import("@shared/utils");

    const input = { a: 1, b: undefined, c: "hello", d: null, e: undefined };
    const result = omitUndefined(input);

    expect(result).toEqual({ a: 1, c: "hello", d: null });
    expect("b" in result).toBe(false);
    expect("e" in result).toBe(false);
  });

  it("should keep null values (intentional clearing)", async () => {
    const { omitUndefined } = await import("@shared/utils");

    const input = { name: "test", description: null, notes: undefined };
    const result = omitUndefined(input);

    expect(result).toEqual({ name: "test", description: null });
  });
});
