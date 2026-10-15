/**
 * 판매 LOT 시점 조건 (2026-10-15, Codex #523 판매 사전 점검)
 *
 * 재현 (운영 읽기 전용 예측): 매출 #10535 (10/08, 하늘사랑 1.6kg 150박스) 를 제품 90 에 연결해 승인하면
 *   FEFO 가 10/14 생산 LOT #1834 (358박스) 에서 150 을 뺀다 — 판매일에 존재하지 않던 재고.
 *   음수 재고 자리(sink)도 날짜 제한 없이 가장 최근 LOT 을 골랐다.
 * 고정: 판매일 이전(포함) LOT 만 차감. 모자라면 기존 음수 정책 그대로 — 판매일 기준 가장 최근 LOT 에 음수,
 *   그런 LOT 도 없으면 판매일 날짜 자리표시 LOT.
 *
 * 가짜 DB 는 SQL 에 날짜 조건(`<= ?`)이 있을 때만 날짜로 거른다 — 코드에서 조건을 빼면 이 테스트가 실패한다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Lot = { id: number; product_id: number; production_date: string | null; receipt_date: string | null; created_at: string; available_quantity: number; current_quantity: number; quantity: number; unit_price: number; status: string; lot_number?: string };
const st = vi.hoisted(() => ({
  sale: null as any,
  lots: [] as any[],
  txs: [] as Array<{ lot_id: number; quantity: number; transaction_date: string; notes: string }>,
  nextId: 5000,
}));

const lotDate = (l: Lot) => l.production_date ?? l.receipt_date ?? l.created_at.slice(0, 10);
const hasDateBound = (q: string) => /COALESCE\(production_date, receipt_date, DATE\(created_at\)\) <= \?/.test(q);

const exec = vi.fn(async (q: string, p: any[] = []) => {
  if (/FROM accounting_sales WHERE id = \? AND tenant_id = \? FOR UPDATE/.test(q)) return [[{ status: st.sale.status }]];
  if (/FROM item_master im/.test(q)) return [[]]; // 혼합(번들) 아님
  if (/FROM h_inventory_lots/.test(q) && /available_quantity > 0\.001/.test(q)) {
    const [, pid] = p;
    const day = hasDateBound(q) ? p[2] : null;
    return [st.lots.filter((l) => l.product_id === pid && l.status === "available" && l.available_quantity > 0.001 && (!day || lotDate(l) <= day))
      .sort((a, b) => lotDate(a).localeCompare(lotDate(b)) || a.id - b.id).map((l) => ({ ...l }))];
  }
  if (/FROM h_inventory_lots/.test(q) && /LIMIT 1/.test(q) && /DESC, id DESC/.test(q)) {
    const [, pid] = p;
    const day = hasDateBound(q) ? p[2] : null;
    const c = st.lots.filter((l) => l.product_id === pid && (!day || lotDate(l) <= day))
      .sort((a, b) => lotDate(b).localeCompare(lotDate(a)) || b.id - a.id);
    return [c.slice(0, 1).map((l) => ({ id: l.id, unit_price: l.unit_price }))];
  }
  if (/UPDATE h_inventory_lots/.test(q)) {
    const qty = p[0];
    const id = p[p.length - 2]; // ... WHERE id = ? AND tenant_id = ?
    const l = st.lots.find((x) => x.id === id)!;
    l.available_quantity = /GREATEST/.test(q) ? Math.max(0, l.available_quantity - qty) : l.available_quantity - qty;
    return [{ affectedRows: 1 }];
  }
  if (/INSERT INTO h_inventory_lots/.test(q)) {
    const id = ++st.nextId;
    // (tenant_id, product_id, sku_id, lot_number, unit, production_date) — 2026-10-16 sku_id 추가
    st.lots.push({ id, product_id: p[1], lot_number: p[3], production_date: p[5], receipt_date: null, created_at: "2026-10-15 19:00:00", available_quantity: 0, current_quantity: 0, quantity: 0, unit_price: 0, status: "available" });
    return [{ insertId: id }];
  }
  if (/INSERT INTO h_inventory_transactions/.test(q)) {
    st.txs.push({ lot_id: p[1], quantity: Number(p[2]), transaction_date: p[4], notes: String(p[8] ?? "") });
    return [{ insertId: ++st.nextId }];
  }
  if (/INSERT INTO expense_journal_entries/.test(q)) return [{ insertId: ++st.nextId }];
  return [{ affectedRows: 1, insertId: ++st.nextId }];
});

vi.mock("./db", () => ({
  getDb: vi.fn(async () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [st.sale] }) }) }),
    execute: vi.fn(async () => [[]]),
  })),
  withTransaction: vi.fn(async (fn: any) => fn({ execute: exec })),
}));
vi.mock("./db/accounting/journalHelper", () => ({
  resolveSystemAccount: vi.fn(async (_t: number, sc: string) => ({ id: 1, code: sc, name: sc })),
  insertJournalLine: vi.fn(async () => undefined),
}));
vi.mock("./lib/inventory/negativeStockPolicy", () => ({ isNegativeStockAllowed: () => true }));

import { postProductSale } from "./lib/accounting/productSalePost";
import { lotDateExpr, lotAvailableOnSql } from "./lib/inventory/lotChronology";
import { REPO_ROOT } from "./__helpers__/appRoutes";

const lot = (id: number, production_date: string | null, available: number, unit_price = 4442.49, extra: Partial<Lot> = {}): Lot => ({
  id, product_id: 90, production_date, receipt_date: null, created_at: `${production_date ?? "2026-10-01"} 09:00:00`,
  available_quantity: available, current_quantity: available, quantity: Math.max(available, 0), unit_price,
  status: available > 0.001 ? "available" : "used", ...extra,
});
const sale = (id: number, date: string, qty: number) => ({
  id, tenantId: 2, status: "pending", transactionDate: date, productId: 90, materialId: null, quantity: qty,
  unit: "개", itemName: "하늘사랑 1.6kg", totalAmount: 903000, taxAmount: 90300, accountingExcluded: 0,
});

beforeEach(() => {
  st.lots = []; st.txs = []; st.nextId = 5000;
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("판매는 판매일에 있던 LOT 만 차감", () => {
  it("#10535 (10/08, 150박스): 10/14 생산 LOT #1834 를 건드리지 않고, 10/08 기준 가장 최근 LOT 에 음수", async () => {
    st.lots = [lot(1700, "2026-10-01", 0, 4000), lot(1834, "2026-10-14", 358)];
    st.sale = sale(10535, "2026-10-08", 150);
    await postProductSale(10535, 4);
    expect(st.lots.find((l) => l.id === 1834)!.available_quantity).toBe(358);
    expect(st.lots.find((l) => l.id === 1700)!.available_quantity).toBe(-150);
    expect(st.txs).toEqual([{ lot_id: 1700, quantity: 150, transaction_date: "2026-10-08", notes: expect.stringMatching(/음수 차감/) }]);
  });

  it("#10536 (10/15, 240박스): 10/14 LOT #1834 에서 정상 차감", async () => {
    st.lots = [lot(1834, "2026-10-14", 358)];
    st.sale = sale(10536, "2026-10-15", 240);
    await postProductSale(10536, 4);
    expect(st.lots[0].available_quantity).toBe(118);
    expect(st.txs.map((t) => [t.lot_id, t.quantity])).toEqual([[1834, 240]]);
  });

  it("같은 날 생산 LOT 은 쓸 수 있음 (날짜 포함), 판매일 이전 LOT 부터 FEFO", async () => {
    st.lots = [lot(1801, "2026-10-12", 50), lot(1834, "2026-10-14", 358), lot(1840, "2026-10-15", 100)];
    st.sale = sale(1, "2026-10-14", 80);
    await postProductSale(1, 4);
    expect(st.txs.map((t) => [t.lot_id, t.quantity])).toEqual([[1801, 50], [1834, 30]]);
    expect(st.lots.find((l) => l.id === 1840)!.available_quantity).toBe(100);
  });

  it("판매일 이전 LOT 이 하나도 없으면 판매일 날짜 자리표시 LOT 에 음수 (뒤에 생긴 LOT 을 쓰지 않음)", async () => {
    st.lots = [lot(1834, "2026-10-14", 358)];
    st.sale = sale(2, "2026-10-08", 20);
    await postProductSale(2, 4);
    expect(st.lots.find((l) => l.id === 1834)!.available_quantity).toBe(358);
    const placeholder = st.lots.find((l) => String(l.lot_number ?? "").startsWith("NEG-P90-20261008-"))!;
    expect(placeholder.production_date).toBe("2026-10-08");
    expect(placeholder.available_quantity).toBe(-20);
  });

  it("생산일 없는 LOT 은 입고일 → 생성일로 판단 — 판매일 뒤 입고 LOT 은 모자라도 쓰지 않음", async () => {
    st.lots = [lot(1, null, 10, 100, { receipt_date: "2026-10-20" }), lot(2, null, 3, 100, { created_at: "2026-10-05 08:00:00" })];
    st.sale = sale(3, "2026-10-08", 5);
    await postProductSale(3, 4);
    // 생성일 10/05 LOT 에서 3, 부족 2 는 같은 LOT 에 음수 — 10/20 입고 LOT 은 그대로
    expect(st.txs.map((t) => [t.lot_id, t.quantity])).toEqual([[2, 3], [2, 2]]);
    expect(st.lots.find((l) => l.id === 1)!.available_quantity).toBe(10);
  });
});

describe("조건 모양", () => {
  it("LOT 날짜 = 생산일 → 입고일 → 생성일", () => {
    expect(lotDateExpr()).toBe("COALESCE(production_date, receipt_date, DATE(created_at))");
    expect(lotAvailableOnSql("l")).toBe("COALESCE(l.production_date, l.receipt_date, DATE(l.created_at)) <= ?");
  });
  it("혼합(번들) 분해 차감도 FEFO·음수 자리 모두 출고일 조건 (출고일 바인딩 위치 포함)", () => {
    const src = readFileSync(join(REPO_ROOT, "server/lib/production/decomposeBundleOutbound.ts"), "utf-8");
    expect(src.match(/AND \$\{lotAvailableOnSql\(\)\}/g)?.length).toBe(2);
    expect(src).toContain("[tenantId, childSkuId, childProductId ?? -1, outboundDate, childSkuId]");
    expect(src).toContain("[tenantId, childSkuId, childProductId ?? -1, outboundDate],");
  });
  it("판매 취소는 차감했던 LOT 그대로 되돌림 (날짜로 새로 고르지 않음)", () => {
    const src = readFileSync(join(REPO_ROOT, "server/lib/accounting/productSaleCancel.ts"), "utf-8");
    expect(src).not.toMatch(/lotAvailableOnSql|ORDER BY[^`]*expiry_date/);
  });
});
