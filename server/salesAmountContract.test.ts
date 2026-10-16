/**
 * 매입·매출 금액 계약 + 중복 확정 방어 (2026-10-15, Codex #524 판매 승인 직전 검증)
 *
 * 재현 (코드 예측, 운영 미실행): #10535 공급가 903,000·세액 90,300 (화면 합계 993,300)
 *   이전 코드 → 외상매출금 903,000 / 매출 812,700 + 부가세 90,300 — 대차는 맞지만 둘 다 세액만큼 적다.
 *   그래서 테스트는 "대차 균형" 이 아니라 외상매출금·매출·부가세를 각각 본다.
 * 고정:
 *   - 확정: 외상매출금 = 합계(공급가 + 세액), 매출 = 공급가, 부가세 = 세액 (매입도 같은 계약)
 *   - 확정·수금된 매출을 다시 확정하면 아무것도 쓰지 않음 (사전 검사 + 잠금 후 재검사)
 *   - 수금·취소는 원 전표 금액 — 계약 이전에 전기된 매출도 정확히 맞물림
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const ACC: Record<string, { id: number; code: string; name: string }> = {
  ACCOUNTS_RECEIVABLE: { id: 62, code: "1030", name: "외상매출금" },
  SALES_REVENUE: { id: 55, code: "4010", name: "제품매출" },
  VAT_OUTPUT: { id: 64, code: "2350", name: "부가세예수금" },
  COST_OF_GOODS: { id: 29, code: "5010", name: "매출원가" },
  INVENTORY_FINISHED: { id: 159, code: "1430", name: "제품" },
  INVENTORY_RAW: { id: 54, code: "1410", name: "원재료" },
  VAT_INPUT: { id: 51, code: "1350", name: "부가세대급금" },
  ACCOUNTS_PAYABLE: { id: 52, code: "2010", name: "미지급금" },
  BANK_DEPOSIT: { id: 50, code: "1020", name: "보통예금" },
  CASH: { id: 49, code: "1010", name: "현금" },
};

const st = vi.hoisted(() => ({
  sale: null as any,
  purchase: null as any,
  lockedStatus: "pending",
  headers: [] as Array<{ id: number; description: string; debit: number; credit: number }>,
  lines: [] as Array<{ journalEntryId: number; accountId: number; debit: number; credit: number; partnerId?: number | null }>,
  writes: [] as string[],
  postedEntries: [] as Array<{ id: number; description: string; lines: any[] }>,
  nextId: 800,
}));

const conn = {
  execute: vi.fn(async (q: string, p: any[] = []) => {
    if (/FROM accounting_sales WHERE id = \? AND tenant_id = \? FOR UPDATE/.test(q) || /SELECT status FROM accounting_sales\s+WHERE id = \? AND tenant_id = \? FOR UPDATE/.test(q)) return [[{ status: st.lockedStatus }]];
    if (/FROM accounting_sales WHERE id = \? AND tenant_id = \? LIMIT 1/.test(q)) return [[st.sale]];
    if (/FROM accounting_purchases\s+WHERE id = \? FOR UPDATE/.test(q)) return [[st.purchase]];
    if (/FROM accounting_sales\s+WHERE id = \? FOR UPDATE/.test(q)) return [[st.sale]];
    if (/FROM item_master im/.test(q)) return [[]];
    if (/FROM h_inventory_lots/.test(q)) return [[]];
    if (/FROM h_inventory_transactions/.test(q)) return [[]];
    if (/FROM bank_accounts/.test(q)) return [[{ id: 7 }]];
    if (/SELECT id FROM expense_journal_entries/.test(q)) {
      const [, exact, like] = p;
      const prefix = String(like).replace(/%$/, "");
      const e = [...st.postedEntries].reverse().find((x) => x.description === exact || x.description.startsWith(prefix));
      return [e ? [{ id: e.id }] : []];
    }
    if (/FROM expense_journal_lines WHERE journal_entry_id = \?/.test(q)) {
      return [st.postedEntries.find((e) => e.id === p[0])?.lines ?? []];
    }
    if (/INSERT INTO expense_journal_entries/.test(q)) {
      const id = ++st.nextId;
      const desc = p.find((x: any) => typeof x === "string" && x.startsWith("["));
      const nums = p.filter((x: any) => typeof x === "number");
      st.headers.push({ id, description: desc, debit: Number(nums[nums.length - 3] ?? nums[0]), credit: Number(nums[nums.length - 2] ?? nums[1]) });
      return [{ insertId: id }];
    }
    if (/^\s*(UPDATE|INSERT|DELETE)/.test(q)) { st.writes.push(q.trim().split("\n")[0]); return [{ affectedRows: 1, insertId: ++st.nextId }]; }
    return [[]];
  }),
};

vi.mock("./db", () => ({
  getDb: vi.fn(async () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([st.sale]) }) }) }),
    execute: vi.fn(async () => [[]]),
  })),
  getRawConnection: vi.fn(async () => conn),
  withTransaction: vi.fn(async (fn: any) => fn(conn)),
}));
// productSaleCancel 은 순환 의존을 피하려 connection 에서 직접 가져온다
vi.mock("./db/connection", () => ({
  getDb: vi.fn(async () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([st.sale]) }) }) }),
    execute: vi.fn(async () => [[]]),
  })),
  getRawConnection: vi.fn(async () => conn),
  withTransaction: vi.fn(async (fn: any) => fn(conn)),
}));
vi.mock("./db/accounting/journalHelper", () => ({
  resolveSystemAccount: vi.fn(async (_t: number, sc: string) => ACC[sc] ?? { id: 0, code: sc, name: sc }),
  insertJournalLine: vi.fn(async (_c: any, l: any) => {
    st.lines.push({ journalEntryId: l.journalEntryId, accountId: l.accountId, debit: Number(l.debitAmount), credit: Number(l.creditAmount), partnerId: l.partnerId });
  }),
  getPaymentSystemAccount: vi.fn(),
  ensureSystemAccounts: vi.fn(),
}));
vi.mock("./lib/inventory/negativeStockPolicy", () => ({ isNegativeStockAllowed: () => true }));

import { postProductSale } from "./lib/accounting/productSalePost";
import { erpPostSale } from "./lib/accounting/erpSalePost";
import { erpPostPurchase } from "./lib/accounting/erpPurchasePost";
import { markSaleReceived } from "./lib/accounting/productSaleReceive";
import { cancelProductSale } from "./lib/accounting/productSaleCancel";
import { documentAmounts } from "./lib/accounting/amountContract";

const SALE_10535 = {
  id: 10535, tenantId: 2, tenant_id: 2, status: "pending", transactionDate: "2026-10-08", transaction_date: "2026-10-08",
  productId: null, materialId: null, quantity: 150, unit: "box", itemName: "하늘사랑 1.6kg", item_name: "하늘사랑 1.6kg",
  totalAmount: "903000.00", total_amount: "903000.00", taxAmount: "90300.00", tax_amount: "90300.00",
  accountingExcluded: 0, accounting_excluded: 0, partnerId: 11, partner_id: 11,
};
const linesOf = (desc: RegExp) => {
  const h = st.headers.find((x) => desc.test(x.description))!;
  const ls = st.lines.filter((l) => l.journalEntryId === h.id);
  const amt = (acc: string, side: "debit" | "credit") => ls.filter((l) => l.accountId === ACC[acc].id).reduce((a, l) => a + l[side], 0);
  return { h, ls, amt };
};

beforeEach(() => {
  st.sale = { ...SALE_10535 }; st.purchase = null; st.lockedStatus = "pending";
  st.headers = []; st.lines = []; st.writes = []; st.postedEntries = []; st.nextId = 800;
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("금액 계약", () => {
  it("total_amount = 공급가, 합계 = 공급가 + 세액", () => {
    expect(documentAmounts({ totalAmount: "903000.00", taxAmount: "90300.00" })).toEqual({ supply: 903000, tax: 90300, gross: 993300 });
    expect(documentAmounts({ totalAmount: 95460, taxAmount: 9540 })).toEqual({ supply: 95460, tax: 9540, gross: 105000 });
    expect(documentAmounts({ totalAmount: null, taxAmount: undefined })).toEqual({ supply: 0, tax: 0, gross: 0 });
  });
});

describe("매출 확정 — 외상매출금·매출·부가세를 각각", () => {
  it("#10535: 외상매출금 993,300 / 매출 903,000 + 부가세 90,300 (이전 903,000 / 812,700 + 90,300)", async () => {
    await postProductSale(10535, 4);
    const { h, amt } = linesOf(/^\[매출\] SALE-10535 /);
    expect(amt("ACCOUNTS_RECEIVABLE", "debit")).toBe(993300);
    expect(amt("SALES_REVENUE", "credit")).toBe(903000);
    expect(amt("VAT_OUTPUT", "credit")).toBe(90300);
    expect([h.debit, h.credit]).toEqual([993300, 993300]);
  });
  it("#10536: 외상매출금 1,589,280 / 매출 1,444,800 + 부가세 144,480", async () => {
    st.sale = { ...SALE_10535, id: 10536, totalAmount: "1444800.00", taxAmount: "144480.00", transactionDate: "2026-10-15" };
    await postProductSale(10536, 4);
    const { amt } = linesOf(/^\[매출\] SALE-10536 /);
    expect([amt("ACCOUNTS_RECEIVABLE", "debit"), amt("SALES_REVENUE", "credit"), amt("VAT_OUTPUT", "credit")]).toEqual([1589280, 1444800, 144480]);
  });
  it("ERP 전용 확정도 같은 계약, 전표 설명에 SALE-<id> (수금·취소가 원 전표를 찾도록)", async () => {
    await erpPostSale(10535, 4);
    const { amt } = linesOf(/^\[매출\] SALE-10535 /);
    expect([amt("ACCOUNTS_RECEIVABLE", "debit"), amt("SALES_REVENUE", "credit"), amt("VAT_OUTPUT", "credit")]).toEqual([993300, 903000, 90300]);
  });
  it("매입 (ERP 확정): 원재료 공급가 + 부가세대급금 / 외상매입금 합계", async () => {
    st.purchase = { id: 77, tenant_id: 2, item_name: "찹쌀", status: "pending", total_amount: "100000.00", tax_amount: "10000.00", partner_id: 3, transaction_date: "2026-10-15" };
    await erpPostPurchase(77, 4);
    const { amt } = linesOf(/^\[매입\] PURCHASE-77 /);
    expect([amt("INVENTORY_RAW", "debit"), amt("VAT_INPUT", "debit"), amt("ACCOUNTS_PAYABLE", "credit")]).toEqual([100000, 10000, 110000]);
  });
});

describe("중복 확정 방어", () => {
  for (const status of ["approved", "received"]) {
    it(`이미 ${status} 인 매출 → 아무것도 쓰지 않음 (재고·분개·상태)`, async () => {
      st.sale = { ...SALE_10535, status };
      expect(await postProductSale(10535, 4)).toEqual({ alreadyProcessed: true });
      expect(st.headers).toEqual([]);
      expect(st.writes).toEqual([]);
    });
  }
  it("동시 요청: 사전 조회는 pending 이었지만 잠근 뒤 approved → 쓰기 0", async () => {
    st.lockedStatus = "approved";
    expect(await postProductSale(10535, 4)).toEqual({ alreadyProcessed: true });
    expect(st.headers).toEqual([]);
    expect(st.writes).toEqual([]);
  });
  it("두 번 연속 확정 → 분개 한 벌", async () => {
    await postProductSale(10535, 4);
    st.sale = { ...SALE_10535, status: "approved" }; st.lockedStatus = "approved";
    await postProductSale(10535, 4);
    expect(st.headers.filter((h) => /^\[매출\] SALE-10535/.test(h.description))).toHaveLength(1);
  });
  it("확정 상태 갱신은 pending 일 때만 (WHERE status = 'pending')", async () => {
    await postProductSale(10535, 4);
    expect(st.writes.some((w) => /UPDATE accounting_sales/.test(w))).toBe(true);
    const src = (await import("node:fs")).readFileSync((await import("node:path")).join(__dirname, "lib/accounting/productSalePost.ts"), "utf-8");
    expect(src).toContain("WHERE id = ? AND tenant_id = ? AND status = 'pending'`");
  });
  it("ERP 확정도 approved·received 면 쓰기 0, 취소된 건 거부", async () => {
    st.sale = { ...SALE_10535, status: "received" };
    expect(await erpPostSale(10535, 4)).toMatchObject({ alreadyPosted: true });
    st.sale = { ...SALE_10535, status: "cancelled" };
    await expect(erpPostSale(10535, 4)).rejects.toThrow(/확정할 수 없는 상태/);
    expect(st.headers).toEqual([]);
  });
});

describe("수금·취소 — 원 전표 금액", () => {
  const legacyPosted = () => ({
    // 계약 이전에 전기된 매출: 외상매출금 903,000 / 매출 812,700 + 부가세 90,300
    id: 700, description: "[매출] SALE-10535 하늘사랑 1.6kg",
    lines: [
      { account_id: 62, account_code: "1030", account_name: "외상매출금", debit_amount: "903000.00", credit_amount: "0.00", partner_id: 11, description: null },
      { account_id: 55, account_code: "4010", account_name: "제품매출", debit_amount: "0.00", credit_amount: "812700.00", partner_id: null, description: null },
      { account_id: 64, account_code: "2350", account_name: "부가세예수금", debit_amount: "0.00", credit_amount: "90300.00", partner_id: null, description: null },
    ],
  });
  it("수금: 새 계약 전표면 합계 993,300 회수", async () => {
    st.sale = { ...SALE_10535, status: "approved" }; st.lockedStatus = "approved";
    st.postedEntries = [{ id: 701, description: "[매출] SALE-10535 하늘사랑 1.6kg", lines: [
      { account_id: 62, account_code: "1030", account_name: "외상매출금", debit_amount: "993300.00", credit_amount: "0.00", partner_id: 11, description: null },
    ] }];
    await markSaleReceived(10535, 4, 2);
    const { amt } = linesOf(/^\[수금\] SALE-10535/);
    expect([amt("BANK_DEPOSIT", "debit"), amt("ACCOUNTS_RECEIVABLE", "credit")]).toEqual([993300, 993300]);
  });
  it("수금: 계약 이전 전표면 그 전표의 외상매출금 903,000 만 회수 (과다 회수 없음)", async () => {
    st.sale = { ...SALE_10535, status: "approved" }; st.lockedStatus = "approved";
    st.postedEntries = [legacyPosted()];
    await markSaleReceived(10535, 4, 2);
    expect(linesOf(/^\[수금\] SALE-10535/).amt("ACCOUNTS_RECEIVABLE", "credit")).toBe(903000);
  });
  it("수금: 원 전표를 SALE-1053 이 SALE-10535 로 착각하지 않음 → 합계로", async () => {
    st.sale = { ...SALE_10535, id: 1053, status: "approved" }; st.lockedStatus = "approved";
    st.postedEntries = [legacyPosted()];
    await markSaleReceived(1053, 4, 2);
    expect(linesOf(/^\[수금\] SALE-1053/).amt("ACCOUNTS_RECEIVABLE", "credit")).toBe(993300);
  });
  it("취소: 계약 이전 전표를 그대로 뒤집음 (매출 812,700 + 부가세 90,300 / 외상매출금 903,000)", async () => {
    st.sale = { ...SALE_10535, status: "approved" }; st.lockedStatus = "approved"; // 2026-10-16: 취소는 대기·승인 (수금 완료는 거부)
    st.postedEntries = [legacyPosted()];
    await cancelProductSale(10535, 4, 2);
    const { h, amt } = linesOf(/^\[매출취소\] SALE-10535/);
    expect([amt("SALES_REVENUE", "debit"), amt("VAT_OUTPUT", "debit"), amt("ACCOUNTS_RECEIVABLE", "credit")]).toEqual([812700, 90300, 903000]);
    expect([h.debit, h.credit]).toEqual([903000, 903000]);
  });
  it("취소: 원 전표가 없으면 역분개를 만들지 않음 (2026-10-16 — 없던 매출을 음수로 만들지 않는다)", async () => {
    st.sale = { ...SALE_10535, status: "approved" }; st.lockedStatus = "approved";
    await cancelProductSale(10535, 4, 2);
    expect(st.headers.filter((h: any) => /^\[매출취소\] SALE-10535/.test(h.description))).toEqual([]);
  });
  it("취소: 수금 완료는 거부 (수금 먼저 취소)", async () => {
    st.sale = { ...SALE_10535, status: "received" }; st.lockedStatus = "received";
    await expect(cancelProductSale(10535, 4, 2)).rejects.toThrow(/수금을 먼저 취소/);
  });
});

describe("나머지 경로 — 소스 고정", () => {
  const read = async (p: string) => (await import("node:fs")).readFileSync((await import("node:path")).join(__dirname, p), "utf-8");
  it("HACCP 매입 확정: 외상매입금 = 합계, 원재료 = 공급가", async () => {
    const src = await read("lib/accounting/purchasePost.ts");
    expect(src).toContain("const { supply: supplyAmount, tax: taxAmount, gross: grossAmount } = documentAmounts(purchase);");
    expect(src).toMatch(/payableAcc\.name,\s+debitAmount: 0, creditAmount: grossAmount,/);
    expect(src).not.toMatch(/totalAmount - taxAmount/);
  });
  it("매입 취소·매입 복구·반복 거래도 같은 계약 (total − tax 로 공급가를 만들지 않음)", async () => {
    for (const p of ["lib/accounting/purchaseCancel.ts", "lib/consistency/recovery.ts", "lib/accounting/productSaleCancel.ts", "lib/accounting/erpSalePost.ts", "lib/accounting/erpPurchasePost.ts"]) {
      expect(await read(p), p).not.toMatch(/totalAmount - taxAmount|total_amount\) - |Math\.max\(0, totalAmount - taxAmount\)/);
    }
    const cancel = await read("lib/accounting/purchaseCancel.ts");
    expect(cancel).toContain("findPostedEntryLines(conn, tenantId, `[매입] ${docId}`)");
    const recurring = await read("routers/accounting/recurringTransaction.router.ts");
    expect(recurring).toContain("const totalAmount = Number(t.amount);");
  });
});
