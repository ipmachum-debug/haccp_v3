/**
 * 실 MySQL 8 통합 테스트 — LOT 차감 상태 판정 + 판매 확정 금액 (2026-10-16, Codex #525 승인 전 검증)
 *
 * 사고 (읽기 전용 예측): MySQL 단일 테이블 UPDATE 는 SET 의 앞 식에서 바꾼 값을 뒤 식이 읽는다.
 *   `available_quantity = GREATEST(0, available_quantity - ?), status = CASE WHEN GREATEST(0, available_quantity - ?) …`
 *   → LOT #1834 358 − 240 = 118 남는데 status 식은 118 − 240 으로 다시 빼서 'used' (이후 FEFO 에서 사라짐).
 *   가짜 DB 테스트는 이 엔진 동작을 모르므로 통과했다 → 이 테스트는 실제 MySQL 에서 돈다.
 *
 * 실행: MYSQL_IT_URL=mysql://user:pw@127.0.0.1:33306/haccp_it npx vitest run server/saleLotStatus.mysql.test.ts
 *   (운영 DB 로 실행 금지 — 테이블을 지우고 다시 만든다. URL 이 없으면 건너뜀)
 *   스키마: server/__fixtures__/mysql/saleLotSchema.sql (운영 백업의 DDL 만, 데이터 없음)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import mysql from "mysql2/promise";

const URL_ = process.env.MYSQL_IT_URL;
const T = 2;

describe.skipIf(!URL_)("실 MySQL — 판매 확정 LOT 상태·금액", () => {
  let admin: mysql.Connection;
  let postProductSale: (saleId: number, userId: number) => Promise<{ alreadyProcessed: boolean }>;
  let applyInventoryDelta: any;

  const q = async (sql: string, p: any[] = []) => (await admin.query(sql, p))[0] as any[];
  const num = (v: unknown) => (v == null ? null : Number(v));
  const lot = async (id: number) => {
    const r = (await q(`SELECT available_quantity AS a, current_quantity AS c, quantity AS q, status FROM h_inventory_lots WHERE id = ?`, [id]))[0];
    return { a: num(r.a), c: num(r.c), q: num(r.q), status: r.status };
  };

  beforeAll(async () => {
    if (/haccpone|49\.50\.130\.101/.test(URL_!)) throw new Error("운영 DB 로 실행 금지");
    process.env.DATABASE_URL = URL_;
    process.env.INVENTORY_ALLOW_NEGATIVE = "true";
    admin = await mysql.createConnection({ uri: URL_, multipleStatements: true });
    const [ver]: any = await admin.query("SELECT VERSION() AS v");
    expect(String(ver[0].v)).toMatch(/^8\.0\./);
    await admin.query(`SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'`);
    await admin.query(readFileSync(join(__dirname, "__fixtures__/mysql/saleLotSchema.sql"), "utf-8"));
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    ({ postProductSale } = await import("./lib/accounting/productSalePost"));
    ({ applyLotDelta: applyInventoryDelta } = await import("./lib/inventory/applyInventoryDelta"));
  }, 60000);

  afterAll(async () => {
    await admin?.end();
    const c = await import("./db/connection");
    await (await c.getRawConnection())?.end?.().catch(() => undefined);
  });

  beforeEach(async () => {
    for (const t of ["h_inventory", "accounting_sales", "h_inventory_lots", "h_inventory_transactions", "expense_journal_entries", "expense_journal_lines", "accounting_accounts", "h_product_outbound", "bundle_lots"]) {
      await q(`DELETE FROM ${t}`);
    }
    // 단지 시스템 계정 (보정 후 상태)
    await q(`INSERT INTO accounting_accounts (id, tenant_id, category, code, system_code, name, is_active) VALUES
      (62, ?, 'assets', '1030', 'ACCOUNTS_RECEIVABLE', '외상매출금', 'Y'),
      (55, ?, 'revenue', '4010', 'SALES_REVENUE', '제품매출', 'Y'),
      (64, ?, 'liabilities', '2350', 'VAT_OUTPUT', '부가세예수금', 'Y'),
      (29, ?, 'expenses', '5010', 'COST_OF_GOODS', '매출원가', 'Y'),
      (159, ?, 'assets', '1430', 'INVENTORY_FINISHED', '제품', 'Y'),
      (54, ?, 'assets', '1410', 'INVENTORY_RAW', '원재료', 'Y')`, [T, T, T, T, T, T]);
    // LOT #1834 (10/14 생산, SKU208 358박스, 단가 4,442.49) · #1588 (9/8, −951, 단가 0)
    await q(`INSERT INTO h_inventory_lots (id, tenant_id, product_id, sku_id, lot_number, quantity, current_quantity, available_quantity, unit, unit_price, production_date, status)
      VALUES (1834, ?, 90, 208, 'L1834', 358, NULL, 358, 'box', 4442.49, '2026-10-14', 'available'),
             (1588, ?, 90, 208, 'L1588', 0, -951, -951, 'box', 0, '2026-09-08', 'available')`, [T, T]);
  });

  const insertSale = async (id: number, date: string, qty: number, supply: number, tax: number) => {
    await q(`INSERT INTO accounting_sales (id, tenant_id, transaction_date, item_name, product_id, quantity, unit, unit_price, total_amount, tax_amount, tax_rate, status, created_by, accounting_excluded)
      VALUES (?, ?, ?, '하늘사랑 1.6kg', 90, ?, 'box', ?, ?, ?, 10, 'pending', 4, 0)`, [id, T, date, qty, supply / qty, supply, tax]);
  };
  const journal = async (prefix: string) => {
    const e = (await q(`SELECT id, total_debit+0 AS d, total_credit+0 AS c FROM expense_journal_entries WHERE tenant_id = ? AND description LIKE ?`, [T, `${prefix}%`]));
    const lines = e.length ? await q(`SELECT account_id, debit_amount+0 AS d, credit_amount+0 AS c FROM expense_journal_lines WHERE journal_entry_id = ?`, [e[0].id]) : [];
    const amt = (acc: number, side: "d" | "c") => lines.filter((l: any) => Number(l.account_id) === acc).reduce((a: number, l: any) => a + Number(l[side]), 0);
    return { count: e.length, header: e[0], amt };
  };

  it("엔진 동작 확인 — 이전 식은 118 남아도 'used', 고친 식은 'available'", async () => {
    await q(`UPDATE h_inventory_lots SET available_quantity = GREATEST(0, available_quantity - ?), status = CASE WHEN GREATEST(0, available_quantity - ?) <= 0.001 THEN 'used' ELSE status END WHERE id = 1834`, [240, 240]);
    expect(await lot(1834)).toMatchObject({ a: 118, status: "used" }); // 재현
    await q(`UPDATE h_inventory_lots SET available_quantity = 358, status = 'available' WHERE id = 1834`);
    await q(`UPDATE h_inventory_lots SET available_quantity = GREATEST(0, available_quantity - ?), status = CASE WHEN available_quantity <= 0.001 THEN 'used' ELSE status END WHERE id = 1834`, [240]);
    expect(await lot(1834)).toMatchObject({ a: 118, status: "available" });
  });

  it("#10536 (10/15, 240박스): LOT #1834 118·available, 판매 이동 1건, 외상매출금 1,589,280 / 매출 1,444,800 + 부가세 144,480, 매출원가 1,066,198", async () => {
    await insertSale(10536, "2026-10-15", 240, 1444800, 144480);
    await postProductSale(10536, 4);
    expect(await lot(1834)).toMatchObject({ a: 118, c: 118, status: "available" });
    const moves = await q(`SELECT lot_id, quantity AS q, transaction_type FROM h_inventory_transactions WHERE source_id = 10536`);
    expect(moves.map((m: any) => [Number(m.lot_id), Number(m.q), m.transaction_type])).toEqual([[1834, 240, "usage"]]);
    const s = await journal("[매출] SALE-10536 ");
    expect([s.count, s.amt(62, "d"), s.amt(55, "c"), s.amt(64, "c")]).toEqual([1, 1589280, 1444800, 144480]);
    expect([Number(s.header.d), Number(s.header.c)]).toEqual([1589280, 1589280]);
    const c = await journal("[매출원가] SALE-10536 ");
    expect([c.amt(29, "d"), c.amt(159, "c")]).toEqual([1066198, 1066198]);
    expect((await q(`SELECT status FROM accounting_sales WHERE id = 10536`))[0].status).toBe("approved");
  });

  it("이어서 #10535 (10/08, 150박스): #1834 그대로 118, #1588 −951 → −1,101, 10/08 이동, 금액 993,300 / 903,000 + 90,300, 매출원가 없음", async () => {
    await insertSale(10536, "2026-10-15", 240, 1444800, 144480);
    await postProductSale(10536, 4);
    await insertSale(10535, "2026-10-08", 150, 903000, 90300);
    await postProductSale(10535, 4);
    expect(await lot(1834)).toMatchObject({ a: 118, status: "available" });
    expect(await lot(1588)).toMatchObject({ a: -1101, c: -1101 });
    const moves = await q(`SELECT lot_id, quantity AS q, DATE_FORMAT(transaction_date, '%Y-%m-%d') AS d FROM h_inventory_transactions WHERE source_id = 10535`);
    expect(moves.map((m: any) => [Number(m.lot_id), Number(m.q), m.d])).toEqual([[1588, 150, "2026-10-08"]]);
    const s = await journal("[매출] SALE-10535 ");
    expect([s.amt(62, "d"), s.amt(55, "c"), s.amt(64, "c")]).toEqual([993300, 903000, 90300]);
    expect((await journal("[매출원가] SALE-10535 ")).count).toBe(0);
  });

  it("다시 확정 → 아무것도 바뀌지 않음 (이동·분개 한 벌)", async () => {
    await insertSale(10536, "2026-10-15", 240, 1444800, 144480);
    await postProductSale(10536, 4);
    expect(await postProductSale(10536, 4)).toEqual({ alreadyProcessed: true });
    expect(await lot(1834)).toMatchObject({ a: 118, status: "available" });
    expect(Number((await q(`SELECT COUNT(*) AS n FROM h_inventory_transactions WHERE source_id = 10536`))[0].n)).toBe(1);
    expect((await journal("[매출] SALE-10536 ")).count).toBe(1);
  });

  it("전량 판매 358 → 0 'used', 경계 0.0005 남음 → 'used', 0.5 남음 → 'available'", async () => {
    await insertSale(1, "2026-10-15", 358, 358000, 35800);
    await postProductSale(1, 4);
    expect(await lot(1834)).toMatchObject({ a: 0, status: "used" });
    await q(`UPDATE h_inventory_lots SET available_quantity = 10, status = 'available' WHERE id = 1834`);
    await insertSale(2, "2026-10-15", 9.9995, 9999, 0);
    await postProductSale(2, 4);
    expect(await lot(1834)).toMatchObject({ status: "used" });
    await q(`UPDATE h_inventory_lots SET available_quantity = 10, status = 'available' WHERE id = 1834`);
    await insertSale(3, "2026-10-15", 9.5, 9500, 0);
    await postProductSale(3, 4);
    expect(await lot(1834)).toMatchObject({ a: 0.5, status: "available" });
  });

  it("공통 재고 이동 (applyInventoryDelta): 부분 차감 남으면 available, current NULL 이어도 한 번만 빠짐, 증가도 한 번", async () => {
    await q(`INSERT INTO h_inventory_lots (id, tenant_id, product_id, lot_number, quantity, current_quantity, available_quantity, unit, status) VALUES (900, ?, 90, 'L900', 100, NULL, 100, 'box', 'available')`, [T]);
    const conn = await (await import("./db/connection")).getRawConnection();
    const c = await (conn as any).getConnection();
    try {
      await c.beginTransaction();
      await applyInventoryDelta(c, { tenantId: T, lotId: 900, subject: { productId: 90 }, direction: "decrease", quantity: 30, transactionType: "usage", unit: "box", createdBy: 4, transactionDate: "2026-10-15" });
      await applyInventoryDelta(c, { tenantId: T, lotId: 900, subject: { productId: 90 }, direction: "increase", quantity: 5, transactionType: "return", unit: "box", createdBy: 4, transactionDate: "2026-10-15" });
      await c.commit();
    } finally { c.release(); }
    // 100 − 30 + 5 = 75 (current_quantity NULL 에서 시작해도 두 번 빠지거나 더해지지 않음)
    expect(await lot(900)).toMatchObject({ q: 75, a: 75, c: 75, status: "available" });
  });

  it("매입 취소 SQL (purchaseCancel 원문 그대로): 일부 취소로 남으면 'disposed' 아님, 전부 취소면 'disposed'", async () => {
    const src = readFileSync(join(__dirname, "lib/accounting/purchaseCancel.ts"), "utf-8");
    const m = src.match(/`(UPDATE h_inventory_lots\s+SET available_quantity = GREATEST\(0, available_quantity - \?\)[\s\S]*?WHERE id = \? AND tenant_id = \?)`/);
    expect(m).toBeTruthy();
    await q(`INSERT INTO h_inventory_lots (id, tenant_id, material_id, lot_number, quantity, current_quantity, available_quantity, unit, status) VALUES (700, ?, 5, 'L700', 100, 100, 100, 'kg', 'available')`, [T]);
    await q(m![1], [30, 30, 700, T]);
    expect(await lot(700)).toMatchObject({ a: 70, c: 70, status: "available" });
    await q(m![1], [70, 70, 700, T]);
    expect(await lot(700)).toMatchObject({ a: 0, status: "disposed" });
  });
});
