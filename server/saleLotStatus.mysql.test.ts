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
  let createSale: any;
  let updateSale: any;

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
    // 운영과 같게: 서버는 요청을 받기 전에 필수 스키마를 만든다 (ensureRequiredSchema — 수율 기준 PR B 컬럼 포함)
    const { ensureRequiredSchema } = await import("./db/startupMigrations");
    expect(await ensureRequiredSchema(admin, { allowDdl: true })).toMatchObject({ ok: true, missing: [] });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    ({ postProductSale } = await import("./lib/accounting/productSalePost"));
    ({ applyLotDelta: applyInventoryDelta } = await import("./lib/inventory/applyInventoryDelta"));
    ({ createSale, updateSale } = await import("./db/haccp/haccpIntegration"));
  }, 60000);

  afterAll(async () => {
    await admin?.end();
    const c = await import("./db/connection");
    await (await c.getRawConnection())?.end?.().catch(() => undefined);
  });

  beforeEach(async () => {
    for (const t of ["ar_ledger", "bank_accounts", "h_mf_ingredients", "product_skus", "item_master", "sku_bundles", "h_inventory", "accounting_sales", "h_inventory_lots", "h_inventory_transactions", "expense_journal_entries", "expense_journal_lines", "accounting_accounts", "h_product_outbound", "bundle_lots"]) {
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

  // ── 상태만 되돌린 매출 재확정 차단 (2026-10-16, saleFootprint — 10/14 매출 7건 이중 차감 사고) ──
  it("확정된 매출을 상태만 pending 으로 되돌리고 다시 확정 → 거부, LOT·이동·분개 한 벌 그대로", async () => {
    await insertSale(10536, "2026-10-15", 240, 1444800, 144480);
    await postProductSale(10536, 4);
    await q(`UPDATE accounting_sales SET status = 'pending' WHERE id = 10536`); // bulkRestoreApprovedToPending 이 하던 일
    await expect(postProductSale(10536, 4)).rejects.toThrow(/이미 재고 차감 240·매출 분개 1건 기록이 남아 있습니다/);
    expect(await lot(1834)).toMatchObject({ a: 118 });
    expect(Number((await q(`SELECT COUNT(*) AS n FROM h_inventory_transactions WHERE source_id = 10536`))[0].n)).toBe(1);
    expect((await journal("[매출] SALE-10536 ")).count).toBe(1);
  });

  it("분개 없이 재고만 빠진 매출(7796 유형)도 거부 — 분개만 있는 매출도 거부", async () => {
    await insertSale(7796, "2026-05-27", 10, 10000, 1000);
    await q(`INSERT INTO h_inventory_transactions (tenant_id, lot_id, transaction_type, quantity, unit, transaction_date, reference_type, source_type, source_id, created_by)
      VALUES (?, 1834, 'usage', 10, 'box', '2026-05-27', 'SALE', 'SALE', 7796, 4)`, [T]);
    await expect(postProductSale(7796, 4)).rejects.toThrow(/재고 차감 10 기록/);
    await insertSale(7797, "2026-05-27", 10, 10000, 1000);
    await q(`INSERT INTO expense_journal_entries (tenant_id, entry_date, description, total_debit, total_credit, posted_by) VALUES (?, '2026-05-27', '[매출] SALE-7797 x', 11000, 11000, 4)`, [T]);
    await expect(postProductSale(7797, 4)).rejects.toThrow(/매출 분개 1건/);
    // 비슷한 번호(SALE-77970)·매출원가 전표는 흔적이 아님
    await insertSale(7798, "2026-05-27", 1, 1000, 100);
    await q(`INSERT INTO expense_journal_entries (tenant_id, entry_date, description, total_debit, total_credit, posted_by) VALUES
      (?, '2026-05-27', '[매출] SALE-77980 x', 1, 1, 4), (?, '2026-05-27', '[매출원가] SALE-7798 x', 1, 1, 4)`, [T, T]);
    await postProductSale(7798, 4);
    expect((await q(`SELECT status FROM accounting_sales WHERE id = 7798`))[0].status).toBe("approved");
  });

  it("정식 취소(재고 복원·역분개) 후에는 흔적 0 → 다시 대기·확정 가능, 차감은 한 번만 남음", async () => {
    const { cancelProductSale } = await import("./lib/accounting/productSaleCancel");
    const { getSaleFootprint } = await import("./lib/accounting/saleFootprint");
    await insertSale(10536, "2026-10-15", 240, 1444800, 144480);
    await postProductSale(10536, 4);
    await cancelProductSale(10536, 4, T); // 승인 상태에서 정식 취소 (2026-10-16 — 화면과 같은 조건)
    expect(await lot(1834)).toMatchObject({ a: 358 });
    expect(await getSaleFootprint(admin, T, 10536)).toMatchObject({ netDeducted: 0, postedJournals: 1, reversedJournals: 1, live: false });
    // 원 전표 그대로 상쇄: 매출·매출원가 둘 다
    const net = async (prefix: string) => (await q(`SELECT COALESCE(SUM(l.debit_amount - l.credit_amount), 0) + 0 AS n FROM expense_journal_entries e JOIN expense_journal_lines l ON l.journal_entry_id = e.id WHERE l.account_id = ? AND (e.description LIKE ? OR e.description LIKE ?)`, [prefix === "ar" ? 62 : 29, `[매출%] SALE-10536 %`, `[매출원가%] SALE-10536 %`]))[0].n;
    expect([Number(await net("ar")), Number(await net("cogs"))]).toEqual([0, 0]);
    const ret = await q(`SELECT quantity + 0 AS qty, unit FROM h_inventory_transactions WHERE source_type = 'SALE_CANCEL' AND source_id = 10536`);
    expect(ret.map((r: any) => [Number(r.qty), r.unit])).toEqual([[240, "box"]]);
    await q(`UPDATE accounting_sales SET status = 'pending' WHERE id = 10536`);
    await postProductSale(10536, 4);
    expect(await lot(1834)).toMatchObject({ a: 118 });
  });

  it("매출 취소 상태 조건: 수금 완료 거부, 차감 없는 대기 매출은 분개 없이 취소, 제품 출고 매출은 출고 화면으로", async () => {
    const { cancelProductSale } = await import("./lib/accounting/productSaleCancel");
    await insertSale(10536, "2026-10-15", 240, 1444800, 144480);
    await postProductSale(10536, 4);
    await q(`UPDATE accounting_sales SET status = 'received' WHERE id = 10536`);
    await expect(cancelProductSale(10536, 4, T)).rejects.toThrow(/수금을 먼저 취소/);
    expect(await lot(1834)).toMatchObject({ a: 118 });
    await insertSale(501, "2026-10-15", 1, 1000, 100);
    await cancelProductSale(501, 4, T);
    expect((await q(`SELECT status FROM accounting_sales WHERE id = 501`))[0].status).toBe("cancelled");
    expect(Number((await q(`SELECT COUNT(*) AS n FROM expense_journal_entries WHERE description LIKE '%SALE-501 %'`))[0].n)).toBe(0);
    await insertSale(502, "2026-10-15", 1, 1000, 100);
    await q(`UPDATE accounting_sales SET source_type = 'product_outbound', source_id = 1 WHERE id = 502`);
    await expect(cancelProductSale(502, 4, T)).rejects.toThrow(/제품 출고 화면/);
  });

  it("혼합(번들) 매출 취소: bundle_lots 'sales:<id>' 의 구성품 LOT 을 kg 그대로 복원 (참조 없는 옛 차감 포함), 복원 후 흔적 0", async () => {
    const { cancelProductSale } = await import("./lib/accounting/productSaleCancel");
    const { getSaleFootprint } = await import("./lib/accounting/saleFootprint");
    await q(`INSERT INTO h_inventory_lots (id, tenant_id, product_id, sku_id, lot_number, quantity, current_quantity, available_quantity, unit, unit_price, production_date, status)
      VALUES (950, ?, 70, 300, 'L950', 10, 7.6, 7.6, 'kg', 5000, '2026-10-10', 'available'), (951, ?, 71, 301, 'NEG-951', 0, -0.4, -0.4, 'kg', 0, '2026-10-15', 'available')`, [T, T]);
    await insertSale(600, "2026-10-15", 1, 30000, 3000);
    await q(`UPDATE accounting_sales SET status = 'approved' WHERE id = 600`);
    await q(`INSERT INTO bundle_lots (tenant_id, parent_lot_id, child_lot_id, deducted_qty_kg, notes) VALUES (?, 1834, 950, 2.4, 'sales:600'), (?, 1834, 951, 0.4, 'sales:600'), (?, 1834, 950, 1, 'sales:6000')`, [T, T, T]);
    expect((await getSaleFootprint(admin, T, 600)).live).toBe(true);
    await cancelProductSale(600, 4, T);
    const lots = await q(`SELECT id, available_quantity + 0 AS a, current_quantity + 0 AS c FROM h_inventory_lots WHERE id IN (950, 951) ORDER BY id`);
    expect(lots.map((l: any) => [Number(l.id), Number(l.a), Number(l.c)])).toEqual([[950, 10, 10], [951, 0, 0]]);
    const ret = await q(`SELECT lot_id, quantity + 0 AS qty, unit FROM h_inventory_transactions WHERE source_type = 'SALE_CANCEL' AND source_id = 600 ORDER BY lot_id`);
    expect(ret.map((r: any) => [Number(r.lot_id), Number(r.qty), r.unit])).toEqual([[950, 2.4, "kg"], [951, 0.4, "kg"]]);
    expect((await getSaleFootprint(admin, T, 600)).live).toBe(false);
  });

  it("수금 취소: 원 [수금] 전표 역분개 + AR 상쇄 → 승인 상태, 그다음 매출 취소까지 / [수금] 없는 수금 완료는 거부", async () => {
    const { markSaleReceived } = await import("./lib/accounting/productSaleReceive");
    const { unreceiveSale } = await import("./lib/accounting/productSaleUnreceive");
    const { cancelProductSale } = await import("./lib/accounting/productSaleCancel");
    await q(`DELETE FROM ar_ledger`);
    await q(`INSERT INTO accounting_accounts (id, tenant_id, category, code, system_code, name, is_active) VALUES (80, ?, 'assets', '1010', 'CASH', '현금', 'Y')`, [T]);
    await insertSale(10536, "2026-10-15", 240, 1444800, 144480);
    await q(`UPDATE accounting_sales SET partner_id = 11 WHERE id = 10536`);
    await postProductSale(10536, 4);
    await markSaleReceived(10536, 4, T, { receivedDate: "2026-10-16" });
    expect((await q(`SELECT status FROM accounting_sales WHERE id = 10536`))[0].status).toBe("received");
    const r = await unreceiveSale(10536, 4, T);
    expect(r.alreadyProcessed).toBe(false);
    expect((await q(`SELECT status FROM accounting_sales WHERE id = 10536`))[0].status).toBe("approved");
    const cash = (await q(`SELECT COALESCE(SUM(l.debit_amount - l.credit_amount), 0) + 0 AS n FROM expense_journal_lines l JOIN expense_journal_entries e ON e.id = l.journal_entry_id WHERE l.account_id = 80`))[0].n;
    expect(Number(cash)).toBe(0);
    const ar = (await q(`SELECT SUM(CASE WHEN ar_entry_type IN ('debit','adjust') THEN amount ELSE -amount END) + 0 AS n FROM ar_ledger WHERE ref_id = 10536`))[0].n;
    expect(Number(ar)).toBe(0);
    expect(await unreceiveSale(10536, 4, T)).toEqual({ alreadyProcessed: true });
    await cancelProductSale(10536, 4, T);
    expect(await lot(1834)).toMatchObject({ a: 358 });
    const receivable = (await q(`SELECT COALESCE(SUM(l.debit_amount - l.credit_amount), 0) + 0 AS n FROM expense_journal_lines l WHERE l.account_id = 62`))[0].n;
    expect(Number(receivable)).toBe(0);
    await insertSale(503, "2026-10-15", 1, 1000, 100);
    await q(`UPDATE accounting_sales SET status = 'received' WHERE id = 503`);
    await expect(unreceiveSale(503, 4, T)).rejects.toThrow(/수금 전표를 찾을 수 없어/);
  });

  it("반복 사이클 3회: 취소 → 복구 → 재확정 → 재취소 — 매번 판매분만 복원 (이전: 첫 차감을 다시 복원해 재고가 늘어남, Codex #538 P1)", async () => {
    const { cancelProductSale } = await import("./lib/accounting/productSaleCancel");
    const { getSaleFootprint } = await import("./lib/accounting/saleFootprint");
    await insertSale(10536, "2026-10-15", 240, 1444800, 144480);
    for (let round = 1; round <= 3; round++) {
      await postProductSale(10536, 4);
      expect(await lot(1834)).toMatchObject({ a: 118 });
      await cancelProductSale(10536, 4, T);
      expect(await lot(1834)).toMatchObject({ a: 358, c: 358 });
      const f = await getSaleFootprint(admin, T, 10536);
      expect([f.netDeducted, f.live]).toEqual([0, false]);
      await q(`UPDATE accounting_sales SET status = 'pending' WHERE id = 10536`); // 정식 복구와 같은 결과 (saleRestore 는 흔적 0 이면 허용)
    }
    const ret = await q(`SELECT quantity + 0 AS qty, amount + 0 AS amt FROM h_inventory_transactions WHERE source_type = 'SALE_CANCEL' AND source_id = 10536 ORDER BY id`);
    expect(ret.map((r: any) => Number(r.qty))).toEqual([240, 240, 240]);
    // 원가: 원 차감 단가 4,442.49 × 240
    expect(ret.map((r: any) => Number(r.amt))).toEqual([1066197.6, 1066197.6, 1066197.6]);
  });

  it("회차마다 단가가 다르면 복원 금액도 그 회차 금액 — 수량·금액 순액 모두 0 (Codex #541 재검증 P2)", async () => {
    const { cancelProductSale } = await import("./lib/accounting/productSaleCancel");
    await insertSale(10536, "2026-10-15", 240, 1444800, 144480);
    for (const price of [4442.49, 5000, 3000]) {
      await q(`UPDATE h_inventory_lots SET unit_price = ? WHERE id = 1834`, [price]);
      await postProductSale(10536, 4);
      await cancelProductSale(10536, 4, T);
      await q(`UPDATE accounting_sales SET status = 'pending' WHERE id = 10536`);
    }
    const ret = await q(`SELECT amount + 0 AS amt FROM h_inventory_transactions WHERE source_type = 'SALE_CANCEL' AND source_id = 10536 ORDER BY id`);
    expect(ret.map((r: any) => Number(r.amt))).toEqual([1066197.6, 1200000, 720000]);
    const net = (await q(`SELECT SUM(CASE WHEN transaction_type = 'usage' THEN quantity ELSE -quantity END) + 0 AS qty,
      SUM(CASE WHEN transaction_type = 'usage' THEN amount ELSE -amount END) + 0 AS amt FROM h_inventory_transactions WHERE source_id = 10536 AND source_type IN ('SALE', 'SALE_CANCEL')`))[0];
    expect([Number(net.qty), Number(net.amt)]).toEqual([0, 0]);
    expect(await lot(1834)).toMatchObject({ a: 358 });
  });

  it("혼합 반복 2회 + 옛 거래(매출 참조 없음) 원가: 부모·자식 LOT 로 원 차감 단가 연결, 복원 금액 순액 0 (Codex #538 P1·P2)", async () => {
    const { cancelProductSale } = await import("./lib/accounting/productSaleCancel");
    await q(`INSERT INTO h_inventory_lots (id, tenant_id, product_id, sku_id, lot_number, quantity, current_quantity, available_quantity, unit, unit_price, production_date, status)
      VALUES (950, ?, 70, 300, 'L950', 10, 7.6, 7.6, 'kg', 9999, '2026-10-10', 'available')`, [T]);
    await insertSale(600, "2026-10-15", 1, 30000, 3000);
    // 옛 규약 차감: 거래에 매출 참조 없음, 당시 단가 5,000 (LOT 현재 단가 9,999 와 다름)
    const oldDeduct = async () => {
      await q(`INSERT INTO h_inventory_transactions (tenant_id, lot_id, transaction_type, quantity, unit, transaction_date, source_type, source_id, unit_cost, amount, created_by)
        VALUES (?, 950, 'usage', 2.4, 'kg', '2026-10-15', 'BUNDLE_OUTBOUND', 1834, 5000, 12000, 4)`, [T]);
      await q(`INSERT INTO bundle_lots (tenant_id, parent_lot_id, child_lot_id, deducted_qty_kg, notes) VALUES (?, 1834, 950, 2.4, 'sales:600')`, [T]);
      await q(`UPDATE accounting_sales SET status = 'approved' WHERE id = 600`);
    };
    await oldDeduct();
    await cancelProductSale(600, 4, T);
    expect(Number((await q(`SELECT available_quantity AS a FROM h_inventory_lots WHERE id = 950`))[0].a)).toBe(10);
    // 2회차: 재차감 → 재취소 — 첫 회차 2.4 를 다시 복원하지 않음 (이전: 12.4)
    await q(`UPDATE h_inventory_lots SET available_quantity = 7.6, current_quantity = 7.6 WHERE id = 950`);
    await oldDeduct();
    await cancelProductSale(600, 4, T);
    expect(Number((await q(`SELECT available_quantity AS a FROM h_inventory_lots WHERE id = 950`))[0].a)).toBe(10);
    const ret = await q(`SELECT quantity + 0 AS qty, unit_cost + 0 AS uc, amount + 0 AS amt FROM h_inventory_transactions WHERE source_type = 'SALE_CANCEL' AND source_id = 600 ORDER BY id`);
    expect(ret.map((r: any) => [Number(r.qty), Number(r.uc), Number(r.amt)])).toEqual([[2.4, 5000, 12000], [2.4, 5000, 12000]]);
    const net = (await q(`SELECT SUM(CASE WHEN transaction_type = 'usage' THEN amount ELSE -amount END) + 0 AS n FROM h_inventory_transactions WHERE lot_id = 950`))[0].n;
    expect(Number(net)).toBe(0);
  });

  it("일괄 복구 조건(saleHasFootprintSql): 반쪽 승인만 대상, 확정 흔적 있는 매출·다른 회사 흔적은 구분", async () => {
    const { saleHasFootprintSql } = await import("./lib/accounting/saleFootprint");
    await insertSale(10536, "2026-10-15", 240, 1444800, 144480);
    await postProductSale(10536, 4);
    await insertSale(500, "2026-10-15", 1, 1000, 100);
    await q(`UPDATE accounting_sales SET status = 'approved' WHERE id = 500`); // 반쪽 승인 (흔적 없음)
    await q(`INSERT INTO expense_journal_entries (tenant_id, entry_date, description, total_debit, total_credit, posted_by) VALUES (9, '2026-10-15', '[매출] SALE-500 x', 1, 1, 4)`); // 다른 회사 전표
    const rows = await q(`SELECT s.id, ${saleHasFootprintSql("s")} AS fp FROM accounting_sales s WHERE s.tenant_id = ? AND s.status = 'approved' ORDER BY s.id`, [T]);
    expect(rows.map((r: any) => [Number(r.id), Number(r.fp)])).toEqual([[500, 0], [10536, 1]]);
    await q(`UPDATE accounting_sales s SET s.status = 'pending' WHERE s.status = 'approved' AND s.tenant_id = ? AND NOT ${saleHasFootprintSql("s")}`, [T]);
    expect((await q(`SELECT id, status FROM accounting_sales ORDER BY id`)).map((r: any) => [Number(r.id), r.status])).toEqual([[500, "pending"], [10536, "approved"]]);
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

  // ── 판매 SKU (2026-10-16) ─────────────────────────────────────────────
  // 하늘사랑 1.6kg: item_master #282 (legacy_product_id 90) — SKU208 박스, SKU209 박스.
  // 단일 SKU 제품: item_master #300 (legacy 82) — SKU400 kg.
  const seedSkus = async () => {
    await q(`INSERT INTO item_master (id, tenant_id, item_code, item_name, item_type, legacy_product_id, is_active) VALUES
      (282, ?, 'P90', '하늘사랑 1.6kg', 'own_product', 90, 1), (300, ?, 'P82', '인절미', 'own_product', 82, 1), (900, 9, 'X', '다른 회사', 'own_product', 90, 1)`, [T, T]);
    await q(`INSERT INTO product_skus (id, tenant_id, item_id, sku_code, sku_name, sales_unit, kg_per_sales_unit, is_active, is_default) VALUES
      (208, ?, 282, 'S208', '하늘사랑 1.6kg 박스A', 'box', 1.6, 1, 1), (209, ?, 282, 'S209', '하늘사랑 1.6kg 박스B', 'box', 1.6, 1, 0),
      (400, ?, 300, 'S400', '인절미 kg', 'kg', 1, 1, 1), (999, 9, 900, 'S999', '다른 회사 SKU', 'box', 1, 1, 1)`, [T, T, T]);
  };

  it("판매 SKU 지정: 그 SKU 의 LOT 만 차감 (다른 SKU 의 더 오래된 LOT 은 그대로), 매출에 SKU 기록", async () => {
    await seedSkus();
    await q(`INSERT INTO h_inventory_lots (id, tenant_id, product_id, sku_id, lot_number, quantity, current_quantity, available_quantity, unit, unit_price, production_date, status)
      VALUES (1700, ?, 90, 209, 'L1700', 50, 50, 50, 'box', 4000, '2026-10-01', 'available')`, [T]);
    await insertSale(10600, "2026-10-15", 30, 30000, 3000);
    await q(`UPDATE accounting_sales SET sku_id = 208 WHERE id = 10600`);
    await postProductSale(10600, 4);
    expect(await lot(1700)).toMatchObject({ a: 50, status: "available" });
    expect(await lot(1834)).toMatchObject({ a: 328 });
  });

  it("SKU 가 여럿인 제품을 SKU 없이 확정 → 막힘, 아무것도 바뀌지 않음", async () => {
    await seedSkus();
    await insertSale(10601, "2026-10-15", 10, 10000, 1000);
    await expect(postProductSale(10601, 4)).rejects.toThrow(/SKU 가 2개입니다.*판매 SKU 를 지정/);
    expect(await lot(1834)).toMatchObject({ a: 358 });
    expect((await q(`SELECT status FROM accounting_sales WHERE id = 10601`))[0].status).toBe("pending");
    expect(Number((await q(`SELECT COUNT(*) AS n FROM h_inventory_transactions WHERE source_id = 10601`))[0].n)).toBe(0);
    expect(Number((await q(`SELECT COUNT(*) AS n FROM expense_journal_entries WHERE description LIKE '[매출] SALE-10601 %'`))[0].n)).toBe(0);
  });

  it("SKU 하나뿐인 제품 → 자동, 그 SKU LOT + SKU 없는 같은 단위(kg) 옛 LOT 은 쓰고 다른 단위(box) 옛 LOT 은 안 씀", async () => {
    await seedSkus();
    await q(`INSERT INTO h_inventory_lots (id, tenant_id, product_id, sku_id, lot_number, quantity, current_quantity, available_quantity, unit, unit_price, production_date, status) VALUES
      (2001, ?, 82, NULL, 'L2001', 10, 10, 10, 'kg', 1000, '2026-09-01', 'available'),
      (2002, ?, 82, NULL, 'L2002', 99, 99, 99, 'box', 1000, '2026-08-01', 'available'),
      (2003, ?, 82, 400, 'L2003', 20, 20, 20, 'kg', 1000, '2026-10-10', 'available')`, [T, T, T]);
    await q(`INSERT INTO accounting_sales (id, tenant_id, transaction_date, item_name, product_id, quantity, unit, unit_price, total_amount, tax_amount, tax_rate, status, created_by, accounting_excluded)
      VALUES (10602, ?, '2026-10-15', '인절미', 82, 25, 'kg', 1000, 25000, 2500, 10, 'pending', 4, 0)`, [T]);
    await postProductSale(10602, 4);
    expect(await lot(2001)).toMatchObject({ a: 0, status: "used" });
    expect(await lot(2003)).toMatchObject({ a: 5, status: "available" });
    expect(await lot(2002)).toMatchObject({ a: 99 });
    expect(Number((await q(`SELECT sku_id FROM accounting_sales WHERE id = 10602`))[0].sku_id)).toBe(400);
  });

  it("SKU 부족분 음수: 그 SKU 안에서, LOT 이 없으면 자리표시 LOT 에 SKU·판매단위 기록", async () => {
    await seedSkus();
    await q(`DELETE FROM h_inventory_lots`);
    await insertSale(10603, "2026-10-15", 7, 7000, 700);
    await q(`UPDATE accounting_sales SET sku_id = 209 WHERE id = 10603`);
    await postProductSale(10603, 4);
    const ph = (await q(`SELECT sku_id, unit, available_quantity AS a FROM h_inventory_lots WHERE lot_number LIKE 'NEG-P90-%'`))[0];
    expect([Number(ph.sku_id), ph.unit, Number(ph.a)]).toEqual([209, "box", -7]);
  });

  it("매출 등록: SKU 로 제품·단위 결정, 다른 회사 SKU·제품 불일치는 거부", async () => {
    await seedSkus();
    const r: any = await createSale({ transactionDate: "2026-10-16", partnerId: 1, itemName: "하늘사랑", skuId: 209, quantity: 5, unitPrice: 6020, amount: 30100, taxAmount: 3010, createdBy: 4 }, T);
    const id = Number(r?.insertId ?? r?.id);
    const row = (await q(`SELECT product_id, sku_id, unit FROM accounting_sales WHERE id = ?`, [id]))[0];
    expect([Number(row.product_id), Number(row.sku_id), row.unit]).toEqual([90, 209, "box"]);
    await expect(createSale({ transactionDate: "2026-10-16", partnerId: 1, itemName: "x", skuId: 999, quantity: 1, unitPrice: 1, amount: 1, taxAmount: 0, createdBy: 4 }, T)).rejects.toThrow(/찾을 수 없습니다/);
    await expect(createSale({ transactionDate: "2026-10-16", partnerId: 1, itemName: "x", productId: 82, skuId: 208, quantity: 1, unitPrice: 1, amount: 1, taxAmount: 0, createdBy: 4 }, T)).rejects.toThrow(/제품 #90 의 SKU/);
  });

  it("매출 수정: 상태는 바꿀 수 없음 (유령 승인 차단), 확정된 매출의 SKU 변경 거부, 대기 매출은 SKU 변경 가능", async () => {
    await seedSkus();
    await insertSale(10604, "2026-10-15", 3, 3000, 300);
    await expect(updateSale(10604, { status: "approved" }, T)).rejects.toThrow(/상태는 수정으로 바꿀 수 없습니다/);
    await updateSale(10604, { status: "pending", skuId: 208 }, T);
    expect(Number((await q(`SELECT sku_id FROM accounting_sales WHERE id = 10604`))[0].sku_id)).toBe(208);
    await postProductSale(10604, 4);
    await expect(updateSale(10604, { skuId: 209 }, T)).rejects.toThrow(/확정된 매출의 SKU 는 바꿀 수 없습니다/);
    expect((await q(`SELECT status FROM accounting_sales WHERE id = 10604`))[0].status).toBe("approved");
  });

  it("필수 스키마 관문 (listen 전): sku_id·인덱스가 없으면 만들고 ok, 다시 불러도 그대로 (멱등)", async () => {
    const { ensureRequiredSchema } = await import("./db/startupMigrations");
    await q(`ALTER TABLE accounting_sales DROP COLUMN sku_id`);
    const r1 = await ensureRequiredSchema(admin, { allowDdl: true });
    expect(r1).toEqual({ ok: true, missing: [], warnings: [] });
    const cols = await q(`SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'accounting_sales' AND COLUMN_NAME = 'sku_id'`);
    expect(cols.map((c: any) => c.IS_NULLABLE)).toEqual(["YES"]);
    expect(await ensureRequiredSchema(admin, { allowDdl: true })).toEqual({ ok: true, missing: [], warnings: [] });
    // 검사만(allowDdl=false) — 컬럼이 없으면 ok:false
    await q(`ALTER TABLE accounting_sales DROP COLUMN sku_id`);
    const r2 = await ensureRequiredSchema(admin, { allowDdl: false });
    expect(r2.ok).toBe(false);
    await ensureRequiredSchema(admin, { allowDdl: true }); // 뒷정리
  });

  // ── Codex 운영 DB 점검 P1 (2026-10-16) ─────────────────────────────────
  it("확정은 호출자 회사의 전표만 — 다른 회사(9) 로 부르면 '찾을 수 없음', 아무것도 바뀌지 않음", async () => {
    await insertSale(10700, "2026-10-15", 10, 10000, 1000);
    await expect(postProductSale(10700, 4, 9 as any)).rejects.toThrow(/찾을 수 없습니다/);
    expect((await q(`SELECT status FROM accounting_sales WHERE id = 10700`))[0].status).toBe("pending");
    expect(Number((await q(`SELECT COUNT(*) AS n FROM h_inventory_transactions WHERE source_id = 10700`))[0].n)).toBe(0);
    expect(await lot(1834)).toMatchObject({ a: 358 });
  });

  describe("직접 제품출고 — 한 트랜잭션", () => {
    let createProductOutbound: any;
    beforeAll(async () => {
      ({ createProductOutbound } = await import("./db/production/productOutboundManagement"));
      await q(`DELETE FROM h_product_outbound`);
    });
    beforeEach(async () => { await q(`DELETE FROM h_product_outbound`); });
    const base = { lotId: 1834, productName: "하늘사랑 1.6kg", quantity: 10, unit: "box", unitPrice: 6020, partnerId: 11, releaseDate: "2026-10-16", releaseType: "sale", createdBy: 4 };

    it("출고 취소: LOT 가용·현재 수량 복원, 승인된 연결 매출의 매출·매출원가 전표 역분개 후 매출 취소 — 수금 완료면 거부", async () => {
      const { cancelProductOutbound } = await import("./db/production/productOutboundManagement");
      const r = await createProductOutbound(base, T);
      await postProductSale(r.saleId, 4); // 승인 — 출고가 이미 차감했으므로 원가만
      expect(await lot(1834)).toMatchObject({ a: 348 });
      const je = async () => Number((await q(`SELECT COUNT(*) AS n FROM expense_journal_entries WHERE description LIKE ?`, [`%SALE-${r.saleId} %`]))[0].n);
      const before = await je();
      await q(`UPDATE accounting_sales SET status = 'received' WHERE id = ?`, [r.saleId]);
      await expect(cancelProductOutbound(r.outboundId, 4, T)).rejects.toThrow(/수금을 먼저 취소/);
      await q(`UPDATE accounting_sales SET status = 'approved' WHERE id = ?`, [r.saleId]);
      await cancelProductOutbound(r.outboundId, 4, T);
      expect(await lot(1834)).toMatchObject({ a: 358, c: 358, status: "available" });
      expect(await je()).toBe(before * 2); // 원 전표마다 역분개 1건
      const ar = (await q(`SELECT COALESCE(SUM(l.debit_amount - l.credit_amount), 0) + 0 AS n FROM expense_journal_entries e JOIN expense_journal_lines l ON l.journal_entry_id = e.id WHERE l.account_id = 62 AND e.description LIKE ?`, [`%SALE-${r.saleId} %`]))[0].n;
      expect(Number(ar)).toBe(0);
      expect((await q(`SELECT status FROM accounting_sales WHERE id = ?`, [r.saleId]))[0].status).toBe("cancelled");
      const tx = await q(`SELECT transaction_type, source_id, quantity + 0 AS qty, unit FROM h_inventory_transactions WHERE source_type = 'PRODUCT_OUTBOUND_CANCEL'`);
      expect(tx.map((t: any) => [t.transaction_type, Number(t.source_id), Number(t.qty), t.unit])).toEqual([["return", r.outboundId, 10, "box"]]);
      await expect(cancelProductOutbound(r.outboundId, 4, T)).rejects.toThrow(/이미 취소/);
    });

    it("출고 취소 복원 거래는 원 출고 당시 원가 — LOT 단가가 바뀐 뒤 취소해도 (Codex #538 P2)", async () => {
      const { cancelProductOutbound } = await import("./db/production/productOutboundManagement");
      const r = await createProductOutbound(base, T);
      const orig = (await q(`SELECT unit_cost + 0 AS uc, amount + 0 AS amt FROM h_inventory_transactions WHERE source_type = 'PRODUCT_OUTBOUND' AND source_id = ?`, [r.outboundId]))[0];
      await q(`UPDATE h_inventory_lots SET unit_price = 9999 WHERE id = 1834`);
      await cancelProductOutbound(r.outboundId, 4, T);
      const ret = (await q(`SELECT unit_cost + 0 AS uc, amount + 0 AS amt FROM h_inventory_transactions WHERE source_type = 'PRODUCT_OUTBOUND_CANCEL' AND source_id = ?`, [r.outboundId]))[0];
      expect([Number(ret.uc), Number(ret.amt)]).toEqual([Number(orig.uc), Number(orig.amt)]);
      expect(Number(orig.amt)).toBeGreaterThan(0);
    });

    it("정상: 출고 행(SKU 포함)·원장(출고 번호 연결)·LOT 차감·매출(제품·SKU·세액) 이 함께", async () => {
      const r = await createProductOutbound(base, T);
      expect(await lot(1834)).toMatchObject({ a: 348, status: "available" });
      const ob = (await q(`SELECT sku_id, lot_id, status FROM h_product_outbound WHERE id = ?`, [r.outboundId]))[0];
      expect([Number(ob.sku_id), Number(ob.lot_id), ob.status]).toEqual([208, 1834, "confirmed"]);
      const tx = await q(`SELECT transaction_type, source_type, source_id, quantity FROM h_inventory_transactions WHERE source_type = 'PRODUCT_OUTBOUND'`);
      expect(tx.map((t: any) => [t.transaction_type, Number(t.source_id), Number(t.quantity)])).toEqual([["outbound", r.outboundId, 10]]);
      const sale = (await q(`SELECT product_id, sku_id, total_amount, tax_amount, status, source_type, source_id FROM accounting_sales WHERE id = ?`, [r.saleId]))[0];
      expect([Number(sale.product_id), Number(sale.sku_id), Number(sale.total_amount), Number(sale.tax_amount), sale.status, sale.source_type, Number(sale.source_id)])
        .toEqual([90, 208, 60200, 6020, "pending", "product_outbound", r.outboundId]);
    });

    it("매출 생성이 실패하면(장애 주입) LOT 차감·원장·출고 행 모두 되돌림", async () => {
      await q(`ALTER TABLE accounting_sales DROP COLUMN tax_rate`);
      try {
        await expect(createProductOutbound(base, T)).rejects.toThrow();
      } finally {
        await q(`ALTER TABLE accounting_sales ADD COLUMN tax_rate decimal(5,2) DEFAULT '10.00' AFTER tax_amount`);
      }
      expect(await lot(1834)).toMatchObject({ a: 358 });
      expect(Number((await q(`SELECT COUNT(*) AS n FROM h_product_outbound`))[0].n)).toBe(0);
      expect(Number((await q(`SELECT COUNT(*) AS n FROM h_inventory_transactions WHERE source_type = 'PRODUCT_OUTBOUND'`))[0].n)).toBe(0);
    });

    it("동시 출고 2건(각 200, 가용 358) — LOT 잠금으로 하나만 성공, 음수 없음", async () => {
      const results = await Promise.allSettled([
        createProductOutbound({ ...base, quantity: 200 }, T),
        createProductOutbound({ ...base, quantity: 200 }, T),
      ]);
      expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      expect(String((results.find((x) => x.status === "rejected") as any).reason?.message)).toMatch(/출고 가능 수량 초과/);
      expect(await lot(1834)).toMatchObject({ a: 158 });
      expect(Number((await q(`SELECT COUNT(*) AS n FROM h_product_outbound`))[0].n)).toBe(1);
    });

    it("다른 회사 LOT·원재료 LOT·사용 불가 LOT 은 출고 거부", async () => {
      await expect(createProductOutbound(base, 9)).rejects.toThrow(/찾을 수 없습니다/);
      await q(`INSERT INTO h_inventory_lots (id, tenant_id, material_id, lot_number, quantity, current_quantity, available_quantity, unit, status) VALUES (777, ?, 5, 'L777', 10, 10, 10, 'kg', 'available')`, [T]);
      await expect(createProductOutbound({ ...base, lotId: 777, quantity: 1 }, T)).rejects.toThrow(/제품 LOT 이 아닙니다/);
      await q(`UPDATE h_inventory_lots SET status = 'used' WHERE id = 1834`);
      await expect(createProductOutbound(base, T)).rejects.toThrow(/사용 가능한 LOT 아님/);
    });
  });

  describe("원료 FEFO — 소비기한·사용 불가 상태 제외 (2026-10-16, Codex DB 감사: 기한 지난 LOT 6건 실사용)", () => {
    let allocateLotsFEFO: any;
    let generateExpiredAlerts: (tenantId?: number) => Promise<number>;
    beforeAll(async () => {
      ({ allocateLotsFEFO } = await import("./lib/inventory/fefoLotAllocation"));
      ({ generateExpiredAlerts } = await import("./lib/inventory/expiryAlertGenerator"));
    });
    const matLot = async (id: number, expiry: string | null, avail: number, status = "available", tenant = T) =>
      q(`INSERT INTO h_inventory_lots (id, tenant_id, inventory_id, material_id, lot_number, quantity, current_quantity, available_quantity, unit, unit_price, expiry_date, status)
         VALUES (?, ?, 50, 600, ?, ?, ?, ?, 'kg', 1000, ?, ?)`, [id, tenant, `M${id}`, Math.max(avail, 0), avail, avail, expiry, status]);
    const seed = async () => {
      await matLot(901, "2026-10-10", 30);               // 10/16 기준 기한 경과
      await matLot(902, "2026-10-16", 5);                // 소비기한 당일 — 사용 가능
      await matLot(903, null, 100, "disposed");          // 폐기
      await matLot(904, "2026-12-01", 7, "used");        // 과거 상태 버그로 'used' 지만 재고 있음 — 사용 가능
      await matLot(905, "2026-11-30", 10);
      await matLot(906, "2026-10-01", 3);                // 가장 최근 id 지만 기한 경과 — 음수 자리로도 안 씀
      await matLot(907, null, 50, "reserved");           // 보류
    };

    it("기한 경과·폐기·보류 LOT 은 건너뛰고, 당일 소비기한과 재고 남은 'used' LOT 은 쓴다", async () => {
      await seed();
      const a = await allocateLotsFEFO(50, 20, "kg", T, 600, undefined, { asOfDate: "2026-10-16" });
      expect(a.map((x: any) => [x.lotId, x.quantity])).toEqual([[902, 5], [905, 10], [904, 5]]);
    });

    it("모자라면 음수 자리는 쓸 수 있는 LOT 중 가장 최근 — 기한 경과 LOT #906 의 남은 3kg 을 빼지 않는다", async () => {
      await seed();
      const a = await allocateLotsFEFO(50, 40, "kg", T, 600, undefined, { asOfDate: "2026-10-16", allowNegative: true });
      expect(a.map((x: any) => [x.lotId, x.quantity, !!x.negative])).toEqual([[902, 5, false], [905, 28, true], [904, 7, false]]);
      expect(a.some((x: any) => [901, 903, 906, 907].includes(x.lotId))).toBe(false);
    });

    it("과거 날짜 생산은 그날 기준 — 10/09 생산이면 10/10 기한 #901 은 쓰고, 10/01 기한 #906 은 안 쓴다", async () => {
      await seed();
      const a = await allocateLotsFEFO(50, 31, "kg", T, 600, undefined, { asOfDate: "2026-10-09" });
      expect(a.map((x: any) => [x.lotId, x.quantity])).toEqual([[901, 30], [902, 1]]);
    });

    it("만료 알림: 전 회사 대상, 기한 지남·재고 남음·폐기 아님만, 두 번 돌려도 1건씩", async () => {
      await q(`DELETE FROM h_stock_alerts`);
      await matLot(911, "2020-01-01", 4);                 // 알림
      await matLot(912, "2020-01-01", 0, "used");         // 재고 없음 — 알림 없음
      await matLot(913, "2020-01-01", 9, "disposed");     // 폐기 — 알림 없음
      await matLot(914, "2020-01-01", 2, "expired");      // 만료 상태지만 재고 남음 — 알림
      await matLot(915, "2099-12-31", 5);                 // 기한 전
      await matLot(916, "2020-01-01", 1, "available", 9); // 다른 회사 — 회사 지정 없이 돌면 알림
      expect(await generateExpiredAlerts()).toBe(3);
      expect(await generateExpiredAlerts()).toBe(0);
      const rows = await q(`SELECT lot_id, tenant_id, site_id, alert_type, severity FROM h_stock_alerts ORDER BY lot_id`);
      expect(rows.map((r: any) => [Number(r.lot_id), r.tenant_id, Number(r.site_id), r.alert_type, r.severity])).toEqual([
        [911, T, 0, "expired", "critical"], [914, T, 0, "expired", "critical"], [916, 9, 0, "expired", "critical"],
      ]);
      await q(`DELETE FROM h_stock_alerts`);
      expect(await generateExpiredAlerts(9)).toBe(1);
    });
  });

  describe("매입 등록·확정 — 수불부 한 번, 입고전표는 실제 LOT (2026-10-16, Codex DB 감사: 원료 605·635 이중 가산, 매입 422~427)", () => {
    let createPurchase: any;
    beforeAll(async () => {
      ({ createPurchase } = await import("./db/haccp/haccpIntegration"));
    });
    beforeEach(async () => {
      for (const t of ["accounting_purchases", "h_inbound_headers", "h_inbound_lines", "partners", "h_materials", "material_ledger_daily"]) await q(`DELETE FROM ${t}`);
      await q(`INSERT INTO accounting_accounts (id, tenant_id, category, code, system_code, name, is_active) VALUES
        (70, ?, 'liabilities', '2010', 'ACCOUNTS_PAYABLE', '외상매입금', 'Y'), (71, ?, 'assets', '1350', 'VAT_INPUT', '부가세대급금', 'Y')`, [T, T]);
      await q(`INSERT INTO h_materials (id, tenant_id, material_code, material_name, unit, is_active) VALUES (635, ?, 'M635', '우유(국내산)', 'kg', 1)`, [T]);
    });

    it("우유 6개 × 0.9kg: LOT 5.4kg, 수불부 입고 5.4 (이전 11.4 = 5.4kg + 6개), 입고전표 LOT 번호·재고 수량 = 실제 LOT", async () => {
      const res = await createPurchase({
        transactionDate: "2026-10-12", partnerId: 0, itemName: "우유(국내산)", materialId: 635,
        quantity: 6, packagingSize: 0.9, unit: "개", unitPrice: 3000, amount: 18000, taxAmount: 0, taxRate: 0, createdBy: 4,
      }, T);
      expect(res.posted).toBe(true);
      const lots = await q(`SELECT id, lot_number, quantity + 0 AS q, unit FROM h_inventory_lots WHERE material_id = 635`);
      expect(lots).toHaveLength(1);
      expect([Number(lots[0].q), lots[0].unit]).toEqual([5.4, "kg"]);
      const led = await q(`SELECT receiving_qty + 0 AS r FROM material_ledger_daily WHERE material_id = 635 AND ledger_date = '2026-10-12'`);
      expect(led.map((r: any) => Number(r.r))).toEqual([5.4]);
      const line = (await q(`SELECT lot_number, purchase_quantity + 0 AS pq, purchase_unit, stock_quantity + 0 AS sq, stock_unit FROM h_inbound_lines`))[0];
      expect([line.lot_number, Number(line.pq), line.purchase_unit, Number(line.sq), line.stock_unit]).toEqual([lots[0].lot_number, 6, "개", 5.4, "kg"]);
      // 재고 이동도 한 벌 (등록 receipt 만, 확정은 LOT 재사용)
      expect(Number((await q(`SELECT COUNT(*) AS n FROM h_inventory_transactions WHERE lot_id = ?`, [lots[0].id]))[0].n)).toBe(1);
    });
  });

  describe("매입 취소 — 등록·확정이 남긴 것을 LOT 단위로 되돌림 (2026-10-16, Codex DB 감사: 취소 대칭)", () => {
    let createPurchase: any;
    let cancelPurchase: any;
    beforeAll(async () => {
      ({ createPurchase } = await import("./db/haccp/haccpIntegration"));
      ({ cancelPurchase } = await import("./lib/accounting/purchaseCancel"));
    });
    beforeEach(async () => {
      for (const t of ["accounting_purchases", "h_inbound_headers", "h_inbound_lines", "partners", "h_materials", "material_ledger_daily"]) await q(`DELETE FROM ${t}`);
      await q(`INSERT INTO accounting_accounts (id, tenant_id, category, code, system_code, name, is_active) VALUES
        (70, ?, 'liabilities', '2010', 'ACCOUNTS_PAYABLE', '외상매입금', 'Y'), (71, ?, 'assets', '1350', 'VAT_INPUT', '부가세대급금', 'Y')`, [T, T]);
      await q(`INSERT INTO h_materials (id, tenant_id, material_code, material_name, unit, is_active) VALUES (635, ?, 'M635', '우유(국내산)', 'kg', 1)`, [T]);
    });
    const milk = () => createPurchase({
      transactionDate: "2026-10-12", partnerId: 0, itemName: "우유(국내산)", materialId: 635,
      quantity: 6, packagingSize: 0.9, unit: "개", unitPrice: 3000, amount: 18000, taxAmount: 1800, taxRate: 10, createdBy: 4,
    }, T);
    const purchaseId = async () => Number((await q(`SELECT id FROM accounting_purchases ORDER BY id DESC LIMIT 1`))[0].id);
    const lotOf = async () => {
      const r = (await q(`SELECT available_quantity AS a, status FROM h_inventory_lots WHERE material_id = 635`))[0];
      return { a: Number(r.a), status: r.status };
    };
    const net = async (pid: number) => {
      const r = await q(`SELECT e.description, SUM(l.debit_amount) d, SUM(l.credit_amount) c FROM expense_journal_entries e JOIN expense_journal_lines l ON l.journal_entry_id = e.id
        WHERE e.description LIKE ? OR e.description LIKE ? GROUP BY e.id`, [`[매입] PURCHASE-${pid} %`, `[매입취소] PURCHASE-${pid} %`]);
      return r.map((x: any) => [String(x.description).split(" ")[0], Number(x.d), Number(x.c)]);
    };

    it("승인 매입 취소: LOT 5.4kg 전부(개수 6 아님) 되돌림, 수불부 0, 입고전표 취소, 원 전표 그대로 역분개, 두 번째 취소는 무변경", async () => {
      expect((await milk()).posted).toBe(true);
      const pid = await purchaseId();
      expect((await q(`SELECT status FROM accounting_purchases WHERE id = ?`, [pid]))[0].status).toBe("approved");
      await cancelPurchase(pid, 4, T);
      expect(await lotOf()).toMatchObject({ a: 0, status: "disposed" });
      const tx = await q(`SELECT quantity + 0 AS qty, unit FROM h_inventory_transactions WHERE source_type = 'PURCHASE_CANCEL' AND source_id = ?`, [pid]);
      expect(tx.map((t: any) => [Number(t.qty), t.unit])).toEqual([[5.4, "kg"]]);
      expect(Number((await q(`SELECT receiving_qty + 0 AS r FROM material_ledger_daily WHERE material_id = 635`))[0].r)).toBe(0);
      expect((await q(`SELECT status FROM h_inbound_headers WHERE inbound_number = ?`, [`INB-PURCHASE-${pid}`]))[0].status).toBe("cancelled");
      expect(await net(pid)).toEqual([["[매입]", 19800, 19800], ["[매입취소]", 19800, 19800]]);
      expect(await cancelPurchase(pid, 4, T)).toEqual({ alreadyProcessed: true });
      expect((await net(pid)).length).toBe(2);
    });

    it("확정 실패로 대기인 수기 매입: 등록 때 만든 LOT 은 되돌리고, 없던 분개·수불부는 건드리지 않음", async () => {
      await q(`RENAME TABLE domain_events TO domain_events_off`); // 확정(postPurchase) 실패 재현
      try {
        expect((await milk()).posted).toBe(false);
      } finally {
        await q(`RENAME TABLE domain_events_off TO domain_events`);
      }
      const pid = await purchaseId();
      expect((await q(`SELECT status FROM accounting_purchases WHERE id = ?`, [pid]))[0].status).toBe("pending");
      await cancelPurchase(pid, 4, T);
      expect(Number((await lotOf()).a)).toBe(0);
      expect(await net(pid)).toEqual([]);
      expect(Number((await q(`SELECT COUNT(*) AS n FROM material_ledger_daily`))[0].n)).toBe(0);
      expect((await q(`SELECT status FROM accounting_purchases WHERE id = ?`, [pid]))[0].status).toBe("cancelled");
    });

    it("일부 소비된 LOT 은 취소 거부(무변경), 지급 완료는 거부", async () => {
      await milk();
      const pid = await purchaseId();
      await q(`UPDATE h_inventory_lots SET available_quantity = 2 WHERE material_id = 635`);
      await expect(cancelPurchase(pid, 4, T)).rejects.toThrow(/일부 소비/);
      expect((await q(`SELECT status FROM accounting_purchases WHERE id = ?`, [pid]))[0].status).toBe("approved");
      await q(`UPDATE accounting_purchases SET status = 'paid' WHERE id = ?`, [pid]);
      await expect(cancelPurchase(pid, 4, T)).rejects.toThrow(/지급을 먼저 취소/);
    });
  });

  describe("품목제조보고 원료 저장 — 행 id 유지, 오래된 화면 거부 (2026-10-16, Codex PR #534 배포 검토 P2)", () => {
    let saveVersionIngredients: any;
    let db: any;
    beforeAll(async () => {
      ({ saveVersionIngredients } = await import("./db/production/mfIngredientStore"));
      db = await (await import("./db/connection")).getDb();
    });
    const rows = async () => q(`SELECT id, line_no, material_id, quantity, process_group_id, adjusted_weight_kg + 0 AS adj, is_additional FROM h_mf_ingredients WHERE mf_report_version_id = 464 ORDER BY line_no`);
    beforeEach(async () => {
      await q(`DELETE FROM h_mf_ingredients`);
      await q(`INSERT INTO h_mf_ingredients (id, mf_report_version_id, line_no, material_id, quantity, unit, is_deductible, material_type, process_group_id, adjusted_weight_kg, is_additional) VALUES
        (7142, 464, 1, 645, '43', '%', 1, 'RAW', 1, NULL, 0),
        (7143, 464, 2, 700, '57', '%', 1, 'RAW', NULL, 18.5, 0),
        (7150, 464, 3, 191, '3', 'kg', 0, 'RAW', 1, 3, 1),
        (9001, 999, 1, 645, '100', '%', 1, 'RAW', 4, NULL, 0)`);
    });
    const base = { unit: "%", isDeductible: 1, materialType: "RAW" };

    it("공정 지정을 안 보내도 유지, 행 id 그대로, 두 번 연속 저장해도 유지 (이전: 두 번째 저장에서 옛 id → NULL)", async () => {
      const payload = [{ ...base, id: 7142, materialId: 645, quantity: 44 }, { ...base, id: 7143, materialId: 700, quantity: 56 }, { ...base, id: 7150, materialId: 191, quantity: 3, unit: "kg", isDeductible: 0 }];
      await saveVersionIngredients(db, 464, payload);
      await saveVersionIngredients(db, 464, payload);
      expect((await rows()).map((r: any) => [Number(r.id), r.quantity, r.process_group_id, r.adj == null ? null : Number(r.adj), r.is_additional])).toEqual([
        [7142, "44", 1, null, 0], [7143, "56", null, 18.5, 0], [7150, "3", 1, 3, 1],
      ]);
    });

    it("현재 없는 id(다른 사람이 먼저 저장) 가 있으면 아무것도 바꾸지 않고 거부", async () => {
      await expect(saveVersionIngredients(db, 464, [{ ...base, id: 7142, materialId: 645, quantity: 10 }, { ...base, id: 8001, materialId: 700, quantity: 90 }]))
        .rejects.toThrow(/새로고침 후 다시 저장/);
      expect((await rows()).map((r: any) => [Number(r.id), r.quantity])).toEqual([[7142, "43"], [7143, "57"], [7150, "3"]]);
    });

    it("다른 버전의 id 도 거부 (버전 9001 행을 끌어오지 않음)", async () => {
      await expect(saveVersionIngredients(db, 464, [{ ...base, id: 9001, materialId: 645, quantity: 100 }])).rejects.toThrow(/새로고침/);
      expect(Number((await q(`SELECT process_group_id FROM h_mf_ingredients WHERE id = 9001`))[0].process_group_id)).toBe(4);
    });

    it("보내지 않은 행은 삭제, id 없는 새 행은 추가 (공정 지정 추정 없음), 명시적 null 은 비움", async () => {
      await saveVersionIngredients(db, 464, [
        { ...base, id: 7142, materialId: 645, quantity: 50, processGroupId: null },
        { ...base, materialId: 615, quantity: 50 },
      ]);
      const r = await rows();
      expect(r.map((x: any) => [x.material_id, x.process_group_id, x.line_no])).toEqual([[645, null, 1], [615, null, 2]]);
      expect(Number(r[0].id)).toBe(7142);
      expect(r.some((x: any) => [7143, 7150].includes(Number(x.id)))).toBe(false);
    });
  });

  describe("원물·공정·완제품 기준 — 스키마 추가 + 배치 스냅샷 (2026-10-16, 수율 기준 PR B)", () => {
    let recordBatchMassBasis: any;
    beforeAll(async () => {
      // fixture 는 운영 DDL(새 컬럼 없음) — 바깥 beforeAll 의 ensureRequiredSchema 가 추가했다. 다시 불러도 그대로.
      const { ensureRequiredSchema } = await import("./db/startupMigrations");
      expect(await ensureRequiredSchema(admin, { allowDdl: true })).toMatchObject({ ok: true, missing: [] });
      expect((await q(`SHOW COLUMNS FROM h_mf_ingredients LIKE 'pretreatment_factor'`)).length).toBe(1);
      ({ recordBatchMassBasis } = await import("./db/production/batchMassBasis"));
    });
    beforeEach(async () => {
      for (const t of ["h_mf_reports", "h_mf_report_versions", "h_batch_mass_basis"]) await q(`DELETE FROM ${t}`);
      await q(`INSERT INTO h_mf_reports (id, tenant_id, product_id, report_no, report_date, status) VALUES (373, ?, 38, 'R373', '2026-03-31', 'ACTIVE')`, [T]);
      await q(`INSERT INTO h_mf_report_versions (id, tenant_id, mf_report_id, version_no, effective_from, approval_status, batch_target_kg, reference_finished_kg, mass_basis_enabled)
        VALUES (377, ?, 373, 1, '2026-02-19', 'APPROVED', 100, NULL, 0), (472, ?, 373, 2, '2026-05-08', 'APPROVED', 12.5, 12.5, 1)`, [T, T]);
      await q(`INSERT INTO h_mf_ingredients (mf_report_version_id, line_no, material_id, quantity, unit, is_deductible, material_type, process_group_id, basis_raw_kg, pretreatment_factor) VALUES
        (472, 1, 615, '73.3', '%', 1, 'RAW', 2, 8, 1.25), (472, 2, 701, '9.1', '%', 1, 'RAW', 2, 1, NULL),
        (472, 3, 702, '9.1', '%', 1, 'RAW', 2, 1, NULL), (472, 4, 191, '7.3', '%', 0, 'RAW', NULL, 0.8, NULL),
        (472, 5, 703, '1.2', '%', 1, 'RAW', 2, 0.13, NULL), (377, 1, 615, '69.5', '%', 1, 'RAW', 2, NULL, NULL)`);
    });

    it("우유설기 작업 2판(5kg) 배치: 배치 버전(v2) 기준으로 생멥쌀 3.2 / 공정 4.0 스냅샷, 같은 배치 재호출은 유지", async () => {
      const r = await recordBatchMassBasis(5001, T, 38, 5);
      expect(r.recorded).toBe(true);
      const row = (await q(`SELECT mf_report_version_id, calc_version, reference_finished_kg + 0 AS ref, planned_finished_kg + 0 AS planned, total_raw_kg + 0 AS raw, total_process_kg + 0 AS proc, rows_json FROM h_batch_mass_basis WHERE batch_id = 5001`))[0];
      expect([Number(row.mf_report_version_id), row.calc_version, Number(row.ref), Number(row.planned), Number(row.raw), Number(row.proc)])
        .toEqual([472, "massBasis/1", 12.5, 5, 4.372, 5.172]);
      const rows = typeof row.rows_json === "string" ? JSON.parse(row.rows_json) : row.rows_json;
      const rice = rows.find((x: any) => x.materialId === 615);
      expect([rice.rawKg, rice.processKg, rice.processGroupId]).toEqual([3.2, 4, 2]);
      await q(`UPDATE h_mf_ingredients SET basis_raw_kg = 9 WHERE mf_report_version_id = 472 AND material_id = 615`); // 레시피를 고쳐도
      await recordBatchMassBasis(5001, T, 38, 5);
      expect(Number((await q(`SELECT total_raw_kg + 0 AS raw FROM h_batch_mass_basis WHERE batch_id = 5001`))[0].raw)).toBe(4.372); // 그 배치 스냅샷은 그대로
    });

    it("기준 사용이 꺼진 버전·기준 완제품 없는 버전은 기록하지 않음 (기존 계산 그대로)", async () => {
      await q(`UPDATE h_mf_report_versions SET mass_basis_enabled = 0 WHERE id = 472`);
      expect(await recordBatchMassBasis(5002, T, 38, 5)).toMatchObject({ recorded: false, reason: "disabled" });
      await q(`UPDATE h_mf_report_versions SET mass_basis_enabled = 1, reference_finished_kg = NULL WHERE id = 472`);
      expect((await recordBatchMassBasis(5003, T, 38, 5)).recorded).toBe(false);
      expect(Number((await q(`SELECT COUNT(*) AS n FROM h_batch_mass_basis`))[0].n)).toBe(0);
    });
  });

  describe("대시보드 최근 생산 배치 — 생산일 기준 (2026-10-16, Codex 대시보드 날짜 검토 P2)", () => {
    let getAllBatches: any;
    beforeAll(async () => {
      ({ getAllBatches } = await import("./db/production/batchCRUD"));
    });
    beforeEach(async () => {
      await q(`DELETE FROM h_batches`);
      // 운영 실측과 같은 모양: 10/13·10/14 생산분을 10/15 에 입력, 10/12 생산분은 그보다 먼저 입력
      const rows: Array<[number, string, string]> = [
        [1104, "2026-10-12", "2026-10-13 09:00:00"],
        [1110, "2026-10-13", "2026-10-15 09:20:00"], [1111, "2026-10-13", "2026-10-15 09:20:00"], [1112, "2026-10-13", "2026-10-15 09:20:00"],
        [1113, "2026-10-14", "2026-10-15 09:23:00"], [1114, "2026-10-14", "2026-10-15 09:23:00"], [1115, "2026-10-14", "2026-10-15 09:23:00"],
        [1120, "2026-10-09", "2026-10-16 08:00:00"], // 가장 늦게 입력됐지만 생산일은 가장 이름
      ];
      for (const [id, d, c] of rows) {
        await q(`INSERT INTO h_batches (id, tenant_id, site_id, batch_code, product_id, planned_quantity, planned_date, status, created_by, created_at)
          VALUES (?, ?, 1, ?, 90, 100, ?, 'completed', 4, ?)`, [id, T, `B${id}`, d, c]);
      }
    });

    it("생산일 최신순, 같은 날은 id 최신순, 날짜는 DB DATE 문자열 그대로 (하루 밀림 없음)", async () => {
      const r = await getAllBatches({ tenantId: T, sort: "planned", limit: 6 });
      expect(r.items.map((b: any) => [b.id, b.plannedDateYmd])).toEqual([
        [1115, "2026-10-14"], [1114, "2026-10-14"], [1113, "2026-10-14"], [1112, "2026-10-13"], [1111, "2026-10-13"], [1110, "2026-10-13"],
      ]);
    });

    it("페이지 경계에서도 서버 정렬이 이어짐 — 늦게 입력된 과거 생산일(10/09) 은 맨 뒤", async () => {
      const p1 = await getAllBatches({ tenantId: T, sort: "planned", limit: 3, page: 1 });
      const p2 = await getAllBatches({ tenantId: T, sort: "planned", limit: 3, page: 2 });
      const p3 = await getAllBatches({ tenantId: T, sort: "planned", limit: 3, page: 3 });
      expect([...p1.items, ...p2.items, ...p3.items].map((b: any) => b.id)).toEqual([1115, 1114, 1113, 1112, 1111, 1110, 1104, 1120]);
    });

    it("기본 정렬(입력일 최신순) 은 그대로 — 다른 목록·엑셀 영향 없음", async () => {
      const r = await getAllBatches({ tenantId: T, limit: 1 });
      expect(r.items[0].id).toBe(1120);
    });
  });

  describe("시각 경계 — drizzle 과 raw 연결이 같은 순간을 읽음 (2026-10-16, Codex 대시보드 날짜 검토 #2)", () => {
    it("DB 가 기록한 18:11:35(KST 세션) 를 drizzle·raw 모두 09:11:35Z 로, drizzle 이 쓴 시각도 같은 KST 벽시계로 저장", async () => {
      const { getDb, getRawConnection } = await import("./db/connection");
      const { hStockAlerts, hInventoryLots } = await import("../drizzle/schema/part2");
      const { eq } = await import("drizzle-orm");
      const db: any = await getDb();
      await q(`DELETE FROM h_stock_alerts`);
      // 세션 time_zone 은 +09:00 — 감사·알림처럼 DB 가 기록한 값과 같은 모양
      await q(`SET time_zone = '+09:00'`);
      await q(`INSERT INTO h_stock_alerts (id, tenant_id, site_id, alert_type, message, alert_date, created_at) VALUES (9001, ?, 0, 'expired', 't', '2026-10-16 18:11:35', '2026-10-16 18:11:35')`, [T]);
      const viaDrizzle = (await db.select({ c: hStockAlerts.createdAt }).from(hStockAlerts).where(eq(hStockAlerts.id, 9001)))[0].c as Date;
      expect(viaDrizzle.toISOString()).toBe("2026-10-16T09:11:35.000Z"); // 이전: 18:11:35Z (9시간 미래)
      const raw = await getRawConnection();
      const [rr]: any = await raw.query(`SELECT created_at FROM h_stock_alerts WHERE id = 9001`);
      expect((rr[0].created_at as Date).toISOString()).toBe(viaDrizzle.toISOString()); // 두 경로가 같은 순간
      // drizzle 로 쓰기 — 자정 직전 23:59:30 KST
      await db.update(hStockAlerts).set({ resolvedAt: new Date("2026-10-16T14:59:30Z") }).where(eq(hStockAlerts.id, 9001));
      const [w]: any = await raw.query(`SELECT DATE_FORMAT(resolved_at, '%Y-%m-%d %H:%i:%s') AS kst, DATE(resolved_at) AS d FROM h_stock_alerts WHERE id = 9001`);
      expect(w[0].kst).toBe("2026-10-16 23:59:30"); // 이전: 14:59:30 (9시간 이르게 저장)
      // DB 기본값(NOW) 으로 만든 행 — drizzle 로 읽은 순간이 지금과 같음
      await db.insert(hStockAlerts).values({ id: 9002, tenantId: T, siteId: 0, alertType: "expired", message: "now" } as any);
      const created = (await db.select({ c: hStockAlerts.createdAt }).from(hStockAlerts).where(eq(hStockAlerts.id, 9002)))[0].c as Date;
      expect(Math.abs(created.getTime() - Date.now())).toBeLessThan(60_000);
      // DATE(업무일) 는 변환하지 않음 — 기존 그대로
      await q(`DELETE FROM h_inventory_lots WHERE id = 9101`);
      await q(`INSERT INTO h_inventory_lots (id, tenant_id, lot_number, quantity, available_quantity, unit, expiry_date) VALUES (9101, ?, 'TZ1', 1, 1, 'kg', '2026-10-16')`, [T]);
      const exp = (await db.select({ e: hInventoryLots.expiryDate }).from(hInventoryLots).where(eq(hInventoryLots.id, 9101)))[0].e;
      expect(exp instanceof Date ? exp.toISOString().slice(0, 10) : String(exp).slice(0, 10)).toBe("2026-10-16");
    });
  });
});
