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

  it("S1·S2·S3 (Codex #564 검증): 재고 출고 → 매출전표 자동 생성 중단(두 경로·일괄, 동시 요청), 남은 inventory_usage 매출은 확정 거부 — LOT 재차감 없음", async () => {
    const hi = await import("./db/haccp/haccpIntegration");
    const hai = await import("./db/haccp/haccpAccountingIntegration");
    const base = { itemName: "하늘사랑 1.6kg", quantity: "5", unit: "box", unitPrice: "12000", partnerId: 1, createdBy: 4 };
    const rs = await Promise.allSettled([1, 2, 3].map(() => hi.createSaleFromUsage({ ...base, inventoryTransactionId: 77001 }, T)));
    expect(rs.map((r) => r.status)).toEqual(["rejected", "rejected", "rejected"]);
    expect(String((rs[0] as any).reason?.message)).toMatch(/제품 출고/);
    await expect(hi.createSaleFromUsage({ ...base }, T)).rejects.toThrow(/제품 출고/);
    expect(await hai.createSaleFromUsage(T, 77001)).toMatchObject({ skipped: true, reason: "usage_sale_disabled" });
    expect((await hai.batchCreateAccountingTransactions(T)).sales).toMatchObject({ created: 0, errors: 0 });
    expect(Number((await q(`SELECT COUNT(*) AS n FROM accounting_sales`))[0].n)).toBe(0);
    // 예전에 만들어진 구형 매출 — 확정하면 출고한 LOT 이 다시 빠진다 → 거부, 재고·분개·상태 그대로
    await q(`INSERT INTO accounting_sales (id, tenant_id, transaction_date, item_name, product_id, quantity, unit, unit_price, total_amount, tax_amount, tax_rate, status, created_by, accounting_excluded, source_type, source_id)
      VALUES (10600, ?, '2026-10-12', '하늘사랑 1.6kg', 90, 5, 'box', 12000, 60000, 6000, 10, 'pending', 4, 0, 'inventory_usage', 77001)`, [T]);
    const { dispatchPostSale } = await import("./lib/accounting/postDispatcher");
    await expect(dispatchPostSale(10600, 4, T)).rejects.toThrow(/재고 출고 화면에서 자동 생성된 매출/);
    expect(await lot(1834)).toMatchObject({ a: 358, status: "available" });
    expect(Number((await q(`SELECT COUNT(*) AS n FROM h_inventory_transactions`))[0].n)).toBe(0);
    expect(Number((await q(`SELECT COUNT(*) AS n FROM expense_journal_entries`))[0].n)).toBe(0);
    expect((await q(`SELECT status FROM accounting_sales WHERE id = 10600`))[0].status).toBe("pending");
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
      for (const t of ["h_mf_reports", "h_mf_report_versions", "h_batch_mass_basis", "tenant_feature_settings"]) await q(`DELETE FROM ${t}`);
      await q(`INSERT INTO tenant_feature_settings (tenant_id, feature_code, enabled) VALUES (?, 'PRODUCTION_MASS_BASIS', 1)`, [T]); // 회사 선택
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

  describe("원물·공정 기준 연결 — 배치 투입 계획·CCP 투입량 (2026-10-16, 수율 기준 PR C)", () => {
    let createBatch: any;
    beforeAll(async () => {
      ({ createBatch } = await import("./db/production/batchCRUD"));
    });
    beforeEach(async () => {
      for (const t of ["h_mf_reports", "h_mf_report_versions", "h_mf_ingredients", "h_batch_mass_basis", "h_batches", "h_batch_inputs", "item_master", "h_materials", "tenant_feature_settings"]) await q(`DELETE FROM ${t}`);
      await q(`INSERT INTO tenant_feature_settings (tenant_id, feature_code, enabled) VALUES (?, 'PRODUCTION_MASS_BASIS', 1)`, [T]); // 회사 선택
      await q(`INSERT INTO item_master (id, tenant_id, item_code, item_name, item_type, base_unit, is_active) VALUES
        (168, ?, 'M168', '멥쌀(국내산)', 'raw_material', 'kg', 1), (191, ?, 'M191', '정제수', 'raw_material', 'kg', 1),
        (177, ?, 'M177', '설탕', 'raw_material', 'kg', 1), (188, ?, 'M188', '우유(국내산)', 'raw_material', 'kg', 1),
        (199, ?, 'M199', '천일염', 'raw_material', 'kg', 1)`, [T, T, T, T, T]);
      await q(`INSERT INTO h_mf_reports (id, tenant_id, product_id, report_no, report_date, status, report_type) VALUES (373, ?, 38, 'R373', '2026-03-31', 'ACTIVE', 'BASIC')`, [T]);
      await q(`INSERT INTO h_mf_report_versions (id, tenant_id, mf_report_id, version_no, effective_from, approval_status, batch_target_kg, reference_finished_kg, mass_basis_enabled)
        VALUES (472, ?, 373, 2, '2026-05-08', 'APPROVED', 5, 12.5, 1)`, [T]);
      // 운영 저장값 그대로 (Codex 확인 2026-10-16): 정제수도 차감·공정 2
      await q(`INSERT INTO h_mf_ingredients (id, mf_report_version_id, line_no, material_id, quantity, unit, is_deductible, material_type, process_group_id, basis_raw_kg, pretreatment_factor) VALUES
        (6852, 472, 1, 168, '73.3', '%', 1, 'RAW', 2, 8, 1.25), (6853, 472, 2, 191, '7.3', '%', 1, 'RAW', 2, 0.8, NULL),
        (6854, 472, 3, 177, '9.1', '%', 1, 'RAW', 2, 1, NULL), (6855, 472, 4, 188, '9.1', '%', 1, 'RAW', 2, 1, NULL),
        (6856, 472, 5, 199, '1.2', '%', 1, 'RAW', 2, 0.13, NULL)`);
    });
    const newBatch = (kg: string, code: string) => createBatch({ siteId: 1, productId: 38, batchCode: code, plannedQuantity: kg, plannedDate: new Date("2026-10-17T00:00:00+09:00"), createdBy: 4, tenantId: T });
    const inputs = async (bid: number) => (await q(`SELECT material_id, planned_quantity + 0 AS pq FROM h_batch_inputs WHERE batch_id = ? ORDER BY material_id`, [bid])).map((r: any) => [Number(r.material_id), Number(r.pq)]);

    it("기준을 켠 우유설기 2판(5kg): 원료 투입 계획 = 원물 kg (생멥쌀 3.2 — 배합비 73.3% × 5 = 3.665 아님), 스냅샷 함께 고정", async () => {
      const bid = await newBatch("5", "MILK-5");
      expect(await inputs(bid)).toEqual([[168, 3.2], [177, 0.4], [188, 0.4], [191, 0.32], [199, 0.052]]);
      expect(Number((await q(`SELECT COUNT(*) AS n FROM h_batch_mass_basis WHERE batch_id = ?`, [bid]))[0].n)).toBe(1);
    });

    it("계획량에 비례 (12.5kg = 준비 5판 → 생멥쌀 8)", async () => {
      const bid = await newBatch("12.5", "MILK-125");
      expect((await inputs(bid)).find((r: any) => r[0] === 168)).toEqual([168, 8]);
    });

    it("기준을 끈 버전은 기존 계산 그대로 (배합비 % × 계획량), 스냅샷 없음", async () => {
      await q(`UPDATE h_mf_report_versions SET mass_basis_enabled = 0 WHERE id = 472`);
      const bid = await newBatch("5", "MILK-OFF");
      expect((await inputs(bid)).find((r: any) => r[0] === 168)).toEqual([168, 3.665]);
      expect(Number((await q(`SELECT COUNT(*) AS n FROM h_batch_mass_basis WHERE batch_id = ?`, [bid]))[0].n)).toBe(0);
    });

    // ── 회사 선택 (2026-10-16 — 수율 환산은 공통 표준이 아니라 테넌트가 고르는 방식) ──
    it("회사가 선택하지 않으면 버전이 켜져 있어도 기존 계산 (배합비 % × 계획량), 스냅샷 없음", async () => {
      await q(`DELETE FROM tenant_feature_settings`);
      const bid = await newBatch("5", "MILK-TENANT-OFF");
      expect((await inputs(bid)).find((r: any) => r[0] === 168)).toEqual([168, 3.665]);
      expect(Number((await q(`SELECT COUNT(*) AS n FROM h_batch_mass_basis`))[0].n)).toBe(0);
      const { setTenantFeature, isTenantFeatureEnabled, MASS_BASIS_FEATURE } = await import("./lib/production/massBasisPolicy");
      await setTenantFeature(admin, T, MASS_BASIS_FEATURE, true, 4);
      expect(await isTenantFeatureEnabled(admin, T, MASS_BASIS_FEATURE)).toBe(true);
      expect(await isTenantFeatureEnabled(admin, T + 1, MASS_BASIS_FEATURE)).toBe(false); // 다른 회사는 그대로
    });

    it("회사 설정 표를 읽을 수 없으면(표 없음) 배치를 만들지 않음 — 꺼짐으로 보고 3.665 로 만들지 않음 (Codex #547 P1)", async () => {
      await q(`RENAME TABLE tenant_feature_settings TO _tenant_feature_settings_off`);
      try {
        await expect(newBatch("5", "MILK-FEATURE-ERR")).rejects.toThrow(/사용 여부를 확인할 수 없습니다/);
        expect(Number((await q(`SELECT COUNT(*) AS n FROM h_batches`))[0].n)).toBe(0);
        expect(Number((await q(`SELECT COUNT(*) AS n FROM h_batch_inputs`))[0].n)).toBe(0);
        const { ensureRequiredSchema } = await import("./db/startupMigrations");
        const r = await ensureRequiredSchema(admin, { allowDdl: false });
        expect(r.ok).toBe(false);
        expect(r.missing.some((m: string) => m.startsWith("tenant_feature_settings."))).toBe(true);
      } finally {
        await q(`RENAME TABLE _tenant_feature_settings_off TO tenant_feature_settings`);
      }
    });

    // ── Codex #546 배포 검토 P1-1: 켜진 버전의 계산 실패를 기존 계산으로 덮지 않는다 ──
    const batchCount = async () => Number((await q(`SELECT COUNT(*) AS n FROM h_batches`))[0].n);
    const leftovers = async () => [
      await batchCount(),
      Number((await q(`SELECT COUNT(*) AS n FROM h_batch_inputs`))[0].n),
      Number((await q(`SELECT COUNT(*) AS n FROM h_batch_mass_basis`))[0].n),
    ];
    it("기준 원물 kg 누락(% 행인데 기준 원물 합계 없음) → 배치를 만들지 않음 (3.665 로 과다 차감하지 않음)", async () => {
      await q(`UPDATE h_mf_ingredients SET basis_raw_kg = NULL WHERE id = 6854`);
      await expect(newBatch("5", "MILK-MISSING")).rejects.toThrow(/수율 환산/);
      expect(await leftovers()).toEqual([0, 0, 0]);
    });

    it("원료 기본 단위가 kg/g 이 아니면(EA) → 스냅샷까지 만든 뒤라도 배치·투입·스냅샷 모두 되돌림", async () => {
      await q(`UPDATE item_master SET base_unit = 'EA' WHERE id = 177`);
      await expect(newBatch("5", "MILK-UNIT")).rejects.toThrow(/단위/);
      expect(await leftovers()).toEqual([0, 0, 0]);
    });

    it("g 단위 원료는 g 로 (설탕 0.4kg → 400g)", async () => {
      await q(`UPDATE item_master SET base_unit = 'g' WHERE id = 177`);
      const bid = await newBatch("5", "MILK-G");
      const r = (await q(`SELECT planned_quantity + 0 AS pq, unit FROM h_batch_inputs WHERE batch_id = ? AND material_id = 177`, [bid]))[0];
      expect([Number(r.pq), r.unit]).toEqual([400, "g"]);
    });

    it("스냅샷 저장 자체가 실패하면 배치·투입 남기지 않음", async () => {
      await q(`RENAME TABLE h_batch_mass_basis TO _h_batch_mass_basis_off`);
      try {
        await expect(newBatch("5", "MILK-SNAPFAIL")).rejects.toThrow();
        expect(await batchCount()).toBe(0);
        expect(Number((await q(`SELECT COUNT(*) AS n FROM h_batch_inputs`))[0].n)).toBe(0);
      } finally {
        await q(`RENAME TABLE _h_batch_mass_basis_off TO h_batch_mass_basis`);
      }
    });

    it("같은 배치 스냅샷 재저장은 처음 저장값·행 기준량을 돌려줌 (Codex #546 P2-4)", async () => {
      const { saveBatchMassBasis, prepareBatchMassBasis } = await import("./db/production/batchMassBasis");
      const plan = await prepareBatchMassBasis(T, 38, 5, admin);
      expect(plan.mode).toBe("basis");
      // 다른 값을 보내도 처음 값
      const first = await saveBatchMassBasis(admin, 9001, T, (plan as any).snapshot, 5);
      const again = await saveBatchMassBasis(admin, 9001, T, { ...(plan as any).snapshot, totalRawKg: 999 }, 7);
      expect([again.snapshot.totalRawKg, again.subBatchKg]).toEqual([first.snapshot.totalRawKg, 5]);
      await q(`DELETE FROM h_batch_mass_basis`);
    });

    // ── Codex #546 P1-2: 재수화는 고정 스냅샷만 기준 ──
    it("투입 재생성(hydrator): 새 버전·기준을 바꿔도 그 배치는 스냅샷 값 (생멥쌀 3.2), 최신 BOM 을 섞지 않음", async () => {
      const bid = await newBatch("5", "MILK-HYD");
      await q(`DELETE FROM h_batch_inputs WHERE batch_id = ?`, [bid]);
      // 이후 레시피 변경: 같은 버전 기준값 수정 + 새 승인 버전(v3, 다른 원료) 추가
      await q(`UPDATE h_mf_ingredients SET basis_raw_kg = 9 WHERE id = 6852`);
      await q(`INSERT INTO h_mf_report_versions (id, tenant_id, mf_report_id, version_no, effective_from, approval_status, batch_target_kg, reference_finished_kg, mass_basis_enabled)
        VALUES (480, ?, 373, 3, '2026-10-20', 'APPROVED', 10, NULL, 0)`, [T]);
      await q(`INSERT INTO h_mf_ingredients (id, mf_report_version_id, line_no, material_id, quantity, unit, is_deductible, material_type, process_group_id) VALUES
        (6900, 480, 1, 168, '90', '%', 1, 'RAW', 2), (6901, 480, 2, 177, '10', '%', 1, 'RAW', 2)`);
      const { hydrateBatchInputs } = await import("./services/batchHydrator");
      expect(await hydrateBatchInputs(bid, 38, T)).toBe(5);
      expect(await inputs(bid)).toEqual([[168, 3.2], [177, 0.4], [188, 0.4], [191, 0.32], [199, 0.052]]);
    });

    // ── Codex #546 P2-3: CCP 기록지 행 기준량도 배치 생성 때 고정 ──
    it("CCP 공정 투입량: 저장된 행 기준량(5kg) 사용 — 이후 BOM 기준량을 10kg 로 바꿔도 그대로 (공정2 = 4.0+0.4+0.4+0.052)", async () => {
      const bid = await newBatch("5", "MILK-CCP");
      expect(Number((await q(`SELECT sub_batch_kg + 0 AS s FROM h_batch_mass_basis WHERE batch_id = ?`, [bid]))[0].s)).toBe(5);
      await q(`UPDATE h_mf_report_versions SET batch_target_kg = 10 WHERE id = 472`);
      const { loadCcpInputFromMassBasis } = await import("./db/haccp/ccpFormSettings");
      const r = await loadCcpInputFromMassBasis(admin, bid, T, 10);
      expect(r).toEqual({ inputByGroup: { 2: 4.852 }, subBatchKg: 5 });
      // 저장값이 없는(PR C 이전) 스냅샷만 현재 BOM 기준량으로
      await q(`UPDATE h_batch_mass_basis SET sub_batch_kg = NULL WHERE batch_id = ?`, [bid]);
      expect((await loadCcpInputFromMassBasis(admin, bid, T, 10))?.subBatchKg).toBe(10);
      expect(await loadCcpInputFromMassBasis(admin, bid + 999, T, 10)).toBeNull();
    });
  });
  describe("재고 쓰기 경로 PR-1 — 회사 격리 + 재고 관문 경유 (2026-10-17, 쓰기 경로 분류 #35~#39)", () => {
    const O = 3; // 다른 회사
    let inv: any;
    beforeAll(async () => {
      inv = await import("./db/inventory/inventoryFunctions");
    });
    beforeEach(async () => {
      for (const t of ["h_materials", "h_batches", "h_batch_inputs", "h_inventory_lots", "h_inventory_transactions", "h_inventory", "item_master"]) await q(`DELETE FROM ${t}`);
      await q(`INSERT INTO h_materials (id, tenant_id, material_code, material_name, unit, is_active) VALUES
        (700, ?, 'M700', '멥쌀', 'kg', 1), (800, ?, 'M800', '타사 원료', 'kg', 1)`, [T, O]);
      await q(`INSERT INTO h_inventory_lots (id, tenant_id, material_id, lot_number, quantity, current_quantity, available_quantity, unit, receipt_date, status) VALUES
        (9001, ?, 700, 'A-1', 100, 100, 100, 'kg', '2026-10-01', 'available'),
        (9003, ?, 700, 'A-3', 50, 50, 50, 'kg', '2026-10-02', 'available'),
        (9002, ?, 800, 'B-1', 100, 100, 100, 'kg', '2026-10-01', 'available')`, [T, T, O]);
      await q(`INSERT INTO h_batches (id, tenant_id, site_id, batch_code, product_id, planned_quantity, planned_date, status, created_by)
        VALUES (7001, ?, 1, 'B7001', 38, 10, '2026-10-17', 'in_progress', 4), (7002, ?, 1, 'B7002', 38, 10, '2026-10-17', 'in_progress', 4)`, [T, O]);
    });
    const avail = async (id: number) => Number((await q(`SELECT available_quantity + 0 AS a FROM h_inventory_lots WHERE id = ?`, [id]))[0]?.a);
    const otherUntouched = async () => {
      expect(await avail(9002)).toBe(100);
      expect(Number((await q(`SELECT COUNT(*) AS n FROM h_inventory_transactions WHERE tenant_id = ? OR lot_id = 9002`, [O]))[0].n)).toBe(0);
    };

    it("LOT 입고: 회사·현재수량·입고 원장·집계 한 번에 / 회사 없으면 거부 / 다른 회사 원료 거부", async () => {
      const r = await inv.createInventoryLot({ materialId: 700, lotNumber: "N-1", quantity: "20", unit: "kg", userId: 4, tenantId: T });
      const lotRow = (await q(`SELECT tenant_id, current_quantity + 0 AS c, available_quantity + 0 AS a FROM h_inventory_lots WHERE id = ?`, [r.lotId]))[0];
      expect([Number(lotRow.tenant_id), Number(lotRow.c), Number(lotRow.a)]).toEqual([T, 20, 20]);
      const led = await q(`SELECT tenant_id, transaction_type, quantity + 0 AS qty FROM h_inventory_transactions WHERE lot_id = ?`, [r.lotId]);
      expect(led.map((x: any) => [Number(x.tenant_id), x.transaction_type, Number(x.qty)])).toEqual([[T, "receipt", 20]]);
      expect(Number((await q(`SELECT available_quantity + 0 AS a FROM h_inventory WHERE tenant_id = ? AND material_id = 700`, [T]))[0].a)).toBe(170);
      await expect(inv.createInventoryLot({ materialId: 700, lotNumber: "N-2", quantity: "1", unit: "kg", userId: 4 })).rejects.toThrow(/테넌트/);
      await expect(inv.receiveMaterial({ materialId: 800, quantity: 5, unit: "kg", receiptDate: "2026-10-17", tenantId: T, userId: 4 })).rejects.toThrow(/원재료를 찾을 수 없습니다/);
      await otherUntouched();
    });

    it("원료 투입: 다른 회사 LOT·배치는 찾을 수 없음 (아무것도 안 바뀜), 정상 투입은 원장에 투입 줄 id", async () => {
      await expect(inv.addMaterialInputToBatch({ batchId: 7001, materialId: 700, lotId: 9002, quantity: "30", unit: "kg", userId: 4, tenantId: T })).rejects.toThrow(/LOT를 찾을 수 없습니다/);
      await expect(inv.addMaterialInputToBatch({ batchId: 7002, materialId: 700, lotId: 9001, quantity: "30", unit: "kg", userId: 4, tenantId: T })).rejects.toThrow(/배치를 찾을 수 없습니다/);
      expect(Number((await q(`SELECT COUNT(*) AS n FROM h_batch_inputs`))[0].n)).toBe(0);
      await otherUntouched();

      await inv.addMaterialInputToBatch({ batchId: 7001, materialId: 700, lotId: 9001, quantity: "30", unit: "kg", userId: 4, tenantId: T });
      expect(await avail(9001)).toBe(70);
      const input = (await q(`SELECT id, tenant_id, inventory_deducted FROM h_batch_inputs`))[0];
      expect([Number(input.tenant_id), Number(input.inventory_deducted)]).toEqual([T, 1]);
      const led = (await q(`SELECT tenant_id, source_type, source_id, source_line_id FROM h_inventory_transactions WHERE lot_id = 9001`))[0];
      expect([Number(led.tenant_id), led.source_type, Number(led.source_id), Number(led.source_line_id)]).toEqual([T, "BATCH", 7001, Number(input.id)]);
      expect(Number((await q(`SELECT available_quantity + 0 AS a FROM h_inventory WHERE tenant_id = ? AND material_id = 700`, [T]))[0].a)).toBe(120);
    });

    it("원료 투입: 단위가 LOT 과 다르면 거부 (400g 를 400kg 로 빼지 않음)", async () => {
      await expect(inv.addMaterialInputToBatch({ batchId: 7001, materialId: 700, lotId: 9001, quantity: "400", unit: "g", userId: 4, tenantId: T })).rejects.toThrow(/단위가 다릅니다/);
      expect(await avail(9001)).toBe(100);
      expect(Number((await q(`SELECT COUNT(*) AS n FROM h_batch_inputs`))[0].n)).toBe(0);
    });

    it("투입 삭제: 원장으로 뺀 LOT 들에 되돌림 (여러 LOT), 다른 회사 투입 id 는 찾을 수 없음", async () => {
      // 자동출고처럼 두 LOT 에서 뺀 투입
      await q(`INSERT INTO h_batch_inputs (id, tenant_id, batch_id, material_id, lot_id, planned_quantity, actual_quantity, unit, inventory_deducted) VALUES (501, ?, 7001, 700, 9001, 15, 15, 'kg', 1)`, [T]);
      await q(`UPDATE h_inventory_lots SET available_quantity = available_quantity - 10, current_quantity = current_quantity - 10 WHERE id = 9001`);
      await q(`UPDATE h_inventory_lots SET available_quantity = 0, current_quantity = 0, status = 'used' WHERE id = 9003`);
      await q(`INSERT INTO h_inventory_transactions (tenant_id, lot_id, material_id, transaction_type, quantity, unit, source_type, source_id, source_line_id, created_by) VALUES
        (?, 9001, 700, 'usage', 10, 'kg', 'BATCH', 7001, 501, 4), (?, 9003, 700, 'usage', 50, 'kg', 'BATCH', 7001, 501, 4)`, [T, T]);
      await expect(inv.deleteMaterialInput(501, O, 4)).rejects.toThrow(/투입 내역을 찾을 수 없습니다/);
      await expect(inv.deleteMaterialInput(501)).rejects.toThrow(/테넌트/);
      expect(await avail(9001)).toBe(90);

      expect(await inv.deleteMaterialInput(501, T, 4)).toEqual({ restoredLots: 2 });
      expect([await avail(9001), await avail(9003)]).toEqual([100, 50]);
      expect((await q(`SELECT status FROM h_inventory_lots WHERE id = 9003`))[0].status).toBe("available"); // 소진 → 복원
      expect(Number((await q(`SELECT COUNT(*) AS n FROM h_batch_inputs`))[0].n)).toBe(0);
      expect(Number((await q(`SELECT COUNT(*) AS n FROM h_inventory_transactions WHERE transaction_type = 'return' AND source_type = 'BATCH_INPUT_CANCEL' AND source_line_id = 501`))[0].n)).toBe(2);
      await otherUntouched();
    });

    it("투입 삭제: 재고를 뺐다는데 출고 원장이 없으면 거부 (추정 복원 안 함) / 만료 LOT 은 수량만 돌리고 상태 유지 (D4)", async () => {
      await q(`INSERT INTO h_batch_inputs (id, tenant_id, batch_id, material_id, lot_id, planned_quantity, actual_quantity, unit, inventory_deducted) VALUES
        (502, ?, 7001, 700, 9001, 5, 5, 'kg', 1), (503, ?, 7001, 700, 9001, 5, 5, 'kg', 1)`, [T, T]);
      await expect(inv.deleteMaterialInput(502, T, 4)).rejects.toThrow(/출고 기록을 찾을 수 없어/);
      expect(Number((await q(`SELECT COUNT(*) AS n FROM h_batch_inputs WHERE id = 502`))[0].n)).toBe(1);
      await q(`UPDATE h_inventory_lots SET status = 'expired', available_quantity = 95, current_quantity = 95 WHERE id = 9001`);
      await q(`INSERT INTO h_inventory_transactions (tenant_id, lot_id, material_id, transaction_type, quantity, unit, source_type, source_id, source_line_id, created_by) VALUES (?, 9001, 700, 'usage', 5, 'kg', 'BATCH', 7001, 503, 4)`, [T]);
      await inv.deleteMaterialInput(503, T, 4);
      const r = (await q(`SELECT available_quantity + 0 AS a, status FROM h_inventory_lots WHERE id = 9001`))[0];
      expect([Number(r.a), r.status]).toEqual([100, "expired"]);
    });

    it("LOT 삭제: 다른 회사 LOT 은 찾을 수 없음, 거래 이력 있으면 거부, 이력 없는 LOT 만 삭제 + 집계 재계산", async () => {
      await expect(inv.deleteInventoryLot(9002, T)).rejects.toThrow(/찾을 수 없습니다/);
      await q(`INSERT INTO h_inventory_transactions (tenant_id, lot_id, material_id, transaction_type, quantity, unit, created_by) VALUES (?, 9003, 700, 'receipt', 50, 'kg', 4)`, [T]);
      await expect(inv.deleteInventoryLot(9003, T)).rejects.toThrow(/거래 이력/);
      await inv.deleteInventoryLot(9001, T);
      expect(Number((await q(`SELECT COUNT(*) AS n FROM h_inventory_lots WHERE id = 9001`))[0].n)).toBe(0);
      expect(Number((await q(`SELECT available_quantity + 0 AS a FROM h_inventory WHERE tenant_id = ? AND material_id = 700`, [T]))[0].a)).toBe(50);
      await otherUntouched();
    });

    it("투입 수정: 다른 회사 투입·LOT 은 찾을 수 없음", async () => {
      await q(`INSERT INTO h_batch_inputs (id, tenant_id, batch_id, material_id, lot_id, planned_quantity, actual_quantity, unit) VALUES (601, ?, 7002, 800, 9002, 5, 5, 'kg')`, [O]);
      await expect(inv.updateMaterialInput(601, { quantity: "9" }, T)).rejects.toThrow(/찾을 수 없습니다/);
      await q(`INSERT INTO h_batch_inputs (id, tenant_id, batch_id, material_id, lot_id, planned_quantity, actual_quantity, unit) VALUES (602, ?, 7001, 700, 9001, 5, 5, 'kg')`, [T]);
      await expect(inv.updateMaterialInput(602, { lotId: 9002 }, T)).rejects.toThrow(/LOT를 찾을 수 없습니다/);
      await inv.updateMaterialInput(602, { quantity: "6" }, T);
      expect(Number((await q(`SELECT actual_quantity + 0 AS a FROM h_batch_inputs WHERE id = 602`))[0].a)).toBe(6);
      expect(Number((await q(`SELECT actual_quantity + 0 AS a FROM h_batch_inputs WHERE id = 601`))[0].a)).toBe(5);
    });

    it("투입 수정: 재고가 이미 차감된 투입은 수량·LOT 수정 거부, 다른 원료 LOT 지정 거부 (Codex #549 P1)", async () => {
      await inv.addMaterialInputToBatch({ batchId: 7001, materialId: 700, lotId: 9001, quantity: "30", unit: "kg", userId: 4, tenantId: T });
      const id = Number((await q(`SELECT id FROM h_batch_inputs`))[0].id);
      await expect(inv.updateMaterialInput(id, { quantity: "90" }, T)).rejects.toThrow(/이미 차감된 투입/);
      await expect(inv.updateMaterialInput(id, { lotId: 9003 }, T)).rejects.toThrow(/이미 차감된 투입/);
      const row = (await q(`SELECT actual_quantity + 0 AS a, lot_id FROM h_batch_inputs WHERE id = ?`, [id]))[0];
      expect([Number(row.a), Number(row.lot_id)]).toEqual([30, 9001]);
      await q(`INSERT INTO h_materials (id, tenant_id, material_code, material_name, unit, is_active) VALUES (701, ?, 'M701', '설탕', 'kg', 1)`, [T]);
      await q(`INSERT INTO h_inventory_lots (id, tenant_id, material_id, lot_number, quantity, current_quantity, available_quantity, unit, status) VALUES (9004, ?, 701, 'C-1', 10, 10, 10, 'kg', 'available')`, [T]);
      await q(`INSERT INTO h_batch_inputs (id, tenant_id, batch_id, material_id, lot_id, planned_quantity, unit) VALUES (69003, ?, 7001, 700, NULL, 5, 'kg')`, [T]);
      await expect(inv.updateMaterialInput(69003, { lotId: 9004 }, T)).rejects.toThrow(/다른 원료의 LOT/);
    });

    it("투입 삭제: LOT 없는 출고 잔량이 있으면 전체 거부 — 혼합(정상 LOT + LOT 없음)도 일부 복원 없이 (Codex #549 P2)", async () => {
      await q(`INSERT INTO h_batch_inputs (id, tenant_id, batch_id, material_id, lot_id, planned_quantity, actual_quantity, unit, inventory_deducted) VALUES
        (511, ?, 7001, 700, NULL, 30, 30, 'kg', 1), (512, ?, 7001, 700, 9001, 15, 15, 'kg', 1)`, [T, T]);
      await q(`UPDATE h_inventory_lots SET available_quantity = 90, current_quantity = 90 WHERE id = 9001`);
      await q(`INSERT INTO h_inventory_transactions (tenant_id, lot_id, material_id, transaction_type, quantity, unit, source_type, source_id, source_line_id, created_by) VALUES
        (?, NULL, 700, 'usage', 30, 'kg', 'BATCH', 7001, 511, 4),
        (?, 9001, 700, 'usage', 10, 'kg', 'BATCH', 7001, 512, 4), (?, NULL, 700, 'usage', 5, 'kg', 'BATCH', 7001, 512, 4)`, [T, T, T]);
      await expect(inv.deleteMaterialInput(511, T, 4)).rejects.toThrow(/LOT 가 없는 30.000/);
      await expect(inv.deleteMaterialInput(512, T, 4)).rejects.toThrow(/LOT 가 없는 5.000/);
      expect(await avail(9001)).toBe(90); // 정상 그룹도 되돌리지 않음
      expect(Number((await q(`SELECT COUNT(*) AS n FROM h_batch_inputs WHERE id IN (511, 512)`))[0].n)).toBe(2);
      expect(Number((await q(`SELECT COUNT(*) AS n FROM h_inventory_transactions WHERE transaction_type = 'return'`))[0].n)).toBe(0);
    });
  });
  describe("재고 쓰기 경로 PR-2 — '소모→현황 재고 동기화' 쓰기 차단, 미리보기만 (2026-10-17)", () => {
    beforeEach(async () => {
      for (const t of ["h_materials", "h_batches", "h_batch_inputs", "h_inventory_lots", "h_inventory_transactions", "h_inventory"]) await q(`DELETE FROM ${t}`);
      await q(`INSERT INTO h_materials (id, tenant_id, material_code, material_name, unit, is_active) VALUES (700, ?, 'M700', '멥쌀', 'kg', 1)`, [T]);
      // 입고 100, 배치 소모 30, 매출·실사 등으로 LOT 은 이미 50 (식으로는 70 이 '정상')
      await q(`INSERT INTO h_inventory_lots (id, tenant_id, material_id, lot_number, quantity, current_quantity, available_quantity, unit, receipt_date, status)
        VALUES (9101, ?, 700, 'S-1', 100, 50, 50, 'kg', '2026-10-01', 'available')`, [T]);
      await q(`INSERT INTO h_inventory (tenant_id, material_id, total_quantity, available_quantity, reserved_quantity, unit) VALUES (?, 700, 50, 50, 0, 'kg')`, [T]);
      await q(`INSERT INTO h_batches (id, tenant_id, site_id, batch_code, product_id, planned_quantity, planned_date, status, created_by)
        VALUES (7101, ?, 1, 'B7101', 38, 10, '2026-10-17', 'completed', 4)`, [T]);
      await q(`INSERT INTO h_batch_inputs (tenant_id, batch_id, material_id, lot_id, planned_quantity, actual_quantity, unit, inventory_deducted) VALUES (?, 7101, 700, 9101, 30, 30, 'kg', 1)`, [T]);
    });
    const state = async () => [
      Number((await q(`SELECT available_quantity + 0 AS a FROM h_inventory_lots WHERE id = 9101`))[0].a),
      Number((await q(`SELECT available_quantity + 0 AS a FROM h_inventory WHERE material_id = 700`))[0].a),
      Number((await q(`SELECT COUNT(*) AS n FROM h_inventory_transactions`))[0].n),
    ];

    it("덮어쓰기(dryRun=false) 는 거부, 재고·집계·원장 그대로", async () => {
      const { syncStockFromConsumption } = await import("./db/production/outboundManagement");
      await expect(syncStockFromConsumption(T, 4, false)).rejects.toThrow(/중단되었습니다/);
      expect(await state()).toEqual([50, 50, 0]);
    });

    it("미리보기는 차이만 보여 주고 아무것도 바꾸지 않음 — 참고값 표시, 음수도 그대로, 요청 회사만", async () => {
      const { syncStockFromConsumption } = await import("./db/production/outboundManagement");
      const r = await syncStockFromConsumption(T, 4); // 생략 = 미리보기
      expect(r.referenceOnly).toBe(true);
      expect(r.basisNote).toMatch(/정상 재고나 보정 확정값이 아닙니다/);
      expect(r.materialsProcessed).toBe(1);
      expect(r.details[0].warnings[0]).toContain("참고재고 70.0");
      expect(await state()).toEqual([50, 50, 0]);
      // 소모 > 입고 → 음수 참고값 (0 으로 자르지 않음)
      await q(`UPDATE h_batch_inputs SET actual_quantity = 130`);
      expect((await syncStockFromConsumption(T, 4, true)).details[0].warnings[0]).toContain("참고재고 -30.0");
      // 다른 회사 데이터는 읽지 않음
      await q(`INSERT INTO h_materials (id, tenant_id, material_code, material_name, unit, is_active) VALUES (800, 3, 'M800', '타사', 'kg', 1)`);
      await q(`INSERT INTO h_inventory_lots (id, tenant_id, material_id, lot_number, quantity, current_quantity, available_quantity, unit, status) VALUES (9102, 3, 800, 'X', 10, 1, 1, 'kg', 'available')`);
      expect((await syncStockFromConsumption(T, 4, true)).details.map((d: any) => d.materialId)).toEqual([700]);
      expect(await state()).toEqual([50, 50, 0]);
      await expect(syncStockFromConsumption(0 as any, 4, true)).rejects.toThrow(/테넌트/);
    });
  });
  describe("재고 쓰기 경로 PR-3 — 발주 제안 승인은 발주서 작성 (재고·LOT 생성 안 함, 2026-10-17)", () => {
    beforeEach(async () => {
      for (const t of ["h_materials", "item_master", "h_inventory_lots", "h_inventory_transactions", "h_inventory"]) await q(`DELETE FROM ${t}`);
      await q(`INSERT INTO h_materials (id, tenant_id, material_code, material_name, unit, is_active) VALUES (700, ?, 'M700', '멥쌀', 'kg', 1), (800, 3, 'M800', '타사', 'kg', 1)`, [T]);
      await q(`INSERT INTO item_master (id, tenant_id, item_code, item_name, item_type, base_unit, is_active, legacy_material_id) VALUES (1700, ?, 'M700', '멥쌀', 'raw_material', 'kg', 1, 700)`, [T]);
    });
    const counts = async () => [
      Number((await q(`SELECT COUNT(*) AS n FROM h_inventory_lots`))[0].n),
      Number((await q(`SELECT COUNT(*) AS n FROM h_inventory_transactions`))[0].n),
      Number((await q(`SELECT COUNT(*) AS n FROM h_inventory`))[0].n),
    ];
    it("승인 → 발주서 초안(품목 item_master id·수량·단위)만, LOT·원장·집계 0 / 다른 회사·회사 없음 거부", async () => {
      const { approvePurchaseOrderSuggestion } = await import("./db/production/productionAnalytics");
      const r = await approvePurchaseOrderSuggestion({ materialId: 700, quantity: 120, approvedBy: 4, tenantId: T });
      expect(r.draft).toEqual({ materialId: 1700, itemName: "멥쌀", itemCode: "M700", unit: "kg", quantity: 120 });
      expect(await counts()).toEqual([0, 0, 0]);
      await expect(approvePurchaseOrderSuggestion({ materialId: 800, quantity: 1, approvedBy: 4, tenantId: T })).rejects.toThrow(/찾을 수 없습니다/);
      await expect(approvePurchaseOrderSuggestion({ materialId: 700, quantity: 1, approvedBy: 4 })).rejects.toThrow(/테넌트/);
      expect(await counts()).toEqual([0, 0, 0]);
    });
  });
  describe("재고 쓰기 경로 PR-4 — 생산완료 제품 LOT 은 ensureBatchLots 하나 (덮어쓰기 없음, 한 벌만, 2026-10-17)", () => {
    beforeEach(async () => {
      for (const t of ["h_batches", "h_batch_inputs", "h_inventory_lots", "h_inventory_transactions", "h_inventory", "product_skus", "production_sku_output", "item_master", "h_products_v2", "expense_journal_entries"]) await q(`DELETE FROM ${t}`);
      await q(`INSERT INTO h_batches (id, tenant_id, site_id, batch_code, product_id, planned_quantity, actual_quantity, planned_date, status, created_by)
        VALUES (7201, ?, 1, 'B7201', 90, 100, 96, '2026-10-14', 'completed', 4)`, [T]);
      await q(`INSERT INTO product_skus (id, tenant_id, item_id, sku_code, sku_name, sales_unit, kg_per_sales_unit, unit_price) VALUES
        (208, ?, 1, 'S208', '하늘사랑 1.6kg', 'box', 1.6, 30000), (209, ?, 1, 'S209', '0.8kg 팩', 'pack', 0.8, 9000)`, [T, T]);
      await q(`INSERT INTO production_sku_output (tenant_id, batch_id, sku_id, quantity) VALUES (?, 7201, 208, 30), (?, 7201, 209, 60)`, [T, T]);
    });
    const lots = async () => (await q(`SELECT sku_id, unit, quantity + 0 AS q, available_quantity + 0 AS a, current_quantity + 0 AS c, unit_price, tenant_id, receipt_date FROM h_inventory_lots WHERE batch_id = 7201 ORDER BY sku_id`))
      .map((r: any) => [Number(r.sku_id), r.unit, Number(r.q), Number(r.a), Number(r.c), r.unit_price, Number(r.tenant_id)]);

    it("SKU 별 LOT (단위 그대로, 현재수량, 판매가를 단가로 넣지 않음) + 입고 원장, 제품 집계는 쓰지 않음", async () => {
      const { ensureBatchLots } = await import("./db/production/productOutboundManagement");
      const r = await ensureBatchLots(7201, T);
      expect(r.created.length).toBe(2);
      expect(await lots()).toEqual([[208, "box", 30, 30, 30, null, T], [209, "pack", 60, 60, 60, null, T]]);
      const led = await q(`SELECT transaction_type, quantity + 0 AS q, unit, source_type, source_id, transaction_date FROM h_inventory_transactions ORDER BY id`);
      expect(led.map((x: any) => [x.transaction_type, Number(x.q), x.unit, x.source_type, Number(x.source_id)])).toEqual([["inbound", 30, "box", "BATCH_OUTPUT", 7201], ["inbound", 60, "pack", "BATCH_OUTPUT", 7201]]);
      expect(Number((await q(`SELECT COUNT(*) AS n FROM h_inventory WHERE product_id IS NOT NULL`))[0].n)).toBe(0);
    });

    it("이미 LOT 이 있으면 그대로 — 판매로 줄어든 잔량을 생산수량으로 되살리지 않음", async () => {
      const { ensureBatchLots } = await import("./db/production/productOutboundManagement");
      await ensureBatchLots(7201, T);
      await q(`UPDATE h_inventory_lots SET available_quantity = 12, current_quantity = 12 WHERE batch_id = 7201 AND sku_id = 208`); // 18박스 판매
      expect(await ensureBatchLots(7201, T)).toMatchObject({ skipped: true, reason: "lots_already_exist" });
      expect((await lots())[0]).toEqual([208, "box", 30, 12, 12, null, T]);
      expect(Number((await q(`SELECT COUNT(*) AS n FROM h_inventory_transactions`))[0].n)).toBe(2);
    });

    it("동시에 두 번 불러도 LOT 은 한 벌 (배치 잠금)", async () => {
      const { ensureBatchLots } = await import("./db/production/productOutboundManagement");
      const rs = await Promise.all([ensureBatchLots(7201, T), ensureBatchLots(7201, T), ensureBatchLots(7201, T)]);
      expect(rs.filter((r) => !r.skipped).length).toBe(1);
      expect((await lots()).length).toBe(2);
      expect(Number((await q(`SELECT COUNT(*) AS n FROM h_inventory_transactions`))[0].n)).toBe(2);
    });

    it("원료가 다 출고되지 않았으면 제품 LOT·생산완료 분개를 만들지 않음 (Codex #552 P1)", async () => {
      await q(`DELETE FROM h_batch_inputs`);
      await q(`INSERT INTO h_batch_inputs (id, tenant_id, batch_id, material_id, planned_quantity, unit, inventory_deducted) VALUES (901, ?, 7201, 700, 10, 'kg', 0)`, [T]);
      const { ensureBatchLots } = await import("./db/production/productOutboundManagement");
      expect(await ensureBatchLots(7201, T)).toMatchObject({ skipped: true, reason: "materials_not_issued" });
      expect(await lots()).toEqual([]);
      const { postProductionCompletionJournal } = await import("./lib/production/productionCompletionJournal");
      const jr = await postProductionCompletionJournal({ batchId: 7201, tenantId: T, userId: 4 });
      expect(["materials_not_issued", "disabled", "before_start"]).toContain((jr as any).reason);
      // 출고되면(원장 연결) 생성
      await q(`INSERT INTO h_inventory_transactions (tenant_id, lot_id, material_id, transaction_type, quantity, unit, source_type, source_id, source_line_id, created_by) VALUES (?, NULL, 700, 'usage', 10, 'kg', 'BATCH', 7201, 901, 4)`, [T]);
      expect((await ensureBatchLots(7201, T)).created.length).toBe(2);
      await q(`DELETE FROM h_batch_inputs`);
    });

    it("SKU 없는 배치 LOT 단위는 kg (포장 단위 base_unit 을 붙이지 않음, Codex #551)", async () => {
      await q(`DELETE FROM production_sku_output`);
      await q(`INSERT INTO item_master (id, tenant_id, item_code, item_name, item_type, base_unit, is_active, legacy_product_id) VALUES (1090, ?, 'P90', '제품', 'own_product', 'box', 1, 90)`, [T]);
      const { ensureBatchLots } = await import("./db/production/productOutboundManagement");
      await ensureBatchLots(7201, T);
      expect((await lots())[0].slice(1, 3)).toEqual(["kg", 96]);
    });

    it("생산완료 분개가 이미 있으면 보강 LOT 에 그 금액으로 원가 단가 (Codex #551)", async () => {
      await q(`INSERT INTO expense_journal_entries (tenant_id, entry_date, description, total_debit, total_credit, posted_by) VALUES (?, '2026-10-14', '[생산완료] BATCH-7201', 96000, 96000, 4)`, [T]);
      const { ensureBatchLots } = await import("./db/production/productOutboundManagement");
      await ensureBatchLots(7201, T);
      // kg 비율 배분: box 30×1.6=48kg, pack 60×0.8=48kg → 각 48,000원 → box 1600, pack 800
      expect((await q(`SELECT sku_id, unit_price + 0 AS p FROM h_inventory_lots WHERE batch_id = 7201 ORDER BY sku_id`)).map((r: any) => [Number(r.sku_id), Number(r.p)])).toEqual([[208, 1600], [209, 800]]);
      await q(`DELETE FROM expense_journal_entries`);
    });

    it("SKU 실적 없으면 배치 실적 수량으로 LOT 하나 (기본 단위), 다른 회사·회사 없음은 생성 안 함", async () => {
      await q(`DELETE FROM production_sku_output`);
      const { ensureBatchLots } = await import("./db/production/productOutboundManagement");
      expect(await ensureBatchLots(7201, 3)).toMatchObject({ skipped: true, reason: "batch_not_found" });
      await expect(ensureBatchLots(7201, 0 as any)).rejects.toThrow(/테넌트/);
      await ensureBatchLots(7201, T);
      expect(await lots()).toEqual([[0, "kg", 96, 96, 96, null, T]]);
    });
  });
  describe("재고 쓰기 경로 PR-5·6 — 자동출고: 줄 단위 트랜잭션·관문·공통 잠금 (2026-10-17)", () => {
    beforeEach(async () => {
      await q(`DROP TRIGGER IF EXISTS trg_fail_bi_update`);
      for (const t of ["h_materials", "h_batches", "h_batch_inputs", "h_inventory_lots", "h_inventory_transactions", "h_inventory", "material_ledger_daily", "item_master"]) await q(`DELETE FROM ${t}`);
      await q(`INSERT INTO h_materials (id, tenant_id, material_code, material_name, unit, unit_price, is_active) VALUES (700, ?, 'M700', '멥쌀', 'kg', 2000, 1)`, [T]);
      await q(`INSERT INTO h_inventory_lots (id, tenant_id, material_id, lot_number, quantity, current_quantity, available_quantity, unit, unit_price, receipt_date, expiry_date, status) VALUES
        (9301, ?, 700, 'R-1', 50, 50, 50, 'kg', 2000, '2026-10-01', '2026-12-01', 'available'),
        (9302, ?, 700, 'R-2', 50, 50, 50, 'kg', 2100, '2026-10-02', '2026-11-01', 'available')`, [T, T]);
      await q(`INSERT INTO h_batches (id, tenant_id, site_id, batch_code, product_id, planned_quantity, planned_date, status, created_by)
        VALUES (7301, ?, 1, 'B7301', 90, 100, '2026-10-17', 'in_progress', 4)`, [T]);
      await q(`INSERT INTO h_batch_inputs (id, tenant_id, batch_id, material_id, planned_quantity, unit, inventory_deducted) VALUES (801, ?, 7301, 700, 60, 'kg', 0)`, [T]);
    });
    afterAll(async () => { await q(`DROP TRIGGER IF EXISTS trg_fail_bi_update`); });
    const avail = async (id: number) => Number((await q(`SELECT available_quantity + 0 AS a FROM h_inventory_lots WHERE id = ?`, [id]))[0].a);
    const ledger = async () => (await q(`SELECT lot_id, quantity + 0 AS q, source_line_id FROM h_inventory_transactions WHERE transaction_type = 'usage' ORDER BY id`))
      .map((r: any) => [Number(r.lot_id), Number(r.q), Number(r.source_line_id)]);
    const dispatch = async (t = T) => (await import("./lib/production/autoMaterialIssueDispatcher")).autoIssueMaterialsDispatch(7301, 4, t);

    it("FEFO(소비기한 순) 로 관문 차감 — LOT·원장(투입 줄 id)·집계·투입 행 한 번에", async () => {
      const r = await dispatch();
      expect(r.errors).toEqual([]);
      expect([await avail(9302), await avail(9301)]).toEqual([0, 40]);
      expect(await ledger()).toEqual([[9302, 50, 801], [9301, 10, 801]]);
      const bi = (await q(`SELECT inventory_deducted, actual_quantity + 0 AS a, total_price + 0 AS tp FROM h_batch_inputs WHERE id = 801`))[0];
      expect([Number(bi.inventory_deducted), Number(bi.a), Number(bi.tp)]).toEqual([1, 60, 125000]);
      expect(Number((await q(`SELECT available_quantity + 0 AS a FROM h_inventory WHERE material_id = 700`))[0].a)).toBe(40);
    });

    it("다시 실행·동시 3회 실행해도 한 번만 출고", async () => {
      const rs = await Promise.all([dispatch(), dispatch(), dispatch()]);
      expect(rs.filter((r) => r.busy).length).toBeGreaterThanOrEqual(0);
      await dispatch();
      expect(await ledger()).toEqual([[9302, 50, 801], [9301, 10, 801]]);
      expect([await avail(9302), await avail(9301)]).toEqual([0, 40]);
    });

    it("투입 단위가 LOT 과 다르면 그 줄은 출고하지 않음 (D6)", async () => {
      await q(`UPDATE h_batch_inputs SET unit = 'g', planned_quantity = 600 WHERE id = 801`);
      const r = await dispatch();
      expect(r.success).toBe(false); // 줄 오류가 있으면 전체 실패 (Codex #552 P1)
      expect(r.errors.join()).toMatch(/단위가 다릅니다/);
      expect(await ledger()).toEqual([]);
      expect([await avail(9301), await avail(9302)]).toEqual([50, 50]);
      expect(Number((await q(`SELECT inventory_deducted FROM h_batch_inputs WHERE id = 801`))[0].inventory_deducted)).toBe(0);
    });

    it("재고보다 많이 쓰면 음수 그대로 (0 으로 자르지 않음, 음수 허용 정책)", async () => {
      await q(`UPDATE h_batch_inputs SET planned_quantity = 130 WHERE id = 801`);
      await dispatch();
      const total = (await ledger()).reduce((a, x) => a + x[1], 0);
      expect(total).toBe(130);
      expect((await avail(9301)) + (await avail(9302))).toBe(-30);
    });

    it("줄 처리 중간에 실패하면 그 줄의 LOT·원장이 모두 되돌아감", async () => {
      await admin.query(`CREATE TRIGGER trg_fail_bi_update BEFORE UPDATE ON h_batch_inputs FOR EACH ROW
        BEGIN IF NEW.inventory_deducted = 1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'injected'; END IF; END`);
      const r = await dispatch();
      expect(r.errors.join()).toMatch(/injected/);
      expect(await ledger()).toEqual([]);
      expect([await avail(9301), await avail(9302)]).toEqual([50, 50]);
    });

    it("다른 회사로 호출하면 출고 없음 / 회사 없으면 거부", async () => {
      const r = await dispatch(3);
      expect(r.success).toBe(false);
      expect(await ledger()).toEqual([]);
      await expect(dispatch(0)).rejects.toThrow(/테넌트/);
    });

    it("잠근 행에서 수량을 다시 읽음 — 바깥 조회 뒤 실투입을 20 으로 고치면 20 만 출고 (Codex #552 P1)", async () => {
      const other = await mysql.createConnection({ uri: URL_! });
      try {
        await other.query(`SET SESSION time_zone = '+09:00'`);
        await other.beginTransaction();
        await other.query(`SELECT id FROM h_batch_inputs WHERE id = 801 FOR UPDATE`); // 출고가 이 행에서 기다리게
        const running = dispatch();
        await new Promise((r) => setTimeout(r, 400));
        await other.query(`UPDATE h_batch_inputs SET actual_quantity = 20 WHERE id = 801`);
        await other.commit();
        const r = await running;
        expect(r.errors).toEqual([]);
      } finally {
        await other.end();
      }
      expect(await ledger()).toEqual([[9302, 20, 801]]);
      expect(Number((await q(`SELECT actual_quantity + 0 AS a FROM h_batch_inputs WHERE id = 801`))[0].a)).toBe(20);
    });

    it("구형 출고 유형(batch_completion) 이 줄에 연결돼 있으면 다시 출고하지 않음 (Codex #552 P2)", async () => {
      await q(`INSERT INTO h_inventory_transactions (tenant_id, lot_id, material_id, transaction_type, quantity, unit, source_type, source_id, source_line_id, created_by)
        VALUES (?, 9301, 700, 'usage', 60, 'kg', 'batch_completion', 7301, 801, 4)`, [T]);
      await dispatch();
      expect(await ledger()).toEqual([[9301, 60, 801]]);
    });

    it("투입 수정도 같은 행 잠금 — 차감된 뒤면 거부", async () => {
      await dispatch();
      const inv = await import("./db/inventory/inventoryFunctions");
      await expect(inv.updateMaterialInput(801, { quantity: "20" }, T)).rejects.toThrow(/이미 차감된 투입/);
    });
  });
  describe("입고 정본화 PR-0 — 재확정 차단·분개만 보충·입고탭 LOT 재사용·수정/삭제 가드 (2026-10-17)", () => {
    let createPurchase: any;
    let postPurchase: any;
    let backfillPurchaseJournal: any;
    let hi: any;
    beforeAll(async () => {
      hi = await import("./db/haccp/haccpIntegration");
      ({ createPurchase } = hi);
      ({ postPurchase, backfillPurchaseJournal } = await import("./lib/accounting/purchasePost"));
    });
    beforeEach(async () => {
      for (const t of ["accounting_purchases", "h_inbound_headers", "h_inbound_lines", "partners", "h_materials", "material_ledger_daily", "h_inventory_lots", "h_inventory_transactions", "h_inventory", "expense_journal_entries", "expense_journal_lines"]) await q(`DELETE FROM ${t}`);
      await q(`INSERT INTO accounting_accounts (id, tenant_id, category, code, system_code, name, is_active) VALUES
        (70, ?, 'liabilities', '2010', 'ACCOUNTS_PAYABLE', '외상매입금', 'Y'), (71, ?, 'assets', '1350', 'VAT_INPUT', '부가세대급금', 'Y')`, [T, T]);
      await q(`INSERT INTO h_materials (id, tenant_id, material_code, material_name, unit, is_active) VALUES (635, ?, 'M635', '우유(국내산)', 'kg', 1)`, [T]);
    });
    const counts = async () => [
      Number((await q(`SELECT COUNT(*) AS n FROM h_inventory_lots`))[0].n),
      Number((await q(`SELECT COUNT(*) AS n FROM h_inventory_transactions`))[0].n),
      Number((await q(`SELECT COUNT(*) AS n FROM expense_journal_entries`))[0].n),
    ];
    const newPurchase = () => createPurchase({
      transactionDate: "2026-10-12", partnerId: 0, itemName: "우유(국내산)", materialId: 635,
      quantity: 10, unit: "kg", unitPrice: 3000, amount: 30000, taxAmount: 3000, taxRate: 10, createdBy: 4,
    }, T);

    it("승인된 매입을 다시 확정해도 LOT·원장·분개가 늘지 않음", async () => {
      await newPurchase();
      const id = Number((await q(`SELECT id FROM accounting_purchases`))[0].id);
      const before = await counts();
      expect(await postPurchase(id, 4, T)).toEqual({ alreadyProcessed: true });
      expect(await counts()).toEqual(before);
    });

    it("확정·분개 없음 → 분개만 보충 (미리보기 → 적용 → 재실행 건너뜀), 재고·상태 그대로", async () => {
      await q(`INSERT INTO accounting_purchases (id, tenant_id, transaction_date, item_name, material_id, quantity, unit, unit_price, total_amount, tax_amount, tax_rate, status, created_by)
        VALUES (501, ?, '2026-09-01', '우유(국내산)', 635, 10, 'kg', 3000, 30000, 3000, 10, 'approved', 4)`, [T]);
      const pre = await backfillPurchaseJournal(501, T, 4, { apply: false });
      expect(pre).toMatchObject({ status: "would_post", amount: 33000, entryDate: "2026-09-01", hasStock: false });
      expect(await counts()).toEqual([0, 0, 0]);
      const r = await backfillPurchaseJournal(501, T, 4, { apply: true });
      expect(r.status).toBe("posted");
      const lines = await q(`SELECT account_code, debit_amount + 0 AS d, credit_amount + 0 AS c FROM expense_journal_lines ORDER BY sort_order`);
      expect(lines.map((l: any) => [l.account_code, Number(l.d), Number(l.c)])).toEqual([["1410", 30000, 0], ["1350", 3000, 0], ["2010", 0, 33000]]);
      expect(await backfillPurchaseJournal(501, T, 4, { apply: true })).toMatchObject({ status: "skip", reason: "already_posted" });
      expect(await counts()).toEqual([0, 0, 1]);
      expect((await q(`SELECT status FROM accounting_purchases WHERE id = 501`))[0].status).toBe("approved");
      // 대기 매입은 보충 대상 아님 / 다른 회사 매입은 찾을 수 없음
      await q(`UPDATE accounting_purchases SET status = 'pending' WHERE id = 501`);
      expect(await backfillPurchaseJournal(501, T, 4, { apply: true })).toMatchObject({ status: "skip", reason: "not_confirmed" });
      expect(await backfillPurchaseJournal(501, 3, 4, { apply: true })).toMatchObject({ status: "skip", reason: "not_found" });
    });

    it("입고 탭 대기 전표(source material_receipt) 승인 → 그 LOT 재사용, 두 번째 LOT 없음", async () => {
      await q(`INSERT INTO h_inventory_lots (id, tenant_id, material_id, lot_number, quantity, current_quantity, available_quantity, unit, receipt_date, status) VALUES (9401, ?, 635, 'RCV-1', 10, 10, 10, 'kg', '2026-10-12', 'available')`, [T]);
      await q(`INSERT INTO h_inventory_transactions (tenant_id, lot_id, material_id, transaction_type, quantity, unit, created_by) VALUES (?, 9401, 635, 'receipt', 10, 'kg', 4)`, [T]);
      await q(`INSERT INTO accounting_purchases (id, tenant_id, transaction_date, item_name, quantity, unit, unit_price, total_amount, tax_amount, tax_rate, status, source_type, source_id, created_by)
        VALUES (502, ?, '2026-10-12', 'M635', 10, 'kg', 3000, 30000, 0, 0, 'pending', 'material_receipt', 9401, 4)`, [T]);
      await postPurchase(502, 4, T);
      expect(Number((await q(`SELECT COUNT(*) AS n FROM h_inventory_lots`))[0].n)).toBe(1);
      expect(Number((await q(`SELECT COUNT(*) AS n FROM h_inventory_transactions WHERE transaction_type = 'receipt'`))[0].n)).toBe(1);
      expect(Number((await q(`SELECT COUNT(*) AS n FROM expense_journal_entries`))[0].n)).toBe(1);
      expect(Number((await q(`SELECT material_id FROM h_inbound_lines`))[0].material_id)).toBe(635);
    });

    it("수정: 상태 변경 거부, 재고 생긴 매입의 수량 변경 거부, 같은 값 + 메모는 허용 / 삭제: 재고 생긴 매입 거부", async () => {
      await newPurchase();
      const p = (await q(`SELECT id, transaction_date, quantity + 0 AS qty, unit_price + 0 AS up FROM accounting_purchases`))[0];
      const id = Number(p.id);
      await expect(hi.updatePurchase(id, { status: "paid" }, T)).rejects.toThrow(/상태는 확정·취소/);
      await expect(hi.updatePurchase(id, { quantity: 20 }, T)).rejects.toThrow(/고칠 수 없습니다/);
      await hi.updatePurchase(id, { quantity: 10, unitPrice: 3000, status: "approved", notes: "메모" }, T);
      expect((await q(`SELECT notes FROM accounting_purchases WHERE id = ?`, [id]))[0].notes).toBe("메모");
      await expect(hi.deletePurchase(id, T)).rejects.toThrow(/삭제할 수 없습니다/);
      // 재고·분개 없는 대기 매입은 삭제 가능
      await q(`INSERT INTO accounting_purchases (id, tenant_id, transaction_date, item_name, quantity, unit, unit_price, total_amount, status, created_by) VALUES (95003, ?, '2026-10-12', 'x', 1, 'kg', 1, 1, 'pending', 4)`, [T]);
      await hi.deletePurchase(95003, T);
      expect(Number((await q(`SELECT COUNT(*) AS n FROM accounting_purchases WHERE id = 95003`))[0].n)).toBe(0);
    });
  });
  describe("#553 검토 후속 — 미정산 배치 출고 차단·배치 원가 확정 공통화·누락 분개 보충 분류 (2026-10-17)", () => {
    beforeEach(async () => {
      for (const t of ["h_materials", "h_batches", "h_batch_inputs", "h_inventory_lots", "h_inventory_transactions", "h_inventory", "h_product_outbound", "accounting_sales", "expense_journal_entries", "expense_journal_lines", "accounting_purchases"]) await q(`DELETE FROM ${t}`);
      await q(`INSERT INTO h_materials (id, tenant_id, material_code, material_name, unit, is_active) VALUES (700, ?, 'M700', '멥쌀', 'kg', 1), (191, ?, 'M191', '정제수', 'kg', 1)`, [T, T]);
      await q(`INSERT INTO h_batches (id, tenant_id, site_id, batch_code, product_id, planned_quantity, actual_quantity, planned_date, status, created_by)
        VALUES (7401, ?, 1, 'B7401', 90, 100, 96, '2026-10-14', 'completed', 4)`, [T]);
      await q(`INSERT INTO h_batch_inputs (id, tenant_id, batch_id, material_id, planned_quantity, unit, inventory_deducted, total_price) VALUES
        (1401, ?, 7401, 700, 60, 'kg', 0, 0), (1402, ?, 7401, 191, 10, 'kg', 1, 500)`, [T, T]);
    });
    const outbound = (batchId: number) => import("./db/production/productOutboundManagement").then((m) => m.createProductOutbound({
      batchId, productName: "제품", quantity: 1, unit: "kg", unitPrice: 1000, releaseDate: "2026-10-17", releaseType: "sample", createdBy: 4,
    } as any, T));
    const issue = async () => {
      await q(`UPDATE h_batch_inputs SET inventory_deducted = 1, total_price = 125000 WHERE id = 1401`);
    };

    it("원료 미출고 배치는 배치 기준(레거시) 출고 거부 — 출고 행 0, 출고 가능 목록에도 없음", async () => {
      await expect(outbound(7401)).rejects.toThrow(/아직 출고되지 않은 배치/);
      expect(Number((await q(`SELECT COUNT(*) AS n FROM h_product_outbound`))[0].n)).toBe(0);
      const { getProductAvailableForRelease } = await import("./db/production/productOutboundManagement");
      expect((await getProductAvailableForRelease(T)).filter((r: any) => r.batchId === 7401)).toEqual([]);
    });

    it("제품 LOT 이 있는 배치는 LOT 으로만 / LOT 없는 정산 완료 레거시 배치는 배치 기준 출고 허용 (단위 kg)", async () => {
      await issue();
      const { getProductAvailableForRelease } = await import("./db/production/productOutboundManagement");
      const listed = (await getProductAvailableForRelease(T)).filter((r: any) => r.batchId === 7401);
      expect(listed.map((r: any) => [r.source, r.unit])).toEqual([["batch", "kg"]]);
      await outbound(7401);
      expect(Number((await q(`SELECT COUNT(*) AS n FROM h_product_outbound WHERE batch_id = 7401`))[0].n)).toBe(1);
      await q(`INSERT INTO h_inventory_lots (id, tenant_id, batch_id, product_id, lot_number, quantity, current_quantity, available_quantity, unit, status) VALUES (9501, ?, 7401, 90, 'P-1', 96, 96, 96, 'kg', 'available')`, [T]);
      await expect(outbound(7401)).rejects.toThrow(/LOT 을 골라 출고/);
    });

    it("배치 원가 확정: 미출고면 보류 → 출고 뒤 출고된 줄 합(정제수 제외) 으로 확정 → 재호출 무변경", async () => {
      const { finalizeBatchCost } = await import("./lib/production/batchCompletionHooks");
      expect(await finalizeBatchCost(admin, 7401, T)).toBe("materials_not_issued");
      await issue();
      expect(await finalizeBatchCost(admin, 7401, T)).toBe("finalized");
      const b = (await q(`SELECT actual_cost + 0 AS c, cost_finalized_at FROM h_batches WHERE id = 7401`))[0];
      expect(Number(b.c)).toBe(125000);
      expect(b.cost_finalized_at).not.toBeNull();
      await q(`UPDATE h_batch_inputs SET total_price = 1 WHERE id = 1401`);
      expect(await finalizeBatchCost(admin, 7401, T)).toBe("already");
      expect(Number((await q(`SELECT actual_cost + 0 AS c FROM h_batches WHERE id = 7401`))[0].c)).toBe(125000);
    });

    it("원가 정본: 옛 material_cost(100,000) 가 있어도 확정 원가(출고 125,000) 로 분개·LOT 평가 — 세 값 일치 (Codex #555 P1)", async () => {
      await q(`UPDATE h_batches SET material_cost = 100000 WHERE id = 7401`);
      await issue();
      const { runBatchCompletionHooks } = await import("./lib/production/batchCompletionHooks");
      await runBatchCompletionHooks(7401, T, { source: "manual" } as any);
      const b = (await q(`SELECT actual_cost + 0 AS c FROM h_batches WHERE id = 7401`))[0];
      const j = (await q(`SELECT total_debit + 0 AS d FROM expense_journal_entries WHERE description LIKE '[생산완료] BATCH-7401%'`));
      expect([Number(b.c), j.map((r: any) => Number(r.d))]).toEqual([125000, [125000]]);
      const { ensureBatchLots } = await import("./db/production/productOutboundManagement");
      await ensureBatchLots(7401, T);
      const lot = (await q(`SELECT quantity + 0 AS q, unit_price + 0 AS p FROM h_inventory_lots WHERE batch_id = 7401`))[0];
      expect(Math.abs(Number(lot.q) * Number(lot.p) - 125000)).toBeLessThan(1); // 96kg × 1,302.08
    });

    it("기존 생산완료 분개(100,000) 와 현재 출고 원가(125,000) 가 다르면 배치 원가 확정 보류 + 차이 경고, 분개 그대로 (Codex #555 P2)", async () => {
      await q(`INSERT INTO expense_journal_entries (tenant_id, entry_date, description, total_debit, total_credit, posted_by) VALUES (?, '2026-10-14', '[생산완료] BATCH-7401', 100000, 100000, 4)`, [T]);
      await issue();
      const { runBatchCompletionHooks } = await import("./lib/production/batchCompletionHooks");
      const r = await runBatchCompletionHooks(7401, T, { source: "manual" } as any);
      expect(r.warnings.join()).toMatch(/COST_MISMATCH.*100000.*125000/);
      const b = (await q(`SELECT actual_cost, cost_finalized_at FROM h_batches WHERE id = 7401`))[0];
      expect([b.actual_cost, b.cost_finalized_at]).toEqual([null, null]); // 명시적 미확정
      expect((await q(`SELECT total_debit + 0 AS d FROM expense_journal_entries`)).map((x: any) => Number(x.d))).toEqual([100000]);
      // 같으면 그 값으로 확정
      await q(`UPDATE expense_journal_entries SET total_debit = 125000, total_credit = 125000`);
      const { finalizeBatchCost } = await import("./lib/production/batchCompletionHooks");
      expect(await finalizeBatchCost(admin, 7401, T)).toBe("finalized");
    });

    it("누락 분개 보충: 다른 이름으로 이 매입을 가리키는 분개(역분개 등) 가 있으면 건너뜀", async () => {
      await q(`INSERT INTO accounting_purchases (id, tenant_id, transaction_date, item_name, material_id, quantity, unit, unit_price, total_amount, tax_amount, tax_rate, status, created_by)
        VALUES (601, ?, '2026-09-01', '멥쌀', 700, 10, 'kg', 3000, 30000, 0, 0, 'approved', 4)`, [T]);
      await q(`INSERT INTO expense_journal_entries (tenant_id, entry_date, description, total_debit, total_credit, posted_by) VALUES (?, '2026-09-02', '[매입취소] PURCHASE-601 역분개', 30000, 30000, 4)`, [T]);
      const { backfillPurchaseJournal } = await import("./lib/accounting/purchasePost");
      const r = await backfillPurchaseJournal(601, T, 4, { apply: true });
      expect(r).toMatchObject({ status: "skip", reason: "other_journal" });
      expect(Number((await q(`SELECT COUNT(*) AS n FROM expense_journal_entries`))[0].n)).toBe(1);
      // PURCHASE-6010 같은 다른 번호는 같은 매입으로 보지 않음
      await q(`UPDATE expense_journal_entries SET description = '[매입취소] PURCHASE-6010'`);
      expect((await backfillPurchaseJournal(601, T, 4, { apply: false })).status).toBe("would_post");
    });
  });
  describe("입고 정본화 PR-1 — 입고 문서 스키마·중복 방지 키 (2026-10-17)", () => {
    beforeEach(async () => {
      for (const t of ["h_inbound_headers", "h_inbound_lines", "h_inventory_lots", "h_inventory_transactions", "h_inventory", "h_materials"]) await q(`DELETE FROM ${t}`);
      await q(`INSERT INTO h_materials (id, tenant_id, material_code, material_name, unit, is_active) VALUES (700, ?, 'M700', '멥쌀', 'kg', 1), (800, 3, 'M800', '타사', 'kg', 1)`, [T]);
    });

    it("필수 스키마: 새 컬럼·유니크 키가 있고, 다시 불러도 그대로 (기존 행 값 무변경)", async () => {
      const { ensureRequiredSchema } = await import("./db/startupMigrations");
      expect(await ensureRequiredSchema(admin, { allowDdl: true })).toMatchObject({ ok: true, missing: [] });
      const uniq = await q(`SELECT TABLE_NAME AS t, INDEX_NAME AS i FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND NON_UNIQUE = 0 AND INDEX_NAME IN ('uq_lot_tenant_inbound_line','uq_ibl_tenant_lot','uq_ibl_tenant_header_line','uq_ibh_tenant_idem') GROUP BY 1, 2 ORDER BY 2`);
      expect(uniq.map((r: any) => r.i)).toEqual(["uq_ibh_tenant_idem", "uq_ibl_tenant_header_line", "uq_ibl_tenant_lot", "uq_lot_tenant_inbound_line"]);
      expect((await q(`SELECT COLUMN_TYPE AS ct FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h_inbound_headers' AND COLUMN_NAME = 'status'`))[0].ct).toContain("pending_approval");
    });

    it("같은 이름이지만 컬럼 구성이 다른 키 — 필수 스키마가 ok:false (자동 재생성 안 함, Codex #557 검증 P2)", async () => {
      const { ensureRequiredSchema } = await import("./db/startupMigrations");
      await q(`ALTER TABLE h_inventory_lots DROP INDEX uq_lot_tenant_inbound_line, ADD UNIQUE KEY uq_lot_tenant_inbound_line (tenant_id, id)`);
      try {
        const r = await ensureRequiredSchema(admin, { allowDdl: true });
        expect(r.ok).toBe(false);
        expect(r.missing.join()).toMatch(/uq_lot_tenant_inbound_line 구성 불일치 — 기대 UNIQUE\(tenant_id, inbound_line_id\), 실제 UNIQUE\(tenant_id, id\)/);
      } finally {
        await q(`ALTER TABLE h_inventory_lots DROP INDEX uq_lot_tenant_inbound_line, ADD UNIQUE KEY uq_lot_tenant_inbound_line (tenant_id, inbound_line_id)`);
      }
      expect((await ensureRequiredSchema(admin, { allowDdl: false })).ok).toBe(true);
    });

    it("입고 줄 하나에 LOT 하나 — 같은 회사·같은 줄로 두 번째 LOT 은 DB 가 거부, 다른 회사·NULL 은 허용", async () => {
      const { withInventoryTx, receiveNewLot } = await import("./lib/inventory/applyInventoryDelta");
      const make = (tenantId: number, materialId: number, n: string, inboundLineId: number | null) =>
        withInventoryTx((conn) => receiveNewLot(conn, { tenantId, subject: { materialId }, lotNumber: n, quantity: 10, unit: "kg", inboundLineId, createdBy: 4 }));
      const r = await make(T, 700, "IB-1", 501);
      expect(Number((await q(`SELECT inbound_line_id FROM h_inventory_lots WHERE id = ?`, [r.lotId]))[0].inbound_line_id)).toBe(501);
      await expect(make(T, 700, "IB-2", 501)).rejects.toThrow(/Duplicate entry/);
      expect(Number((await q(`SELECT COUNT(*) AS n FROM h_inventory_transactions`))[0].n)).toBe(1); // 실패한 두 번째는 원장도 남기지 않음
      await make(3, 800, "IB-3", 501); // 다른 회사
      await make(T, 700, "IB-4", null);
      await make(T, 700, "IB-5", null); // 기존처럼 NULL 은 여러 개
      expect(Number((await q(`SELECT COUNT(*) AS n FROM h_inventory_lots`))[0].n)).toBe(4);
    });

    it("문서: 승인 대기 상태 저장, 같은 회사·같은 키 문서 / 같은 문서 줄 번호 / 같은 LOT 두 줄은 거부", async () => {
      await q(`INSERT INTO h_inbound_headers (id, tenant_id, inbound_number, site_id, inbound_date, status, created_by, idempotency_key, source_type)
        VALUES (61, ?, 'IB-2-1', 1, '2026-10-17', 'pending_approval', 4, 'k-1', 'direct')`, [T]);
      await expect(q(`INSERT INTO h_inbound_headers (tenant_id, inbound_number, site_id, inbound_date, status, created_by, idempotency_key) VALUES (?, 'IB-2-2', 1, '2026-10-17', 'draft', 4, 'k-1')`, [T])).rejects.toThrow(/Duplicate entry/);
      await q(`INSERT INTO h_inbound_headers (tenant_id, inbound_number, site_id, inbound_date, status, created_by, idempotency_key) VALUES (3, 'IB-3-1', 1, '2026-10-17', 'draft', 4, 'k-1')`);
      const line = (n: number, lot: number | null) => q(`INSERT INTO h_inbound_lines (tenant_id, header_id, line_number, material_id, purchase_quantity, purchase_unit, stock_quantity, stock_unit, unit_price, total_price, lot_id)
        VALUES (?, 61, ?, 700, 10, 'kg', 10, 'kg', 1000, 10000, ?)`, [T, n, lot]);
      await line(1, 9001);
      await expect(line(1, null)).rejects.toThrow(/Duplicate entry/);
      await expect(line(2, 9001)).rejects.toThrow(/Duplicate entry/);
      await line(2, null);
      const l = (await q(`SELECT cancelled_qty + 0 AS c, inspection_result FROM h_inbound_lines WHERE line_number = 2`))[0];
      expect([Number(l.c), l.inspection_result]).toEqual([0, null]);
    });
  });
  describe("입고 정본화 PR-2 — 입고 확정 단일 처리 (발주서 입고·직접 입고, 2026-10-17)", () => {
    let svc: any;
    beforeAll(async () => { svc = await import("./lib/inventory/inbound/inboundService"); });
    beforeEach(async () => {
      for (const t of ["h_inbound_headers", "h_inbound_lines", "h_inventory_lots", "h_inventory_transactions", "h_inventory", "h_materials", "item_master", "material_ledger_daily", "purchase_orders", "purchase_order_lines", "accounting_purchases", "tenant_feature_settings", "domain_events", "partners", "expense_journal_entries", "expense_journal_lines", "material_pack_units"]) await q(`DELETE FROM ${t}`);
      await q(`INSERT INTO h_materials (id, tenant_id, material_code, material_name, unit, is_active) VALUES (700, ?, 'M700', '멥쌀', 'kg', 1), (800, 3, 'M800', '타사', 'kg', 1)`, [T]);
      await q(`INSERT INTO item_master (id, tenant_id, item_code, item_name, item_type, base_unit, is_active, legacy_material_id) VALUES (1700, ?, 'M700', '멥쌀', 'raw_material', 'kg', 1, 700)`, [T]);
      await q(`INSERT INTO purchase_orders (id, tenant_id, po_number, partner_id, order_date, status, created_by) VALUES (31, ?, 'PO-31', 0, '2026-10-17', 'approved', 4)`, [T]);
      await q(`INSERT INTO purchase_order_lines (id, tenant_id, po_id, line_number, material_id, item_name, ordered_qty, received_qty, unit, unit_price, amount) VALUES (311, ?, 31, 1, 1700, '멥쌀', 100, 0, 'kg', 2000, 200000)`, [T]);
    });
    const line = (qty: number, extra: any = {}) => ({ materialId: 700, purchaseQuantity: qty, purchaseUnit: "kg", stockQuantity: qty, stockUnit: "kg", unitPrice: 2000, ...extra });
    const draft = (key: string, lines: any[], extra: any = {}) => svc.createInboundDraft({ tenantId: T, userId: 4, idempotencyKey: key, sourceType: "direct", inboundDate: "2026-10-17", lines, ...extra });
    const fromPo = (key: string, qty: number) => draft(key, [line(qty, { poLineId: 311 })], { sourceType: "purchase_order", poId: 31 });
    const counts = async () => [
      Number((await q(`SELECT COUNT(*) AS n FROM h_inventory_lots`))[0].n),
      Number((await q(`SELECT COUNT(*) AS n FROM h_inventory_transactions`))[0].n),
      Number((await q(`SELECT COALESCE(SUM(available_quantity), 0) + 0 AS a FROM h_inventory WHERE material_id = 700`))[0].a),
    ];
    const received = async () => Number((await q(`SELECT received_qty + 0 AS r FROM purchase_order_lines WHERE id = 311`))[0].r);
    const poStatus = async () => (await q(`SELECT status FROM purchase_orders WHERE id = 31`))[0].status;

    it("직접 입고: 같은 키로 두 번 만들어도 문서 하나, 확정 두 번·동시 두 번이어도 LOT·원장 한 번, 집계 = LOT 합, 수불부 반영", async () => {
      const a = await draft("key-direct-1", [line(50, { expiryDate: "2027-01-01" })]);
      const b = await draft("key-direct-1", [line(50)]);
      expect([a.created, b.created, b.headerId]).toEqual([true, false, a.headerId]);
      expect(await counts()).toEqual([0, 0, 0]); // 문서만으로는 재고 없음
      const rs = await Promise.all([svc.confirmInbound(a.headerId, T, 4), svc.confirmInbound(a.headerId, T, 4)]);
      expect(rs.filter((r: any) => r.alreadyProcessed === false).length).toBe(1);
      expect(await counts()).toEqual([1, 1, 50]);
      const lot = (await q(`SELECT inbound_line_id, expiry_date, receipt_date, unit_price + 0 AS p FROM h_inventory_lots`))[0];
      const ln = (await q(`SELECT id, lot_id, receipt_tx_id FROM h_inbound_lines`))[0];
      expect([Number(lot.inbound_line_id), String(lot.expiry_date).length > 0, Number(lot.p)]).toEqual([Number(ln.id), true, 2000]);
      expect(ln.lot_id).not.toBeNull();
      expect(ln.receipt_tx_id).not.toBeNull();
      expect(Number((await q(`SELECT receiving_qty + 0 AS r FROM material_ledger_daily WHERE material_id = 700`))[0].r)).toBe(50);
      expect((await q(`SELECT status FROM h_inbound_headers`))[0].status).toBe("confirmed");
      expect(Number((await q(`SELECT COUNT(*) AS n FROM domain_events WHERE event_type = 'inbound.confirmed'`))[0].n)).toBe(1);
    });

    it("발주서 입고 부분 입고: 100 발주 → 30 확정 → 잔량 70 → 80 거부(재고 무변경) → 70 확정 → 입고 완료", async () => {
      await svc.confirmInbound((await fromPo("key-po-30", 30)).headerId, T, 4);
      expect([await received(), await poStatus()]).toEqual([30, "partial_received"]);
      expect((await svc.getReceivableLines(31, T))[0].remainingQty).toBe(70);
      const over = await fromPo("key-po-80", 80);
      await expect(svc.confirmInbound(over.headerId, T, 4)).rejects.toThrow(/잔량 70/);
      expect(await counts()).toEqual([1, 1, 30]);
      await svc.confirmInbound((await fromPo("key-po-70", 70)).headerId, T, 4);
      expect([await received(), await poStatus()]).toEqual([100, "received"]);
      // 발주 줄 품목(item_master 1700) 이 아니라 원재료 id(700) 로 입고
      expect((await q(`SELECT DISTINCT material_id FROM h_inventory_lots`)).map((r: any) => Number(r.material_id))).toEqual([700]);
    });

    it("여러 줄 중 하나라도 실패하면 전부 되돌림 (LOT 0, 발주 입고량 무변경)", async () => {
      await q(`INSERT INTO h_inventory_lots (id, tenant_id, material_id, lot_number, quantity, current_quantity, available_quantity, unit, status) VALUES (9601, ?, 700, 'DUP-LOT', 1, 1, 1, 'kg', 'available')`, [T]);
      const d = await draft("key-multi", [line(10, { poLineId: 311 }), line(5, { poLineId: 311, lotNumber: "DUP-LOT" })], { sourceType: "purchase_order", poId: 31 });
      await expect(svc.confirmInbound(d.headerId, T, 4)).rejects.toThrow(/Duplicate entry/);
      expect(Number((await q(`SELECT COUNT(*) AS n FROM h_inventory_lots`))[0].n)).toBe(1);
      expect([await received(), (await q(`SELECT status FROM h_inbound_headers`))[0].status]).toEqual([0, "draft"]);
    });

    it("승인 필요 회사: 확정 요청은 승인 대기(재고 없음) → 승인 시 한 번 반영", async () => {
      await q(`INSERT INTO tenant_feature_settings (tenant_id, feature_code, enabled) VALUES (?, 'INBOUND_APPROVAL', 1)`, [T]);
      const d = await draft("key-approve", [line(20)]);
      expect(await svc.confirmInbound(d.headerId, T, 4)).toEqual({ status: "pending_approval" });
      expect(await counts()).toEqual([0, 0, 0]);
      expect((await svc.approveInbound(d.headerId, T, 9)).status).toBe("confirmed");
      expect(await counts()).toEqual([1, 1, 20]);
      expect(Number((await q(`SELECT approved_by FROM h_inbound_headers`))[0].approved_by)).toBe(9);
    });

    it("입고 줄 취소: 일부 사용됐으면 거부, 아니면 LOT 차감·취소 수량·발주 입고량 감소·문서 취소, 연결 전표 있으면 거부", async () => {
      const d = await fromPo("key-cancel", 40);
      await svc.confirmInbound(d.headerId, T, 4);
      const lineId = Number((await q(`SELECT id FROM h_inbound_lines`))[0].id);
      await q(`DELETE FROM accounting_purchases`); // 발주 입고가 만든 전표 초안 — 이 시험은 아래에서 직접 연결 전표를 다룬다
      await q(`UPDATE h_inventory_lots SET available_quantity = 35, current_quantity = 35`);
      await expect(svc.cancelInboundLine(lineId, T, 4)).rejects.toThrow(/이미 일부 사용/);
      await q(`UPDATE h_inventory_lots SET available_quantity = 40, current_quantity = 40`);
      await q(`INSERT INTO accounting_purchases (id, tenant_id, transaction_date, item_name, quantity, unit, unit_price, total_amount, status, created_by, inbound_line_id) VALUES (701, ?, '2026-10-17', '멥쌀', 40, 'kg', 2000, 80000, 'pending', 4, ?)`, [T, lineId]);
      await expect(svc.cancelInboundLine(lineId, T, 4)).rejects.toThrow(/매입전표 #701/);
      await q(`UPDATE accounting_purchases SET status = 'cancelled' WHERE id = 701`);
      expect(await svc.cancelInboundLine(lineId, T, 4, "반품")).toEqual({ cancelledQty: 40 });
      const l = (await q(`SELECT cancelled_qty + 0 AS c FROM h_inbound_lines`))[0];
      expect([Number(l.c), await received(), await poStatus(), (await q(`SELECT status FROM h_inbound_headers`))[0].status]).toEqual([40, 0, "approved", "cancelled"]);
      expect(Number((await q(`SELECT available_quantity + 0 AS a FROM h_inventory_lots`))[0].a)).toBe(0);
      await expect(svc.cancelInboundLine(lineId, T, 4)).rejects.toThrow(/이미 취소/);
    });

    it("발주서 입고 확정 → 대기 매입전표 초안(입고 줄 연결) → 전표 확정은 분개만(재고 재생성 없음) → 전표 취소도 분개만", async () => {
      await q(`UPDATE purchase_order_lines SET tax_amount = 20000 WHERE id = 311`);
      await q(`INSERT INTO accounting_accounts (id, tenant_id, category, code, system_code, name, is_active) VALUES
        (70, ?, 'liabilities', '2010', 'ACCOUNTS_PAYABLE', '외상매입금', 'Y'), (71, ?, 'assets', '1350', 'VAT_INPUT', '부가세대급금', 'Y')`, [T, T]);
      const d = await fromPo("key-voucher", 30);
      const r = await svc.confirmInbound(d.headerId, T, 4);
      expect(r.voucherIds.length).toBe(1);
      const v = (await q(`SELECT id, status, inbound_line_id, material_id, quantity + 0 AS qty, total_amount + 0 AS amt, tax_amount + 0 AS tax FROM accounting_purchases`))[0];
      const lineId = Number((await q(`SELECT id FROM h_inbound_lines`))[0].id);
      expect([v.status, Number(v.inbound_line_id), Number(v.material_id), Number(v.qty), Number(v.amt), Number(v.tax)]).toEqual(["pending", lineId, 700, 30, 60000, 6000]);
      // 같은 문서를 다시 확정해도 전표는 그대로 하나
      expect((await svc.confirmInbound(d.headerId, T, 4)).voucherIds).toEqual([Number(v.id)]);
      const before = await counts();
      const ibh = Number((await q(`SELECT COUNT(*) AS n FROM h_inbound_headers`))[0].n);
      const mld = Number((await q(`SELECT receiving_qty + 0 AS r FROM material_ledger_daily`))[0].r);
      const { postPurchase } = await import("./lib/accounting/purchasePost");
      expect(await postPurchase(Number(v.id), 4, T)).toEqual({ alreadyProcessed: false });
      expect(await counts()).toEqual(before); // LOT·원장·집계 그대로
      expect(Number((await q(`SELECT COUNT(*) AS n FROM h_inbound_headers`))[0].n)).toBe(ibh); // 입고전표 추가 없음
      expect(Number((await q(`SELECT receiving_qty + 0 AS r FROM material_ledger_daily`))[0].r)).toBe(mld); // 수불부 이중 가산 없음
      const je = await q(`SELECT total_debit + 0 AS d FROM expense_journal_entries WHERE description LIKE '[매입] PURCHASE-%'`);
      expect(je.map((x: any) => Number(x.d))).toEqual([66000]);
      const { cancelPurchase } = await import("./lib/accounting/purchaseCancel");
      await cancelPurchase(Number(v.id), 4, T);
      expect(await counts()).toEqual(before); // 재고는 입고 문서가 담당 — 전표 취소는 분개만
      expect(Number((await q(`SELECT COUNT(*) AS n FROM expense_journal_entries WHERE description LIKE '[매입취소] PURCHASE-%'`))[0].n)).toBe(1);
      // 전표가 취소됐으니 이제 입고 줄 취소 가능
      await svc.cancelInboundLine(lineId, T, 4);
      expect(Number((await q(`SELECT available_quantity + 0 AS a FROM h_inventory_lots`))[0].a)).toBe(0);
    });

    it("PR-4 직접 입고: 단가 있으면 입고 줄 연결 전표 초안, 영수증 전표 재생성 없음, 전표 취소는 구형 참조가 있어도 재고 무변경", async () => {
      await q(`INSERT INTO accounting_accounts (id, tenant_id, category, code, system_code, name, is_active) VALUES
        (70, ?, 'liabilities', '2010', 'ACCOUNTS_PAYABLE', '외상매입금', 'Y'), (71, ?, 'assets', '1350', 'VAT_INPUT', '부가세대급금', 'Y')`, [T, T]);
      const r = await svc.receiveDirect({ tenantId: T, userId: 4, materialId: 1700, quantity: 25, unit: "kg", unitPrice: 2000, receiptDate: "2026-10-17", expiryDate: "2027-02-01", createVoucherDraft: true });
      expect([r.lotId > 0, r.voucherIds.length]).toEqual([true, 1]);
      expect((await q(`SELECT source_type FROM h_inbound_headers`))[0].source_type).toBe("direct");
      expect(Number((await q(`SELECT material_id FROM h_inventory_lots`))[0].material_id)).toBe(700); // item_master 1700 → 700
      // 입고 후 '매입 거래 생성' (영수증 → 전표) 을 또 불러도 같은 전표
      const hi = await import("./db/haccp/haccpIntegration");
      const again: any = await hi.createPurchaseFromReceipt({ lotId: r.lotId, itemName: "멥쌀", quantity: "25", unit: "kg", unitPrice: "2000", createdBy: 4 }, T);
      expect(Number(again.id)).toBe(r.voucherIds[0]);
      expect(Number((await q(`SELECT COUNT(*) AS n FROM accounting_purchases`))[0].n)).toBe(1);
      const { postPurchase } = await import("./lib/accounting/purchasePost");
      const before = await counts();
      await postPurchase(r.voucherIds[0], 4, T);
      expect(await counts()).toEqual(before);
      // 구형 참조 규약(reference accounting_purchase = 전표 id) 의 receipt 원장이 우연히 있어도 전표 취소는 재고를 건드리지 않음
      await q(`INSERT INTO h_inventory_transactions (tenant_id, lot_id, material_id, transaction_type, quantity, unit, reference_type, reference_id, created_by)
        VALUES (?, ?, 700, 'receipt', 25, 'kg', 'accounting_purchase', ?, 4)`, [T, r.lotId, r.voucherIds[0]]);
      const { cancelPurchase } = await import("./lib/accounting/purchaseCancel");
      await cancelPurchase(r.voucherIds[0], 4, T);
      expect(Number((await q(`SELECT available_quantity + 0 AS a FROM h_inventory_lots WHERE id = ?`, [r.lotId]))[0].a)).toBe(25);
      // 재고는 입고 줄 취소에서 한 번만
      await svc.cancelInboundLine(r.lineId, T, 4);
      expect(Number((await q(`SELECT available_quantity + 0 AS a FROM h_inventory_lots WHERE id = ?`, [r.lotId]))[0].a)).toBe(0);
    });

    it("PR-4 재고 화면 입고(createLot·receiveMaterial) 도 입고 문서 경유 — 전표 없음, 날짜 그대로", async () => {
      const inv = await import("./db/inventory/inventoryFunctions");
      await inv.createInventoryLot({ materialId: 700, lotNumber: "MAN-1", quantity: "5", unit: "kg", expiryDate: new Date("2027-03-01T00:00:00+09:00"), receiptDate: new Date("2026-10-17T00:00:00+09:00"), userId: 4, tenantId: T });
      await inv.receiveMaterial({ materialId: 700, quantity: 3, unit: "kg", receiptDate: "2026-10-16", expiryDate: "2027-01-31", tenantId: T, userId: 4 });
      const lots = await q(`SELECT lot_number, DATE_FORMAT(expiry_date, '%Y-%m-%d') AS e, DATE_FORMAT(receipt_date, '%Y-%m-%d') AS r, inbound_line_id FROM h_inventory_lots ORDER BY id`);
      expect(lots.map((l: any) => [l.e, l.r, l.inbound_line_id != null])).toEqual([["2027-03-01", "2026-10-17", true], ["2027-01-31", "2026-10-16", true]]);
      expect(lots[0].lot_number).toBe("MAN-1");
      expect(Number((await q(`SELECT COUNT(*) AS n FROM h_inbound_headers WHERE status = 'confirmed' AND source_type = 'direct'`))[0].n)).toBe(2);
      expect(Number((await q(`SELECT COUNT(*) AS n FROM accounting_purchases`))[0].n)).toBe(0);
    });

    it("포장 단위 환산: 설정 없으면 차단 → 1포대=20kg 설정 → 3포대 입고 = 재고 60kg·발주 입고량 3포대, 환산값 보존(설정 변경 무관)", async () => {
      await q(`DELETE FROM material_pack_units`);
      await q(`INSERT INTO purchase_orders (id, tenant_id, po_number, partner_id, order_date, status, created_by) VALUES (33, ?, 'PO-33', 0, '2026-10-17', 'approved', 4)`, [T]);
      await q(`INSERT INTO purchase_order_lines (id, tenant_id, po_id, line_number, material_id, item_name, ordered_qty, received_qty, unit, unit_price, amount) VALUES (331, ?, 33, 1, 1700, '멥쌀', 10, 0, '포대', 40000, 400000)`, [T]);
      const bag = (key: string, qty: number, extra: any = {}) => draft(key, [{ materialId: 700, poLineId: 331, purchaseQuantity: qty, purchaseUnit: "포대", unitPrice: 40000, ...extra }], { sourceType: "purchase_order", poId: 33 });
      await expect(bag("key-pack-none", 3)).rejects.toThrow(/환산 설정이 없습니다/);
      expect((await svc.getReceivableLines(33, T))[0]).toMatchObject({ conversion: null });
      const pu = await import("./lib/inventory/inbound/packUnits");
      await expect(pu.upsertPackUnit(admin, { tenantId: T, userId: 4, materialId: 700, packUnit: "kg", baseQty: 1 })).rejects.toThrow(/기준 단위와 같은/);
      await pu.upsertPackUnit(admin, { tenantId: T, userId: 4, materialId: 700, packUnit: "포대", baseQty: 20 });
      expect((await svc.getReceivableLines(33, T))[0].conversion).toEqual({ factor: 20, baseUnit: "kg" });
      await expect(bag("key-pack-bad", 3, { stockQuantity: 50 })).rejects.toThrow(/환산 결과 60kg/);
      const d = await bag("key-pack-3", 3);
      const ln = (await q(`SELECT stock_quantity + 0 AS s, stock_unit, pack_factor + 0 AS f, pack_conversion_id FROM h_inbound_lines WHERE header_id = ?`, [d.headerId]))[0];
      expect([Number(ln.s), ln.stock_unit, Number(ln.f), ln.pack_conversion_id != null]).toEqual([60, "kg", 20, true]);
      await pu.upsertPackUnit(admin, { tenantId: T, userId: 4, materialId: 700, packUnit: "포대", baseQty: 25 }); // 초안 뒤 규격 변경
      await svc.confirmInbound(d.headerId, T, 4);
      const lot = (await q(`SELECT quantity + 0 AS q, unit, unit_price + 0 AS p FROM h_inventory_lots`))[0];
      expect([Number(lot.q), lot.unit, Number(lot.p)]).toEqual([60, "kg", 2000]); // 120,000원 / 60kg
      expect(Number((await q(`SELECT received_qty + 0 AS r FROM purchase_order_lines WHERE id = 331`))[0].r)).toBe(3);
      expect(Number((await q(`SELECT receiving_qty + 0 AS r FROM material_ledger_daily`))[0].r)).toBe(60);
      // 새 입고는 새 설정(25)
      const d2 = await bag("key-pack-2", 2);
      expect(Number((await q(`SELECT stock_quantity + 0 AS s FROM h_inbound_lines WHERE header_id = ?`, [d2.headerId]))[0].s)).toBe(50);
      // 설정을 끄면 다시 차단
      const id = Number((await q(`SELECT id FROM material_pack_units`))[0].id);
      await pu.deactivatePackUnit(admin, T, 4, id);
      await expect(bag("key-pack-off", 1)).rejects.toThrow(/환산 설정이 없습니다/);
      // 직접 입고도 같은 환산 (포대 → kg)
      await pu.upsertPackUnit(admin, { tenantId: T, userId: 4, materialId: 700, packUnit: "포대", baseQty: 20 });
      const r = await svc.receiveDirect({ tenantId: T, userId: 4, materialId: 700, quantity: 2, unit: "포대", unitPrice: 0, receiptDate: "2026-10-17", createVoucherDraft: false });
      expect(Number((await q(`SELECT quantity + 0 AS q FROM h_inventory_lots WHERE id = ?`, [r.lotId]))[0].q)).toBe(40);
    });

    it("재고관리 사용 여부 (CEO 결정 2): 설정 없으면 패키지(HACCP) 기준, 회계만 회사는 입고가 LOT·재고 없이 수량·전표만, 설정이 우선", async () => {
      const pol = await import("./lib/inventory/inventoryTrackingPolicy");
      await q(`DELETE FROM tenants WHERE id IN (2, 3)`);
      await q(`INSERT INTO tenants (id, name, slug, subscription_package) VALUES (2, '단지', 'danji', 'standard')`).catch(async () => {
        const cols = (await q(`SHOW COLUMNS FROM tenants`)).filter((c: any) => c.Null === "NO" && c.Default == null && c.Extra !== "auto_increment").map((c: any) => c.Field);
        throw new Error(`tenants 필수 컬럼: ${cols.join(",")}`);
      });
      try {
        expect(await pol.getInventoryTrackingSetting(T, admin)).toEqual({ enabled: false, source: "package" }); // standard = ERP 전용
        // 회계만: 발주 입고 → LOT·원장·수불부 없음, 발주 입고량·전표 초안은 있음
        await q(`UPDATE purchase_order_lines SET unit = 'kg' WHERE id = 311`);
        const d = await fromPo("key-acct-only", 30);
        const r = await svc.confirmInbound(d.headerId, T, 4);
        expect([r.lots[0].lotId, r.voucherIds.length]).toEqual([0, 1]);
        expect(await counts()).toEqual([0, 0, 0]);
        expect([await received(), await poStatus()]).toEqual([30, "partial_received"]);
        expect(Number((await q(`SELECT COUNT(*) AS n FROM material_ledger_daily`))[0].n)).toBe(0);
        // 입고 줄 취소도 수량 기록만
        await q(`UPDATE accounting_purchases SET status = 'cancelled'`);
        await svc.cancelInboundLine(r.lots[0].lineId, T, 4);
        expect(await received()).toBe(0);
        // 회사 설정이 우선 — ERP 패키지라도 재고관리 사용
        await q(`INSERT INTO tenant_feature_settings (tenant_id, feature_code, enabled) VALUES (?, 'INVENTORY_TRACKING', 1)`, [T]);
        expect(await pol.getInventoryTrackingSetting(T, admin)).toEqual({ enabled: true, source: "setting" });
        const r2 = await svc.receiveDirect({ tenantId: T, userId: 4, materialId: 700, quantity: 4, unit: "kg", receiptDate: "2026-10-17", createVoucherDraft: false });
        expect(r2.lotId).toBeGreaterThan(0);
        await q(`UPDATE tenant_feature_settings SET enabled = 0 WHERE feature_code = 'INVENTORY_TRACKING'`);
        expect(await pol.isInventoryTrackingEnabled(T, admin)).toBe(false);
      } finally {
        await q(`DELETE FROM tenants WHERE id = 2`);
        await q(`DELETE FROM tenant_feature_settings WHERE feature_code = 'INVENTORY_TRACKING'`);
      }
      expect(await pol.getInventoryTrackingSetting(T, admin)).toEqual({ enabled: true, source: "package" }); // 회사 행 없음 → 기존 기본(HACCP)
    });

    // ── Codex #560 검증 N1~N6 회귀 ──
    it("N1 같은 입고 줄 전표 동시 3회 생성 → 전표 1장·분개 1벌, 취소 뒤 재발행은 새 1장", async () => {
      await q(`INSERT INTO accounting_accounts (id, tenant_id, category, code, system_code, name, is_active) VALUES
        (70, ?, 'liabilities', '2010', 'ACCOUNTS_PAYABLE', '외상매입금', 'Y'), (71, ?, 'assets', '1350', 'VAT_INPUT', '부가세대급금', 'Y')`, [T, T]);
      const r = await svc.receiveDirect({ tenantId: T, userId: 4, materialId: 700, quantity: 25, unit: "kg", unitPrice: 2000, receiptDate: "2026-10-16", createVoucherDraft: false });
      const hi = await import("./db/haccp/haccpIntegration");
      const mk = () => hi.createPurchaseFromReceipt({ lotId: r.lotId, itemName: "멥쌀", quantity: "25", unit: "kg", unitPrice: "2000", createdBy: 4 }, T);
      const vs: any[] = await Promise.all([mk(), mk(), mk()]);
      expect(new Set(vs.map((v) => Number(v.id))).size).toBe(1);
      expect(String(vs[0].transaction_date).slice(0, 10)).toBe("2026-10-16"); // 전표일 = 입고일
      const { postPurchase } = await import("./lib/accounting/purchasePost");
      await Promise.all([postPurchase(Number(vs[0].id), 4, T), postPurchase(Number(vs[0].id), 4, T)]);
      expect(Number((await q(`SELECT COUNT(*) AS n FROM expense_journal_entries WHERE description LIKE '[매입] PURCHASE-%'`))[0].n)).toBe(1);
      expect(Number((await q(`SELECT available_quantity + 0 AS a FROM h_inventory_lots`))[0].a)).toBe(25);
      await q(`UPDATE accounting_purchases SET status = 'cancelled'`);
      const re: any = await mk();
      expect(Number(re.id)).not.toBe(Number(vs[0].id));
      expect(Number((await q(`SELECT COUNT(*) AS n FROM accounting_purchases WHERE status <> 'cancelled'`))[0].n)).toBe(1);
      await expect(q(`UPDATE accounting_purchases SET status = 'pending' WHERE id = ?`, [vs[0].id])).rejects.toThrow(/Duplicate entry/); // DB 가 살아 있는 전표 하나 보장
    });

    it("N2 LOT 번호와 재고거래 번호를 구분 — 같은 숫자가 다른 입고를 가리켜도 요청한 종류로만, 원료는 입고 줄에서", async () => {
      const A = await svc.receiveDirect({ tenantId: T, userId: 4, materialId: 700, quantity: 5, unit: "kg", unitPrice: 1000, receiptDate: "2026-10-17", createVoucherDraft: true });
      const B = await svc.receiveDirect({ tenantId: T, userId: 4, materialId: 700, quantity: 7, unit: "kg", unitPrice: 1000, receiptDate: "2026-10-17", createVoucherDraft: true });
      await q(`INSERT INTO h_inventory_transactions (id, tenant_id, lot_id, material_id, transaction_type, quantity, unit, created_by) VALUES (?, ?, ?, 700, 'receipt', 0, 'kg', 4)`, [B.lotId, T, A.lotId]);
      const hi = await import("./db/haccp/haccpIntegration");
      const byLot: any = await hi.createPurchaseFromReceipt({ lotId: B.lotId, itemName: "x", quantity: "1", unit: "kg", unitPrice: "1", createdBy: 4 }, T);
      const byTx: any = await hi.createPurchaseFromReceipt({ inventoryTransactionId: B.lotId, itemName: "x", quantity: "1", unit: "kg", unitPrice: "1", createdBy: 4 }, T);
      expect([Number(byLot.id), Number(byTx.id)]).toEqual([B.voucherIds[0], A.voucherIds[0]]);
      expect([Number(byLot.material_id), Number(byLot.quantity)]).toEqual([700, 7]);
      await expect(hi.createPurchaseFromReceipt({ lotId: B.lotId, itemName: "x", quantity: "1", unit: "kg", unitPrice: "1", createdBy: 4 }, 3)).rejects.toThrow(/찾을 수 없습니다/);
    });

    it("N3 수동 LOT 단가 보존 (25kg × 2,000) / 단가 없던 LOT 은 연결 전표 확정 때 원가, 이미 쓰인 LOT 은 소급 안 하고 확정 보류 (R3)", async () => {
      await q(`INSERT INTO accounting_accounts (id, tenant_id, category, code, system_code, name, is_active) VALUES
        (70, ?, 'liabilities', '2010', 'ACCOUNTS_PAYABLE', '외상매입금', 'Y'), (71, ?, 'assets', '1350', 'VAT_INPUT', '부가세대급금', 'Y')`, [T, T]);
      const inv = await import("./db/inventory/inventoryFunctions");
      const m = await inv.createInventoryLot({ materialId: 700, lotNumber: "MAN-P", quantity: "25", unit: "kg", unitPrice: 2000, userId: 4, tenantId: T });
      expect(Number((await q(`SELECT unit_price + 0 AS p FROM h_inventory_lots WHERE id = ?`, [m.lotId]))[0].p)).toBe(2000);
      const u = await inv.createInventoryLot({ materialId: 700, lotNumber: "MAN-0", quantity: "25", unit: "kg", userId: 4, tenantId: T });
      const hi = await import("./db/haccp/haccpIntegration");
      const v: any = await hi.createPurchaseFromReceipt({ lotId: u.lotId, itemName: "멥쌀", quantity: "25", unit: "kg", unitPrice: "2000", createdBy: 4 }, T);
      expect(Number(v.total_amount)).toBe(50000);
      const { postPurchase } = await import("./lib/accounting/purchasePost");
      await postPurchase(Number(v.id), 4, T);
      expect(Number((await q(`SELECT unit_price + 0 AS p, quantity + 0 AS q FROM h_inventory_lots WHERE id = ?`, [u.lotId]))[0].p)).toBe(2000);
      const d1 = (await q(`SELECT l.debit_amount + 0 AS d FROM expense_journal_lines l WHERE l.account_code = '1410'`)).map((r: any) => Number(r.d));
      expect(d1).toEqual([50000]);
      // 이미 쓰인 무단가 LOT — 소급하지 않음
      const w = await inv.createInventoryLot({ materialId: 700, lotNumber: "MAN-USED", quantity: "10", unit: "kg", userId: 4, tenantId: T });
      await q(`INSERT INTO h_inventory_transactions (tenant_id, lot_id, material_id, transaction_type, quantity, unit, created_by) VALUES (?, ?, 700, 'usage', 2, 'kg', 4)`, [T, w.lotId]);
      const v2: any = await hi.createPurchaseFromReceipt({ lotId: w.lotId, itemName: "멥쌀", quantity: "10", unit: "kg", unitPrice: "2000", createdBy: 4 }, T);
      // R3: LOT 평가액(0) 과 회계 자산(20,000) 이 달라지므로 확정하지 않는다 — 전표는 대기, 분개 없음
      await expect(postPurchase(Number(v2.id), 4, T)).rejects.toThrow(/이미 사용돼 단가를 소급할 수 없습니다/);
      expect(Number((await q(`SELECT COALESCE(unit_price, 0) + 0 AS p FROM h_inventory_lots WHERE id = ?`, [w.lotId]))[0].p)).toBe(0);
      expect((await q(`SELECT status FROM accounting_purchases WHERE id = ?`, [v2.id]))[0].status).toBe("pending");
      expect((await q(`SELECT l.debit_amount + 0 AS d FROM expense_journal_lines l WHERE l.account_code = '1410'`)).map((r: any) => Number(r.d))).toEqual([50000]);
    });

    it("N4 거래처: 선택 id → 전표·LOT, 자유 입력 → LOT 공급자 원문·전표 거래처 없음, 다른 회사 거래처 거부", async () => {
      await q(`INSERT INTO partners (id, tenant_id, company_name) VALUES (17, ?, '미래농산'), (18, 3, '타사거래처')`, [T]).catch(async () => q(`INSERT INTO partners (id, tenant_id, company_name, partner_type) VALUES (17, ?, '미래농산', 'supplier'), (18, 3, '타사거래처', 'supplier')`, [T]));
      const a = await svc.receiveDirect({ tenantId: T, userId: 4, materialId: 700, quantity: 5, unit: "kg", unitPrice: 1000, supplierId: 17, receiptDate: "2026-10-17", createVoucherDraft: true });
      const b = await svc.receiveDirect({ tenantId: T, userId: 4, materialId: 700, quantity: 5, unit: "kg", unitPrice: 1000, supplierName: "동네방앗간", receiptDate: "2026-10-17", createVoucherDraft: true });
      const lot = async (id: number) => (await q(`SELECT supplier_name FROM h_inventory_lots WHERE id = ?`, [id]))[0].supplier_name;
      const vp = async (id: number) => (await q(`SELECT partner_id FROM accounting_purchases WHERE id = ?`, [id]))[0].partner_id;
      expect([await lot(a.lotId), Number(await vp(a.voucherIds[0]))]).toEqual(["미래농산", 17]);
      expect([await lot(b.lotId), await vp(b.voucherIds[0])]).toEqual(["동네방앗간", null]);
      await expect(svc.receiveDirect({ tenantId: T, userId: 4, materialId: 700, quantity: 1, unit: "kg", supplierId: 18, receiptDate: "2026-10-17", createVoucherDraft: false })).rejects.toThrow(/거래처를 찾을 수 없습니다/);
    });

    it("N5 승인 필요 회사의 직접 입고: 대기 중 재고·전표 없음 → 승인 때 문서에 보존된 정책대로 LOT·연결 전표 각 1", async () => {
      await q(`INSERT INTO tenant_feature_settings (tenant_id, feature_code, enabled) VALUES (?, 'INBOUND_APPROVAL', 1)`, [T]);
      const r = await svc.receiveDirect({ tenantId: T, userId: 4, materialId: 700, quantity: 8, unit: "kg", unitPrice: 1000, receiptDate: "2026-10-17", createVoucherDraft: true });
      expect([r.status, r.lotId]).toEqual(["pending_approval", 0]);
      expect([await counts(), Number((await q(`SELECT COUNT(*) AS n FROM accounting_purchases`))[0].n)]).toEqual([[0, 0, 0], 0]);
      const a = await svc.approveInbound(r.headerId, T, 9);
      expect(a.status).toBe("confirmed");
      expect((a as any).voucherIds.length).toBe(1);
      expect(Number((await q(`SELECT inbound_line_id FROM accounting_purchases`))[0].inbound_line_id)).toBe((a as any).lots[0].lineId);
    });

    it("N6 receiveMaterial 같은 요청 키 재시도 = 입고 한 번, 다른 키 = 두 번", async () => {
      const inv = await import("./db/inventory/inventoryFunctions");
      const call = (key: string) => inv.receiveMaterial({ materialId: 700, quantity: 3, unit: "kg", receiptDate: "2026-10-17", tenantId: T, userId: 4, idempotencyKey: key });
      await Promise.all([call("key-n6-aaaa"), call("key-n6-aaaa")]);
      await call("key-n6-aaaa");
      expect(Number((await q(`SELECT COALESCE(SUM(available_quantity), 0) + 0 AS a FROM h_inventory_lots`))[0].a)).toBe(3);
      await call("key-n6-bbbb");
      expect(Number((await q(`SELECT COALESCE(SUM(available_quantity), 0) + 0 AS a FROM h_inventory_lots`))[0].a)).toBe(6);
    });

    // ── Codex #558 검증 F1~F6 회귀 ──
    it("F1 재고 단위 ≠ 원료 기준 단위(kg) 면 거부 — kg 재고에 g 를 더하지 않음, 다른 단위 LOT 이 있으면 거부, 공통 관문도 거부", async () => {
      await svc.confirmInbound((await draft("key-f1-kg", [line(10)])).headerId, T, 4);
      await expect(draft("key-f1-g", [line(1000, { purchaseUnit: "g", stockUnit: "g" })])).rejects.toThrow(/환산 설정이 없습니다|기준 단위\(kg\) 와 다릅니다/);
      await expect(draft("key-f1-g2", [line(1000, { stockUnit: "g" })])).rejects.toThrow(/기준 단위\(kg\) 와 다릅니다/);
      await q(`INSERT INTO h_inventory_lots (id, tenant_id, material_id, lot_number, quantity, current_quantity, available_quantity, unit, status) VALUES (9701, ?, 700, 'OLD-BOX', 1, 1, 1, 'box', 'available')`, [T]);
      await expect(draft("key-f1-mixed", [line(5)])).rejects.toThrow(/다른 단위\(box\)/);
      const { withInventoryTx, receiveNewLot } = await import("./lib/inventory/applyInventoryDelta");
      await expect(withInventoryTx((c) => receiveNewLot(c, { tenantId: T, subject: { materialId: 700 }, lotNumber: "GW-G", quantity: 1, unit: "g", createdBy: 4 }))).rejects.toThrow(/기준 단위/);
      await q(`DELETE FROM h_inventory_lots WHERE id = 9701`);
      expect(Number((await q(`SELECT available_quantity + 0 AS a FROM h_inventory WHERE material_id = 700`))[0].a)).toBe(10);
    });

    it("F2 발주 줄 원료(쌀) 와 다른 원료(설탕) 로 입고 거부 — 초안·확정 모두", async () => {
      await q(`INSERT INTO h_materials (id, tenant_id, material_code, material_name, unit, is_active) VALUES (701, ?, 'M701', '설탕', 'kg', 1)`, [T]);
      await expect(draft("key-f2", [line(100, { materialId: 701, poLineId: 311 })], { sourceType: "purchase_order", poId: 31 })).rejects.toThrow(/발주 줄 원료와 입고 원료가 다릅니다/);
      const d = await fromPo("key-f2-ok", 10);
      await q(`UPDATE h_inbound_lines SET material_id = 701`); // 초안 뒤 바뀐 경우
      await expect(svc.confirmInbound(d.headerId, T, 4)).rejects.toThrow(/발주 줄 원료와 입고 원료가 다릅니다/);
      expect([await received(), await poStatus()]).toEqual([0, "approved"]);
    });

    it("F3 발주 단위(kg) 와 다른 매입 단위(g) 거부 — 발주 입고량에 1 을 더하지 않음", async () => {
      await expect(draft("key-f3", [line(1, { purchaseUnit: "g", stockQuantity: 0.001, poLineId: 311 })], { sourceType: "purchase_order", poId: 31 })).rejects.toThrow(/환산 설정이 없습니다|발주 단위\(kg\) 와 다릅니다/);
      expect(await received()).toBe(0);
    });

    it("F4 초안 뒤 발주가 취소되면 확정 거부 — 재고·수불부·발주 입고량 무변경", async () => {
      const d = await fromPo("key-f4", 30);
      await q(`UPDATE purchase_orders SET status = 'cancelled' WHERE id = 31`);
      await expect(svc.confirmInbound(d.headerId, T, 4)).rejects.toThrow(/입고할 수 없는 발주서 상태/);
      expect(await counts()).toEqual([0, 0, 0]);
      expect([await received(), await poStatus()]).toEqual([0, "cancelled"]);
    });

    it("F5 발주서 입고는 모든 줄에 발주 줄 필수", async () => {
      await expect(draft("key-f5", [line(10)], { sourceType: "purchase_order", poId: 31 })).rejects.toThrow(/발주 줄을 지정해야/);
      expect(await counts()).toEqual([0, 0, 0]);
    });

    it("F6 제조일·소비기한이 하루 앞당겨지지 않음 (날짜 문자열 그대로)", async () => {
      const d = await draft("key-f6", [line(5, { productionDate: "2026-10-16", expiryDate: "2027-01-01" })]);
      await svc.confirmInbound(d.headerId, T, 4);
      const l = (await q(`SELECT DATE_FORMAT(production_date, '%Y-%m-%d') AS p, DATE_FORMAT(expiry_date, '%Y-%m-%d') AS e, DATE_FORMAT(receipt_date, '%Y-%m-%d') AS r FROM h_inventory_lots`))[0];
      expect([l.p, l.e, l.r]).toEqual(["2026-10-16", "2027-01-01", "2026-10-17"]);
    });

    it("다른 회사 문서·원료 거부, 검수 불합격 줄은 확정 거부, 발주서 입고에 다른 발주 줄 거부", async () => {
      const d = await draft("key-tenant", [line(5)]);
      await expect(svc.confirmInbound(d.headerId, 3, 4)).rejects.toThrow(/찾을 수 없습니다/);
      await expect(draft("key-other-mat", [line(5, { materialId: 800 })])).rejects.toThrow(/원재료를 찾을 수 없습니다/);
      const f = await draft("key-fail", [line(5, { inspectionResult: "fail" })]);
      await expect(svc.confirmInbound(f.headerId, T, 4)).rejects.toThrow(/검수 불합격/);
      await q(`INSERT INTO purchase_orders (id, tenant_id, po_number, partner_id, order_date, status, created_by) VALUES (32, ?, 'PO-32', 0, '2026-10-17', 'approved', 4)`, [T]);
      await expect(draft("key-wrong-po", [line(5, { poLineId: 311 })], { sourceType: "purchase_order", poId: 32 })).rejects.toThrow(/이 발주서의 줄이 아닙니다/);
      expect(await counts()).toEqual([0, 0, 0]);
    });

    // ── Codex #561·562 검증 R1~R7 회귀 ──
    const accts = () => q(`INSERT INTO accounting_accounts (id, tenant_id, category, code, system_code, name, is_active) VALUES
        (70, ?, 'liabilities', '2010', 'ACCOUNTS_PAYABLE', '외상매입금', 'Y'), (71, ?, 'assets', '1350', 'VAT_INPUT', '부가세대급금', 'Y')`, [T, T]);
    const debit1410 = async () => Number((await q(`SELECT COALESCE(SUM(debit_amount - credit_amount), 0) + 0 AS d FROM expense_journal_lines WHERE account_code = '1410'`))[0].d);
    const nPurch = async () => Number((await q(`SELECT COUNT(*) AS n FROM accounting_purchases`))[0].n);

    it("R1 다른 회사·없는·입고 아닌 재고거래 번호는 쓰기 없이 거절 (구형 전표로 빠지지 않음), 원료도 이 회사 것만", async () => {
      const hi = await import("./db/haccp/haccpIntegration");
      await q(`INSERT INTO h_inventory_lots (id, tenant_id, material_id, lot_number, quantity, current_quantity, available_quantity, unit, status) VALUES (88001, 3, 800, 'T3', 5, 5, 5, 'kg', 'available')`);
      await q(`INSERT INTO h_inventory_transactions (id, tenant_id, lot_id, material_id, transaction_type, quantity, unit, created_by) VALUES (88001, 3, 88001, 800, 'receipt', 5, 'kg', 4)`);
      const own = await svc.receiveDirect({ tenantId: T, userId: 4, materialId: 700, quantity: 5, unit: "kg", receiptDate: "2026-10-17", createVoucherDraft: false });
      const [usage]: any = await admin.query(`INSERT INTO h_inventory_transactions (tenant_id, lot_id, material_id, transaction_type, quantity, unit, created_by) VALUES (?, ?, 700, 'usage', 1, 'kg', 4)`, [T, own.lotId]);
      const base = { itemName: "x", quantity: "1", unit: "kg", unitPrice: "1000", createdBy: 4 };
      await expect(hi.createPurchaseFromReceipt({ ...base, inventoryTransactionId: 88001 }, T)).rejects.toThrow(/입고 거래를 찾을 수 없습니다/);
      await expect(hi.createPurchaseFromReceipt({ ...base, inventoryTransactionId: 99999999 }, T)).rejects.toThrow(/입고 거래를 찾을 수 없습니다/);
      await expect(hi.createPurchaseFromReceipt({ ...base, inventoryTransactionId: Number(usage.insertId) }, T)).rejects.toThrow(/입고 거래를 찾을 수 없습니다/);
      await expect(hi.createPurchaseFromReceipt({ ...base, lotId: 88001 }, T)).rejects.toThrow(/LOT 을 찾을 수 없습니다/);
      await expect(hi.createPurchaseFromReceipt({ ...base, materialId: 800 }, T)).rejects.toThrow(/원재료를 찾을 수 없습니다/);
      await expect(hi.createPurchaseFromReceipt({ ...base }, undefined as any)).rejects.toThrow(/tenantId 필수/);
      expect(await nPurch()).toBe(0);
      // 이 회사 입고 거래는 그 입고 줄 전표 (원료 700)
      const [tx] = await q(`SELECT receipt_tx_id FROM h_inbound_lines WHERE id = ?`, [own.lineId]);
      const v: any = await hi.createPurchaseFromReceipt({ ...base, inventoryTransactionId: Number(tx.receipt_tx_id) }, T);
      expect([Number(v.inbound_line_id), Number(v.material_id)]).toEqual([own.lineId, 700]);
    });

    it("R2 부분 취소된 입고 줄: 전표 재발행·확정 거부(헤더는 다른 줄 때문에 확정 유지), 살아 있는 줄의 전표만 취소 뒤 재발행은 1장·1벌", async () => {
      await accts();
      const d = await draft("key-r2", [line(25), line(10)], { createVoucherDrafts: true });
      const r = await svc.confirmInbound(d.headerId, T, 4);
      const [l1, l2] = r.lots.map((x: any) => x.lineId);
      const [v1, v2] = r.voucherIds;
      const { postPurchase } = await import("./lib/accounting/purchasePost");
      const { cancelPurchase } = await import("./lib/accounting/purchaseCancel");
      await postPurchase(v1, 4, T);
      await cancelPurchase(v1, 4, T);
      await svc.cancelInboundLine(l1, T, 4);
      expect((await q(`SELECT status FROM h_inbound_headers WHERE id = ?`, [d.headerId]))[0].status).toBe("confirmed");
      const before = await debit1410();
      const hi = await import("./db/haccp/haccpIntegration");
      await expect(hi.createPurchaseFromReceipt({ inboundLineId: l1, itemName: "x", quantity: "25", unit: "kg", unitPrice: "2000", createdBy: 4 }, T)).rejects.toThrow(/취소됐습니다/);
      // 우회로 만들어진 대기 전표(취소된 줄 연결) 도 확정 거부 — 회계 경로도 같은 검사
      const [bad]: any = await admin.query(
        `INSERT INTO accounting_purchases (tenant_id, transaction_date, item_name, material_id, quantity, unit, unit_price, total_amount, tax_amount, tax_rate, status, source_type, source_id, inbound_line_id, created_by)
         VALUES (?, '2026-10-17', '멥쌀', 700, 25, 'kg', 2000, 50000, 5000, 10, 'pending', 'inbound', ?, ?, 4)`, [T, l1, l1]);
      await expect(postPurchase(Number(bad.insertId), 4, T)).rejects.toThrow(/취소됐습니다/);
      const { erpPostPurchase } = await import("./lib/accounting/erpPurchasePost");
      await expect(erpPostPurchase(Number(bad.insertId), 4, T)).rejects.toThrow(/취소됐습니다/);
      await q(`UPDATE accounting_purchases SET status = 'cancelled' WHERE id = ?`, [bad.insertId]);
      expect(await debit1410()).toBe(before);
      // 살아 있는 두 번째 줄: 전표만 취소 → 재발행 1장 → 확정 1벌
      await cancelPurchase(v2, 4, T);
      const re: any = await hi.createPurchaseFromReceipt({ inboundLineId: l2, itemName: "x", quantity: "10", unit: "kg", unitPrice: "2000", createdBy: 4 }, T);
      const re2: any = await hi.createPurchaseFromReceipt({ inboundLineId: l2, itemName: "x", quantity: "10", unit: "kg", unitPrice: "2000", createdBy: 4 }, T);
      expect(Number(re2.id)).toBe(Number(re.id));
      await postPurchase(Number(re.id), 4, T);
      expect(await debit1410()).toBe(before + 20000);
      // 확정 전(대기) 입고 줄로는 전표를 만들 수 없다
      await q(`INSERT INTO tenant_feature_settings (tenant_id, feature_code, enabled) VALUES (?, 'INBOUND_APPROVAL', 1)`, [T]);
      const p = await draft("key-r2-pending", [line(3)]);
      expect((await svc.confirmInbound(p.headerId, T, 4)).status).toBe("pending_approval");
      const pl = Number((await q(`SELECT id FROM h_inbound_lines WHERE header_id = ?`, [p.headerId]))[0].id);
      await expect(hi.createPurchaseFromReceipt({ inboundLineId: pl, itemName: "x", quantity: "3", unit: "kg", unitPrice: "2000", createdBy: 4 }, T)).rejects.toThrow(/확정된 입고 줄만/);
    });

    it("R3 무단가 입고: 첫 확정 평가가 정본 — 같은 단가 재발행은 그대로, 다른 단가 재발행·확정 거부, LOT 평가액 = 원재료 자산", async () => {
      await accts();
      const u = await svc.receiveDirect({ tenantId: T, userId: 4, materialId: 700, quantity: 25, unit: "kg", receiptDate: "2026-10-17", createVoucherDraft: false });
      const hi = await import("./db/haccp/haccpIntegration");
      const { postPurchase } = await import("./lib/accounting/purchasePost");
      const { cancelPurchase } = await import("./lib/accounting/purchaseCancel");
      const mk = (price: string) => hi.createPurchaseFromReceipt({ lotId: u.lotId, itemName: "멥쌀", quantity: "25", unit: "kg", unitPrice: price, createdBy: 4 }, T);
      const v1: any = await mk("2000");
      await postPurchase(Number(v1.id), 4, T);
      const lotValue = async () => Number((await q(`SELECT unit_price * quantity AS v FROM h_inventory_lots WHERE id = ?`, [u.lotId]))[0].v);
      expect([await lotValue(), await debit1410()]).toEqual([50000, 50000]);
      const ln = (await q(`SELECT valuation_unit_price + 0 AS p, valuation_amount + 0 AS a, valuation_purchase_id AS v FROM h_inbound_lines WHERE id = ?`, [u.lineId]))[0];
      expect([Number(ln.p), Number(ln.a), Number(ln.v)]).toEqual([2000, 50000, Number(v1.id)]);
      await cancelPurchase(Number(v1.id), 4, T);
      await expect(mk("3000")).rejects.toThrow(/단가 2000 로 평가됐습니다/);
      // 화면 우회로 금액을 바꾼 대기 전표도 확정 거부
      const v2: any = await mk("2000");
      expect(Number(v2.total_amount)).toBe(50000);
      await q(`UPDATE accounting_purchases SET total_amount = 75000, unit_price = 3000 WHERE id = ?`, [v2.id]);
      await expect(postPurchase(Number(v2.id), 4, T)).rejects.toThrow(/평가됐습니다/);
      await q(`UPDATE accounting_purchases SET total_amount = 50000, unit_price = 2000 WHERE id = ?`, [v2.id]);
      await postPurchase(Number(v2.id), 4, T);
      expect([await lotValue(), await debit1410()]).toEqual([50000, 50000]); // 취소 1벌 + 재확정 1벌 → 순 50,000
      // 단가 있던 입고는 입고 금액과 다른 전표 확정 거부
      const pr = await svc.receiveDirect({ tenantId: T, userId: 4, materialId: 700, quantity: 10, unit: "kg", unitPrice: 1000, receiptDate: "2026-10-17", createVoucherDraft: true });
      await q(`UPDATE accounting_purchases SET total_amount = 99999 WHERE id = ?`, [pr.voucherIds[0]]);
      await expect(postPurchase(pr.voucherIds[0], 4, T)).rejects.toThrow(/입고 금액 10000 와 다릅니다/);
    });

    it("R4 승인 필요 회사: 수동 LOT·원재료 입고는 대기 상태·문서 번호를 돌려주고 LOT·전표 없음, 승인 때 한 번 반영(전표 초안 의도 보존)", async () => {
      await q(`INSERT INTO tenant_feature_settings (tenant_id, feature_code, enabled) VALUES (?, 'INBOUND_APPROVAL', 1)`, [T]);
      const inv = await import("./db/inventory/inventoryFunctions");
      const a: any = await inv.createInventoryLot({ materialId: 700, lotNumber: "MAN-R4", quantity: "5", unit: "kg", unitPrice: 1000, userId: 4, tenantId: T, createVoucherDraft: true });
      expect([a.status, a.pendingApproval, a.lotId, a.inboundHeaderId > 0]).toEqual(["pending_approval", true, null, true]);
      const b: any = await inv.receiveMaterial({ materialId: 700, quantity: 3, unit: "kg", receiptDate: "2026-10-17", tenantId: T, userId: 4 });
      expect([b.status, b.pendingApproval, b.lotId, b.lotNumber, b.inboundHeaderId > 0]).toEqual(["pending_approval", true, null, null, true]);
      expect([(await counts())[0], await nPurch()]).toEqual([0, 0]);
      const ap = await svc.approveInbound(a.inboundHeaderId, T, 4);
      expect(ap.status).toBe("confirmed");
      expect([(await counts())[0], await nPurch()]).toEqual([1, 1]);
      expect((await svc.approveInbound(a.inboundHeaderId, T, 4)).alreadyProcessed).toBe(true);
      expect([(await counts())[0], await nPurch()]).toEqual([1, 1]);
    });

    it("R5 생성 컬럼 식 검사: 일반 컬럼·NULL 상수식·반대 조건은 시작 거부, 정상 식은 통과", async () => {
      const { ensureRequiredSchema } = await import("./db/startupMigrations");
      const col = "active_inbound_line_id";
      const restore = `ALTER TABLE accounting_purchases MODIFY COLUMN ${col} bigint GENERATED ALWAYS AS (IF(\`status\` <> 'cancelled', \`inbound_line_id\`, NULL)) STORED`;
      try {
        for (const bad of [
          `bigint GENERATED ALWAYS AS (NULL) STORED`,
          `bigint GENERATED ALWAYS AS (IF(\`status\` = 'cancelled', \`inbound_line_id\`, NULL)) STORED`,
        ]) {
          await q(`ALTER TABLE accounting_purchases DROP INDEX uq_ap_tenant_active_inbound_line`);
          await q(`ALTER TABLE accounting_purchases MODIFY COLUMN ${col} ${bad}`);
          await q(`ALTER TABLE accounting_purchases ADD UNIQUE KEY uq_ap_tenant_active_inbound_line (tenant_id, ${col})`);
          const r = await ensureRequiredSchema(admin, { allowDdl: true });
          expect(r.ok).toBe(false);
          expect(r.missing.join("\n")).toMatch(/active_inbound_line_id 생성식 불일치/);
        }
        await q(`ALTER TABLE accounting_purchases DROP INDEX uq_ap_tenant_active_inbound_line`);
        await q(`ALTER TABLE accounting_purchases DROP COLUMN ${col}`);
        await q(`ALTER TABLE accounting_purchases ADD COLUMN ${col} bigint NULL`);
        await q(`ALTER TABLE accounting_purchases ADD UNIQUE KEY uq_ap_tenant_active_inbound_line (tenant_id, ${col})`);
        const plain = await ensureRequiredSchema(admin, { allowDdl: true });
        expect(plain.missing.join("\n")).toMatch(/일반 컬럼/);
      } finally {
        await q(`ALTER TABLE accounting_purchases DROP INDEX uq_ap_tenant_active_inbound_line`).catch(() => undefined);
        await q(`ALTER TABLE accounting_purchases DROP COLUMN ${col}`).catch(() => undefined);
        await q(`ALTER TABLE accounting_purchases ADD COLUMN ${col} bigint GENERATED ALWAYS AS (IF(\`status\` <> 'cancelled', \`inbound_line_id\`, NULL)) STORED`);
        await q(`ALTER TABLE accounting_purchases ADD UNIQUE KEY uq_ap_tenant_active_inbound_line (tenant_id, ${col})`);
      }
      void restore;
      expect(await ensureRequiredSchema(admin, { allowDdl: true })).toMatchObject({ ok: true, missing: [] });
    });

    it("R6 처리 기준은 문서 것: 회계 전용 입고 뒤 재고를 켜도 그 전표는 분개만으로 확정, 재고 입고 뒤 끄도 그 전표는 재고 경로", async () => {
      await accts();
      const { dispatchPostPurchase } = await import("./lib/accounting/postDispatcher");
      await q(`INSERT INTO tenant_feature_settings (tenant_id, feature_code, enabled) VALUES (?, 'INVENTORY_TRACKING', 0)`, [T]);
      const off = await svc.confirmInbound((await draft("key-r6-off", [line(10)], { createVoucherDrafts: true })).headerId, T, 4);
      // 대기(작성) 상태 문서도 작성 때 기준을 지킨다 — 켜도 LOT 을 만들지 않음
      const offDraft = await draft("key-r6-off-draft", [line(4)]);
      await q(`UPDATE tenant_feature_settings SET enabled = 1 WHERE feature_code = 'INVENTORY_TRACKING'`);
      await dispatchPostPurchase(off.voucherIds[0], 4, T);
      expect((await q(`SELECT status FROM accounting_purchases WHERE id = ?`, [off.voucherIds[0]]))[0].status).toBe("approved");
      expect(await counts()).toEqual([0, 0, 0]); // 과거 회계 전용 입고에 LOT 을 몰래 만들지 않음
      expect(await debit1410()).toBe(20000);
      await svc.confirmInbound(offDraft.headerId, T, 4);
      expect((await counts())[0]).toBe(0);
      // 재고 입고 → 끄기 → 재고 경로로 확정 (LOT 평가·수불부 유지)
      const on = await svc.confirmInbound((await draft("key-r6-on", [line(5)], { createVoucherDrafts: true })).headerId, T, 4);
      expect((await counts())[0]).toBe(1);
      await q(`UPDATE tenant_feature_settings SET enabled = 0 WHERE feature_code = 'INVENTORY_TRACKING'`);
      await dispatchPostPurchase(on.voucherIds[0], 4, T);
      expect((await q(`SELECT status FROM accounting_purchases WHERE id = ?`, [on.voucherIds[0]]))[0].status).toBe("approved");
      expect(await debit1410()).toBe(30000);
      expect((await counts())[0]).toBe(1);
    });

    it("R7 회계 전용 회사의 발주 입고 미리보기는 재고 환산을 요구하지 않음, 재고 사용 회사는 그대로", async () => {
      await q(`UPDATE purchase_order_lines SET unit = 'bag' WHERE id = 311`);
      const on = (await svc.getReceivableLines(31, T))[0];
      expect([on.inventoryTracking, on.conversion, /환산 설정이 없습니다/.test(String(on.conversionError))]).toEqual([true, null, true]);
      await q(`INSERT INTO tenant_feature_settings (tenant_id, feature_code, enabled) VALUES (?, 'INVENTORY_TRACKING', 0)`, [T]);
      const off = (await svc.getReceivableLines(31, T))[0];
      expect([off.inventoryTracking, off.conversion, off.conversionError, off.remainingQty]).toEqual([false, null, null, 100]);
    });

    it("R8 입고 문서 이전 방식 입고: 전표 자동 생성 거부(두 경로·일괄), 남은 구형 전표 확정 거부 — 재고 25kg 그대로, 입고 문서 입고는 1장", async () => {
      await accts();
      await q(`INSERT INTO h_inventory_lots (id, tenant_id, material_id, lot_number, quantity, current_quantity, available_quantity, unit, unit_price, status, receipt_date)
               VALUES (88101, ?, 700, 'OLD-1', 25, 25, 25, 'kg', 2000, 'available', '2026-10-01')`, [T]);
      await q(`INSERT INTO h_inventory_transactions (id, tenant_id, lot_id, material_id, transaction_type, quantity, unit, created_by) VALUES (88101, ?, 88101, 700, 'receipt', 25, 'kg', 4)`, [T]);
      const hi = await import("./db/haccp/haccpIntegration");
      const hai = await import("./db/haccp/haccpAccountingIntegration");
      const base = { itemName: "멥쌀", quantity: "25", unit: "kg", unitPrice: "2000", createdBy: 4 };
      const rs = await Promise.allSettled([
        hi.createPurchaseFromReceipt({ ...base, inventoryTransactionId: 88101 }, T),
        hi.createPurchaseFromReceipt({ ...base, inventoryTransactionId: 88101 }, T),
        hi.createPurchaseFromReceipt({ ...base, lotId: 88101 }, T),
      ]);
      expect(rs.map((r) => r.status)).toEqual(["rejected", "rejected", "rejected"]);
      expect(String((rs[0] as any).reason?.message)).toMatch(/입고 문서 이전 방식/);
      await expect(hi.createPurchaseFromReceipt({ ...base }, T)).rejects.toThrow(/입고 번호/);
      expect(await hai.createPurchaseFromReceipt(T, 88101, 4)).toMatchObject({ skipped: true, reason: "legacy_receipt" });
      const batch = await hai.batchCreateAccountingTransactions(T);
      expect(batch.purchases).toMatchObject({ created: 0, errors: 0 });
      expect(await nPurch()).toBe(0);
      // 이미 있던 구형 전표(이 경로가 예전에 만든 것) 는 확정하지 않는다
      const [old]: any = await admin.query(
        `INSERT INTO accounting_purchases (tenant_id, transaction_date, item_name, material_id, quantity, unit, unit_price, total_amount, tax_amount, tax_rate, status, source_type, source_id, created_by)
         VALUES (?, '2026-10-01', '멥쌀', 700, 25, 'kg', 2000, 50000, 5000, 10, 'pending', 'inventory_receipt', 88101, 4)`, [T]);
      const { dispatchPostPurchase } = await import("./lib/accounting/postDispatcher");
      await expect(dispatchPostPurchase(Number(old.insertId), 4, T)).rejects.toThrow(/입고 문서 이전 방식/);
      expect(Number((await q(`SELECT COALESCE(SUM(available_quantity), 0) + 0 AS a FROM h_inventory_lots WHERE material_id = 700`))[0].a)).toBe(25);
      expect(Number((await q(`SELECT COUNT(*) AS n FROM h_inventory_lots`))[0].n)).toBe(1);
      expect(await debit1410()).toBe(0);
      // 입고 문서로 받은 입고는 두 경로 모두 그 입고 줄 전표 하나 (동시에 불러도)
      const nw = await svc.receiveDirect({ tenantId: T, userId: 4, materialId: 700, quantity: 25, unit: "kg", unitPrice: 2000, receiptDate: "2026-10-17", createVoucherDraft: false });
      const [tx] = await q(`SELECT receipt_tx_id FROM h_inbound_lines WHERE id = ?`, [nw.lineId]);
      const both: any[] = await Promise.all([
        hai.createPurchaseFromReceipt(T, Number(tx.receipt_tx_id), 4),
        hi.createPurchaseFromReceipt({ ...base, inventoryTransactionId: Number(tx.receipt_tx_id) }, T),
      ]);
      expect(Number(both[0].purchaseId)).toBe(Number(both[1].id));
      await dispatchPostPurchase(Number(both[1].id), 4, T);
      expect(Number((await q(`SELECT COALESCE(SUM(available_quantity), 0) + 0 AS a FROM h_inventory_lots WHERE material_id = 700`))[0].a)).toBe(50);
      expect(await debit1410()).toBe(50000);
    });
  });

  describe("발주 수량 변경 — 요청 → 승인 → 추가 입고, 초과 입고는 그대로 차단 (2026-10-17, CEO 결정 3)", () => {
    let svc: any;
    let qc: any;
    beforeAll(async () => {
      svc = await import("./lib/inventory/inbound/inboundService");
      qc = await import("./lib/inventory/inbound/poQtyChange");
    });
    beforeEach(async () => {
      for (const t of ["h_inbound_headers", "h_inbound_lines", "h_inventory_lots", "h_inventory_transactions", "h_inventory", "h_materials", "item_master", "material_ledger_daily", "purchase_orders", "purchase_order_lines", "purchase_order_line_changes", "accounting_purchases", "tenant_feature_settings", "domain_events", "partners", "expense_journal_entries", "expense_journal_lines", "material_pack_units"]) await q(`DELETE FROM ${t}`);
      await q(`INSERT INTO h_materials (id, tenant_id, material_code, material_name, unit, is_active) VALUES (700, ?, 'M700', '멥쌀', 'kg', 1)`, [T]);
      await q(`INSERT INTO item_master (id, tenant_id, item_code, item_name, item_type, base_unit, is_active, legacy_material_id) VALUES (1700, ?, 'M700', '멥쌀', 'raw_material', 'kg', 1, 700)`, [T]);
      await q(`INSERT INTO purchase_orders (id, tenant_id, po_number, partner_id, order_date, status, total_amount, tax_amount, grand_total, created_by) VALUES (41, ?, 'PO-41', 0, '2026-10-17', 'approved', 200000, 20000, 220000, 4)`, [T]);
      await q(`INSERT INTO purchase_order_lines (id, tenant_id, po_id, line_number, material_id, item_name, ordered_qty, received_qty, unit, unit_price, amount, tax_amount) VALUES (411, ?, 41, 1, 1700, '멥쌀', 100, 0, 'kg', 2000, 200000, 20000)`, [T]);
    });
    const fromPo = (key: string, qty: number) => svc.createInboundDraft({
      tenantId: T, userId: 4, idempotencyKey: key, sourceType: "purchase_order", poId: 41, inboundDate: "2026-10-17",
      lines: [{ materialId: 700, poLineId: 411, purchaseQuantity: qty, purchaseUnit: "kg", stockQuantity: qty, stockUnit: "kg", unitPrice: 2000 }],
    });
    const poLine = async () => {
      const r = (await q(`SELECT ordered_qty AS o, received_qty AS r, amount AS a, tax_amount AS t FROM purchase_order_lines WHERE id = 411`))[0];
      return { o: Number(r.o), r: Number(r.r), a: Number(r.a), t: Number(r.t) };
    };
    const po = async () => {
      const r = (await q(`SELECT status, total_amount AS a, tax_amount AS t, grand_total AS g FROM purchase_orders WHERE id = 41`))[0];
      return { status: r.status, a: Number(r.a), t: Number(r.t), g: Number(r.g) };
    };
    const req = (newQty: number, extra: any = {}) => qc.requestPoLineQtyChange(admin, { tenantId: T, userId: 5, poLineId: 411, newQty, reason: "실입고 120kg", ...extra });
    const decide = (changeId: number, approve: boolean) => qc.decidePoLineQtyChange(admin, { tenantId: T, userId: 4, changeId, approve, note: approve ? "확인" : "반려" });

    it("입고 완료 뒤 20 더 들어옴: 초과 입고 거부 → 120 으로 변경 요청 → 요청만으로는 여전히 거부 → 승인 → 일부 입고로 되돌아감 → 20 추가 입고 → 입고 완료, 원래 수량·이력 남음", async () => {
      await svc.confirmInbound((await fromPo("qc-100", 100)).headerId, T, 4);
      expect((await po()).status).toBe("received");
      // 입고 완료 발주에는 입고 문서부터 막힌다 (요청만으로도 그대로)
      await expect(fromPo("qc-20", 20)).rejects.toThrow(/승인된 발주서만 입고/);
      const { changeId } = await req(120);
      await expect(fromPo("qc-20", 20)).rejects.toThrow(/승인된 발주서만 입고/);
      expect(Number((await poLine()).o)).toBe(100);
      expect(await decide(changeId, true)).toEqual({ status: "approved", poStatus: "partial_received", orderedQty: 120 });
      expect(await poLine()).toMatchObject({ o: 120, r: 100, a: 240000, t: 24000 });
      expect(await po()).toMatchObject({ status: "partial_received", a: 240000, t: 24000, g: 264000 });
      await expect(svc.confirmInbound((await fromPo("qc-21", 21)).headerId, T, 4)).rejects.toThrow(/잔량 20/); // 승인된 만큼만
      await svc.confirmInbound((await fromPo("qc-20", 20)).headerId, T, 4);
      expect([Number((await poLine()).r), (await po()).status]).toEqual([120, "received"]);
      const hist = await qc.listPoLineQtyChanges(admin, T, 41);
      expect(hist.map((h: any) => [h.oldQty, h.newQty, h.status, h.requestedBy, h.decidedBy, h.reason])).toEqual([[100, 120, "approved", 5, 4, "실입고 120kg"]]);
      expect(await qc.listPoLineQtyChanges(admin, 3, 41)).toEqual([]);
    });

    it("줄당 대기 요청 하나 (DB UNIQUE), 처리 뒤에는 새 요청 가능, 반려는 발주를 바꾸지 않음, 두 번 처리 거부", async () => {
      const { changeId } = await req(120);
      await expect(req(130)).rejects.toThrow(/승인 대기 중인 변경 요청이 이미/);
      expect(await decide(changeId, false)).toEqual({ status: "rejected" });
      expect(await poLine()).toMatchObject({ o: 100, a: 200000, t: 20000 });
      expect((await po()).status).toBe("approved");
      await expect(decide(changeId, true)).rejects.toThrow(/이미 처리된/);
      const second = await req(130);
      expect(second.changeId).not.toBe(changeId);
      expect((await qc.listPoLineQtyChanges(admin, T, 41)).map((h: any) => h.status)).toEqual(["pending", "rejected"]);
    });

    it("요청 뒤 발주 수량이 바뀌면 승인 거부, 입고량보다 작게는 요청·승인 모두 거부", async () => {
      await svc.confirmInbound((await fromPo("qc-60", 60)).headerId, T, 4);
      await expect(req(50)).rejects.toThrow(/이미 입고된 수량\(60\)/);
      const { changeId } = await req(70);
      await q(`UPDATE purchase_order_lines SET ordered_qty = 90 WHERE id = 411`);
      await expect(decide(changeId, true)).rejects.toThrow(/요청 뒤 발주 수량이 바뀌었습니다/);
      expect(Number((await poLine()).o)).toBe(90);
      await q(`UPDATE purchase_order_lines SET ordered_qty = 100 WHERE id = 411`);
      await q(`UPDATE purchase_order_lines SET received_qty = 80 WHERE id = 411`);
      await expect(decide(changeId, true)).rejects.toThrow(/이미 입고된 수량\(80\)/);
      expect((await qc.listPoLineQtyChanges(admin, T, 41))[0].status).toBe("pending");
    });

    it("작성 중·취소 발주, 같은 수량, 사유 없음, 다른 회사는 요청 거부", async () => {
      await expect(req(120, { reason: " " })).rejects.toThrow(/사유/);
      await expect(req(100)).rejects.toThrow(/같습니다/);
      await expect(req(120, { tenantId: 3 })).rejects.toThrow(/찾을 수 없습니다/);
      await q(`UPDATE purchase_orders SET status = 'draft' WHERE id = 41`);
      await expect(req(120)).rejects.toThrow(/직접 수정/);
      await q(`UPDATE purchase_orders SET status = 'cancelled' WHERE id = 41`);
      await expect(req(120)).rejects.toThrow(/바꿀 수 없는 발주서 상태/);
      expect(Number((await q(`SELECT COUNT(*) AS n FROM purchase_order_line_changes`))[0].n)).toBe(0);
    });
  });
});
