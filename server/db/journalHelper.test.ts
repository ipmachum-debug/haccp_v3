/**
 * journalHelper 단위 테스트
 * DB 호출은 vi.mock으로 모킹
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock getRawConnection before importing the module
const mockExecute = vi.fn();
const mockConnection = { execute: mockExecute };

vi.mock("../db", () => ({
  getRawConnection: vi.fn(() => Promise.resolve(mockConnection)),
}));

// Mock SYSTEM_ACCOUNTS
vi.mock("../../drizzle/schema/accountingAccounts", () => ({
  SYSTEM_ACCOUNTS: {
    CASH: "CASH",
    BANK_DEPOSIT: "BANK_DEPOSIT",
    ACCOUNTS_PAYABLE: "ACCOUNTS_PAYABLE",
    ACCOUNTS_PAYABLE_CARD: "ACCOUNTS_PAYABLE_CARD",
    VAT_INPUT: "VAT_INPUT",
    VAT_OUTPUT: "VAT_OUTPUT",
    ACCOUNTS_RECEIVABLE: "ACCOUNTS_RECEIVABLE",
    INVENTORY_RAW: "INVENTORY_RAW",
    INVENTORY_GOODS: "INVENTORY_GOODS",
    SALES_REVENUE: "SALES_REVENUE",
    SERVICE_REVENUE: "SERVICE_REVENUE",
    COST_OF_GOODS: "COST_OF_GOODS",
    CAPITAL: "CAPITAL",
    RETAINED_EARNINGS: "RETAINED_EARNINGS",
  },
}));

import { resolveSystemAccount, getPaymentSystemAccount, insertJournalLine } from "./journalHelper";

describe("getPaymentSystemAccount", () => {
  it("maps 'cash' to CASH system account", () => {
    const result = getPaymentSystemAccount("cash");
    expect(result.systemCode).toBe("CASH");
    expect(result.fallbackCode).toBe("1010");
    expect(result.fallbackName).toBe("현금");
  });

  it("maps 'bank' to BANK_DEPOSIT system account", () => {
    const result = getPaymentSystemAccount("bank");
    expect(result.systemCode).toBe("BANK_DEPOSIT");
    expect(result.fallbackCode).toBe("1020");
    expect(result.fallbackName).toBe("보통예금");
  });

  it("maps 'card' to ACCOUNTS_PAYABLE_CARD", () => {
    const result = getPaymentSystemAccount("card");
    expect(result.systemCode).toBe("ACCOUNTS_PAYABLE_CARD");
    expect(result.fallbackCode).toBe("2020");
    expect(result.fallbackName).toBe("미지급금-카드");
  });

  it("maps 'unpaid' to ACCOUNTS_PAYABLE", () => {
    const result = getPaymentSystemAccount("unpaid");
    expect(result.systemCode).toBe("ACCOUNTS_PAYABLE");
    expect(result.fallbackCode).toBe("2010");
    expect(result.fallbackName).toBe("미지급금");
  });

  it("defaults to CASH for unknown payment method", () => {
    const result = getPaymentSystemAccount("bitcoin");
    expect(result.systemCode).toBe("CASH");
    expect(result.fallbackCode).toBe("1010");
  });

  it("defaults to CASH for empty string", () => {
    const result = getPaymentSystemAccount("");
    expect(result.systemCode).toBe("CASH");
  });
});

describe("resolveSystemAccount", () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it("returns account found by system_code (primary lookup)", async () => {
    mockExecute.mockResolvedValueOnce([[{ id: 5, code: "1010", name: "현금" }]]);

    const result = await resolveSystemAccount(1, "CASH", "1010", "현금");
    expect(result).toEqual({ id: 5, code: "1010", name: "현금" });
    // Should have called execute once (system_code lookup succeeded)
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockExecute.mock.calls[0][1]).toEqual([1, "CASH"]);
  });

  it("falls back to code/name lookup when system_code not found", async () => {
    // First call: system_code lookup returns empty
    mockExecute.mockResolvedValueOnce([[]]);
    // Second call: fallback lookup returns result
    mockExecute.mockResolvedValueOnce([[{ id: 10, code: "1350", name: "부가세대급금" }]]);

    const result = await resolveSystemAccount(1, "VAT_INPUT", "1350", "부가세대급금");
    expect(result).toEqual({ id: 10, code: "1350", name: "부가세대급금" });
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it("returns fallback defaults (id=0) when nothing found", async () => {
    // Both lookups return empty
    mockExecute.mockResolvedValueOnce([[]]);
    mockExecute.mockResolvedValueOnce([[]]);

    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await resolveSystemAccount(1, "NONEXISTENT" as any, "9999", "없는계정");

    expect(result).toEqual({ id: 0, code: "9999", name: "없는계정" });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("returns systemCode as code/name when no fallbacks provided and nothing found", async () => {
    mockExecute.mockResolvedValueOnce([[]]);

    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await resolveSystemAccount(1, "CASH");

    expect(result).toEqual({ id: 0, code: "CASH", name: "CASH" });
    consoleSpy.mockRestore();
  });

  it("skips fallback query when no fallbackCode/fallbackName provided", async () => {
    mockExecute.mockResolvedValueOnce([[]]);

    vi.spyOn(console, "warn").mockImplementation(() => {});
    await resolveSystemAccount(1, "CASH");

    // Only 1 call (system_code), no fallback query
    expect(mockExecute).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });
});

describe("insertJournalLine", () => {
  const mockConn = { execute: vi.fn() };

  beforeEach(() => {
    mockConn.execute.mockReset();
  });

  it("inserts into expense_journal_lines by default", async () => {
    mockConn.execute.mockResolvedValueOnce([{ insertId: 1 }]);

    await insertJournalLine(mockConn, {
      tenantId: 1,
      journalEntryId: 100,
      accountId: 5,
      accountCode: "1010",
      accountName: "현금",
      debitAmount: 10000,
      creditAmount: 0,
      sortOrder: 0,
    });

    expect(mockConn.execute).toHaveBeenCalledTimes(1);
    const sql = mockConn.execute.mock.calls[0][0];
    expect(sql).toContain("expense_journal_lines");
    const params = mockConn.execute.mock.calls[0][1];
    expect(params[0]).toBe(1);        // tenantId
    expect(params[1]).toBe(100);      // journalEntryId
    expect(params[2]).toBe(5);        // accountId
    expect(params[5]).toBe(10000);    // debitAmount
    expect(params[6]).toBe(0);        // creditAmount
  });

  it("uses custom table name when specified", async () => {
    mockConn.execute.mockResolvedValueOnce([{ insertId: 1 }]);

    await insertJournalLine(mockConn, {
      tenantId: 1,
      journalEntryId: 100,
      accountId: 5,
      accountCode: "1010",
      accountName: "현금",
      debitAmount: 0,
      creditAmount: 5000,
      sortOrder: 1,
      tableName: "custom_journal_lines",
    });

    const sql = mockConn.execute.mock.calls[0][0];
    expect(sql).toContain("custom_journal_lines");
  });

  it("passes null for optional fields when not provided", async () => {
    mockConn.execute.mockResolvedValueOnce([{ insertId: 1 }]);

    await insertJournalLine(mockConn, {
      tenantId: 1,
      journalEntryId: 100,
      accountId: 5,
      accountCode: "1010",
      accountName: "현금",
      debitAmount: 1000,
      creditAmount: 0,
      sortOrder: 0,
    });

    const params = mockConn.execute.mock.calls[0][1];
    expect(params[7]).toBeNull();  // description
    expect(params[9]).toBeNull();  // bankAccountId
    expect(params[10]).toBeNull(); // partnerId
  });
});
