/**
 * journalHelper 단위 테스트
 * DB 호출은 vi.mock으로 모킹
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock getRawConnection before importing the module
const mockExecute = vi.fn();
const mockConnection = { execute: mockExecute };

vi.mock("../connection", () => ({
  getRawConnection: vi.fn(() => Promise.resolve(mockConnection)),
}));

import { resolveSystemAccount, getPaymentSystemAccount, insertJournalLine, ensureSystemAccounts } from "./journalHelper";

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
  /** 계정표를 흉내 내는 가짜 DB — 실제 SQL 의 조건(역할·분류·코드·이름 정확 일치)을 그대로 적용 */
  type Acc = { id: number; tenant_id: number; code: string; name: string; category: string; system_code: string | null };
  const useAccounts = (accounts: Acc[]) => {
    mockExecute.mockReset();
    mockExecute.mockImplementation(async (sql: string, params: any[]) => {
      const active = accounts.filter((a) => a.tenant_id === params[0]);
      if (!/system_code IS NULL/.test(sql)) return [active.filter((a) => a.system_code === params[1]).slice(0, 1)];
      const hasCat = /category = \?/.test(sql);
      const [, sc, ...rest] = params;
      const cat = hasCat ? rest[0] : undefined;
      const value = rest[rest.length - 1];
      const field = /AND code = \?/.test(sql) ? "code" : "name";
      return [active.filter((a) => (!a.system_code || a.system_code === sc) && (!hasCat || a.category === cat) && a[field] === value).slice(0, 2)];
    });
  };
  // 단지(테넌트 2) 실제 계정표 일부 — 제품(1430) 계정 없음, '제품매출' 만 있음
  const DANJI: Acc[] = [
    { id: 54, tenant_id: 2, code: "1410", name: "원재료", category: "assets", system_code: "INVENTORY_RAW" },
    { id: 55, tenant_id: 2, code: "4010", name: "제품매출", category: "revenue", system_code: "SALES_REVENUE" },
    { id: 63, tenant_id: 2, code: "1420", name: "상품", category: "assets", system_code: "INVENTORY_GOODS" },
    { id: 29, tenant_id: 2, code: "5010", name: "급여", category: "expenses", system_code: "COST_OF_GOODS" },
  ];
  beforeEach(() => { vi.spyOn(console, "warn").mockImplementation(() => {}); });

  it("역할(system_code)로 찾으면 그 계정", async () => {
    useAccounts(DANJI);
    expect(await resolveSystemAccount(2, "INVENTORY_RAW", "1410", "원재료")).toEqual({ id: 54, code: "1410", name: "원재료" });
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("제품 계정이 없고 '제품매출' 만 있으면 — 제품매출을 고르지 않고 id=0 (사고 재현: 단지 생산완료 751~754)", async () => {
    useAccounts(DANJI);
    const r = await resolveSystemAccount(2, "INVENTORY_FINISHED", "1430", "제품");
    expect(r.id).toBe(0);
    expect(r).toEqual({ id: 0, code: "1430", name: "제품" });
  });

  it("이름 폴백은 정확 일치만 — 같은 분류·역할 없는 '제품' 계정이면 채택", async () => {
    useAccounts([...DANJI, { id: 90, tenant_id: 2, code: "1435", name: "제품", category: "assets", system_code: null }]);
    expect(await resolveSystemAccount(2, "INVENTORY_FINISHED", "1430", "제품")).toEqual({ id: 90, code: "1435", name: "제품" });
  });

  it("코드가 같아도 분류가 다르면 거부 (1430 이 수익 계정)", async () => {
    useAccounts([...DANJI, { id: 91, tenant_id: 2, code: "1430", name: "기타", category: "revenue", system_code: null }]);
    expect((await resolveSystemAccount(2, "INVENTORY_FINISHED", "1430", "제품")).id).toBe(0);
  });

  it("다른 역할이 붙은 계정은 폴백으로 고르지 않음", async () => {
    useAccounts([{ id: 92, tenant_id: 2, code: "1430", name: "제품", category: "assets", system_code: "WIP" }]);
    expect((await resolveSystemAccount(2, "INVENTORY_FINISHED", "1430", "제품")).id).toBe(0);
  });

  it("역할이 붙어 있어도 분류가 다르면 거부", async () => {
    useAccounts([{ id: 93, tenant_id: 2, code: "4010", name: "제품매출", category: "revenue", system_code: "INVENTORY_FINISHED" }]);
    expect((await resolveSystemAccount(2, "INVENTORY_FINISHED", "1430", "제품")).id).toBe(0);
  });

  it("같은 이름이 여러 개면 고르지 않음", async () => {
    useAccounts([
      { id: 94, tenant_id: 2, code: "1431", name: "제품", category: "assets", system_code: null },
      { id: 95, tenant_id: 2, code: "1432", name: "제품", category: "assets", system_code: null },
    ]);
    expect((await resolveSystemAccount(2, "INVENTORY_FINISHED", undefined, "제품")).id).toBe(0);
  });

  it("다른 회사 계정은 보지 않음", async () => {
    useAccounts([{ id: 96, tenant_id: 1, code: "1430", name: "제품", category: "assets", system_code: "INVENTORY_FINISHED" }]);
    expect((await resolveSystemAccount(2, "INVENTORY_FINISHED", "1430", "제품")).id).toBe(0);
  });

  it("폴백 없이 못 찾으면 역할 이름으로 id=0", async () => {
    useAccounts([]);
    expect(await resolveSystemAccount(1, "CASH")).toEqual({ id: 0, code: "CASH", name: "CASH" });
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });
});

describe("ensureSystemAccounts — 코드가 같아도 분류가 다른 계정은 채택하지 않음", () => {
  it("계정이 없으면 제품(1430, 자산) 신설", async () => {
    mockExecute.mockReset();
    mockExecute.mockResolvedValue([[]]);
    await ensureSystemAccounts(2, 1);
    const ins = mockExecute.mock.calls.find(([q, p]) => /INSERT INTO accounting_accounts/.test(q) && p[4] === "INVENTORY_FINISHED")!;
    expect(ins[1].slice(1, 4)).toEqual(["assets", "1430", "제품"]);
  });
  it("같은 코드 계정이 있으면 분류가 같을 때만 채택 (UPDATE 에 category 조건·값)", async () => {
    mockExecute.mockReset();
    mockExecute.mockImplementation(async (q: string) => {
      if (/system_code = \? LIMIT 1/.test(q)) return [[]];
      if (/UPDATE accounting_accounts SET system_code/.test(q)) return [{ affectedRows: 0 }];
      return [[{ id: 1 }]]; // 코드 이미 사용 중
    });
    await ensureSystemAccounts(2, 1);
    const adopt = mockExecute.mock.calls.filter(([q]) => /UPDATE accounting_accounts SET system_code/.test(q));
    expect(adopt.length).toBeGreaterThan(10);
    for (const [q] of adopt) expect(q).toMatch(/AND category = \?/);
    const fin = adopt.find(([, p]) => p[0] === "INVENTORY_FINISHED")!;
    expect(fin[1]).toEqual(["INVENTORY_FINISHED", 2, "1430", "assets"]);
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
