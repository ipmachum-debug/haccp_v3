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
    // 운영에 늘 있는 CCP 표 (최소 칸) — 필수 칸(무효 표시, 이력 보존형 복구)을 이 표들에 더한다
    await admin.query(`CREATE TABLE IF NOT EXISTS h_ccp_instances (id bigint NOT NULL AUTO_INCREMENT PRIMARY KEY, tenant_id int NOT NULL, batch_id bigint NULL, process_group_id int NULL, ccp_type varchar(20) NULL, status varchar(20) NULL)`);
    const [st]: any = await admin.query(`SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h_ccp_instances' AND COLUMN_NAME = 'status'`);
    if (!st.length) await admin.query(`ALTER TABLE h_ccp_instances ADD COLUMN status varchar(20) NULL`); // 이전 실행이 만든 최소 표
    await admin.query(`CREATE TABLE IF NOT EXISTS h_ccp_form_records (id bigint NOT NULL AUTO_INCREMENT PRIMARY KEY, tenant_id int NOT NULL, batch_id bigint NULL, ccp_type varchar(20) NULL, process_group_id int NULL, work_date date NULL,
      product_name varchar(200) NULL, status varchar(20) NULL DEFAULT 'draft', rows_version int NOT NULL DEFAULT 0, confirmed_by int NULL, confirmed_at datetime NULL, confirmed_rows_version int NULL,
      approval_request_id bigint NULL, batch_count int NULL, planned_qty_kg decimal(10,2) NULL, bom_batch_kg decimal(10,2) NULL)`);
    await admin.query(`CREATE TABLE IF NOT EXISTS h_ccp_form_rows (id bigint NOT NULL AUTO_INCREMENT PRIMARY KEY, tenant_id int NOT NULL, form_record_id bigint NOT NULL, batch_seq int NULL, equipment_type varchar(30) NULL, product_name varchar(200) NULL,
      pass_qty int NULL, pass_unit varchar(20) NULL, confirmed_by int NULL, action_by int NULL, is_deviation tinyint NULL DEFAULT 0, corrective_action text NULL)`);
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
    // S4: 회계 전용 경로(직접·재고 끈 디스패처) 도 같은 정책
    const { erpPostSale } = await import("./lib/accounting/erpSalePost");
    await expect(erpPostSale(10600, 4, T)).rejects.toThrow(/재고 출고 화면에서 자동 생성된 매출/);
    await q(`DELETE FROM tenant_feature_settings WHERE feature_code = 'INVENTORY_TRACKING'`);
    await q(`INSERT INTO tenant_feature_settings (tenant_id, feature_code, enabled) VALUES (?, 'INVENTORY_TRACKING', 0)`, [T]);
    try {
      await expect(dispatchPostSale(10600, 4, T)).rejects.toThrow(/재고 출고 화면에서 자동 생성된 매출/);
    } finally {
      await q(`DELETE FROM tenant_feature_settings WHERE feature_code = 'INVENTORY_TRACKING'`);
    }
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

  it("원재료·제품 코드는 회사별 유일 — 전역 키를 회사별 키로 바꾸고, 다른 회사는 같은 코드 가능·같은 회사는 거부 (지티 QA F01)", async () => {
    const { ensureRequiredSchema } = await import("./db/startupMigrations");
    await ensureRequiredSchema(admin, { allowDdl: true });
    for (const [table, mine, legacy] of [["h_materials", "uq_hm_tenant_code", "h_materials_material_code_unique"], ["h_products_v2", "uq_hp2_tenant_code", "h_products_v2_product_code_unique"]]) {
      const ix = (await q(`SELECT DISTINCT INDEX_NAME AS n FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME IN (?, ?)`, [table, mine, legacy])).map((r: any) => r.n);
      expect(ix).toEqual([mine]);
    }
    await q(`INSERT INTO h_materials (id, tenant_id, material_code, material_name) VALUES (98001, 2, 'F01-DUP', 'A'), (98002, 14, 'F01-DUP', 'B')`);
    await expect(q(`INSERT INTO h_materials (id, tenant_id, material_code, material_name) VALUES (98003, 14, 'F01-DUP', 'C')`)).rejects.toThrow(/Duplicate/);
    await q(`DELETE FROM h_materials WHERE id IN (98001, 98002)`);
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

  describe("매입 입력 → 입고 문서 경유 (2026-10-17) — 포장 환산 설정, 수불부·LOT 한 번, 전표 확정 = 분개만", () => {
    let createPurchase: any;
    let cancelPurchase: any;
    let svc: any;
    beforeAll(async () => {
      ({ createPurchase } = await import("./db/haccp/haccpIntegration"));
      ({ cancelPurchase } = await import("./lib/accounting/purchaseCancel"));
      svc = await import("./lib/inventory/inbound/inboundService");
    });
    beforeEach(async () => {
      for (const t of ["accounting_purchases", "h_inbound_headers", "h_inbound_lines", "h_inbound_inspections", "partners", "h_materials", "material_ledger_daily", "material_pack_units", "tenant_feature_settings"]) await q(`DELETE FROM ${t}`);
      await q(`INSERT INTO accounting_accounts (id, tenant_id, category, code, system_code, name, is_active) VALUES
        (70, ?, 'liabilities', '2010', 'ACCOUNTS_PAYABLE', '외상매입금', 'Y'), (71, ?, 'assets', '1350', 'VAT_INPUT', '부가세대급금', 'Y')`, [T, T]);
      await q(`INSERT INTO h_materials (id, tenant_id, material_code, material_name, unit, is_active) VALUES (635, ?, 'M635', '우유(국내산)', 'kg', 1)`, [T]);
      await q(`INSERT INTO partners (id, tenant_id, company_name) VALUES (21, ?, '서울우유')`, [T]).catch(async () => q(`INSERT INTO partners (id, tenant_id, company_name, partner_type) VALUES (21, ?, '서울우유', 'supplier')`, [T]));
    });
    const milk = (extra: any = {}) => createPurchase({
      transactionDate: "2026-10-12", partnerId: 21, itemName: "우유(국내산)", materialId: 635,
      quantity: 6, packagingSize: 0.9, packagingUnit: "kg", unit: "개", unitPrice: 3000, amount: 18000, taxAmount: 1800, createdBy: 4, ...extra,
    }, T);
    const lotOf = async () => {
      const r = (await q(`SELECT id, lot_number, quantity AS q, available_quantity AS a, unit, status FROM h_inventory_lots WHERE material_id = 635`));
      return r.map((x: any) => ({ id: Number(x.id), lot: x.lot_number, q: Number(x.q), a: Number(x.a), unit: x.unit, status: x.status }));
    };
    const ledger = async () => Number((await q(`SELECT COALESCE(SUM(receiving_qty), 0) + 0 AS r FROM material_ledger_daily WHERE material_id = 635`))[0].r);
    const net = async (pid: number) => {
      const r = await q(`SELECT e.description, SUM(l.debit_amount) d, SUM(l.credit_amount) c FROM expense_journal_entries e JOIN expense_journal_lines l ON l.journal_entry_id = e.id
        WHERE e.description LIKE ? OR e.description LIKE ? GROUP BY e.id`, [`[매입] PURCHASE-${pid} %`, `[매입취소] PURCHASE-${pid} %`]);
      return r.map((x: any) => [String(x.description).split(" ")[0], Number(x.d), Number(x.c)]);
    };

    it("우유 6개 × 0.9kg: 환산 설정 없으면 확인 요청(쓰기 없음) → 저장 확인 → LOT 5.4kg·수불부 5.4·입고 줄(6개→5.4kg)·전표 확정 분개 1벌, 다음부터 설정 사용", async () => {
      await expect(milk()).rejects.toThrow(/^PACK_UNIT_MISSING: 우유\(국내산\) — '개' → kg/);
      expect([(await lotOf()).length, Number((await q(`SELECT COUNT(*) AS n FROM h_inbound_headers`))[0].n), Number((await q(`SELECT COUNT(*) AS n FROM accounting_purchases`))[0].n)]).toEqual([0, 0, 0]);
      const res = await milk({ savePackUnit: true, idempotencyKey: "pm-milk-0001" });
      expect([res.posted, res.status]).toEqual([true, "confirmed"]);
      const [lot] = await lotOf();
      expect([lot.q, lot.unit, lot.status]).toEqual([5.4, "kg", "available"]);
      expect(await ledger()).toBe(5.4);
      const line = (await q(`SELECT id, lot_id, lot_number, purchase_quantity + 0 AS pq, purchase_unit, stock_quantity + 0 AS sq, stock_unit, pack_factor + 0 AS f FROM h_inbound_lines`))[0];
      expect([Number(line.lot_id), line.lot_number, Number(line.pq), line.purchase_unit, Number(line.sq), line.stock_unit, Number(line.f)]).toEqual([lot.id, lot.lot, 6, "개", 5.4, "kg", 0.9]);
      const v = (await q(`SELECT id, status, inbound_line_id, partner_id, total_amount + 0 AS a, tax_amount + 0 AS t, DATE_FORMAT(transaction_date, '%Y-%m-%d') AS d FROM accounting_purchases`));
      expect(v.map((x: any) => [x.status, Number(x.inbound_line_id), Number(x.partner_id), Number(x.a), Number(x.t), x.d])).toEqual([["approved", Number(line.id), 21, 18000, 1800, "2026-10-12"]]);
      expect(res.id).toBe(Number(v[0].id));
      expect(await net(res.id)).toEqual([["[매입]", 19800, 19800]]);
      expect(Number((await q(`SELECT COUNT(*) AS n FROM h_inventory_transactions WHERE lot_id = ?`, [lot.id]))[0].n)).toBe(1);
      // 같은 요청 키로 다시 → 같은 입고·전표 (재고·분개 그대로)
      expect((await milk({ idempotencyKey: "pm-milk-0001" })).id).toBe(res.id);
      expect([(await lotOf()).length, await ledger(), (await net(res.id)).length]).toEqual([1, 5.4, 1]);
      // 다음 입력은 저장된 설정으로, 다른 포장규격은 거부 (다른 규격이면 단위 이름을 달리)
      await milk({ idempotencyKey: "pm-milk-0002" });
      expect(await ledger()).toBe(10.8);
      await expect(milk({ packagingSize: 1, idempotencyKey: "pm-milk-0003" })).rejects.toThrow(/환산 결과 5\.4kg/);
      await expect(milk({ packagingUnit: "g", idempotencyKey: "pm-milk-0004" })).rejects.toThrow(/포장규격 단위\(g\)/);
    });

    it("검수 불합격 입력은 격리(재고·전표 없음), 회계 전용 회사는 LOT 없이 전표만, 승인 필요 회사는 대기", async () => {
      const f = await milk({ savePackUnit: true, inspectionResult: "fail", idempotencyKey: "pm-milk-fail" });
      expect([f.status, f.quarantined, f.posted]).toEqual(["quarantined", true, false]);
      expect([(await lotOf()).length, await ledger(), Number((await q(`SELECT COUNT(*) AS n FROM accounting_purchases`))[0].n)]).toEqual([0, 0, 0]);
      expect((await svc.listQuarantinedLines(T)).length).toBe(1);
      await q(`INSERT INTO tenant_feature_settings (tenant_id, feature_code, enabled) VALUES (?, 'INVENTORY_TRACKING', 0)`, [T]);
      const acct = await milk({ idempotencyKey: "pm-milk-acct" });
      expect([acct.status, acct.posted, acct.lotId]).toEqual(["confirmed", true, null]);
      expect((await lotOf()).length).toBe(0);
      expect(await net(acct.id)).toEqual([["[매입]", 19800, 19800]]);
      await q(`UPDATE tenant_feature_settings SET enabled = 1 WHERE feature_code = 'INVENTORY_TRACKING'`);
      await q(`INSERT INTO tenant_feature_settings (tenant_id, feature_code, enabled) VALUES (?, 'INBOUND_APPROVAL', 1)`, [T]);
      const pend = await milk({ idempotencyKey: "pm-milk-pend" });
      expect([pend.status, pend.pendingApproval, (await lotOf()).length]).toEqual(["pending_approval", true, 0]);
      await svc.approveInbound(pend.inboundHeaderId, T, 4);
      expect((await lotOf()).length).toBe(1);
      expect(Number((await q(`SELECT COUNT(*) AS n FROM accounting_purchases WHERE status = 'pending'`))[0].n)).toBe(1); // 승인 뒤 전표 초안(대기)
    });

    it("취소: 전표 취소는 분개만(재고 그대로) → 입고 줄 취소가 재고·수불부를 한 번 되돌림, 일부 사용 LOT 은 입고 취소 거부, 지급 완료 전표 취소 거부", async () => {
      const r = await milk({ savePackUnit: true, idempotencyKey: "pm-milk-c1" });
      await cancelPurchase(r.id, 4, T);
      expect(await net(r.id)).toEqual([["[매입]", 19800, 19800], ["[매입취소]", 19800, 19800]]);
      expect([(await lotOf())[0].a, await ledger()]).toEqual([5.4, 5.4]);
      expect(await cancelPurchase(r.id, 4, T)).toEqual({ alreadyProcessed: true });
      const lineId = Number((await q(`SELECT id FROM h_inbound_lines`))[0].id);
      await svc.cancelInboundLine(lineId, T, 4);
      expect([(await lotOf())[0].a, await ledger()]).toEqual([0, 0]);
      // 일부 사용 / 지급 완료
      const r2 = await milk({ idempotencyKey: "pm-milk-c2" });
      const lot2 = (await lotOf()).find((x) => x.a > 0)!;
      await q(`INSERT INTO h_inventory_transactions (tenant_id, lot_id, material_id, transaction_type, quantity, unit, created_by) VALUES (?, ?, 635, 'usage', 1, 'kg', 4)`, [T, lot2.id]);
      await q(`UPDATE h_inventory_lots SET available_quantity = 4.4 WHERE id = ?`, [lot2.id]);
      await cancelPurchase(r2.id, 4, T);
      const line2 = Number((await q(`SELECT id FROM h_inbound_lines WHERE lot_id = ?`, [lot2.id]))[0].id);
      await expect(svc.cancelInboundLine(line2, T, 4)).rejects.toThrow(/이미 일부 사용/);
      const r3 = await milk({ idempotencyKey: "pm-milk-c3" });
      await q(`UPDATE accounting_purchases SET status = 'paid' WHERE id = ?`, [r3.id]);
      await expect(cancelPurchase(r3.id, 4, T)).rejects.toThrow(/지급을 먼저 취소/);
    });

    it("입고 확정이 실패하면 재고·전표 모두 없음(부분 성공 없음), 같은 요청 키로 다시 보내면 한 번만 반영", async () => {
      await milk({ savePackUnit: true, idempotencyKey: "pm-milk-warm" });
      await q(`DELETE FROM accounting_purchases`); await q(`DELETE FROM h_inventory_lots`); await q(`DELETE FROM material_ledger_daily`);
      await q(`RENAME TABLE domain_events TO domain_events_off`); // 입고 확정 이벤트 실패 재현
      try {
        await expect(milk({ idempotencyKey: "pm-milk-retry" })).rejects.toThrow();
      } finally {
        await q(`RENAME TABLE domain_events_off TO domain_events`);
      }
      expect([(await lotOf()).length, await ledger(), Number((await q(`SELECT COUNT(*) AS n FROM accounting_purchases`))[0].n)]).toEqual([0, 0, 0]);
      const ok = await milk({ idempotencyKey: "pm-milk-retry" });
      expect([ok.posted, (await lotOf()).length, await ledger()]).toEqual([true, 1, 5.4]);
    });

    // ── Codex #567 검증 N1~N4·Q2 ──
    const bulk = async (items: any[]) => {
      const { haccpIntegrationRouter } = await import("./routers/haccp/haccpIntegration.router");
      return haccpIntegrationRouter.createCaller({ user: { id: 4, role: "admin", tenantId: T, email: "t@t" } } as any).bulkCreatePurchases({ items });
    };
    const row = (extra: any = {}) => ({ transactionDate: "2026-10-12", partnerId: 21, itemName: "우유(국내산)", itemMasterId: 1635, quantity: 6, unit: "개", unitPrice: 3000, amount: 18000, taxAmount: 1800, ...extra });

    it("N1·N2·N4 엑셀 일괄: 같은 작업 키 재전송·동시 3회는 한 번만, 새 작업 키는 새 거래, 명시한 불합격은 격리, 상태별로 집계", async () => {
      await q(`INSERT INTO material_pack_units (tenant_id, material_id, pack_unit, base_qty, base_unit, is_active) VALUES (?, 635, '개', 0.9, 'kg', 1)`, [T]);
      await q(`DELETE FROM item_master WHERE id = 1635`);
      await q(`INSERT INTO item_master (id, tenant_id, item_code, item_name, item_type, base_unit, is_active, legacy_material_id) VALUES (1635, ?, 'M635', '우유(국내산)', 'raw_material', 'kg', 1, 635)`, [T]);
      const items = [row({ idempotencyKey: "ub-job1-r1" }), row({ idempotencyKey: "ub-job1-r2", inspectionResult: "fail" })];
      const first = await bulk(items);
      expect([first.successCount, first.quarantinedCount, first.failCount, first.rows.map((r: any) => r.status)]).toEqual([1, 1, 0, ["posted", "quarantined"]]);
      const again = await Promise.all([bulk(items), bulk(items), bulk(items)]);
      expect(again.map((r: any) => [r.successCount, r.quarantinedCount])).toEqual([[1, 1], [1, 1], [1, 1]]);
      expect([(await lotOf()).length, await ledger(), Number((await q(`SELECT COUNT(*) AS n FROM accounting_purchases`))[0].n)]).toEqual([1, 5.4, 1]);
      expect(Number((await q(`SELECT COUNT(*) AS n FROM expense_journal_entries WHERE description LIKE '[매입] PURCHASE-%'`))[0].n)).toBe(1);
      expect((await q(`SELECT inspection_result, disposition FROM h_inbound_lines WHERE inspection_result = 'fail'`)).length).toBe(1);
      await bulk([row({ idempotencyKey: "ub-job2-r1" })]); // 새 업로드 작업 = 새 거래
      expect([(await lotOf()).length, await ledger()]).toEqual([2, 10.8]);
      // 승인 필요 회사 → 승인 대기로 집계 (성공 아님)
      await q(`INSERT INTO tenant_feature_settings (tenant_id, feature_code, enabled) VALUES (?, 'INBOUND_APPROVAL', 1)`, [T]);
      const pend = await bulk([row({ idempotencyKey: "ub-job3-r1" })]);
      expect([pend.successCount, pend.pendingApprovalCount]).toEqual([0, 1]);
    });

    it("N3 명시한 세액은 그대로 (공급가 12,345 · 세액 1,234), 음수·공급가 초과 세액 거부", async () => {
      await q(`INSERT INTO material_pack_units (tenant_id, material_id, pack_unit, base_qty, base_unit, is_active) VALUES (?, 635, '개', 0.9, 'kg', 1)`, [T]);
      const r = await milk({ amount: 12345, taxAmount: 1234, taxRate: 10, idempotencyKey: "pm-tax-1" });
      const v = (await q(`SELECT total_amount + 0 AS a, tax_amount + 0 AS t FROM accounting_purchases WHERE id = ?`, [r.id]))[0];
      expect([Number(v.a), Number(v.t)]).toEqual([12345, 1234]);
      expect(await net(r.id)).toEqual([["[매입]", 13579, 13579]]);
      await expect(milk({ taxAmount: -1, idempotencyKey: "pm-tax-2" })).rejects.toThrow(/세액/);
      await expect(milk({ taxAmount: 20000, idempotencyKey: "pm-tax-3" })).rejects.toThrow(/세액/);
    });

    it("Q2 같은 요청 키로 다시: 격리 줄은 계속 '격리', 반품 뒤에는 '취소' — '확정' 으로 보고하지 않음", async () => {
      await q(`INSERT INTO material_pack_units (tenant_id, material_id, pack_unit, base_qty, base_unit, is_active) VALUES (?, 635, '개', 0.9, 'kg', 1)`, [T]);
      const a = await milk({ inspectionResult: "fail", idempotencyKey: "pm-q2-1" });
      expect(a.status).toBe("quarantined");
      expect((await milk({ inspectionResult: "fail", idempotencyKey: "pm-q2-1" })).status).toBe("quarantined");
      const lineId = Number((await q(`SELECT id FROM h_inbound_lines`))[0].id);
      await svc.returnInboundLine(lineId, T, 4, "반품");
      expect((await milk({ inspectionResult: "fail", idempotencyKey: "pm-q2-1" })).status).toBe("cancelled");
      expect([(await lotOf()).length, Number((await q(`SELECT COUNT(*) AS n FROM accounting_purchases`))[0].n)]).toEqual([0, 0]);
    });

    it("Q1 재검수 합격분 취소: 수불부는 실제로 넣은 날(처리일)에서 빠짐, 수불부 기록이 없으면 취소 전체를 되돌림", async () => {
      await q(`INSERT INTO material_pack_units (tenant_id, material_id, pack_unit, base_qty, base_unit, is_active) VALUES (?, 635, '개', 0.9, 'kg', 1)`, [T]);
      await milk({ inspectionResult: "fail", idempotencyKey: "pm-q1-1" });
      const lineId = Number((await q(`SELECT id FROM h_inbound_lines`))[0].id);
      const rel = await svc.reinspectInboundLine(lineId, T, 4, { result: "pass" });
      const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
      const ld = (await q(`SELECT DATE_FORMAT(ledger_date, '%Y-%m-%d') AS d FROM h_inbound_lines WHERE id = ?`, [lineId]))[0].d;
      expect(ld).toBe(today);
      expect(Number((await q(`SELECT receiving_qty + 0 AS r FROM material_ledger_daily WHERE ledger_date = ?`, [today]))[0].r)).toBe(5.4);
      await cancelPurchase(rel.voucherId, 4, T);
      // 수불부 행이 없으면 거부·무변경
      await q(`UPDATE material_ledger_daily SET ledger_date = '2026-01-01' WHERE ledger_date = ?`, [today]);
      await expect(svc.cancelInboundLine(lineId, T, 4)).rejects.toThrow(/원료수불부 입고 기록을 찾지 못해/);
      expect([(await lotOf())[0].a, Number((await q(`SELECT cancelled_qty + 0 AS c FROM h_inbound_lines WHERE id = ?`, [lineId]))[0].c)]).toEqual([5.4, 0]);
      await q(`UPDATE material_ledger_daily SET ledger_date = ? WHERE ledger_date = '2026-01-01'`, [today]);
      await svc.cancelInboundLine(lineId, T, 4);
      expect([(await lotOf())[0].a, Number((await q(`SELECT receiving_qty + 0 AS r FROM material_ledger_daily WHERE ledger_date = ?`, [today]))[0].r)]).toEqual([0, 0]);
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
      // 보고서 product_id 는 정체성 번호 — 운영과 같게 정체성 제품 1038 → 생산 제품 38 연결 (번호 체계 2단계: 숫자 직접 일치 없음)
      await q(`INSERT IGNORE INTO item_master (id, tenant_id, item_code, item_name, item_type, legacy_product_id, is_active) VALUES (1038, ?, 'P38', '우유설기', 'own_product', 38, 1)`, [T]);
      await q(`INSERT INTO h_mf_reports (id, tenant_id, product_id, report_no, report_date, status) VALUES (373, ?, 1038, 'R373', '2026-03-31', 'ACTIVE')`, [T]);
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
      // 원료 정체성은 정본 연결(legacy_material_id)로만 (2026-10-20, 생산계획 생애주기 검토 5) — 시험 자료도 명시적으로 연결
      await q(`INSERT INTO h_materials (id, tenant_id, material_code, material_name) VALUES
        (168, ?, 'M168', '멥쌀(국내산)'), (191, ?, 'M191', '정제수'), (177, ?, 'M177', '설탕'), (188, ?, 'M188', '우유(국내산)'), (199, ?, 'M199', '천일염')`, [T, T, T, T, T]);
      await q(`INSERT INTO item_master (id, tenant_id, item_code, item_name, item_type, base_unit, is_active, legacy_material_id) VALUES
        (168, ?, 'M168', '멥쌀(국내산)', 'raw_material', 'kg', 1, 168), (191, ?, 'M191', '정제수', 'raw_material', 'kg', 1, 191),
        (177, ?, 'M177', '설탕', 'raw_material', 'kg', 1, 177), (188, ?, 'M188', '우유(국내산)', 'raw_material', 'kg', 1, 188),
        (199, ?, 'M199', '천일염', 'raw_material', 'kg', 1, 199)`, [T, T, T, T, T]);
      // 보고서 product_id 는 정체성 번호 — 운영과 같게 정체성 제품 1038 → 생산 제품 38 연결 (번호 체계 2단계: 숫자 직접 일치 없음)
      await q(`INSERT IGNORE INTO item_master (id, tenant_id, item_code, item_name, item_type, legacy_product_id, is_active) VALUES (1038, ?, 'P38', '우유설기', 'own_product', 38, 1)`, [T]);
      await q(`INSERT INTO h_mf_reports (id, tenant_id, product_id, report_no, report_date, status, report_type) VALUES (373, ?, 1038, 'R373', '2026-03-31', 'ACTIVE', 'BASIC')`, [T]);
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

    it("생산 설계 제품 배합의 공정 투입 = 실제 계획(loadPlanBom)과 같은 계산 — 5kg 아닌 5.172kg, 원물·전처리 근거 그대로 (#600 F600-01)", async () => {
      await q(`DELETE FROM h_products_v2 WHERE id = 38`);
      await q(`INSERT INTO h_products_v2 (id, tenant_id, product_code, product_name) VALUES (38, ?, 'P38', '우유설기')`, [T]);
      await q(`INSERT IGNORE INTO item_master (id, tenant_id, item_code, item_name, item_type, legacy_product_id, is_active) VALUES (1038, ?, 'P38', '우유설기', 'own_product', 38, 1)`, [T]);
      await q(`UPDATE h_mf_reports SET product_id = 1038 WHERE id = 373`);
      try {
        const { loadRecipes } = await import("./lib/production/designOverview");
        const { loadPlanBom } = await import("./lib/production/ccpPlanContext");
        const { processLoads } = await import("../shared/production/designReadiness");
        const { getRawConnection } = await import("./db/connection");
        const conn = await getRawConnection();
        const plan = await loadPlanBom(conn, T, 38, 5);
        expect(plan.massBasis).toBe("basis");
        const r = (await loadRecipes(conn, T)).find((x) => x.reportId === 373)!;
        expect(r.massBasis).toBe(true);
        expect(r.calcError).toBeNull();
        const rice = r.ingredients.find((i) => i.id === 6852)!;
        expect([rice.rawKgPerBatch, rice.kgPerBatch]).toEqual([3.2, 4]); // 생멥쌀 3.2kg × 전처리 1.25 = 공정 4kg
        const loads = processLoads({ approved: true, batchTargetKg: 5, ingredients: r.ingredients }, new Map());
        expect(loads).toEqual([{ label: "공정 #2", kg: 5.17 }]);
        expect(Math.round(r.ingredients.reduce((s, i) => s + (i.kgPerBatch ?? 0), 0) * 1000) / 1000).toBe(plan.inputByGroup[2]);
        expect(plan.inputByGroup[2]).toBe(5.172);

        // 환산을 끈 버전 → 둘 다 기존 계산 (73.3% × 5 = 3.665 …, 공정 합 5)
        await q(`UPDATE h_mf_report_versions SET mass_basis_enabled = 0 WHERE id = 472`);
        const off = (await loadRecipes(conn, T)).find((x) => x.reportId === 373)!;
        expect(off.massBasis).toBe(false);
        expect(off.ingredients.find((i) => i.id === 6852)!.kgPerBatch).toBe(3.665);
        expect((await loadPlanBom(conn, T, 38, 5)).inputByGroup[2]).toBe(5);

        // 켜진 버전의 계산 실패 → 빨강 이유로 보인다 (기존 계산으로 덮지 않는 실제 생성과 같은 판단)
        await q(`UPDATE h_mf_report_versions SET mass_basis_enabled = 1 WHERE id = 472`);
        await q(`UPDATE h_mf_ingredients SET basis_raw_kg = NULL WHERE id = 6854`);
        const bad = (await loadRecipes(conn, T)).find((x) => x.reportId === 373)!;
        expect(bad.massBasis).toBe(false);
        expect(bad.calcError).toBeTruthy();
      } finally {
        await q(`DELETE FROM h_products_v2 WHERE id = 38`);
      }
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
    it("CCP 공정 투입량: 저장된 행 기준량(5kg) 사용 — 이후 BOM 기준량을 10kg 로 바꿔도 그대로 (공정2 = 4.0+0.32 정제수+0.4+0.4+0.052, 2026-10-18 정제수 포함)", async () => {
      const bid = await newBatch("5", "MILK-CCP");
      expect(Number((await q(`SELECT sub_batch_kg + 0 AS s FROM h_batch_mass_basis WHERE batch_id = ?`, [bid]))[0].s)).toBe(5);
      await q(`UPDATE h_mf_report_versions SET batch_target_kg = 10 WHERE id = 472`);
      const { loadCcpInputFromMassBasis } = await import("./db/haccp/ccpFormSettings");
      const r = await loadCcpInputFromMassBasis(admin, bid, T, 10);
      expect(r).toEqual({ inputByGroup: { 2: 5.172 }, subBatchKg: 5 });
      // 저장값이 없는(PR C 이전) 스냅샷만 현재 BOM 기준량으로
      await q(`UPDATE h_batch_mass_basis SET sub_batch_kg = NULL WHERE batch_id = ?`, [bid]);
      expect((await loadCcpInputFromMassBasis(admin, bid, T, 10))?.subBatchKg).toBe(10);
      expect(await loadCcpInputFromMassBasis(admin, bid + 999, T, 10)).toBeNull();
    });
  });
  describe("BOM 줄 계약 — 원료 투입 계획 = CCP 투입량 해석 (2026-10-20, BOM·설비 시간·인쇄 기준 검토 1)", () => {
    let createBatch: any;
    beforeAll(async () => {
      ({ createBatch } = await import("./db/production/batchCRUD"));
    });
    beforeEach(async () => {
      for (const t of ["h_mf_reports", "h_mf_report_versions", "h_mf_ingredients", "h_batch_mass_basis", "h_batches", "h_batch_inputs", "item_master", "h_materials", "tenant_feature_settings"]) await q(`DELETE FROM ${t}`);
      await q(`INSERT INTO h_materials (id, tenant_id, material_code, material_name, unit) VALUES
        (168, ?, 'M168', '멥쌀', 'kg'), (177, ?, 'M177', '설탕', 'kg'), (199, ?, 'M199', '천일염', 'g'), (191, ?, 'M191', '정제수', 'kg')`, [T, T, T, T]);
      await q(`INSERT INTO item_master (id, tenant_id, item_code, item_name, item_type, base_unit, is_active, legacy_material_id) VALUES
        (168, ?, 'M168', '멥쌀', 'raw_material', 'kg', 1, 168), (177, ?, 'M177', '설탕', 'raw_material', 'kg', 1, 177),
        (199, ?, 'M199', '천일염', 'raw_material', 'g', 1, 199), (191, ?, 'M191', '정제수', 'raw_material', 'kg', 1, 191)`, [T, T, T, T]);
      await q(`INSERT IGNORE INTO item_master (id, tenant_id, item_code, item_name, item_type, legacy_product_id, is_active) VALUES (1039, ?, 'P39', '시험떡', 'own_product', 39, 1)`, [T]); // 정체성 1039 → 생산 39
      await q(`INSERT INTO h_mf_reports (id, tenant_id, product_id, report_no, report_date, status, report_type) VALUES (390, ?, 1039, 'R390', '2026-10-01', 'ACTIVE', 'BASIC')`, [T]);
      await q(`INSERT INTO h_mf_report_versions (id, tenant_id, mf_report_id, version_no, effective_from, approval_status, batch_target_kg) VALUES (490, ?, 390, 1, '2026-10-01', 'APPROVED', 10)`, [T]);
      // 주원료 % (멥쌀 62.6% · 천일염 5% — 천일염 재고 단위 g), 추가 원재료 설탕 500g (차감), 정제수 3kg (차감 안 함, 공정 2)
      await q(`INSERT INTO h_mf_ingredients (id, mf_report_version_id, line_no, material_id, quantity, unit, is_deductible, material_type, process_group_id, adjusted_weight_kg, is_additional) VALUES
        (4901, 490, 1, 168, '62.6', '%', 1, 'RAW', 2, NULL, 0), (4902, 490, 2, 199, '5', '%', 1, 'RAW', 2, NULL, 0),
        (4903, 490, 3, 177, '500', 'g', 1, 'RAW', 2, NULL, 1), (4904, 490, 4, 191, '3', 'kg', 0, 'RAW', 2, 3, 1)`);
    });
    const newBatch = (kg: string, code: string) => createBatch({ siteId: 1, productId: 39, batchCode: code, plannedQuantity: kg, plannedDate: new Date("2026-10-21T00:00:00+09:00"), createdBy: 4, tenantId: T });
    const inputs = async (bid: number) => (await q(`SELECT material_id, planned_quantity + 0 AS pq, unit FROM h_batch_inputs WHERE batch_id = ? ORDER BY material_id`, [bid])).map((r: any) => [Number(r.material_id), Number(r.pq), r.unit]);

    it("기준 10kg · 생산 20kg: 주원료 % × 20, 추가 500g = 0.5kg × 2배, 천일염은 재고 단위 g 로 (이전: 설탕 '500%' → 100kg, 천일염 1 g)", async () => {
      const bid = await newBatch("20", "BOM-20");
      expect(await inputs(bid)).toEqual([[168, 12.52, "kg"], [177, 1, "kg"], [199, 1000, "g"]]);
      // CCP 투입량(1회차 10kg 기준)도 같은 줄 해석: 6.26 + 0.5 + 0.5 + 정제수 조정량 3 = 10.26
      const { loadPlanBom } = await import("./lib/production/ccpPlanContext");
      const { getRawConnection } = await import("./db/connection");
      const plan = await loadPlanBom(await getRawConnection(), T, 39, 20);
      expect(plan.qtyError).toBeUndefined();
      expect(plan.inputByGroup[2]).toBeCloseTo(10.26, 9);
    });

    it("부분 회차·기준량 96/100kg 도 같은 비례 (계획 475kg)", async () => {
      for (const target of [96, 100]) {
        await q(`DELETE FROM h_batch_inputs`); await q(`DELETE FROM h_batches`);
        await q(`UPDATE h_mf_report_versions SET batch_target_kg = ? WHERE id = 490`, [target]);
        const bid = await newBatch("475", `BOM-475-${target}`);
        const got = new Map((await inputs(bid)).map((r: any) => [r[0], r[1]]));
        expect(got.get(168)).toBeCloseTo(297.35, 3);
        expect(got.get(177)).toBeCloseTo(Math.round(0.5 * 475 / target * 1000) / 1000, 3);
      }
    });

    it("% 가 아닌 주원료 줄 → 생산 건을 만들지 않음 (머리글까지 되돌림), 미리보기 계획에도 같은 이유", async () => {
      await q(`UPDATE h_mf_ingredients SET unit = 'kg' WHERE id = 4901`);
      await expect(newBatch("20", "BOM-BAD")).rejects.toThrow(/\[원료 양\] 멥쌀: 주원료 줄이 'kg' 로 저장돼 있어/);
      expect(Number((await q(`SELECT COUNT(*) AS n FROM h_batches WHERE batch_code = 'BOM-BAD'`))[0].n)).toBe(0);
      const { loadPlanBom } = await import("./lib/production/ccpPlanContext");
      const { getRawConnection } = await import("./db/connection");
      expect((await loadPlanBom(await getRawConnection(), T, 39, 20)).qtyError).toMatch(/비율\(%\)인지 kg 인지 정할 수 없습니다/);
    });

    it("기준량 없는 kg 줄 · 원료 단위 개 → 막음 (추정하지 않음)", async () => {
      await q(`UPDATE h_mf_report_versions SET batch_target_kg = NULL WHERE id = 490`);
      await expect(newBatch("20", "BOM-NOTARGET")).rejects.toThrow(/1배치 기준량이 없어/);
      await q(`UPDATE h_mf_report_versions SET batch_target_kg = 10 WHERE id = 490`);
      await q(`UPDATE item_master SET base_unit = 'ea' WHERE id = 199`);
      await expect(newBatch("20", "BOM-EA")).rejects.toThrow(/원료 단위 'ea'/);
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
      const r = await inv.createInventoryLot({ material: { kind: "inventory", id: 700 as any }, lotNumber: "N-1", quantity: "20", unit: "kg", userId: 4, tenantId: T });
      const lotRow = (await q(`SELECT tenant_id, current_quantity + 0 AS c, available_quantity + 0 AS a FROM h_inventory_lots WHERE id = ?`, [r.lotId]))[0];
      expect([Number(lotRow.tenant_id), Number(lotRow.c), Number(lotRow.a)]).toEqual([T, 20, 20]);
      const led = await q(`SELECT tenant_id, transaction_type, quantity + 0 AS qty FROM h_inventory_transactions WHERE lot_id = ?`, [r.lotId]);
      expect(led.map((x: any) => [Number(x.tenant_id), x.transaction_type, Number(x.qty)])).toEqual([[T, "receipt", 20]]);
      expect(Number((await q(`SELECT available_quantity + 0 AS a FROM h_inventory WHERE tenant_id = ? AND material_id = 700`, [T]))[0].a)).toBe(170);
      await expect(inv.createInventoryLot({ material: { kind: "inventory", id: 700 as any }, lotNumber: "N-2", quantity: "1", unit: "kg", userId: 4 })).rejects.toThrow(/테넌트/);
      await expect(inv.receiveMaterial({ material: { kind: "inventory", id: 800 as any }, quantity: 5, unit: "kg", receiptDate: "2026-10-17", tenantId: T, userId: 4 })).rejects.toThrow(/재고 원료\(번호 800\)를 이 회사에서 찾을 수 없습니다/);
      await otherUntouched();
    });

    it("원료 투입: 다른 회사 LOT·배치는 찾을 수 없음 (아무것도 안 바뀜), 정상 투입은 원장에 투입 줄 id", async () => {
      await expect(inv.addMaterialInputToBatch({ batchId: 7001, material: { kind: "inventory", id: 700 as any }, lotId: 9002, quantity: "30", unit: "kg", userId: 4, tenantId: T })).rejects.toThrow(/LOT를 찾을 수 없습니다/);
      await expect(inv.addMaterialInputToBatch({ batchId: 7002, material: { kind: "inventory", id: 700 as any }, lotId: 9001, quantity: "30", unit: "kg", userId: 4, tenantId: T })).rejects.toThrow(/배치를 찾을 수 없습니다/);
      expect(Number((await q(`SELECT COUNT(*) AS n FROM h_batch_inputs`))[0].n)).toBe(0);
      await otherUntouched();

      await inv.addMaterialInputToBatch({ batchId: 7001, material: { kind: "inventory", id: 700 as any }, lotId: 9001, quantity: "30", unit: "kg", userId: 4, tenantId: T });
      expect(await avail(9001)).toBe(70);
      const input = (await q(`SELECT id, tenant_id, inventory_deducted FROM h_batch_inputs`))[0];
      expect([Number(input.tenant_id), Number(input.inventory_deducted)]).toEqual([T, 1]);
      const led = (await q(`SELECT tenant_id, source_type, source_id, source_line_id FROM h_inventory_transactions WHERE lot_id = 9001`))[0];
      expect([Number(led.tenant_id), led.source_type, Number(led.source_id), Number(led.source_line_id)]).toEqual([T, "BATCH", 7001, Number(input.id)]);
      expect(Number((await q(`SELECT available_quantity + 0 AS a FROM h_inventory WHERE tenant_id = ? AND material_id = 700`, [T]))[0].a)).toBe(120);
    });

    it("원료 투입: 단위가 LOT 과 다르면 거부 (400g 를 400kg 로 빼지 않음)", async () => {
      await expect(inv.addMaterialInputToBatch({ batchId: 7001, material: { kind: "inventory", id: 700 as any }, lotId: 9001, quantity: "400", unit: "g", userId: 4, tenantId: T })).rejects.toThrow(/단위가 다릅니다/);
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
      await inv.addMaterialInputToBatch({ batchId: 7001, material: { kind: "inventory", id: 700 as any }, lotId: 9001, quantity: "30", unit: "kg", userId: 4, tenantId: T });
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

    it("재고 차감 제외 원료(정제수 등, 회사 설정): 투입만 기록 — LOT·재고 거래·집계·수불부 없음, 다른 원료는 그대로 차감, 다시 실행해도 그대로", async () => {
      await q(`INSERT INTO h_materials (id, tenant_id, material_code, material_name, unit, unit_price, is_active, stock_exempt) VALUES (701, ?, 'M701', '정제수', 'kg', 0, 1, 1)`, [T]);
      await q(`INSERT INTO h_inventory_lots (id, tenant_id, material_id, lot_number, quantity, current_quantity, available_quantity, unit, status) VALUES (9311, ?, 701, 'W-NEG', 0, -5, -5, 'kg', 'available')`, [T]);
      await q(`INSERT INTO h_batch_inputs (id, tenant_id, batch_id, material_id, planned_quantity, unit, inventory_deducted) VALUES (802, ?, 7301, 701, 30, 'kg', 0)`, [T]);
      const r = await dispatch();
      expect(r.errors).toEqual([]);
      expect(await avail(9311)).toBe(-5); // 기존 음수 LOT 소급 없음
      expect((await ledger()).filter((x) => x[2] === 802)).toEqual([]);
      const w = (await q(`SELECT inventory_deducted, actual_quantity + 0 AS a, total_price + 0 AS tp, notes FROM h_batch_inputs WHERE id = 802`))[0];
      expect([Number(w.inventory_deducted), Number(w.a), Number(w.tp), w.notes]).toEqual([1, 30, 0, "재고 차감 제외 원료"]);
      // 진단: 출고 당시 제외 기록으로 정상 — 원료 설정을 나중에 꺼도 그대로, 기록 없는 줄은 '차감 거래 없음' 유지 (Codex #572 P2)
      const { diagnoseBatch } = await import("../scripts/_lib/consumptionDiag");
      await q(`UPDATE h_materials SET stock_exempt = 0 WHERE id = 701`);
      const dg = await diagnoseBatch(admin, T, 7301);
      expect(dg.lines.find((l: any) => l.inputId === 802)).toMatchObject({ exemptAtIssue: true, flags: [] });
      await q(`INSERT INTO h_batch_inputs (id, tenant_id, batch_id, material_id, planned_quantity, unit, inventory_deducted) VALUES (804, ?, 7301, 701, 3, 'kg', 1)`, [T]);
      expect((await diagnoseBatch(admin, T, 7301)).lines.find((l: any) => l.inputId === 804)!.flags).toEqual(["차감 거래 없음(차감 표시 있음)"]);
      await q(`DELETE FROM h_batch_inputs WHERE id = 804`);
      await q(`UPDATE h_materials SET stock_exempt = 1 WHERE id = 701`);
      expect(Number((await q(`SELECT COUNT(*) AS n FROM material_ledger_daily WHERE material_id = 701`))[0].n)).toBe(0);
      expect(await ledger()).toEqual([[9302, 50, 801], [9301, 10, 801]]); // 멥쌀은 그대로 차감
      await dispatch();
      expect((await ledger()).length).toBe(2);
      const { validateBatchStart } = await import("./lib/production/batchStartValidation");
      await q(`UPDATE h_batch_inputs SET inventory_deducted = 0 WHERE id = 802`);
      expect(((await validateBatchStart(7301, T)) as any).shortages.map((x: any) => x.materialId)).not.toContain(701);
    });

    it("번호 체계 2c — 투입 줄 번호는 재고 번호 칸: 같은 숫자가 다른 원료의 품목 번호여도 재고 원료로 출고 · 옛 품목 번호는 FK 로 · 연결 없음은 출고 안 함(원장에 그 숫자 안 남김)", async () => {
      // 재고 700(멥쌀) — 같은 숫자의 품목 700 은 다른 재고 원료 705 에 연결 (숫자 우연 일치)
      await q(`INSERT INTO h_materials (id, tenant_id, material_code, material_name, unit, unit_price, is_active) VALUES (705, ?, 'M705', '찹쌀', 'kg', 3000, 1)`, [T]);
      await q(`INSERT INTO h_inventory_lots (id, tenant_id, material_id, lot_number, quantity, current_quantity, available_quantity, unit, unit_price, receipt_date, status) VALUES (9305, ?, 705, 'C-1', 50, 50, 50, 'kg', 3000, '2026-10-01', 'available')`, [T]);
      await q(`INSERT INTO item_master (id, tenant_id, item_code, item_name, item_type, base_unit, legacy_material_id, is_active) VALUES
        (700, ?, 'I700', '찹쌀', 'raw_material', 'kg', 705, 1), (1710, ?, 'I1710', '멥쌀', 'raw_material', 'kg', 700, 1), (1720, ?, 'I1720', '연결 없음', 'raw_material', 'kg', NULL, 1)`, [T, T, T]);
      // 옛 줄: 품목 번호 1710 (재고 원료로는 없는 숫자) → FK 700 / 연결 없는 품목 1720 / 어디에도 없는 번호 88999
      await q(`UPDATE h_batch_inputs SET planned_quantity = 10 WHERE id = 801`);
      await q(`INSERT INTO h_batch_inputs (id, tenant_id, batch_id, material_id, planned_quantity, unit, inventory_deducted) VALUES
        (803, ?, 7301, 1710, 5, 'kg', 0), (805, ?, 7301, 1720, 2, 'kg', 0), (806, ?, 7301, 88999, 1, 'kg', 0)`, [T, T, T]);
      const r = await dispatch();
      expect(await avail(9305)).toBe(50); // 찹쌀 LOT 은 건드리지 않음 (이전 우려: 품목 해석으로 다른 원료 출고)
      const used = await q(`SELECT source_line_id AS l, material_id AS m FROM h_inventory_transactions WHERE transaction_type = 'usage' ORDER BY id`);
      expect([...new Set(used.map((x: any) => `${x.l}:${x.m}`))].sort()).toEqual(["801:700", "803:700"]);
      expect(used.some((x: any) => [1720, 88999].includes(Number(x.m)))).toBe(false);
      expect(r.errors.join(" / ")).toMatch(/품목\(번호 1720\)이 재고 원료와 연결되지 않았습니다.* — 출고하지 않았습니다/);
      expect(r.errors.join(" / ")).toMatch(/원료\(번호 88999\)를 이 회사에서 찾을 수 없습니다\. — 출고하지 않았습니다/);
      const ded = await q(`SELECT id, inventory_deducted AS d FROM h_batch_inputs WHERE id IN (805, 806) ORDER BY id`);
      expect(ded.map((x: any) => Number(x.d))).toEqual([0, 0]); // 미출고로 남아 완료 관문이 드러낸다
      const { validateBatchStart } = await import("./lib/production/batchStartValidation");
      const v: any = await validateBatchStart(7301, T);
      expect(v.unlinkedLines.map((x: any) => x.inputId)).toEqual([805, 806]);
      expect(v.unissuedLines).toBeGreaterThanOrEqual(2);
      expect(v.shortages.map((x: any) => x.materialId)).not.toContain(1720);
    });

    it("재고 복구 도구의 거래 장부(Codex #569~571 검증 1번): 관문으로 입고·사용·반품·조정한 정상 LOT 은 불일치가 아님, 입고 기록 없는 LOT 은 판단 불가", async () => {
      const { withInventoryTx, receiveNewLot, applyLotDelta } = await import("./lib/inventory/applyInventoryDelta");
      const { loadLotLedger, classifyLot } = await import("../scripts/_lib/lotLedger");
      const mk = async (lot: string) => (await withInventoryTx((c) => receiveNewLot(c, { tenantId: T, subject: { materialId: 700 }, lotNumber: lot, quantity: 50, unit: "kg", receiptDate: "2026-10-17", reference: { referenceType: "test", referenceId: 1 }, createdBy: 4 } as any), "t")).lotId;
      const delta = (lotId: number, quantity: number, direction: "increase" | "decrease", transactionType: any) =>
        withInventoryTx((c) => applyLotDelta(c, { tenantId: T, lotId, subject: { materialId: 700 }, quantity, direction, transactionType, unit: "kg", reference: { referenceType: "test", referenceId: 1 }, createdBy: 4 } as any), "t");
      const a = await mk("LG-USE"); await delta(a, 20, "decrease", "usage");
      const b = await mk("LG-RET"); await delta(b, 5, "increase", "return");
      const c = await mk("LG-ADJ"); await delta(c, 10, "decrease", "adjustment");
      await q(`INSERT INTO h_inventory_lots (id, tenant_id, material_id, lot_number, quantity, current_quantity, available_quantity, unit, status) VALUES (9399, ?, 700, 'OLD-NO-RCPT', 50, 30, 30, 'kg', 'available')`, [T]);
      const rows = await loadLotLedger(admin, T, [], [a, b, c, 9399]);
      const by = new Map(rows.map((r) => [r.id, r]));
      expect([a, b, c].map((id) => [by.get(id)!.available, by.get(id)!.ledger, classifyLot(by.get(id)!)])).toEqual([[30, 30, []], [55, 55, []], [40, 40, []]]);
      expect([by.get(9399)!.ledger, by.get(9399)!.ledgerState, classifyLot(by.get(9399)!).map((x) => x.cat)]).toEqual([null, "no_receipt", ["LEDGER_NO_RECEIPT"]]);
    });

    it("재고 복구 진단의 배치 대조(Codex #569~571 검증 2·3번): source 형식만 있는 차감·batch_input 형식 차감·실적 없는 투입(계획 폴백) 모두 정상, 연결 없는 거래는 '미확인'", async () => {
      const { diagnoseBatch } = await import("../scripts/_lib/consumptionDiag");
      // (a) 계획 60 / 실적 NULL, source 형식만(reference_type 없음) 차감 60
      await q(`INSERT INTO h_inventory_transactions (tenant_id, lot_id, material_id, transaction_type, quantity, unit, source_type, source_id, source_line_id, created_by) VALUES (?, 9301, 700, 'usage', 60, 'kg', 'BATCH', 7301, 801, 4)`, [T]);
      // (b) batch_input 형식 차감 (투입 줄 id 를 reference_id 로)
      await q(`INSERT INTO h_batch_inputs (id, tenant_id, batch_id, material_id, planned_quantity, actual_quantity, unit, inventory_deducted) VALUES (803, ?, 7301, 700, 5, 5, 'kg', 1)`, [T]);
      await q(`INSERT INTO h_inventory_transactions (tenant_id, lot_id, material_id, transaction_type, quantity, unit, reference_type, reference_id, created_by) VALUES (?, 9302, 700, 'usage', 5, 'kg', 'batch_input', 803, 4)`, [T]);
      // (c) 배치에는 걸렸지만 투입 줄을 알 수 없는 거래
      await q(`INSERT INTO h_inventory_transactions (tenant_id, lot_id, material_id, transaction_type, quantity, unit, reference_type, reference_id, created_by) VALUES (?, 9302, 700, 'usage', 1, 'kg', 'batch', 7301, 4)`, [T]);
      const d = await diagnoseBatch(admin, T, 7301);
      const by = new Map(d.lines.map((l: any) => [l.inputId, l]));
      expect([by.get(801)!.qty, by.get(801)!.qtySource, by.get(801)!.deducted, by.get(801)!.flags]).toEqual([60, "planned", 60, []]);
      expect([by.get(803)!.deducted, by.get(803)!.flags]).toEqual([5, []]);
      expect(d.unlinkedTx.map((t: any) => t.qty)).toEqual([1]);
      expect(d.txCount).toBe(3);
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
      for (const t of ["h_inbound_headers", "h_inbound_lines", "h_inventory_lots", "h_inventory_transactions", "h_inventory", "h_materials", "item_master", "material_ledger_daily", "purchase_orders", "purchase_order_lines", "accounting_purchases", "tenant_feature_settings", "domain_events", "partners", "expense_journal_entries", "expense_journal_lines", "material_pack_units", "h_inbound_inspections"]) await q(`DELETE FROM ${t}`);
      await q(`INSERT INTO h_materials (id, tenant_id, material_code, material_name, unit, is_active) VALUES (700, ?, 'M700', '멥쌀', 'kg', 1), (800, 3, 'M800', '타사', 'kg', 1)`, [T]);
      await q(`INSERT INTO item_master (id, tenant_id, item_code, item_name, item_type, base_unit, is_active, legacy_material_id) VALUES (1700, ?, 'M700', '멥쌀', 'raw_material', 'kg', 1, 700)`, [T]);
      await q(`INSERT INTO purchase_orders (id, tenant_id, po_number, partner_id, order_date, status, created_by) VALUES (31, ?, 'PO-31', 0, '2026-10-17', 'approved', 4)`, [T]);
      await q(`INSERT INTO purchase_order_lines (id, tenant_id, po_id, line_number, material_id, item_name, ordered_qty, received_qty, unit, unit_price, amount) VALUES (311, ?, 31, 1, 1700, '멥쌀', 100, 0, 'kg', 2000, 200000)`, [T]);
    });
    const line = (qty: number, extra: any = {}) => ({ material: { kind: "inventory", id: 700 as any }, purchaseQuantity: qty, purchaseUnit: "kg", stockQuantity: qty, stockUnit: "kg", unitPrice: 2000, ...extra });
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
      const r = await svc.receiveDirect({ tenantId: T, userId: 4, material: { kind: "item", id: 1700 as any }, quantity: 25, unit: "kg", unitPrice: 2000, receiptDate: "2026-10-17", expiryDate: "2027-02-01", createVoucherDraft: true });
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
      await inv.createInventoryLot({ material: { kind: "inventory", id: 700 as any }, lotNumber: "MAN-1", quantity: "5", unit: "kg", expiryDate: new Date("2027-03-01T00:00:00+09:00"), receiptDate: new Date("2026-10-17T00:00:00+09:00"), userId: 4, tenantId: T });
      await inv.receiveMaterial({ material: { kind: "inventory", id: 700 as any }, quantity: 3, unit: "kg", receiptDate: "2026-10-16", expiryDate: "2027-01-31", tenantId: T, userId: 4 });
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
      const bag = (key: string, qty: number, extra: any = {}) => draft(key, [{ material: { kind: "inventory", id: 700 as any }, poLineId: 331, purchaseQuantity: qty, purchaseUnit: "포대", unitPrice: 40000, ...extra }], { sourceType: "purchase_order", poId: 33 });
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
      const r = await svc.receiveDirect({ tenantId: T, userId: 4, material: { kind: "inventory", id: 700 as any }, quantity: 2, unit: "포대", unitPrice: 0, receiptDate: "2026-10-17", createVoucherDraft: false });
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
        const r2 = await svc.receiveDirect({ tenantId: T, userId: 4, material: { kind: "inventory", id: 700 as any }, quantity: 4, unit: "kg", receiptDate: "2026-10-17", createVoucherDraft: false });
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
      const r = await svc.receiveDirect({ tenantId: T, userId: 4, material: { kind: "inventory", id: 700 as any }, quantity: 25, unit: "kg", unitPrice: 2000, receiptDate: "2026-10-16", createVoucherDraft: false });
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
      const A = await svc.receiveDirect({ tenantId: T, userId: 4, material: { kind: "inventory", id: 700 as any }, quantity: 5, unit: "kg", unitPrice: 1000, receiptDate: "2026-10-17", createVoucherDraft: true });
      const B = await svc.receiveDirect({ tenantId: T, userId: 4, material: { kind: "inventory", id: 700 as any }, quantity: 7, unit: "kg", unitPrice: 1000, receiptDate: "2026-10-17", createVoucherDraft: true });
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
      const m = await inv.createInventoryLot({ material: { kind: "inventory", id: 700 as any }, lotNumber: "MAN-P", quantity: "25", unit: "kg", unitPrice: 2000, userId: 4, tenantId: T });
      expect(Number((await q(`SELECT unit_price + 0 AS p FROM h_inventory_lots WHERE id = ?`, [m.lotId]))[0].p)).toBe(2000);
      const u = await inv.createInventoryLot({ material: { kind: "inventory", id: 700 as any }, lotNumber: "MAN-0", quantity: "25", unit: "kg", userId: 4, tenantId: T });
      const hi = await import("./db/haccp/haccpIntegration");
      const v: any = await hi.createPurchaseFromReceipt({ lotId: u.lotId, itemName: "멥쌀", quantity: "25", unit: "kg", unitPrice: "2000", createdBy: 4 }, T);
      expect(Number(v.total_amount)).toBe(50000);
      const { postPurchase } = await import("./lib/accounting/purchasePost");
      await postPurchase(Number(v.id), 4, T);
      expect(Number((await q(`SELECT unit_price + 0 AS p, quantity + 0 AS q FROM h_inventory_lots WHERE id = ?`, [u.lotId]))[0].p)).toBe(2000);
      const d1 = (await q(`SELECT l.debit_amount + 0 AS d FROM expense_journal_lines l WHERE l.account_code = '1410'`)).map((r: any) => Number(r.d));
      expect(d1).toEqual([50000]);
      // 이미 쓰인 무단가 LOT — 소급하지 않음
      const w = await inv.createInventoryLot({ material: { kind: "inventory", id: 700 as any }, lotNumber: "MAN-USED", quantity: "10", unit: "kg", userId: 4, tenantId: T });
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
      const a = await svc.receiveDirect({ tenantId: T, userId: 4, material: { kind: "inventory", id: 700 as any }, quantity: 5, unit: "kg", unitPrice: 1000, supplierId: 17, receiptDate: "2026-10-17", createVoucherDraft: true });
      const b = await svc.receiveDirect({ tenantId: T, userId: 4, material: { kind: "inventory", id: 700 as any }, quantity: 5, unit: "kg", unitPrice: 1000, supplierName: "동네방앗간", receiptDate: "2026-10-17", createVoucherDraft: true });
      const lot = async (id: number) => (await q(`SELECT supplier_name FROM h_inventory_lots WHERE id = ?`, [id]))[0].supplier_name;
      const vp = async (id: number) => (await q(`SELECT partner_id FROM accounting_purchases WHERE id = ?`, [id]))[0].partner_id;
      expect([await lot(a.lotId), Number(await vp(a.voucherIds[0]))]).toEqual(["미래농산", 17]);
      expect([await lot(b.lotId), await vp(b.voucherIds[0])]).toEqual(["동네방앗간", null]);
      await expect(svc.receiveDirect({ tenantId: T, userId: 4, material: { kind: "inventory", id: 700 as any }, quantity: 1, unit: "kg", supplierId: 18, receiptDate: "2026-10-17", createVoucherDraft: false })).rejects.toThrow(/거래처를 찾을 수 없습니다/);
    });

    it("N5 승인 필요 회사의 직접 입고: 대기 중 재고·전표 없음 → 승인 때 문서에 보존된 정책대로 LOT·연결 전표 각 1", async () => {
      await q(`INSERT INTO tenant_feature_settings (tenant_id, feature_code, enabled) VALUES (?, 'INBOUND_APPROVAL', 1)`, [T]);
      const r = await svc.receiveDirect({ tenantId: T, userId: 4, material: { kind: "inventory", id: 700 as any }, quantity: 8, unit: "kg", unitPrice: 1000, receiptDate: "2026-10-17", createVoucherDraft: true });
      expect([r.status, r.lotId]).toEqual(["pending_approval", 0]);
      expect([await counts(), Number((await q(`SELECT COUNT(*) AS n FROM accounting_purchases`))[0].n)]).toEqual([[0, 0, 0], 0]);
      const a = await svc.approveInbound(r.headerId, T, 9);
      expect(a.status).toBe("confirmed");
      expect((a as any).voucherIds.length).toBe(1);
      expect(Number((await q(`SELECT inbound_line_id FROM accounting_purchases`))[0].inbound_line_id)).toBe((a as any).lots[0].lineId);
    });

    it("N6 receiveMaterial 같은 요청 키 재시도 = 입고 한 번, 다른 키 = 두 번", async () => {
      const inv = await import("./db/inventory/inventoryFunctions");
      const call = (key: string) => inv.receiveMaterial({ material: { kind: "inventory", id: 700 as any }, quantity: 3, unit: "kg", receiptDate: "2026-10-17", tenantId: T, userId: 4, idempotencyKey: key });
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
      await expect(draft("key-f2", [line(100, { material: { kind: "inventory", id: 701 as any }, poLineId: 311 })], { sourceType: "purchase_order", poId: 31 })).rejects.toThrow(/발주 줄 원료와 입고 원료가 다릅니다/);
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

    it("다른 회사 문서·원료 거부, 검수 불합격 줄은 재고 없이 격리(결정 4), 발주서 입고에 다른 발주 줄 거부", async () => {
      const d = await draft("key-tenant", [line(5)]);
      await expect(svc.confirmInbound(d.headerId, 3, 4)).rejects.toThrow(/찾을 수 없습니다/);
      await expect(draft("key-other-mat", [line(5, { material: { kind: "inventory", id: 800 as any } })])).rejects.toThrow(/재고 원료\(번호 800\)를 이 회사에서 찾을 수 없습니다/);
      const f = await draft("key-fail", [line(5, { inspectionResult: "fail" })]);
      expect((await svc.confirmInbound(f.headerId, T, 4)).quarantinedLineIds?.length).toBe(1);
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
      const own = await svc.receiveDirect({ tenantId: T, userId: 4, material: { kind: "inventory", id: 700 as any }, quantity: 5, unit: "kg", receiptDate: "2026-10-17", createVoucherDraft: false });
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
      const u = await svc.receiveDirect({ tenantId: T, userId: 4, material: { kind: "inventory", id: 700 as any }, quantity: 25, unit: "kg", receiptDate: "2026-10-17", createVoucherDraft: false });
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
      const pr = await svc.receiveDirect({ tenantId: T, userId: 4, material: { kind: "inventory", id: 700 as any }, quantity: 10, unit: "kg", unitPrice: 1000, receiptDate: "2026-10-17", createVoucherDraft: true });
      await q(`UPDATE accounting_purchases SET total_amount = 99999 WHERE id = ?`, [pr.voucherIds[0]]);
      await expect(postPurchase(pr.voucherIds[0], 4, T)).rejects.toThrow(/입고 금액 10000 와 다릅니다/);
    });

    it("R4 승인 필요 회사: 수동 LOT·원재료 입고는 대기 상태·문서 번호를 돌려주고 LOT·전표 없음, 승인 때 한 번 반영(전표 초안 의도 보존)", async () => {
      await q(`INSERT INTO tenant_feature_settings (tenant_id, feature_code, enabled) VALUES (?, 'INBOUND_APPROVAL', 1)`, [T]);
      const inv = await import("./db/inventory/inventoryFunctions");
      const a: any = await inv.createInventoryLot({ material: { kind: "inventory", id: 700 as any }, lotNumber: "MAN-R4", quantity: "5", unit: "kg", unitPrice: 1000, userId: 4, tenantId: T, createVoucherDraft: true });
      expect([a.status, a.pendingApproval, a.lotId, a.inboundHeaderId > 0]).toEqual(["pending_approval", true, null, true]);
      const b: any = await inv.receiveMaterial({ material: { kind: "inventory", id: 700 as any }, quantity: 3, unit: "kg", receiptDate: "2026-10-17", tenantId: T, userId: 4 });
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
      const { erpPostPurchase } = await import("./lib/accounting/erpPurchasePost");
      await expect(erpPostPurchase(Number(old.insertId), 4, T)).rejects.toThrow(/입고 문서 이전 방식/);
      await q(`INSERT INTO tenant_feature_settings (tenant_id, feature_code, enabled) VALUES (?, 'INVENTORY_TRACKING', 0)`, [T]);
      await expect(dispatchPostPurchase(Number(old.insertId), 4, T)).rejects.toThrow(/입고 문서 이전 방식/);
      await q(`DELETE FROM tenant_feature_settings WHERE feature_code = 'INVENTORY_TRACKING'`);
      expect(Number((await q(`SELECT COALESCE(SUM(available_quantity), 0) + 0 AS a FROM h_inventory_lots WHERE material_id = 700`))[0].a)).toBe(25);
      expect(Number((await q(`SELECT COUNT(*) AS n FROM h_inventory_lots`))[0].n)).toBe(1);
      expect(await debit1410()).toBe(0);
      // 입고 문서로 받은 입고는 두 경로 모두 그 입고 줄 전표 하나 (동시에 불러도)
      const nw = await svc.receiveDirect({ tenantId: T, userId: 4, material: { kind: "inventory", id: 700 as any }, quantity: 25, unit: "kg", unitPrice: 2000, receiptDate: "2026-10-17", createVoucherDraft: false });
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

    // ── CEO 결정 4: 검수 불합격 → 격리·재검수·반품, 최초 불합격 보존 ──
    const hist = async (lineId: number) => (await q(`SELECT seq, action, result FROM h_inbound_inspections WHERE inbound_line_id = ? ORDER BY seq`, [lineId])).map((r: any) => [Number(r.seq), r.action, r.result]);
    const lineRow = async (lineId: number) => {
      const r = (await q(`SELECT disposition, inspection_result, lot_id, cancelled_qty AS c FROM h_inbound_lines WHERE id = ?`, [lineId]))[0];
      return { ...r, c: Number(r.c) };
    };
    const failFromPo = (key: string, qty: number) => draft(key, [line(qty, { poLineId: 311, inspectionResult: "fail" })], { sourceType: "purchase_order", poId: 31 });

    it("결정4 불합격 입고: 확정돼도 LOT·원장·집계·수불부·전표 없음(격리), 발주 입고량은 반영, 일반 취소·전표 생성·확정 거부", async () => {
      const d = await failFromPo("key-q-1", 30);
      const r = await svc.confirmInbound(d.headerId, T, 4, { createVoucherDrafts: true });
      const lineId = r.lots[0].lineId;
      expect([r.status, r.lots[0].lotId, r.voucherIds, r.quarantinedLineIds]).toEqual(["confirmed", 0, [], [lineId]]);
      expect(await counts()).toEqual([0, 0, 0]);
      expect(Number((await q(`SELECT COUNT(*) AS n FROM material_ledger_daily`))[0].n)).toBe(0);
      expect(await nPurch()).toBe(0);
      expect([await received(), await poStatus()]).toEqual([30, "partial_received"]);
      expect(await lineRow(lineId)).toMatchObject({ disposition: "quarantine", inspection_result: "fail", lot_id: null });
      expect(await hist(lineId)).toEqual([[1, "initial", "fail"]]);
      // 다시 확정해도 그대로
      expect((await svc.confirmInbound(d.headerId, T, 4)).alreadyProcessed).toBe(true);
      expect(await counts()).toEqual([0, 0, 0]);
      await expect(svc.cancelInboundLine(lineId, T, 4)).rejects.toThrow(/격리 중/);
      const hi = await import("./db/haccp/haccpIntegration");
      await expect(hi.createPurchaseFromReceipt({ inboundLineId: lineId, itemName: "x", quantity: "30", unit: "kg", unitPrice: "2000", createdBy: 4 }, T)).rejects.toThrow(/격리 중/);
      const list = await svc.listQuarantinedLines(T);
      expect(list.map((x: any) => [x.lineId, x.materialName, x.stockQuantity, x.history.length])).toEqual([[lineId, "멥쌀", 30, 1]]);
      expect(await svc.listQuarantinedLines(3)).toEqual([]);
    });

    it("결정4 재검수: 불합격은 이력만, 합격이면 그때 LOT·재고·전표 초안 — 최초 불합격은 줄·이력 1번에 그대로, 두 번 처리 거부, 다른 회사 거부", async () => {
      await accts();
      const r = await svc.confirmInbound((await failFromPo("key-q-2", 30)).headerId, T, 4, { createVoucherDrafts: true });
      const lineId = r.lots[0].lineId;
      await expect(svc.reinspectInboundLine(lineId, 3, 4, { result: "pass" })).rejects.toThrow(/찾을 수 없습니다/);
      expect(await svc.reinspectInboundLine(lineId, T, 5, { result: "fail", notes: "이물 재확인" })).toEqual({ disposition: "quarantine", lotId: null, voucherId: null });
      expect(await counts()).toEqual([0, 0, 0]);
      const ok = await svc.reinspectInboundLine(lineId, T, 5, { result: "pass", notes: "재선별 후 합격" });
      expect(ok.disposition).toBe("released");
      expect(await counts()).toEqual([1, 1, 30]);
      const lot = (await q(`SELECT inbound_line_id, status, available_quantity + 0 AS a, unit_price + 0 AS p, DATE_FORMAT(receipt_date, '%Y-%m-%d') AS rd FROM h_inventory_lots`))[0];
      expect([Number(lot.inbound_line_id), lot.status, Number(lot.a), Number(lot.p), lot.rd]).toEqual([lineId, "available", 30, 2000, "2026-10-17"]);
      expect(await lineRow(lineId)).toMatchObject({ disposition: "released", inspection_result: "fail" }); // 최초 불합격 그대로
      expect(await hist(lineId)).toEqual([[1, "initial", "fail"], [2, "reinspect", "fail"], [3, "reinspect", "pass"]]);
      const v = (await q(`SELECT id, status, inbound_line_id, total_amount + 0 AS a FROM accounting_purchases`));
      expect(v.map((x: any) => [x.status, Number(x.inbound_line_id), Number(x.a)])).toEqual([["pending", lineId, 60000]]);
      expect(ok.voucherId).toBe(Number(v[0].id));
      await expect(svc.reinspectInboundLine(lineId, T, 5, { result: "pass" })).rejects.toThrow(/격리 중인 입고 줄이 아닙니다/);
      const { dispatchPostPurchase } = await import("./lib/accounting/postDispatcher");
      await dispatchPostPurchase(Number(v[0].id), 4, T);
      expect(await counts()).toEqual([1, 1, 30]); // 승인 = 분개만
      expect(await debit1410()).toBe(60000);
      expect(Number((await q(`SELECT SUM(receiving_qty) + 0 AS r FROM material_ledger_daily`))[0].r)).toBe(30);
    });

    it("결정4 반품: 사유 필수, 재고 없이 발주 입고량만 되돌림, 문서 취소, 잔량 다시 입고 가능, 이후 재검수 거부", async () => {
      const r = await svc.confirmInbound((await failFromPo("key-q-3", 30)).headerId, T, 4, { createVoucherDrafts: true });
      const lineId = r.lots[0].lineId;
      await expect(svc.returnInboundLine(lineId, T, 4, " ")).rejects.toThrow(/사유/);
      expect(await svc.returnInboundLine(lineId, T, 4, "공급사 반품")).toEqual({ returnedQty: 30 });
      expect([await received(), await poStatus()]).toEqual([0, "approved"]);
      expect(await counts()).toEqual([0, 0, 0]);
      expect(await lineRow(lineId)).toMatchObject({ disposition: "returned", inspection_result: "fail", c: 30 });
      expect((await q(`SELECT status FROM h_inbound_headers WHERE id = ?`, [r.lots.length ? (await q(`SELECT header_id FROM h_inbound_lines WHERE id = ?`, [lineId]))[0].header_id : 0]))[0].status).toBe("cancelled");
      expect(await hist(lineId)).toEqual([[1, "initial", "fail"], [2, "return", null]]);
      await expect(svc.reinspectInboundLine(lineId, T, 4, { result: "pass" })).rejects.toThrow(/격리 중인 입고 줄이 아닙니다/);
      await expect(svc.returnInboundLine(lineId, T, 4, "다시")).rejects.toThrow(/격리 중인 입고 줄이 아닙니다/);
      await svc.confirmInbound((await fromPo("key-q-3-re", 100)).headerId, T, 4);
      expect([await received(), await poStatus()]).toEqual([100, "received"]);
    });

    it("결정4 회계 전용 회사: 불합격 격리 → 합격이면 LOT 없이 전표 초안만, 합격 줄과 섞인 문서는 합격 줄만 재고", async () => {
      await q(`INSERT INTO tenant_feature_settings (tenant_id, feature_code, enabled) VALUES (?, 'INVENTORY_TRACKING', 0)`, [T]);
      const r = await svc.confirmInbound((await failFromPo("key-q-4", 10)).headerId, T, 4, { createVoucherDrafts: true });
      const ok = await svc.reinspectInboundLine(r.lots[0].lineId, T, 4, { result: "pass" });
      expect([ok.lotId, ok.voucherId != null]).toEqual([null, true]);
      expect(await counts()).toEqual([0, 0, 0]);
      await q(`DELETE FROM tenant_feature_settings`);
      // 재고 회사: 합격 5 + 불합격 3 한 문서 → 합격 줄만 LOT, 불합격은 격리
      const m = await svc.confirmInbound((await draft("key-q-mix", [line(5), line(3, { inspectionResult: "fail" })])).headerId, T, 4);
      expect(m.lots.map((x: any) => x.lotId > 0)).toEqual([true, false]);
      expect(m.quarantinedLineIds).toEqual([m.lots[1].lineId]);
      expect(await counts()).toEqual([1, 1, 5]);
    });

    it("결정4 육안검사일지: 불합격 입고는 '부적합'·조치(격리)로 — 같은 날 같은 원료의 합격분과 합치지 않음, 다시 동기화·재검수 합격 뒤에도 중복 없음, 최초 불합격 보존", async () => {
      const vi = await import("./db/haccp/visualInspectionMaterial");
      const db = await (await import("./db/connection")).getDb();
      await vi.createVisualInspectionTables(db);
      await q(`DELETE FROM h_visual_inspection_items`); await q(`DELETE FROM h_visual_inspection_logs`);
      const ok = await svc.confirmInbound((await draft("key-vi-ok", [line(20)])).headerId, T, 4);
      const bad = await svc.confirmInbound((await draft("key-vi-bad", [line(5, { inspectionResult: "fail" })])).headerId, T, 4);
      const badLine = bad.lots[0].lineId;
      const { id: logId } = await vi.getOrCreateMonthlyLog(db, T, 1, 2026, 10, 4);
      expect(await vi.syncReceivingsToInspectionLog(db, T, logId, 2026, 10)).toEqual({ synced: 2 });
      const items = async () => (await q(`SELECT product_name, compliance, corrective_action, note FROM h_visual_inspection_items WHERE log_id = ? ORDER BY sort_order`, [logId]))
        .map((r: any) => [r.product_name, r.compliance, r.corrective_action, r.note]);
      expect(await items()).toEqual([
        ["멥쌀", "적합", "", `LOT: ${ok.lots[0].lotNumber} 입고줄: ${ok.lots[0].lineId}`],
        ["멥쌀", "부적합", "격리 (재검수·반품 대기)", `입고줄: ${badLine}`],
      ]);
      expect(await vi.syncReceivingsToInspectionLog(db, T, logId, 2026, 10)).toEqual({ synced: 0 });
      await svc.reinspectInboundLine(badLine, T, 4, { result: "pass" });
      expect(await vi.syncReceivingsToInspectionLog(db, T, logId, 2026, 10)).toEqual({ synced: 0 }); // 같은 입고 줄 — 새 행 없음
      expect((await items())[1].slice(0, 2)).toEqual(["멥쌀", "부적합"]); // 최초 불합격 그대로
      // 다른 달 일지로 보면 재검수 뒤 상태가 조치에 반영
      const fetched = await vi.fetchMaterialReceivingsForMonth(db, T, 2026, 10);
      expect(fetched.find((x: any) => x.inboundLineId === badLine)).toMatchObject({ compliance: "부적합", correctiveAction: "격리 후 재검수 합격" });
    });

    it("R1(#568) 발주 입고: 불합격 → 전량 반품 뒤 같은 키로 다시 보내면 오류 없이 '반품·취소' 로 답함 (재고·전표·발주 입고량 그대로), 새 키는 새 입고", async () => {
      const { purchaseOrderRouter } = await import("./routers/accounting/purchaseOrder.router");
      const po = purchaseOrderRouter.createCaller({ user: { id: 4, role: "admin", tenantId: T, email: "t@t" } } as any);
      const send = (key: string, inspectionResult?: "fail") => po.receive({ poId: 31, receiptDate: "2026-10-17", idempotencyKey: key, lines: [{ lineId: 311, receivedQty: 30, ...(inspectionResult ? { inspectionResult } : {}) }] });
      const a = await send("po-r1-key-0001", "fail");
      expect(a.quarantinedLineIds?.length).toBe(1);
      expect((await send("po-r1-key-0001", "fail")).quarantinedLineIds?.length).toBe(1);
      await svc.returnInboundLine(a.quarantinedLineIds![0], T, 4, "반품");
      const again: any = await send("po-r1-key-0001", "fail");
      expect([again.message, again.createdPurchaseIds, again.cancelledLineIds?.length, again.newStatus]).toEqual(["이 입고는 이미 전부 반품·취소됐습니다 — 다시 받으려면 새로 입고하세요.", [], 1, "approved"]);
      expect([await received(), ...(await counts()), await nPurch()]).toEqual([0, 0, 0, 0, 0]);
      await send("po-r1-key-0002");
      expect([await received(), (await counts())[2]]).toEqual([30, 30]);
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
      lines: [{ material: { kind: "inventory", id: 700 as any }, poLineId: 411, purchaseQuantity: qty, purchaseUnit: "kg", stockQuantity: qty, stockUnit: "kg", unitPrice: 2000 }],
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

  describe("원재료 마스터 — 수정은 item_master 연결로만, 소비기한·알림·설명 분리, 중복 코드 안내 (지티 QA R01·R02, 2026-10-18)", () => {
    const caller = async (path: string, name: string) =>
      (await import(path))[name].createCaller({ user: { id: 4, role: "admin", tenantId: T, email: "t@t" }, tenantId: T } as any);
    it("목록 id(item_master) 로 수정하면 연결된 h_materials 만 바뀌고, 같은 번호의 다른 원재료는 그대로", async () => {
      await q(`INSERT INTO h_materials (id, tenant_id, material_code, material_name) VALUES (99201, ?, 'R02-A', '원료R'), (99101, ?, 'DECOY', '다른원료')`, [T, T]);
      await q(`INSERT INTO item_master (id, tenant_id, item_code, item_name, item_type, legacy_material_id) VALUES (99101, ?, 'R02-A', '원료R', 'raw_material', 99201)`, [T]);
      const m = await caller("./routers/master/material.router", "materialRouter");
      await m.update({ id: 99101, materialName: "원료R2", shelfLifeDays: 180, expiryWarningDays: 10, description: "QA 설명" });
      const hm = await q(`SELECT id, material_name, shelf_life_days, expiry_warning_days, description FROM h_materials WHERE id IN (99101, 99201) ORDER BY id`);
      expect(hm.map((r: any) => [r.id, r.material_name, r.shelf_life_days, r.expiry_warning_days, r.description])).toEqual([
        [99101, "다른원료", null, 7, null],
        [99201, "원료R2", 180, 10, "QA 설명"],
      ]);
      const im = (await q(`SELECT item_name, shelf_life_days, description FROM item_master WHERE id = 99101`))[0];
      expect([im.item_name, im.shelf_life_days, im.description]).toEqual(["원료R2", 180, "QA 설명"]);
      const list = await m.list({ search: "R02-A" });
      expect(list.items.map((x: any) => [x.id, x.shelfLifeDays, x.expiryWarningDays])).toEqual([[99101, 180, 10]]);
      await expect(m.update({ id: 99999, materialName: "x" })).rejects.toThrow(/원재료를 찾을 수 없습니다/);
    });
    it("품목 마스터에서 같은 회사 중복 코드 → SQL 없이 업무 문장, 품목·원재료 추가 없음", async () => {
      const im = await caller("./routers/master/itemMaster.router", "itemMasterRouter");
      const before = (await q(`SELECT (SELECT COUNT(*) FROM item_master) a, (SELECT COUNT(*) FROM h_materials) b`))[0];
      const err: any = await im.create({ itemCode: "R02-A", itemName: "중복", itemType: "raw_material" }).catch((e: any) => e);
      expect(err.message).toBe("이미 있는 품목 코드입니다 (R02-A). 다른 코드를 입력하세요.");
      expect(err.message).not.toMatch(/insert|params|Failed query/i);
      expect((await q(`SELECT (SELECT COUNT(*) FROM item_master) a, (SELECT COUNT(*) FROM h_materials) b`))[0]).toEqual(before);
      await q(`DELETE FROM item_master WHERE id = 99101`);
      await q(`DELETE FROM h_materials WHERE id IN (99101, 99201)`);
    });
  });

  describe("원료수불부 일별 — 현재고는 입고·사용·조정 누계, 단가는 최근 LOT 단가 (지티 QA F05, 2026-10-18)", () => {
    it("입고 100 → 사용 8 (저장된 running_stock 은 0): 전일 100·현재고 92·LOT 단가 2,500·금액, 이전 날짜는 영향 없음", async () => {
      await q(`INSERT INTO h_materials (id, tenant_id, material_code, material_name, unit, unit_price) VALUES (99301, ?, 'F05-A', '원료F05', 'kg', 0)`, [T]);
      await q(`INSERT INTO h_inventory_lots (tenant_id, material_id, lot_number, quantity, available_quantity, unit, unit_price, receipt_date, status)
               VALUES (?, 99301, 'F05-LOT', 100, 92, 'kg', 2500, '2026-10-17', 'available')`, [T]);
      // 지금 쓰는 경로처럼 receiving/usage 만 넣고 running_stock 은 0 그대로
      await q(`INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, running_stock, source) VALUES (?, 99301, '2026-10-17', 100, 0, 'inbound')`, [T]);
      await q(`INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, usage_qty, running_stock, source) VALUES (?, 99301, '2026-10-18', 8, 0, 'auto')`, [T]);
      const { getDailyLedger } = await import("./db/accounting/materialLedger");
      const pick = async (d: string) => {
        const r: any = (await getDailyLedger(d, T)).find((x: any) => Number(x.material_id) === 99301);
        return [Number(r.prev_stock), Number(r.receiving_qty), Number(r.usage_qty), Number(r.current_stock), Number(r.unit_price), Number(r.receiving_amount), Number(r.usage_amount)];
      };
      expect(await pick("2026-10-17")).toEqual([0, 100, 0, 100, 2500, 250000, 0]);
      expect(await pick("2026-10-18")).toEqual([100, 0, 8, 92, 2500, 0, 20000]);
      expect(await pick("2026-10-16")).toEqual([0, 0, 0, 0, 0, 0, 0]); // LOT 입고 전 — 단가 근거 없음
      await q(`DELETE FROM material_ledger_daily WHERE material_id = 99301`);
      await q(`DELETE FROM h_inventory_lots WHERE material_id = 99301 AND tenant_id = ?`, [T]);
      await q(`DELETE FROM h_materials WHERE id = 99301`);
    });
  });

  describe("원료수불부 일일 마감 — 이미 기록한 행은 덮어쓰지 않고, 빈 날만 재고 거래로 (지티 QA F05 추가 원인, 2026-10-18)", () => {
    it("입고 100 → 출고 8 → 마감 → 재실행 → 다음날 현재고 92, 미출고 완료 배치 계획량은 사용 아님, 빈 날은 거래로 한 번만 채움", async () => {
      const days = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, "0"));
      await q(`CREATE TABLE IF NOT EXISTS material_ledger_monthly (
        id bigint NOT NULL AUTO_INCREMENT PRIMARY KEY, tenant_id int NOT NULL, material_id bigint NOT NULL, \`year_month\` varchar(7) NOT NULL,
        prev_stock decimal(12,3) DEFAULT 0, receiving_total decimal(12,3) DEFAULT 0, usage_total decimal(12,3) DEFAULT 0, end_stock decimal(12,3) DEFAULT 0,
        ${days.map((d) => `receiving_day_${d} decimal(12,3) DEFAULT 0, usage_day_${d} decimal(12,3) DEFAULT 0`).join(", ")},
        status varchar(20) DEFAULT 'draft', updated_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_mlm (tenant_id, material_id, \`year_month\`))`);
      await q(`INSERT INTO h_materials (id, tenant_id, material_code, material_name, unit) VALUES (99401, ?, 'F05B-A', '원료F05B', 'kg'), (99402, ?, 'F05B-C', '원료F05C', 'kg')`, [T, T]);
      // 입고 LOT — 출고 뒤 quantity 가 줄어든 상태(92) 로 남아 있다 (예전 마감은 이 값을 입고로 썼다)
      await q(`INSERT INTO h_inventory_lots (tenant_id, material_id, lot_number, quantity, available_quantity, unit, unit_price, receipt_date, status)
               VALUES (?, 99401, 'F05B-LOT', 92, 92, 'kg', 1000, '2026-10-17', 'available')`, [T]);
      await q(`INSERT INTO h_inventory_transactions (tenant_id, material_id, transaction_type, quantity, unit, transaction_date, created_by) VALUES
               (?, 99401, 'receipt', 100, 'kg', '2026-10-17', 4), (?, 99401, 'usage', 8, 'kg', '2026-10-18', 4),
               (?, 99402, 'receipt', 30, 'kg', '2026-10-18', 4)`, [T, T, T]);
      // 입고·출고 때 이미 기록된 수불부 (99402 는 기록 없음 — 옛 경로)
      await q(`INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, source) VALUES (?, 99401, '2026-10-17', 100, 'inbound')`, [T]);
      await q(`INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, usage_qty, source) VALUES (?, 99401, '2026-10-18', 8, 'auto')`, [T]);
      const { autoUpdateFromDailyClose, getDailyLedger } = await import("./db/accounting/materialLedger");
      for (let i = 0; i < 2; i++) {
        await autoUpdateFromDailyClose("2026-10-17", T);
        await autoUpdateFromDailyClose("2026-10-18", T);
      }
      const rows = await q(`SELECT material_id, ledger_date, receiving_qty + 0 AS r, usage_qty + 0 AS u FROM material_ledger_daily WHERE material_id IN (99401, 99402) ORDER BY material_id, ledger_date`);
      expect(rows.map((x: any) => [Number(x.material_id), x.ledger_date, Number(x.r), Number(x.u)])).toEqual([
        [99401, "2026-10-17", 100, 0],
        [99401, "2026-10-18", 0, 8],
        [99402, "2026-10-18", 30, 0],
      ]);
      const next: any[] = await getDailyLedger("2026-10-19", T);
      expect(Number(next.find((x: any) => Number(x.material_id) === 99401).current_stock)).toBe(92);
      expect(Number(next.find((x: any) => Number(x.material_id) === 99402).current_stock)).toBe(30);
      const m = await q(`SELECT material_id, receiving_total + 0 AS r, usage_total + 0 AS u, end_stock + 0 AS e FROM material_ledger_monthly WHERE material_id = 99401`);
      expect(m.map((x: any) => [Number(x.r), Number(x.u), Number(x.e)])).toEqual([[100, 8, 92]]);
      await q(`DELETE FROM material_ledger_daily WHERE material_id IN (99401, 99402)`);
      await q(`DELETE FROM material_ledger_monthly WHERE material_id IN (99401, 99402)`);
      await q(`DELETE FROM h_inventory_transactions WHERE material_id IN (99401, 99402) AND tenant_id = ?`, [T]);
      await q(`DELETE FROM h_inventory_lots WHERE material_id = 99401 AND tenant_id = ?`, [T]);
      await q(`DELETE FROM h_materials WHERE id IN (99401, 99402)`);
    });
  });

  describe("하루 생산 입력 회귀 — 시작시각 유지·같은 제품 생산 건 중복 막기 (2026-10-19, Codex 단지 F-PROD-01·02)", () => {
    let updateBatchStatus: any; let guard: any;
    beforeAll(async () => {
      ({ updateBatchStatus } = await import("./db/production/batchCRUD"));
      guard = await import("./lib/production/dayProductionGuard");
    });
    beforeEach(async () => {
      await q(`DELETE FROM h_batches WHERE id BETWEEN 1990 AND 1999`);
      const { todayKstDateStr } = await import("./lib/production/batchBusinessDate");
      const today = todayKstDateStr();
      const rows: Array<[number, string, string | null, string, string | null]> = [
        [1991, "2026-10-15", "2026-10-15 09:00:00", "planned", "DAY-20261015-001"], // 과거 업무일 — 오늘 입력·시작
        [1992, today, `${today} 09:00:00`, "planned", null],                          // 오늘, 자동 시작
        [1993, today, `${today} 09:00:00`, "planned", null],                          // 오늘, 사람이 시작
        [1994, "2026-10-15", null, "planned", null],                                   // 시작시각 없음
        [1995, "2026-10-15", "2026-10-15 09:00:00", "cancelled", null],               // 취소 — 중복 판단 제외
      ];
      for (const [id, d, st, status, grp] of rows) {
        await q(`INSERT INTO h_batches (id, tenant_id, site_id, batch_code, product_id, planned_quantity, planned_date, start_time, status, day_batch_group, created_by)
          VALUES (?, ?, 1, ?, 91, 475, ?, ?, ?, ?, 4)`, [id, T, `FP${id}`, d, st, status, grp]);
      }
    });
    const startOf = async (id: number) => ((await q(`SELECT DATE_FORMAT(start_time, '%Y-%m-%d %H:%i') AS s, status FROM h_batches WHERE id = ?`, [id])) as any[])[0];

    it("과거 업무일 배치를 오늘 시작해도 계획 시작시각(10/15 09:00) 유지", async () => {
      await updateBatchStatus(1991, "in_progress", T);
      expect(await startOf(1991)).toEqual({ s: "2026-10-15 09:00", status: "in_progress" });
    });
    it("자동 시작(keepPlannedStart)은 오늘 배치도 계획 시작시각 유지, 사람이 오늘 시작하면 실제 시각", async () => {
      await updateBatchStatus(1992, "in_progress", T, { keepPlannedStart: true });
      expect((await startOf(1992)).s.endsWith("09:00")).toBe(true);
      await updateBatchStatus(1993, "in_progress", T);
      // 사람이 오늘 시작 = 실제 시작 시각으로 바뀜 (저장 시각대 규칙은 기존 그대로라 값 자체는 비교하지 않음)
      expect((await startOf(1993)).s.endsWith("09:00")).toBe(false);
    });
    it("시작시각이 없으면 이전처럼 지금", async () => {
      await updateBatchStatus(1994, "in_progress", T);
      expect((await startOf(1994)).s).not.toBeNull();
    });
    it("같은 업무일 같은 제품 생산 건 — 취소 제외, 이 요청이 만든 생산 건만 제외 (같은 일일 그룹 전체를 빼지 않음)", async () => {
      const { getRawConnection } = await import("./db/connection");
      const conn = await getRawConnection();
      const all = await guard.existingSameDayRuns(conn, T, "2026-10-15", [91, 92], []);
      expect(all.get(91)).toEqual(["FP1991", "FP1994"]);
      expect(all.has(92)).toBe(false);
      const retry = await guard.existingSameDayRuns(conn, T, "2026-10-15", [91], [1991]);
      expect(retry.get(91)).toEqual(["FP1994"]);
    });
  });

  describe("품목제조보고 회사 소유 검증 — 다른 회사 번호는 실행 전 거부, 부작용 없음 (2026-10-19, 설계 18 R6)", () => {
    let own: any;
    const O = 99; // 다른 회사
    beforeAll(async () => {
      own = await import("./lib/production/mfReportOwnership");
      await q(`CREATE TABLE IF NOT EXISTS ccp_process_groups (id int NOT NULL AUTO_INCREMENT PRIMARY KEY, tenant_id int NOT NULL, name varchar(100) NOT NULL, ccp_type varchar(20) NULL, status varchar(20) NOT NULL DEFAULT 'active', sort_order int NOT NULL DEFAULT 0)`);
    });
    beforeEach(async () => {
      await q(`DELETE FROM h_mf_ingredients WHERE mf_report_version_id IN (8801, 8802)`);
      await q(`DELETE FROM h_mf_report_versions WHERE id IN (8801, 8802)`);
      await q(`DELETE FROM h_mf_reports WHERE id IN (8801, 8802)`);
      await q(`DELETE FROM item_master WHERE id IN (88101, 88102)`);
      await q(`DELETE FROM ccp_process_groups WHERE id IN (8811, 8812)`);
      await q(`INSERT INTO h_mf_reports (id, tenant_id, product_id, report_no, report_date, status) VALUES (8801, ?, 88101, 'MY', '2026-10-01', 'ACTIVE'), (8802, ?, 88102, 'OTHER', '2026-10-01', 'ACTIVE')`, [T, O]);
      await q(`INSERT INTO h_mf_report_versions (id, tenant_id, mf_report_id, version_no, effective_from, approval_status, batch_target_kg) VALUES (8801, ?, 8801, 1, '2026-10-01', 'APPROVED', 96), (8802, ?, 8802, 1, '2026-10-01', 'APPROVED', 50)`, [T, O]);
      await q(`INSERT INTO h_mf_ingredients (id, mf_report_version_id, line_no, material_id, quantity, unit, is_deductible, material_type) VALUES (88011, 8801, 1, 88101, '100', '%', 1, 'RAW'), (88021, 8802, 1, 88102, '100', '%', 1, 'RAW')`);
      await q(`INSERT INTO item_master (id, tenant_id, item_code, item_name, item_type, is_active) VALUES (88101, ?, 'MY1', '우리 찹쌀', 'raw_material', 1), (88102, ?, 'OT1', '남의 찹쌀', 'raw_material', 1)`, [T, O]);
      await q(`INSERT INTO ccp_process_groups (id, tenant_id, name, ccp_type) VALUES (8811, ?, '교반', 'CCP-1B'), (8812, ?, '남의 교반', 'CCP-1B')`, [T, O]);
    });
    const ok = async (raw: any) => { const { getRawConnection } = await import("./db/connection"); await own.assertMfIdsOwned(await getRawConnection(), T, raw); };

    it("내 회사 번호만이면 통과 (보고서·버전·원료 줄·품목·공정)", async () => {
      await expect(ok({ mfReportId: 8801, ingredients: [{ id: 88011, materialId: 88101, processGroupId: 8811 }] })).resolves.toBeUndefined();
      await expect(ok({ versionId: 8801 })).resolves.toBeUndefined();
      await expect(ok({ id: 8801 })).resolves.toBeUndefined();
    });
    it("다른 회사 보고서·버전·원료 줄·품목·공정이 하나라도 있으면 거부", async () => {
      await expect(ok({ mfReportId: 8802 })).rejects.toThrow(/품목제조보고/);
      await expect(ok({ versionId: 8802 })).rejects.toThrow(/버전/);
      await expect(ok({ ingredientId: 88021 })).rejects.toThrow(/원료 줄/);
      await expect(ok({ mfReportId: 8801, ingredients: [{ materialId: 88102 }] })).rejects.toThrow(/품목/);
      await expect(ok({ mfReportId: 8801, ingredients: [{ processGroupId: 8812 }] })).rejects.toThrow(/공정/);
      await expect(ok({ ids: [8801, 8802] })).rejects.toThrow(/품목제조보고/);
    });
    it("updateMfReport 도 다른 회사 보고서는 버전·원료를 바꾸기 전에 거부 (남의 BOM 그대로)", async () => {
      const { updateMfReport } = await import("./db/production/mfReportAPI");
      await expect(updateMfReport({ mfReportId: 8802, batchTargetKg: 1, ingredients: [{ materialId: 88101, quantity: 1, unit: "%", isDeductible: 1, materialType: "RAW" }] } as any, T)).rejects.toThrow(/이 회사의 품목제조보고가 아닙니다/);
      const v = (await q(`SELECT batch_target_kg + 0 AS b FROM h_mf_report_versions WHERE id = 8802`))[0];
      expect(Number(v.b)).toBe(50);
      expect((await q(`SELECT id FROM h_mf_ingredients WHERE mf_report_version_id = 8802`)).map((r: any) => Number(r.id))).toEqual([88021]);
    });
  });

  describe("생산 설계 확인 완료 흐름 — 생산 버전·수정안·옛 초안 구분, 수동 연결 공정, 저장 뒤 서버 재판정 (2026-10-19, #600 검토 A)", () => {
    let d: any;
    beforeAll(async () => {
      d = await import("./lib/production/designOverview");
      await q(`CREATE TABLE IF NOT EXISTS ccp_process_groups (id int NOT NULL AUTO_INCREMENT PRIMARY KEY, tenant_id int NOT NULL, name varchar(100) NOT NULL, ccp_type varchar(20) NULL, status varchar(20) NOT NULL DEFAULT 'active', sort_order int NOT NULL DEFAULT 0)`);
      await q(`CREATE TABLE IF NOT EXISTS equipments (id int NOT NULL AUTO_INCREMENT PRIMARY KEY, tenant_id int NOT NULL, name varchar(100) NOT NULL, status varchar(20) NOT NULL DEFAULT 'active', default_temperature decimal(6,2) NULL, default_time int NULL, batch_operation_time int NULL)`);
      await q(`CREATE TABLE IF NOT EXISTS ccp_process_group_equipments (id int NOT NULL AUTO_INCREMENT PRIMARY KEY, tenant_id int NOT NULL, process_group_id int NOT NULL, equipment_id int NOT NULL, sort_order int NOT NULL DEFAULT 0)`);
      await q(`CREATE TABLE IF NOT EXISTS ccp_process_group_products (id int NOT NULL AUTO_INCREMENT PRIMARY KEY, tenant_id int NOT NULL, product_id int NOT NULL, process_group_id int NOT NULL)`);
      await q(`CREATE TABLE IF NOT EXISTS ccp_time_profiles (id int NOT NULL AUTO_INCREMENT PRIMARY KEY, tenant_id int NOT NULL, ccp_process_group_id int NOT NULL, is_active tinyint NOT NULL DEFAULT 1, time_minutes int NULL)`);
      // 계획 함수(getProcessGroupsForProduct · getEquipmentsForProcessGroup)가 읽는 칸 — 앞 블록이 만든 최소 표에 없으면 더한다
      const addCols = async (table: string, cols: string[]) => {
        for (const c of cols) {
          try { await q(`ALTER TABLE ${table} ADD COLUMN ${c}`); } catch (e: any) { if (e?.code !== "ER_DUP_FIELDNAME") throw e; }
        }
      };
      await addCols("ccp_process_groups", ["temperature_min decimal(6,2) NULL", "temperature_max decimal(6,2) NULL", "time_min int NULL", "time_max int NULL",
        "pressure_min decimal(6,3) NULL", "pressure_max decimal(6,3) NULL", "equip_group_mode varchar(20) NULL DEFAULT 'sequential'", "equip_interval_min int NULL DEFAULT 10", "equip_batch_size int NULL DEFAULT 1"]);
      await addCols("equipments", ["type varchar(50) NULL", "default_pressure decimal(6,3) NULL", "work_start_time varchar(8) NULL"]);
      await addCols("ccp_time_profiles", ["process_type varchar(50) NULL", "profile_name varchar(255) NULL", "description text NULL"]);
    });
    beforeEach(async () => {
      await q(`DELETE FROM h_mf_ingredients WHERE mf_report_version_id IN (8901, 8902, 8903, 8904)`);
      await q(`DELETE FROM h_mf_report_versions WHERE id IN (8901, 8902, 8903, 8904)`);
      await q(`DELETE FROM h_mf_reports WHERE id IN (8901, 8902)`);
      await q(`DELETE FROM item_master WHERE id IN (89101, 89102, 89111, 89112, 89113)`);
      await q(`DELETE FROM h_products_v2 WHERE id IN (891, 892)`);
      await q(`DELETE FROM ccp_process_groups WHERE id IN (8921, 8922, 8925)`);
      await q(`DELETE FROM equipments WHERE id IN (8931, 8935)`);
      await q(`DELETE FROM ccp_process_group_equipments WHERE process_group_id IN (8921, 8922, 8925)`);
      await q(`DELETE FROM ccp_process_group_products WHERE product_id IN (891, 892)`);
      await q(`DELETE FROM ccp_time_profiles WHERE ccp_process_group_id IN (8921, 8922)`);
      await q(`DELETE FROM equipments WHERE id IN (8932, 8939)`);
      await q(`INSERT INTO h_products_v2 (id, tenant_id, product_code, product_name) VALUES (891, ?, 'P891', '왕찹쌀떡'), (892, ?, 'P892', '카스테라앙금인절미')`, [T, T]);
      await q(`INSERT INTO item_master (id, tenant_id, item_code, item_name, item_type, legacy_product_id, is_active) VALUES
        (89101, ?, 'P891', '왕찹쌀떡', 'own_product', 891, 1), (89102, ?, 'P892', '카스테라앙금인절미', 'own_product', 892, 1),
        (89111, ?, 'R1', '찹쌀', 'raw_material', NULL, 1), (89112, ?, 'R2', '통팥앙금', 'raw_material', NULL, 1), (89113, ?, 'R3', '옥수수전분', 'raw_material', NULL, 1)`, [T, T, T, T, T]);
      // 원료는 정본 연결(legacy_material_id)로 (2026-10-20, 생산계획 생애주기 검토 5)
      await q(`DELETE FROM h_materials WHERE id IN (89211, 89212, 89213)`);
      await q(`INSERT INTO h_materials (id, tenant_id, material_code, material_name) VALUES (89211, ?, 'R1', '찹쌀'), (89212, ?, 'R2', '통팥앙금'), (89213, ?, 'R3', '옥수수전분')`, [T, T, T]);
      await q(`UPDATE item_master SET legacy_material_id = id + 100 WHERE id IN (89111, 89112, 89113)`);
      await q(`INSERT INTO ccp_process_groups (id, tenant_id, name, ccp_type) VALUES (8921, ?, '교반-가열공정', 'CCP-1B'), (8922, ?, '증숙(설기류)공정', 'CCP-1B'), (8925, ?, '금속검출공정', 'CCP-4P')`, [T, T, T]);
      await q(`INSERT INTO equipments (id, tenant_id, name, default_temperature, default_time, batch_operation_time) VALUES (8931, ?, '교반기1호기', 99, 10, 70), (8935, ?, '금속검출기', NULL, NULL, NULL)`, [T, T]);
      await q(`INSERT INTO ccp_process_group_equipments (tenant_id, process_group_id, equipment_id) VALUES (?, 8921, 8931), (?, 8925, 8935)`, [T, T]);
      await q(`INSERT INTO h_mf_reports (id, tenant_id, product_id, report_no, report_date, status) VALUES (8901, ?, 89101, 'W', '2026-10-01', 'ACTIVE'), (8902, ?, 89102, 'C', '2026-10-01', 'ACTIVE')`, [T, T]);
      // 왕찹쌀떡: v1 승인(생산) + v2 초안(수정안) / 카스테라: v1 초안(옛) + v2 승인(생산)
      await q(`INSERT INTO h_mf_report_versions (id, tenant_id, mf_report_id, version_no, effective_from, approval_status, batch_target_kg) VALUES
        (8901, ?, 8901, 1, '2026-10-01', 'APPROVED', 96), (8902, ?, 8901, 2, '2026-10-02', 'DRAFT', 96),
        (8903, ?, 8902, 1, '2026-10-01', 'DRAFT', 50), (8904, ?, 8902, 2, '2026-10-02', 'APPROVED', 50)`, [T, T, T, T]);
      await q(`INSERT INTO h_mf_ingredients (id, mf_report_version_id, line_no, material_id, quantity, unit, is_deductible, material_type, process_group_id) VALUES
        (89011, 8901, 1, 89111, '62.6', '%', 1, 'RAW', 8921), (89012, 8901, 2, 89112, '30', '%', 1, 'RAW', NULL), (89013, 8901, 3, 89113, '7.4', '%', 1, 'RAW', NULL),
        (89021, 8902, 1, 89111, '62.6', '%', 1, 'RAW', 8921), (89022, 8902, 2, 89112, '37.4', '%', 1, 'RAW', NULL),
        (89031, 8903, 1, 89111, '100', '%', 1, 'RAW', 8921), (89041, 8904, 1, 89111, '100', '%', 1, 'RAW', 8921)`);
    });
    const conn = async () => { const { getRawConnection } = await import("./db/connection"); return getRawConnection(); };
    const status = async (reportId: number) => (await d.loadRecipeStatuses(await conn(), T)).find((r: any) => r.reportId === reportId);

    it("생산 버전 = 승인 우선, 수정안은 따로 표시 · 승인 대기는 '수정안' 과 '옛 초안' 을 구분 (자동 처리 없음)", async () => {
      const w = await status(8901);
      expect([w.versionId, w.versionRole, w.newerDraft]).toEqual([8901, "production", { versionId: 8902, versionNo: 2 }]);
      const pending = await d.loadPendingVersions(await conn(), T);
      const kinds = Object.fromEntries((pending as any[]).filter((p) => [8902, 8903].includes(p.versionId)).map((p) => [p.versionId, p.kind]));
      expect(kinds).toEqual({ 8902: "draft", 8903: "superseded" });
      expect(Number((await q(`SELECT approval_status = 'DRAFT' AS d FROM h_mf_report_versions WHERE id = 8903`))[0].d)).toBe(1); // 옛 초안 그대로
    });

    it("정확한 버전으로 열기 — 수정안·옛 초안은 그 버전 그대로, 다른 보고서의 버전 번호는 열리지 않음", async () => {
      const draft = await d.loadRecipeDetail(await conn(), T, 8901, 8902);
      expect([draft.versionId, draft.versionRole, draft.signal]).toEqual([8902, "draft", "yellow"]);
      expect(draft.issues.map((i: any) => i.code)).toContain("draft-version");
      expect((await d.loadRecipeDetail(await conn(), T, 8902, 8903)).versionRole).toBe("old");
      expect(await d.loadRecipeDetail(await conn(), T, 8901, 8903)).toBeNull();
      expect(await d.loadRecipeDetail(await conn(), T + 1, 8901)).toBeNull(); // 다른 회사
    });

    it("들어가는 곳은 배합 저장 한 번으로 (따로 분류 저장 없음) — 정하면 서버 재판정으로 초록, 공정 있는 줄은 비움, 다른 회사 거부", async () => {
      const api = await import("./db/production/mfReportAPI");
      await q(`UPDATE h_mf_report_versions SET approval_status = 'APPROVED' WHERE id = 8902`); // 생산 버전 = 최신 v2 (원료 2줄: 교반 + 미정)
      const row = (id: number, mat: number, qty: number, pg: number | null, stage: "direct" | "late" | null) => ({ id, materialId: mat, quantity: qty, unit: "%", isDeductible: 1, materialType: "RAW", processGroupId: pg, entryStage: stage });
      expect((await status(8901)).issues.map((i: any) => i.code)).toEqual(["unassigned"]);
      await api.updateMfReport({ mfReportId: 8901, ingredients: [row(89021, 89111, 62.6, 8921, "late"), row(89022, 89112, 37.4, null, "direct")] } as any, T);
      expect((await status(8901)).signal).toBe("green");
      expect((await q(`SELECT entry_stage FROM h_mf_ingredients WHERE id IN (89021, 89022) ORDER BY id`)).map((r: any) => r.entry_stage)).toEqual([null, "direct"]);
      // 배합 수정 화면처럼 들어가는 곳을 안 보내면 그대로 유지
      await api.updateMfReport({ mfReportId: 8901, batchTargetKg: 96, ingredients: [{ id: 89021, materialId: 89111, quantity: 62.6, unit: "%", isDeductible: 1, materialType: "RAW" }, { id: 89022, materialId: 89112, quantity: 37.4, unit: "%", isDeductible: 1, materialType: "RAW" }] } as any, T);
      expect((await q(`SELECT entry_stage FROM h_mf_ingredients WHERE id = 89022`))[0].entry_stage).toBe("direct");
      await expect(api.updateMfReport({ mfReportId: 8901, ingredients: [row(89022, 89112, 100, null, null)] } as any, T + 1)).rejects.toThrow(/이 회사/);
    });

    it("BOM 이 정본 — 옛 직접 연결(증숙)은 BOM 이 있으면 계획·판정에 안 쓰임 (데이터는 그대로), 금속검출만 하는 제품도 생산 가능 판정 (송편·멥쌀가루)", async () => {
      const { getProcessGroupsForProduct } = await import("./services/ccp-batch");
      const { validateProductCcpMapping } = await import("./services/validateProductCcpMapping");
      // 송편처럼: 배합에서 가열 공정을 뺀 제품 + 옛 증숙 직접 연결
      await q(`UPDATE h_mf_ingredients SET process_group_id = NULL, entry_stage = 'direct' WHERE id = 89041`);
      await q(`INSERT INTO ccp_process_group_products (tenant_id, product_id, process_group_id) VALUES (?, 892, 8922)`, [T]);
      const groups = await getProcessGroupsForProduct({ productId: 892, tenantId: T });
      expect(groups.map((g: any) => [g.name, g.mapping_source])).toEqual([["금속검출공정", "ALWAYS"]]); // 증숙 되살아나지 않음
      expect(await validateProductCcpMapping({ productId: 892, productName: "송편", tenantId: T })).toMatchObject({ valid: true, bomMappingCount: 0 });
      expect((await status(8902)).signal).toBe("green"); // 현황 판정과 같음
      expect(Number((await q(`SELECT COUNT(*) AS n FROM ccp_process_group_products WHERE product_id = 892`))[0].n)).toBe(1); // 옛 연결은 지우지 않음

      // 가열 공정이 없는데 들어가는 곳을 안 정한 원료가 있으면(가열을 빠뜨렸을 수 있음, 예: 시루떡) 막고, 현황도 빨강 — 같은 판정
      await q(`UPDATE h_mf_ingredients SET entry_stage = NULL WHERE id = 89041`);
      expect(await validateProductCcpMapping({ productId: 892, productName: "시루떡", tenantId: T })).toMatchObject({ valid: false, message: expect.stringMatching(/들어가는 곳을 정하지 않은 원료가 1개/) });
      expect((await status(8902)).issues.map((i: any) => i.code)).toContain("no-heat-unclassified");
      await q(`UPDATE h_mf_ingredients SET entry_stage = 'direct' WHERE id = 89041`);

      // 옛 승인 버전(v1 초안 아님 — 다른 버전)의 공정을 합치지 않는다: 생산 버전 v2 만
      await q(`UPDATE h_mf_ingredients SET process_group_id = 8921 WHERE id = 89031`);
      expect((await validateProductCcpMapping({ productId: 892, productName: "송편", tenantId: T })).bomMappingCount).toBe(0);

      // 금속검출 공정은 있는데 검출기가 연결되지 않았으면 금속검출만 하는 제품도 막는다 (Codex #605 재검토 6), 현황도 빨강
      await q(`DELETE FROM ccp_process_group_equipments WHERE process_group_id = 8925`);
      try {
        expect((await validateProductCcpMapping({ productId: 892, productName: "송편", tenantId: T })).valid).toBe(false);
        expect((await status(8902)).issues.map((i: any) => i.code)).toContain("metal-no-equipment");
      } finally {
        await q(`INSERT INTO ccp_process_group_equipments (tenant_id, process_group_id, equipment_id) VALUES (?, 8925, 8935)`, [T]);
      }

      // 금속검출도 꺼져 있으면 CCP 기록이 하나도 안 생기므로 막는다
      await q(`UPDATE ccp_process_groups SET status = 'inactive' WHERE id = 8925`);
      try {
        const v = await validateProductCcpMapping({ productId: 892, productName: "송편", tenantId: T });
        expect([v.valid, v.message]).toEqual([false, expect.stringMatching(/CCP 기록이 하나도/)]);
      } finally {
        await q(`UPDATE ccp_process_groups SET status = 'active' WHERE id = 8925`);
      }

      // 원료에 가열 공정이 있으면 BOM 공정 + 금속검출
      const wang = await getProcessGroupsForProduct({ productId: 891, tenantId: T });
      expect(wang.map((g: any) => g.name)).toEqual(["교반-가열공정", "금속검출공정"]);
    });

    it("BOM 이 없는 제품은 이전처럼 직접 연결(가열 공정)로 계획·판정", async () => {
      const { getProcessGroupsForProduct } = await import("./services/ccp-batch");
      const { validateProductCcpMapping } = await import("./services/validateProductCcpMapping");
      await q(`DELETE FROM h_products_v2 WHERE id = 893`);
      await q(`INSERT INTO h_products_v2 (id, tenant_id, product_code, product_name) VALUES (893, ?, 'P893', 'BOM 없는 제품')`, [T]);
      try {
        expect((await validateProductCcpMapping({ productId: 893, productName: "BOM 없음", tenantId: T })).valid).toBe(false);
        await q(`INSERT INTO ccp_process_group_products (tenant_id, product_id, process_group_id) VALUES (?, 893, 8921)`, [T]);
        expect((await validateProductCcpMapping({ productId: 893, productName: "BOM 없음", tenantId: T })).valid).toBe(true);
        expect((await getProcessGroupsForProduct({ productId: 893, tenantId: T })).map((g: any) => [g.name, g.mapping_source])).toEqual([["교반-가열공정", "MANUAL"], ["금속검출공정", "ALWAYS"]]);
      } finally {
        await q(`DELETE FROM ccp_process_group_products WHERE product_id = 893`);
        await q(`DELETE FROM h_products_v2 WHERE id = 893`);
      }
    });
    it("우리 공장 공정 저장: 운영 가열시간 하나 (계획이 읽는 시간 설정 1개로) · 비우면 설비 기본값 · 몇 대씩·간격 · 연결 설비는 이 회사만", async () => {
      const { saveProcess } = await import("./lib/production/designFactorySave");
      const { getProcessGroupsForProduct } = await import("./services/ccp-batch");
      const c = await conn();
      const heatOf = async () => (await getProcessGroupsForProduct({ productId: 891, tenantId: T })).find((g: any) => g.id === 8921)?.profile_time_min ?? null;
      const active = async () => Number((await q(`SELECT COUNT(*) AS n FROM ccp_time_profiles WHERE ccp_process_group_id = 8921 AND is_active = 1`))[0].n);
      expect(await heatOf()).toBeNull(); // 처음엔 설비 기본값(10분)을 쓴다
      expect((await saveProcess(c, T, { groupId: 8921, heatMin: 35 })).changes).toEqual({ heat_min: { before: null, after: 35 } });
      expect([await heatOf(), await active()]).toEqual([35, 1]);
      await saveProcess(c, T, { groupId: 8921, heatMin: 40 });
      expect([await heatOf(), await active()]).toEqual([40, 1]);
      // 예전처럼 시간 설정이 여러 개면 계획이 안 쓰던 상태 → 저장하면 하나로 정리
      await q(`INSERT INTO ccp_time_profiles (tenant_id, process_type, profile_name, time_minutes, ccp_process_group_id, is_active) VALUES (?, 'MIX', '두 번째', 20, 8921, 1)`, [T]);
      expect(await heatOf()).toBeNull();
      await saveProcess(c, T, { groupId: 8921, heatMin: 45 });
      expect([await heatOf(), await active()]).toEqual([45, 1]);
      // 비우면 시간 설정을 끄고 설비 기본값으로 (지우지 않음)
      await saveProcess(c, T, { groupId: 8921, heatMin: null });
      expect([await heatOf(), await active()]).toEqual([null, 0]);
      // 몇 대씩·간격 — 바뀐 것만 기록
      const r = await saveProcess(c, T, { groupId: 8921, mode: "grouped", batchSize: 3, intervalMin: 5 });
      expect(Object.keys(r.changes).sort()).toEqual(["equip_batch_size", "equip_group_mode", "equip_interval_min"]);
      expect((await saveProcess(c, T, { groupId: 8921, mode: "grouped", batchSize: 3, intervalMin: 5 })).changes).toEqual({});
      // 연결 설비: 다른 회사 설비는 거부, 이 회사 설비는 순서대로
      await q(`INSERT INTO equipments (id, tenant_id, name, default_time, batch_operation_time) VALUES (8932, ?, '교반기2호기', 10, 70), (8939, ?, '남의 설비', 10, 70)`, [T, T + 1]);
      await expect(saveProcess(c, T, { groupId: 8921, equipmentIds: [8931, 8939] })).rejects.toThrow(/이 회사의 설비가 아닌/);
      expect((await saveProcess(c, T, { groupId: 8921, equipmentIds: [8932, 8931] })).changes.equipment_ids).toEqual({ before: "교반기1호기", after: "교반기2호기, 교반기1호기" });
      expect((await q(`SELECT equipment_id FROM ccp_process_group_equipments WHERE process_group_id = 8921 ORDER BY sort_order`)).map((x: any) => Number(x.equipment_id))).toEqual([8932, 8931]);
      await expect(saveProcess(c, T + 1, { groupId: 8921, heatMin: 10 })).rejects.toThrow(/이 회사의 공정이 아닙니다/);
    });

    it("#605 P1: 공정 저장은 전부 되거나 전부 안 됨 — 잘못된 설비가 섞이면 가열시간도 그대로, 중간 실패는 되돌림", async () => {
      const { saveProcess, withTransaction } = await import("./lib/production/designFactorySave");
      const { getRawConnection } = await import("./db/connection");
      const pool: any = await getRawConnection();
      const heat = async () => (await q(`SELECT time_minutes FROM ccp_time_profiles WHERE ccp_process_group_id = 8921 AND is_active = 1`)).map((r: any) => Number(r.time_minutes));
      await q(`DELETE FROM equipments WHERE id = 8939`);
      await q(`INSERT INTO equipments (id, tenant_id, name) VALUES (8939, ?, '남의 설비')`, [T + 1]);
      await expect(withTransaction(pool, (c) => saveProcess(c, T, { groupId: 8921, heatMin: 50, equipmentIds: [8931, 8939] }))).rejects.toThrow(/이 회사의 설비가 아닌/);
      expect(await heat()).toEqual([]);
      // 쓰기 뒤에 실패해도 되돌림
      await expect(withTransaction(pool, async (c) => { await saveProcess(c, T, { groupId: 8921, heatMin: 50, mode: "grouped", batchSize: 2 }); throw new Error("중간 실패"); })).rejects.toThrow(/중간 실패/);
      expect(await heat()).toEqual([]);
      expect((await q(`SELECT equip_group_mode FROM ccp_process_groups WHERE id = 8921`))[0].equip_group_mode ?? "sequential").not.toBe("grouped");
      expect((await q(`SELECT COUNT(*) AS n FROM ccp_process_group_equipments WHERE process_group_id = 8921`))[0].n).toBe(1);
      await q(`DELETE FROM equipments WHERE id = 8939`);
    });

    it("#605 P1: 배합 저장은 한 트랜잭션 — 원료 저장이 실패하면 1배치 기준량도 그대로", async () => {
      const api = await import("./db/production/mfReportAPI");
      // 오래된 화면(없는 줄 id) → 원료 저장 거부 → 같이 보낸 1배치 기준량 변경도 되돌림
      await expect(api.updateMfReport({ mfReportId: 8902, batchTargetKg: 77, ingredients: [{ id: 999999, materialId: 89111, quantity: 100, unit: "%", isDeductible: 1, materialType: "RAW" }] } as any, T)).rejects.toThrow();
      expect(Number((await q(`SELECT batch_target_kg + 0 AS b FROM h_mf_report_versions WHERE id = 8904`))[0].b)).toBe(50);
      // 정상 저장은 그대로 반영
      await api.updateMfReport({ mfReportId: 8902, batchTargetKg: 60, ingredients: [{ id: 89041, materialId: 89111, quantity: 100, unit: "%", isDeductible: 1, materialType: "RAW" }] } as any, T);
      expect(Number((await q(`SELECT batch_target_kg + 0 AS b FROM h_mf_report_versions WHERE id = 8904`))[0].b)).toBe(60);
    });

    it("#605 재검토 2·5: 배합 저장 충돌 — 편집기를 연 뒤 다른 저장이 있으면(지문 다름) 또는 다른 버전이 최신이면 거부, 아무것도 안 바뀜 · 이력은 같은 트랜잭션", async () => {
      const api = await import("./db/production/mfReportAPI");
      const { snapshotRecipe, recipeEditToken } = await import("./lib/production/designChangeDiff");
      const c = await conn();
      const tokenNow = async () => recipeEditToken((await snapshotRecipe(c, T, 8902))!);
      await q(`CREATE TABLE IF NOT EXISTS audit_logs (id bigint NOT NULL AUTO_INCREMENT PRIMARY KEY, tenant_id int NULL, action varchar(100) NULL, entity_type varchar(50) NULL, entity_id bigint NULL, user_id int NULL, user_email varchar(255) NULL, user_role varchar(50) NULL, changes json NULL, description text NULL, ip_address varchar(64) NULL, user_agent text NULL, created_at timestamp NULL)`);
      const audits = async () => Number((await q(`SELECT COUNT(*) AS n FROM audit_logs WHERE entity_type = 'mf_report' AND entity_id = 8902`))[0].n);
      const a0 = await audits();
      const row = { id: 89041, materialId: 89111, quantity: 100, unit: "%", isDeductible: 1, materialType: "RAW" };
      const t0 = await tokenNow();
      // 앞 사람이 저장 (지문 일치) → 반영 + 이력 1
      await api.updateMfReport({ mfReportId: 8902, versionId: 8904, editToken: t0, batchTargetKg: 55, ingredients: [row], audit: { userId: 4 } } as any, T);
      expect(Number((await q(`SELECT batch_target_kg + 0 AS b FROM h_mf_report_versions WHERE id = 8904`))[0].b)).toBe(55);
      expect(await audits()).toBe(a0 + 1);
      // 뒤 사람이 예전 지문으로 저장 → 거부, 앞 사람 값 보존, 이력 그대로
      await expect(api.updateMfReport({ mfReportId: 8902, versionId: 8904, editToken: t0, batchTargetKg: 99, ingredients: [row], audit: { userId: 5 } } as any, T)).rejects.toMatchObject({ code: "MF_EDIT_CONFLICT" });
      expect(Number((await q(`SELECT batch_target_kg + 0 AS b FROM h_mf_report_versions WHERE id = 8904`))[0].b)).toBe(55);
      expect(await audits()).toBe(a0 + 1);
      // 편집기가 본 버전이 최신이 아니면 거부 (다른 버전을 조용히 고치지 않음)
      await expect(api.updateMfReport({ mfReportId: 8902, versionId: 8903, batchTargetKg: 66 } as any, T)).rejects.toThrow(/최신이 아닙니다/);
      expect(Number((await q(`SELECT batch_target_kg + 0 AS b FROM h_mf_report_versions WHERE id = 8904`))[0].b)).toBe(55);
    });

    it("우리 공장 설비 저장: 한 번 도는 시간·온도·작업 시작 시각 — 바뀐 것만, 다른 회사 거부", async () => {
      const { saveEquipment } = await import("./lib/production/designFactorySave");
      const c = await conn();
      const r = await saveEquipment(c, T, { equipmentId: 8931, cycleMin: 60, tempC: 98, workStartTime: "08:30" });
      expect(Object.keys(r.changes).sort()).toEqual(["batchOperationTime", "defaultTemperature", "workStartTime"]);
      const e = (await q(`SELECT batch_operation_time, default_temperature + 0 AS t, work_start_time FROM equipments WHERE id = 8931`))[0];
      expect([Number(e.batch_operation_time), Number(e.t), String(e.work_start_time).slice(0, 5)]).toEqual([60, 98, "08:30"]);
      expect((await saveEquipment(c, T, { equipmentId: 8931, cycleMin: 60, tempC: 98, workStartTime: "08:30" })).changes).toEqual({});
      await expect(saveEquipment(c, T + 1, { equipmentId: 8931, cycleMin: 1 })).rejects.toThrow(/이 회사의 설비가 아닙니다/);
    });

    it("2b 시험 계산: 배치 생성과 같은 원료 양 · 오늘 생산과 같은 회차, 저장 없음 (배치·투입·CCP 그대로)", async () => {
      const c = await conn();
      const counts = async () => [
        Number((await q(`SELECT COUNT(*) AS n FROM h_batches`))[0].n),
        Number((await q(`SELECT COUNT(*) AS n FROM h_batch_inputs`))[0].n),
        Number((await q(`SELECT COUNT(*) AS n FROM audit_logs`).catch(() => [{ n: 0 }]))[0].n),
      ];
      const before = await counts();
      const t = await d.trialCalc(c, T, 8901, 192, "08:00");
      expect(t.ok).toBe(true);
      expect([t.versionId, t.roundsCount, t.subBatchKg, t.massBasis]).toEqual([8901, 2, 96, "legacy"]);
      expect(t.ingredients.map((i: any) => [i.name, i.deductQty, i.entryLabel])).toEqual([
        ["찹쌀", 120.192, "교반-가열공정"], ["통팥앙금", 57.6, "아직 모름"], ["옥수수전분", 14.208, "아직 모름"],
      ]);
      const mix = t.processes.find((p: any) => p.name === "교반-가열공정");
      expect(mix.rounds.map((r: any) => [r.roundNo, r.equipmentName, r.plannedStart, r.inputKg])).toEqual([[1, "교반기1호기", "08:00", 60.1], [2, "교반기1호기", "09:10", 60.1]]); // CCP 기록 투입량은 계획 함수 정밀도(소수 2자리) 그대로
      expect(t.common).toEqual(["금속검출공정"]);
      expect(await counts()).toEqual(before); // 저장 없음

      // 같은 제품·같은 양으로 실제 생성하면 투입 계획이 시험 계산과 같다
      const { createBatch } = await import("./db/production/batchCRUD");
      const bid = await createBatch({ siteId: 1, productId: 891, batchCode: "TRIAL-PARITY", plannedQuantity: "192", plannedDate: new Date("2026-10-20T00:00:00+09:00"), createdBy: 4, tenantId: T });
      const real = (await q(`SELECT planned_quantity + 0 AS pq FROM h_batch_inputs WHERE batch_id = ? ORDER BY id`, [bid])).map((r: any) => Number(r.pq));
      expect(real).toEqual(t.ingredients.map((i: any) => i.deductQty));
      await q(`DELETE FROM h_batch_inputs WHERE batch_id = ?`, [bid]);
      await q(`DELETE FROM h_batches WHERE id = ?`, [bid]);
    });

    it("2b 시험 계산: 원물·공정 환산 — 재고 차감 = 원물 kg(3.2), 공정 투입 = 전처리 후(4), 실제 생성 투입과 같음", async () => {
      await q(`DELETE FROM tenant_feature_settings WHERE tenant_id = ? AND feature_code = 'PRODUCTION_MASS_BASIS'`, [T]);
      await q(`INSERT INTO tenant_feature_settings (tenant_id, feature_code, enabled) VALUES (?, 'PRODUCTION_MASS_BASIS', 1)`, [T]);
      await q(`UPDATE h_mf_report_versions SET batch_target_kg = 5, reference_finished_kg = 12.5, mass_basis_enabled = 1 WHERE id = 8904`);
      await q(`UPDATE h_mf_ingredients SET basis_raw_kg = 8, pretreatment_factor = 1.25 WHERE id = 89041`);
      try {
        const t = await d.trialCalc(await conn(), T, 8902, 5, "08:00");
        expect([t.ok, t.massBasis, t.versionId]).toEqual([true, "basis", 8904]);
        expect(t.ingredients.map((i: any) => [i.deductQty, i.processKg])).toEqual([[3.2, 4]]);
        expect(t.processes.find((p: any) => p.name === "교반-가열공정").rounds.map((r: any) => r.inputKg)).toEqual([4]);
        const { createBatch } = await import("./db/production/batchCRUD");
        const bid = await createBatch({ siteId: 1, productId: 892, batchCode: "TRIAL-MB", plannedQuantity: "5", plannedDate: new Date("2026-10-20T00:00:00+09:00"), createdBy: 4, tenantId: T });
        expect((await q(`SELECT planned_quantity + 0 AS pq FROM h_batch_inputs WHERE batch_id = ?`, [bid])).map((r: any) => Number(r.pq))).toEqual([3.2]);
        await q(`DELETE FROM h_batch_inputs WHERE batch_id = ?`, [bid]);
        await q(`DELETE FROM h_batch_mass_basis WHERE batch_id = ?`, [bid]);
        await q(`DELETE FROM h_batches WHERE id = ?`, [bid]);
      } finally {
        await q(`DELETE FROM tenant_feature_settings WHERE tenant_id = ? AND feature_code = 'PRODUCTION_MASS_BASIS'`, [T]);
      }
    });

    it("2b 시험 계산: 생산 품목 연결이 없으면 계산하지 않고 이유를 알려 줌, 다른 회사 보고서는 없음", async () => {
      const c = await conn();
      await q(`UPDATE item_master SET legacy_product_id = NULL WHERE id = 89102`);
      expect(await d.trialCalc(c, T, 8902, 50, null)).toMatchObject({ ok: false, reason: expect.stringMatching(/생산 품목과 연결/) });
      expect(await d.trialCalc(c, T + 1, 8901, 50, null)).toBeNull();
    });
  });

  describe("현장 1 — 미래 날짜 생산 건은 '예정' 으로만, 그날 첫 확인에서 실행 단계 한 번 (2026-10-19, CEO 정책)", () => {
    const today = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    const tomorrow = () => new Date(Date.now() + 9 * 3600_000 + 86400_000).toISOString().slice(0, 10);
    beforeAll(async () => {
      await q(`CREATE TABLE IF NOT EXISTS h_ccp_instances (id bigint NOT NULL AUTO_INCREMENT PRIMARY KEY, tenant_id int NOT NULL, batch_id bigint NULL, process_group_id int NULL, ccp_type varchar(20) NULL)`);
    });
    beforeEach(async () => {
      await q(`DELETE FROM h_batches WHERE id IN (9301, 9302)`);
      await q(`INSERT INTO h_batches (id, tenant_id, site_id, batch_code, product_id, planned_quantity, planned_date, status, mode, plan_only, created_by) VALUES
        (9301, ?, 1, 'PLAN-1', 891, 96, ?, 'planned', 'manual', 1, 4), (9302, ?, 1, 'PLAN-2', 891, 96, ?, 'planned', 'auto', 1, 4)`, [T, tomorrow(), T, tomorrow()]);
    });
    afterAll(async () => { await q(`DELETE FROM h_batches WHERE id IN (9301, 9302)`); });
    const row = async (id: number) => (await q(`SELECT plan_only, status FROM h_batches WHERE id = ?`, [id]))[0];
    /** 시험 DB 는 최소 표 — 기록지 생성·행 조회·현장 화면·결재 화면이 읽는 운영 칸을 보충 */
    const ensureFormTables = async () => {
        // 시험 DB 는 최소 표 — 운영 표에 있는 칸 중 이 경로(기록지 생성·행 조회)가 읽는 칸을 보충
        const ensureCols = async (table: string, cols: Array<[string, string]>) => {
          for (const [c, ddl] of cols) {
            const [x]: any = await admin.query(`SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`, [table, c]);
            if (!x.length) await admin.query(`ALTER TABLE ${table} ADD COLUMN ${c} ${ddl}`);
          }
        };
        await ensureCols("h_ccp_form_records", [["site_id", "bigint NULL"], ["product_id", "bigint NULL"], ["equip_group_mode", "varchar(20) NULL DEFAULT 'sequential'"], ["equip_interval_min", "int NULL DEFAULT 10"],
          ["cl_heat_time_min_lo", "int NULL"], ["cl_heat_time_min_hi", "int NULL"], ["cl_heat_temp_lo", "decimal(5,1) NULL"], ["cl_pressure_mpa_lo", "decimal(5,3) NULL"], ["cl_product_temp_lo", "decimal(5,1) NULL"],
          ["cl_metal_sensitivity", "int NULL"], ["cl_fe_mm", "decimal(4,1) NULL"], ["cl_sus_mm", "decimal(4,1) NULL"], ["writer_id", "bigint NULL"], ["approver_id", "bigint NULL"],
          ["submitted_at", "timestamp NULL"], ["approved_at", "timestamp NULL"], ["rejected_reason", "text NULL"], ["created_at", "timestamp NULL DEFAULT CURRENT_TIMESTAMP"], ["updated_at", "timestamp NULL DEFAULT CURRENT_TIMESTAMP"]]);
        await ensureCols("h_ccp_form_rows", [["equipment_id", "int NULL"], ["equipment_name", "varchar(100) NULL"], ["measurement_time", "varchar(10) NULL"], ["input_qty_kg", "decimal(10,2) NULL"], ["result", "varchar(10) NULL"],
          ["heat_time_min", "int NULL"], ["heat_temp_c", "decimal(5,1) NULL"], ["siru_name", "varchar(50) NULL"], ["pressure_mpa", "decimal(5,3) NULL"], ["temp_edge_c", "decimal(5,1) NULL"], ["temp_center_c", "decimal(5,1) NULL"],
          ["metal_pass_time", "varchar(10) NULL"], ["metal_fe_mid", "varchar(10) NULL"], ["metal_sus_mid", "varchar(10) NULL"], ["metal_product_only", "varchar(10) NULL"], ["metal_fe_product", "varchar(10) NULL"], ["metal_sus_product", "varchar(10) NULL"],
          ["pass_time_start", "varchar(10) NULL"], ["pass_time_end", "varchar(10) NULL"], ["detected_qty", "int NULL"], ["special_note", "text NULL"], ["deviation_note", "text NULL"], ["note", "text NULL"],
          ["created_at", "timestamp NULL DEFAULT CURRENT_TIMESTAMP"], ["updated_at", "timestamp NULL DEFAULT CURRENT_TIMESTAMP"]]);
        await ensureCols("equipments", [["ccp_type", "varchar(50) NULL"], ["fe_sensitivity", "decimal(5,2) NULL"], ["sts_sensitivity", "decimal(5,2) NULL"]]);
        await q(`CREATE TABLE IF NOT EXISTS users (id int NOT NULL PRIMARY KEY, name varchar(100) NULL, tenant_id int NULL)`); // 현장 화면이 확인한 사람 이름을 붙인다
        await ensureCols("h_approval_requests", [["approved_at", "timestamp NULL"], ["approved_by", "bigint NULL"], ["created_at", "timestamp NULL"], ["description", "text NULL"], ["priority", "varchar(10) NULL"],
          ["rejected_at", "timestamp NULL"], ["rejected_by", "bigint NULL"], ["rejection_reason", "text NULL"], ["requested_at", "timestamp NULL"], ["requested_by", "bigint NULL"],
          ["review_comments", "text NULL"], ["reviewed_at", "timestamp NULL"], ["reviewed_by", "bigint NULL"], ["site_id", "bigint NULL"]]);
    };

    it("예정일 전에는 실행하지 않고 막는다 — 상태·예정 표시 그대로", async () => {
      const { ensureBatchActivated } = await import("./services/batchOrchestrator");
      await expect(ensureBatchActivated(9301, T, 4)).rejects.toThrow(/예정 생산 건입니다 — .* 에 확인하면/);
      expect(await row(9301)).toMatchObject({ plan_only: 1, status: "planned" });
      await expect(ensureBatchActivated(9301, T + 1, 4)).resolves.toEqual({ activated: false }); // 다른 회사는 대상 아님
    });

    it("그날이 되면 첫 확인에서 한 번만 실행 — 동시에 여러 번 눌러도 한 번, 이미 실행된 건은 그대로", async () => {
      const { ensureBatchActivated } = await import("./services/batchOrchestrator");
      await q(`UPDATE h_batches SET planned_date = ? WHERE id = 9301`, [today()]);
      const rs = await Promise.all([ensureBatchActivated(9301, T, 4), ensureBatchActivated(9301, T, 4), ensureBatchActivated(9301, T, 4)]);
      expect(rs.filter((r) => r.activated).length).toBe(1);
      expect(Number((await row(9301)).plan_only)).toBe(0);
      expect(await ensureBatchActivated(9301, T, 4)).toEqual({ activated: false });
    });

    it("자동 모드: 그날 첫 확인에서 원료 출고 한 번 (만들 때는 출고 없음), 다시 눌러도 다시 차감하지 않음", async () => {
      const { ensureBatchActivated } = await import("./services/batchOrchestrator");
      await q(`DELETE FROM h_ccp_instances WHERE batch_id = 9302`);
      await q(`INSERT INTO h_ccp_instances (tenant_id, batch_id, process_group_id, ccp_type) VALUES (?, 9302, 8921, 'CCP-1B')`, [T]);
      await q(`DELETE FROM h_batch_inputs WHERE batch_id = 9302`);
      // 투입 줄 번호는 이 회사 재고 원료여야 출고된다 (번호 체계 2c — 없는 번호로는 원장을 남기지 않음)
      await q(`DELETE FROM h_materials WHERE id = 999999`);
      await q(`INSERT INTO h_materials (id, tenant_id, material_code, material_name, unit, is_active) VALUES (999999, ?, 'QA-999999', '시험 원료', 'kg', 1)`, [T]);
      await q(`INSERT INTO h_batch_inputs (batch_id, tenant_id, material_id, planned_quantity, unit) VALUES (9302, ?, 999999, 5, 'kg')`, [T]);
      const usage = async () => Number((await q(`SELECT COUNT(*) AS n FROM h_inventory_transactions WHERE source_id = 9302 AND transaction_type = 'usage'`))[0].n);
      try {
        await expect(ensureBatchActivated(9302, T, 4)).rejects.toThrow(/예정 생산 건/); // 예정일 전
        expect(await usage()).toBe(0);
        await q(`UPDATE h_batches SET planned_date = ? WHERE id = 9302`, [today()]);
        expect(await ensureBatchActivated(9302, T, 4)).toEqual({ activated: true });
        expect(await usage()).toBe(1);
        expect(await row(9302)).toMatchObject({ plan_only: 0, status: "in_progress" });
        expect(await ensureBatchActivated(9302, T, 4)).toEqual({ activated: false });
        expect(await usage()).toBe(1);
      } finally {
        await q(`DELETE FROM h_inventory_transactions WHERE source_id = 9302 AND transaction_type = 'usage'`);
        await q(`DELETE FROM h_batch_inputs WHERE batch_id = 9302`);
        await q(`DELETE FROM h_ccp_instances WHERE batch_id = 9302`);
        await q(`DELETE FROM h_materials WHERE id = 999999`);
      }
    });

    it("당일 금속검출 기록지 승인 뒤 추가 생산: 승인본 그대로 · 그날 추가 기록지에 통과 행 · 준비 완료 · 첫 확인에서 한 번 출고 (2026-10-20 #626 운영 시험)", async () => {
      const { ensureBatchActivated, verifyBatchSetup } = await import("./services/batchOrchestrator");
      const fr = await import("./db/haccp/ccpFormRecords");
      const D = today(), A = 9311, B = 9312, MAT = 999998;
      await ensureFormTables();
      const cleanup = async () => {
        await q(`DELETE r FROM h_ccp_form_rows r JOIN h_ccp_form_records f ON f.id = r.form_record_id WHERE f.tenant_id = ? AND f.ccp_type = 'CCP-4P' AND f.work_date = ?`, [T, D]);
        await q(`DELETE FROM h_ccp_form_records WHERE tenant_id = ? AND ccp_type = 'CCP-4P' AND work_date = ?`, [T, D]);
        await q(`DELETE FROM h_inventory_transactions WHERE source_id = ? AND transaction_type = 'usage'`, [B]);
        await q(`DELETE FROM h_batch_inputs WHERE batch_id IN (?, ?)`, [A, B]);
        await q(`DELETE FROM h_ccp_instances WHERE batch_id IN (?, ?)`, [A, B]);
        await q(`DELETE FROM h_batches WHERE id IN (?, ?)`, [A, B]);
        await q(`DELETE FROM h_inventory_lots WHERE material_id = ?`, [MAT]);
        await q(`DELETE FROM h_materials WHERE id = ?`, [MAT]);
      };
      await cleanup();
      try {
        // 그날 이미 끝난 생산 건 A + 승인된 금속검출 기록지 F1 (통과 행 1)
        await q(`INSERT INTO h_batches (id, tenant_id, site_id, batch_code, product_id, planned_quantity, planned_date, status, mode, plan_only, created_by) VALUES
          (?, ?, 1, 'MDONE-1', 891, 20, ?, 'completed', 'auto', 0, 4),
          (?, ?, 1, 'MADD-1', 892, 1, ?, 'planned', 'auto', 1, 4)`, [A, T, D, B, T, D]);
        await q(`UPDATE h_batches SET setup_pending = 1 WHERE id = ?`, [B]);
        const [f1]: any = await admin.query(`INSERT INTO h_ccp_form_records (tenant_id, batch_id, ccp_type, work_date, status, field_mode, product_name, planned_qty_kg, batch_count)
          VALUES (?, ?, 'CCP-4P', ?, 'approved', 1, '금속검출 통합', 20, 1)`, [T, A, D]);
        const F1 = Number(f1.insertId);
        await q(`INSERT INTO h_ccp_form_rows (tenant_id, form_record_id, batch_seq, equipment_type, product_name, batch_id, pass_qty, pass_unit, row_version) VALUES (?, ?, 1, 'passage', '끝난 떡', ?, 20, 'kg', 0)`, [T, F1, A]);
        const snap = async () => JSON.stringify([await q(`SELECT * FROM h_ccp_form_records WHERE id = ?`, [F1]), await q(`SELECT * FROM h_ccp_form_rows WHERE form_record_id = ? ORDER BY id`, [F1])]);
        const before = await snap();
        // 새 생산 건 B: 금속검출 공정 + 원료 한 줄 (재고 원료 · LOT 5kg)
        await q(`INSERT INTO h_ccp_instances (tenant_id, batch_id, process_group_id, ccp_type) VALUES (?, ?, 8921, 'CCP-4P')`, [T, B]);
        await q(`INSERT INTO h_materials (id, tenant_id, material_code, material_name, unit, is_active) VALUES (?, ?, 'QA-MADD', '시험용 찹쌀', 'kg', 1)`, [MAT, T]);
        await q(`INSERT INTO h_inventory_lots (tenant_id, material_id, lot_number, quantity, current_quantity, available_quantity, unit, receipt_date, status) VALUES (?, ?, 'MADD-LOT', 5, 5, 5, 'kg', ?, 'available')`, [T, MAT, D]);
        await q(`INSERT INTO h_batch_inputs (tenant_id, batch_id, material_id, planned_quantity, unit) VALUES (?, ?, ?, 1, 'kg')`, [T, B, MAT]);
        // 준비 (생산 건 만들기·이어서 준비가 쓰는 같은 함수 — completeBatchSetup 의 금속검출 부분)
        const prepare = async () => {
          await fr.getOrCreateCcpFormRecord({ tenantId: T, siteId: 1, batchId: B, ccpType: "CCP-4P", workDate: D, productId: 892, productName: "추가 떡", plannedQtyKg: 1, writerId: 4 } as any);
          await fr.syncCcpRowsToFormRows({ batchId: B, tenantId: T });
          return verifyBatchSetup(B, T);
        };
        expect(await prepare()).toEqual([]); // 이전: ['금속검출 통과 행이 없습니다']
        const forms = await q(`SELECT id, status FROM h_ccp_form_records WHERE tenant_id = ? AND ccp_type = 'CCP-4P' AND work_date = ? ORDER BY id`, [T, D]);
        expect(forms.length).toBe(2);
        const F2 = Number(forms[1].id);
        expect(String(forms[1].status)).not.toBe("approved");
        const passOf = async (f: number) => (await q(`SELECT batch_id FROM h_ccp_form_rows WHERE form_record_id = ? AND equipment_type = 'passage' ORDER BY id`, [f])).map((r: any) => Number(r.batch_id));
        const pass2 = await passOf(F2);
        expect(pass2).toContain(B);
        expect(pass2).not.toContain(A); // 끝난 생산 건 A 는 승인본에만 (그날 다른 시험 생산 건은 추가 기록지에 함께 — 정상)
        expect(new Set(pass2).size).toBe(pass2.length);
        expect(await snap()).toBe(before); // 승인본 머리글·행 그대로
        // 같은 요청 재시도 — 기록지·행 늘지 않음
        expect(await prepare()).toEqual([]);
        expect((await q(`SELECT COUNT(*) AS n FROM h_ccp_form_records WHERE tenant_id = ? AND ccp_type = 'CCP-4P' AND work_date = ?`, [T, D]))[0].n).toBe(2);
        expect(await passOf(F2)).toEqual(pass2);
        expect(await snap()).toBe(before);
        // 현장 화면·결재 화면이 같은 기록지를 본다
        const { listFieldWork } = await import("./services/fieldWork");
        expect((await listFieldWork(T, D, null)).metal?.formRecordId).toBe(F2);
        const { getBatchApprovalOverview } = await import("./db/production/batchApprovalOverview");
        expect((await getBatchApprovalOverview(B, T)).forms.filter((f: any) => f.ccpType === "CCP-4P").map((f: any) => f.id)).toEqual([F2]);
        expect((await getBatchApprovalOverview(A, T)).forms.filter((f: any) => f.ccpType === "CCP-4P").map((f: any) => f.id)).toEqual([F1]);
        // 준비 미완 동안 재고·출고 없음 → 준비 완료 표시 (createSingleBatch 와 같은 조건부 갱신) → 첫 확인에서 한 번 출고
        const usage = async () => Number((await q(`SELECT COUNT(*) AS n FROM h_inventory_transactions WHERE source_id = ? AND transaction_type = 'usage'`, [B]))[0].n);
        expect(await usage()).toBe(0);
        await expect(ensureBatchActivated(B, T, 4)).rejects.toThrow(); // 준비 미완(setup_pending) 은 첫 확인을 막는다
        expect(await usage()).toBe(0);
        await q(`UPDATE h_batches SET setup_pending = 0 WHERE id = ? AND tenant_id = ? AND setup_pending = 1`, [B, T]);
        expect(await ensureBatchActivated(B, T, 4)).toEqual({ activated: true });
        expect(await usage()).toBe(1);
        expect(await ensureBatchActivated(B, T, 4)).toEqual({ activated: false });
        expect(await usage()).toBe(1);
        expect(await snap()).toBe(before);
      } finally {
        await cleanup();
      }
    });

    it("어제 '예정'으로 만든 생산 건을 오늘 같은 요청으로 준비 재시도: 준비만 이어서 완료 — 예정 그대로, 금속검출 기록지 제출·결재 요청·일지·출고 없음 (2026-10-21 #627 운영 시험)", async () => {
      await ensureFormTables();
      const yesterday = new Date(Date.now() + 9 * 3600_000 - 86400_000).toISOString().slice(0, 10);
      const B = 9321, MAT = 999997, KEY = "qa-plan-retry-key-1";
      const reqKeys = await import("./lib/production/batchCreateRequests");
      await q(reqKeys.BATCH_CREATE_REQUESTS_DDL);
      const cleanup = async () => {
        await q(`DELETE r FROM h_ccp_form_rows r JOIN h_ccp_form_records f ON f.id = r.form_record_id WHERE f.tenant_id = ? AND f.ccp_type = 'CCP-4P' AND f.work_date = ?`, [T, yesterday]);
        await q(`DELETE FROM h_approval_requests WHERE tenant_id = ? AND reference_type = 'ccp_form_record' AND reference_id IN (SELECT id FROM (SELECT id FROM h_ccp_form_records WHERE tenant_id = ? AND work_date = ?) x)`, [T, T, yesterday]);
        await q(`DELETE FROM h_ccp_form_records WHERE tenant_id = ? AND ccp_type = 'CCP-4P' AND work_date = ?`, [T, yesterday]);
        await q(`DELETE FROM h_inventory_transactions WHERE source_id = ? AND transaction_type = 'usage'`, [B]);
        await q(`DELETE FROM h_batch_inputs WHERE batch_id = ?`, [B]);
        await q(`DELETE FROM h_ccp_instances WHERE batch_id = ?`, [B]);
        await q(`DELETE FROM h_batches WHERE id = ?`, [B]);
        await q(`DELETE FROM h_batch_create_requests WHERE tenant_id = ? AND request_key = ?`, [T, KEY]);
        await q(`DELETE FROM h_inventory_lots WHERE material_id = ?`, [MAT]);
        await q(`DELETE FROM h_materials WHERE id = ?`, [MAT]);
      };
      await cleanup();
      try {
        const item = { productId: 892, plannedQuantityKg: 1, rowKey: "row-1" };
        const fp = reqKeys.rowFingerprint({ workDate: yesterday, siteId: 1, productId: 892, plannedQuantityKg: 1, batchCount: undefined, mode: "auto", startTime: "09:00",
          startTimeOverride: undefined, separateRun: undefined, skuOutputs: [], excluded: [] });
        // 어제 만든 요청 줄(준비 미완으로 실패) + 그 줄로 만든 '예정' 생산 건 (실행 단계 없음: plan_only 1 · activation_pending 0)
        const [rq]: any = await admin.query(`INSERT INTO h_batch_create_requests (tenant_id, request_key, row_key, day_batch_group, status, row_fingerprint) VALUES (?, ?, 'row-1', 'DAY-QA-001', 'failed', ?)`, [T, KEY, fp]);
        await q(`INSERT INTO h_batches (id, tenant_id, site_id, batch_code, product_id, planned_quantity, planned_date, status, mode, plan_only, activation_pending, setup_pending, create_request_id, created_by)
          VALUES (?, ?, 1, 'QA-PLANRETRY-1', 892, 1, ?, 'planned', 'auto', 1, 0, 1, ?, 4)`, [B, T, yesterday, Number(rq.insertId)]);
        await q(`INSERT INTO h_ccp_instances (tenant_id, batch_id, process_group_id, ccp_type) VALUES (?, ?, 8921, 'CCP-4P')`, [T, B]);
        const [f]: any = await admin.query(`INSERT INTO h_ccp_form_records (tenant_id, batch_id, ccp_type, work_date, status, field_mode, product_name) VALUES (?, ?, 'CCP-4P', ?, 'draft', 1, '금속검출 통합')`, [T, B, yesterday]);
        const F = Number(f.insertId);
        await q(`INSERT INTO h_ccp_form_rows (tenant_id, form_record_id, batch_seq, equipment_type, product_name, batch_id, pass_qty, pass_unit, row_version) VALUES (?, ?, 1, 'passage', '예정 떡', ?, 1, 'kg', 0)`, [T, F, B]);
        await q(`INSERT INTO h_materials (id, tenant_id, material_code, material_name, unit, is_active) VALUES (?, ?, 'QA-PR', '시험 원료', 'kg', 1)`, [MAT, T]);
        await q(`INSERT INTO h_inventory_lots (tenant_id, material_id, lot_number, quantity, current_quantity, available_quantity, unit, receipt_date, status) VALUES (?, ?, 'PR-LOT', 5, 5, 5, 'kg', ?, 'available')`, [T, MAT, yesterday]);
        await q(`INSERT INTO h_batch_inputs (tenant_id, batch_id, material_id, planned_quantity, unit) VALUES (?, ?, ?, 1, 'kg')`, [T, B, MAT]);
        const approvals = async () => Number((await q(`SELECT COUNT(*) AS n FROM h_approval_requests WHERE tenant_id = ? AND reference_type = 'ccp_form_record' AND reference_id = ?`, [T, F]))[0].n);
        expect(await approvals()).toBe(0);
        // 오늘(다음 날) 같은 요청 키·같은 내용으로 다시 보냄
        const { batchCrudRouter } = await import("./routers/production/batch.crud.router");
        const b = (batchCrudRouter as any).createCaller({ user: { id: 4, role: "admin", tenantId: T, email: "t@t" }, tenantId: T } as any);
        const r: any = await b.bulkCreateForDay({ requestKey: KEY, siteId: 1, workDate: yesterday, items: [item] });
        expect(r.batches[0]).toMatchObject({ batchId: B, status: "reused", executedNow: false }); // 새 생산 건 없음
        expect(Number((await q(`SELECT COUNT(*) AS n FROM h_batches WHERE create_request_id = ?`, [Number(rq.insertId)]))[0].n)).toBe(1);
        const st = (await q(`SELECT plan_only, activation_pending, setup_pending, status FROM h_batches WHERE id = ?`, [B]))[0];
        expect([Number(st.plan_only), Number(st.activation_pending), Number(st.setup_pending), String(st.status)]).toEqual([1, 0, 0, "planned"]); // 준비만 완료, 예정 그대로
        // 이전: 그룹 후속 단계가 금속검출 기록지를 'submitted' 로 바꾸고 검토 대기 결재를 만들었다
        expect(String((await q(`SELECT status FROM h_ccp_form_records WHERE id = ?`, [F]))[0].status)).toBe("draft");
        expect(await approvals()).toBe(0);
        expect(Number((await q(`SELECT COUNT(*) AS n FROM h_inventory_transactions WHERE source_id = ? AND transaction_type = 'usage'`, [B]))[0].n)).toBe(0);
        expect(Number((await q(`SELECT inventory_deducted AS d FROM h_batch_inputs WHERE batch_id = ?`, [B]))[0].d)).toBe(0);
      } finally {
        await cleanup();
      }
    });

    it("자동 모드: 출고할 줄이 없으면(또는 다 출고되면) 실행", async () => {
      const { ensureBatchActivated } = await import("./services/batchOrchestrator");
      await q(`UPDATE h_batches SET planned_date = ? WHERE id = 9302`, [today()]);
      await q(`DELETE FROM h_ccp_instances WHERE batch_id = 9302`).catch(() => undefined);
      expect(await ensureBatchActivated(9302, T, 4)).toEqual({ activated: true });
      expect(Number((await row(9302)).plan_only)).toBe(0);
    });
  });
  describe("이력 보존형 복구 — 중복 생산 건 무효·역거래·대체 (2026-10-19)", () => {
    const D = "2026-09-01";
    const conn = async () => (await import("./db/connection")).getRawConnection();
    const ids = { keep: 9501, dup: 9502, lot: 9601, mat: 9701, txKeep: 96001, txDup: 96002, apKeep: 9801, apDup: 9802 };
    const input = { tenantId: T, businessDate: D, keepBatchIds: [ids.keep], voids: [{ batchId: ids.dup, supersededBy: ids.keep }], holdInputIds: [95012], reason: "시험 — 같은 제품 중복 생성" };
    const clean = async () => {
      await q(`DELETE FROM h_inventory_transactions WHERE tenant_id = ? AND (id IN (?, ?) OR reversal_of_id IS NOT NULL)`, [T, ids.txKeep, ids.txDup]);
      await q(`DELETE FROM h_batch_inputs WHERE batch_id IN (?, ?)`, [ids.keep, ids.dup]);
      await q(`DELETE FROM h_batches WHERE id IN (?, ?)`, [ids.keep, ids.dup]);
      await q(`DELETE FROM h_inventory_lots WHERE id = ?`, [ids.lot]);
      await q(`DELETE FROM h_inventory WHERE tenant_id = ? AND material_id = ?`, [T, ids.mat]);
      await q(`DELETE FROM material_ledger_daily WHERE tenant_id = ? AND material_id = ?`, [T, ids.mat]);
      for (const t of ["h_approval_requests", "h_approval_history", "h_batch_schedules", "h_batch_recoveries", "h_recovery_archive"]) await q(`DELETE FROM ${t} WHERE tenant_id = ?`, [T]);
      await q(`DELETE FROM audit_logs WHERE action IN ('batch.void', 'batch.recovery')`);
    };
    beforeAll(async () => {
      await q(`CREATE TABLE IF NOT EXISTS h_ccp_rows (id bigint NOT NULL AUTO_INCREMENT PRIMARY KEY, tenant_id int NOT NULL, instance_id bigint NOT NULL, equipment_id int NULL, equipment_name varchar(100) NULL, batch_no int NULL, sort_order int NULL,
        row_type varchar(20) NULL, measured_at datetime NULL, temp_c decimal(6,1) NULL, duration_min int NULL, heating_min int NULL, cycle_total_min int NULL, pressure_bar decimal(6,2) NULL, result varchar(10) NULL, note text NULL,
        auto_generated tinyint NULL DEFAULT 1, planned_start varchar(5) NULL, planned_end varchar(5) NULL, planned_input_kg decimal(10,2) NULL)`);
      await q(`CREATE TABLE IF NOT EXISTS h_ccp_form_rows (id bigint NOT NULL AUTO_INCREMENT PRIMARY KEY, tenant_id int NOT NULL, form_record_id bigint NOT NULL, batch_seq int NULL, equipment_type varchar(30) NULL, product_name varchar(200) NULL,
        pass_qty int NULL, pass_unit varchar(20) NULL, confirmed_by int NULL, action_by int NULL, is_deviation tinyint NULL DEFAULT 0, corrective_action text NULL)`);
      await q(`CREATE TABLE IF NOT EXISTS h_approval_requests (id bigint NOT NULL AUTO_INCREMENT PRIMARY KEY, tenant_id int NOT NULL, request_type varchar(50) NULL, reference_type varchar(50) NULL, reference_id bigint NULL, title varchar(200) NULL, status varchar(30) NULL, notes text NULL)`);
      await q(`CREATE TABLE IF NOT EXISTS h_approval_history (id bigint NOT NULL AUTO_INCREMENT PRIMARY KEY, tenant_id int NOT NULL, request_id bigint NOT NULL, step_id bigint NULL, action varchar(20) NOT NULL, action_by bigint NOT NULL, action_at timestamp NULL, comments text NULL)`);
      await q(`CREATE TABLE IF NOT EXISTS h_batch_schedules (id bigint NOT NULL AUTO_INCREMENT PRIMARY KEY, tenant_id int NOT NULL, batch_id bigint NOT NULL, scheduled_date timestamp NULL, status varchar(50) NULL, notes text NULL)`);
      await q(`CREATE TABLE IF NOT EXISTS h_production_log (id bigint NOT NULL AUTO_INCREMENT PRIMARY KEY, mf_report_version_id bigint NOT NULL, production_date date NOT NULL, batch_size_kg decimal(10,2) NULL, produced_quantity int NULL, notes text NULL)`);
      await q(`CREATE TABLE IF NOT EXISTS h_inventory_deduction_log (id bigint NOT NULL AUTO_INCREMENT PRIMARY KEY, production_log_id bigint NOT NULL, material_id bigint NULL)`);
      await q(`CREATE TABLE IF NOT EXISTS audit_logs (id bigint NOT NULL AUTO_INCREMENT PRIMARY KEY, tenant_id int NULL, action varchar(100) NULL, entity_type varchar(50) NULL, entity_id bigint NULL, user_id int NULL, user_email varchar(255) NULL, user_role varchar(50) NULL, changes json NULL, description text NULL, ip_address varchar(64) NULL, user_agent text NULL, created_at timestamp NULL)`);
    });
    beforeEach(async () => {
      await clean();
      // 원래 100kg LOT 에서 두 건이 10kg 씩 사용 → 80
      await q(`INSERT INTO h_inventory_lots (id, tenant_id, material_id, lot_number, quantity, current_quantity, available_quantity, unit, unit_price, status) VALUES (?, ?, ?, 'L-REC', 80, 80, 80, 'kg', 1000, 'available')`, [ids.lot, T, ids.mat]);
      await q(`INSERT INTO h_inventory (tenant_id, material_id, total_quantity, available_quantity, reserved_quantity, unit) VALUES (?, ?, 80, 80, 0, 'kg')`, [T, ids.mat]);
      await q(`INSERT INTO h_batches (id, tenant_id, site_id, batch_code, product_id, planned_quantity, planned_date, status, mode, plan_only, created_by, day_batch_group, batch_order) VALUES
        (?, ?, 1, 'REC-1', 99901, 50, ?, 'in_progress', 'auto', 0, 4, 'DAY-REC', 1), (?, ?, 1, 'REC-2', 99901, 50, ?, 'in_progress', 'auto', 0, 4, 'DAY-REC', 2)`, [ids.keep, T, D, ids.dup, T, D]);
      await q(`INSERT INTO h_batch_inputs (id, batch_id, tenant_id, material_id, planned_quantity, actual_quantity, unit, inventory_deducted) VALUES
        (95011, ?, ?, ?, 10, 10, 'kg', 1), (95012, ?, ?, ?, 0.5, NULL, 'kg', 0), (95021, ?, ?, ?, 10, 10, 'kg', 1)`, [ids.keep, T, ids.mat, ids.keep, T, ids.mat, ids.dup, T, ids.mat]);
      await q(`INSERT INTO h_inventory_transactions (id, tenant_id, lot_id, material_id, transaction_type, quantity, unit, unit_cost, amount, transaction_date, reference_type, reference_id, source_type, source_id, source_line_id, action_type, created_by) VALUES
        (?, ?, ?, ?, 'usage', 10, 'kg', 1000, 10000, ?, 'batch', ?, 'BATCH', ?, 95011, 'AUTO_ISSUE', 4), (?, ?, ?, ?, 'usage', 10, 'kg', 987.65, 9876.5, ?, 'batch', ?, 'BATCH', ?, 95021, 'AUTO_ISSUE', 4)`,
        [ids.txKeep, T, ids.lot, ids.mat, D, ids.keep, ids.keep, ids.txDup, T, ids.lot, ids.mat, D, ids.dup, ids.dup]);
      await q(`INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, usage_qty, notes, source) VALUES (?, ?, ?, 20, '배치 자동출고', 'auto')`, [T, ids.mat, D]);
      await q(`INSERT INTO h_approval_requests (id, tenant_id, request_type, reference_type, reference_id, title, status) VALUES (?, ?, 'batch_production', 'batch', ?, 'A', 'pending_writer'), (?, ?, 'batch_production', 'batch', ?, 'B', 'pending_writer')`,
        [ids.apKeep, T, ids.keep, ids.apDup, T, ids.dup]);
      await q(`INSERT INTO h_batch_schedules (tenant_id, batch_id, scheduled_date, status) VALUES (?, ?, ?, 'scheduled'), (?, ?, ?, 'scheduled')`, [T, ids.keep, `${D} 12:00:00`, T, ids.dup, `${D} 12:00:00`]);
    });
    afterAll(clean);
    const lotNow = async () => {
      const r = (await q(`SELECT quantity AS q, current_quantity AS c, available_quantity AS a, status FROM h_inventory_lots WHERE id = ?`, [ids.lot]))[0];
      return { q: Number(r.q), c: Number(r.c), a: Number(r.a), status: r.status };
    };
    const snapshot = async () => JSON.stringify(await Promise.all([
      q(`SELECT * FROM h_batches WHERE id IN (?, ?) ORDER BY id`, [ids.keep, ids.dup]), q(`SELECT * FROM h_inventory_transactions WHERE tenant_id = ? ORDER BY id`, [T]),
      q(`SELECT quantity, current_quantity, available_quantity, status FROM h_inventory_lots WHERE id = ?`, [ids.lot]), q(`SELECT usage_qty FROM material_ledger_daily WHERE tenant_id = ? AND material_id = ?`, [T, ids.mat]),
      q(`SELECT id, status FROM h_approval_requests WHERE tenant_id = ? ORDER BY id`, [T]), q(`SELECT COUNT(*) AS n FROM h_batch_recoveries WHERE tenant_id = ?`, [T]),
      q(`SELECT issue_hold FROM h_batch_inputs WHERE id = 95012`), q(`SELECT available_quantity FROM h_inventory WHERE tenant_id = ? AND material_id = ?`, [T, ids.mat]),
    ]));

    it("dry-run 은 아무것도 바꾸지 않고, 다른 회사 번호가 하나라도 섞이면 전부 거부", async () => {
      const { planRecovery } = await import("./services/batchRecovery");
      const before = await snapshot();
      const p = await planRecovery(await conn(), input);
      expect(p.errors).toEqual([]);
      expect([p.batches.before, p.batches.after, p.totals.reversalCount, p.totals.reversalQty, p.totals.reversalAmount]).toEqual([{ count: 2, kg: 100 }, { count: 1, kg: 50 }, 1, 10, 9876.5]);
      expect(p.lots[0]).toMatchObject({ lotId: ids.lot, add: 10, after: { quantity: 90, current: 90, available: 90 } });
      expect(p.ledger).toEqual([{ materialId: ids.mat, date: D, usageBefore: 20, minus: 10, usageAfter: 10 }]);
      expect(p.approvals.cancel.map((a) => a.id)).toEqual([ids.apDup]);
      expect(await snapshot()).toBe(before);
      const other = await planRecovery(await conn(), { ...input, tenantId: T + 1 });
      expect(other.ok).toBe(false);
      expect(other.errors.join()).toMatch(/이 회사의 생산 건이 아닌/);
    });

    it("실행: 원 거래별 역거래(원 단가·금액·거래일, 입고 아님) + LOT 3칸·집계·수불부 복원 + 무효·대체·결재 취소·보류 — 원본 보존", async () => {
      const { planRecovery, executeRecovery } = await import("./services/batchRecovery");
      const p = await planRecovery(await conn(), input);
      const r = await executeRecovery({ ...input, recoveryKey: "REC-T1", expectedFingerprint: p.fingerprint, actorUserId: 4 }, { regenerateDaily: false });
      expect(r.status).toBe("done");
      expect(await lotNow()).toEqual({ q: 90, c: 90, a: 90, status: "available" });
      expect(Number((await q(`SELECT available_quantity FROM h_inventory WHERE tenant_id = ? AND material_id = ?`, [T, ids.mat]))[0].available_quantity)).toBe(90);
      expect(Number((await q(`SELECT usage_qty FROM material_ledger_daily WHERE tenant_id = ? AND material_id = ?`, [T, ids.mat]))[0].usage_qty)).toBe(10);
      const rev = (await q(`SELECT transaction_type, quantity AS qty, unit_cost AS uc, amount AS amt, DATE_FORMAT(transaction_date, '%Y-%m-%d') AS d, reversal_of_id, source_type, action_type, source_line_id FROM h_inventory_transactions WHERE tenant_id = ? AND reversal_of_id IS NOT NULL`, [T]))
        .map((x: any) => ({ ...x, qty: Number(x.qty), uc: Number(x.uc), amt: Number(x.amt), reversal_of_id: Number(x.reversal_of_id), source_line_id: Number(x.source_line_id) }));
      expect(rev).toEqual([{ transaction_type: "return", qty: 10, uc: 987.65, amt: 9876.5, d: D, reversal_of_id: ids.txDup, source_type: "BATCH_VOID", action_type: "VOID_REVERSAL", source_line_id: 95021 }]);
      expect((await q(`SELECT COUNT(*) AS n FROM h_inventory_transactions WHERE id IN (?, ?) AND transaction_type = 'usage'`, [ids.txKeep, ids.txDup]))[0].n).toBe(2); // 원 거래 보존
      expect((await q(`SELECT status, superseded_by_batch_id AS s, voided_by AS v FROM h_batches WHERE id = ?`, [ids.dup]))[0]).toEqual({ status: "cancelled", s: ids.keep, v: 4 });
      expect((await q(`SELECT status FROM h_batches WHERE id = ?`, [ids.keep]))[0].status).toBe("in_progress");
      expect((await q(`SELECT id, status FROM h_approval_requests WHERE tenant_id = ? ORDER BY id`, [T])).map((a: any) => a.status)).toEqual(["pending_writer", "cancelled"]);
      expect((await q(`SELECT action FROM h_approval_history WHERE tenant_id = ? AND request_id = ?`, [T, ids.apDup]))[0].action).toBe("cancelled");
      expect((await q(`SELECT issue_hold FROM h_batch_inputs WHERE id = 95012`))[0].issue_hold).toBe(1);
      expect((await q(`SELECT COUNT(*) AS n FROM h_recovery_archive WHERE tenant_id = ? AND table_name = 'h_batches'`, [T]))[0].n).toBe(2);
      // 남는 생산 건: 다시 출고해도 차감 없음, 보류 줄도 출고 안 함
      const { autoIssueMaterialsDispatch } = await import("./lib/production/autoMaterialIssueDispatcher");
      await autoIssueMaterialsDispatch(ids.keep, 4, T);
      expect(await lotNow()).toEqual({ q: 90, c: 90, a: 90, status: "available" });
      expect((await q(`SELECT COUNT(*) AS n FROM h_inventory_transactions WHERE tenant_id = ? AND transaction_type = 'usage'`, [T]))[0].n).toBe(2);
      // 무효 건: 시작·삭제 막힘
      const { ensureBatchActivated } = await import("./services/batchOrchestrator");
      await expect(ensureBatchActivated(ids.dup, T, 4)).rejects.toThrow(/무효 처리된 생산 건/);
      const { deleteBatch } = await import("./db/production/batchCRUD");
      await expect(deleteBatch(ids.dup, T)).rejects.toThrow(/무효 처리된 생산 건/);
      // 같은 키 재시도 = 이미 완료, 새 키 = 거부 — 추가 변경 0
      const after = await snapshot();
      expect((await executeRecovery({ ...input, recoveryKey: "REC-T1", expectedFingerprint: p.fingerprint, actorUserId: 4 }, { regenerateDaily: false })).status).toBe("already_done");
      await expect(executeRecovery({ ...input, recoveryKey: "REC-T2", expectedFingerprint: p.fingerprint, actorUserId: 4 }, { regenerateDaily: false })).rejects.toThrow(/이미 무효/);
      expect(await snapshot()).toBe(after);
    });

    it("동시 실행 3번 (같은 키 2 + 다른 키 1) → 한 번만, 역거래 1건", async () => {
      const { planRecovery, executeRecovery } = await import("./services/batchRecovery");
      const p = await planRecovery(await conn(), input);
      const run = (k: string) => executeRecovery({ ...input, recoveryKey: k, expectedFingerprint: p.fingerprint, actorUserId: 4 }, { regenerateDaily: false });
      const rs = await Promise.allSettled([run("C1"), run("C1"), run("C2")]);
      expect(rs.filter((x) => x.status === "fulfilled" && (x.value as any).status === "done").length).toBe(1);
      expect((await q(`SELECT COUNT(*) AS n FROM h_inventory_transactions WHERE tenant_id = ? AND reversal_of_id IS NOT NULL`, [T]))[0].n).toBe(1);
      expect(await lotNow()).toEqual({ q: 90, c: 90, a: 90, status: "available" });
    });

    it("중간 실패(단계마다) → 전부 되돌림 / dry-run 뒤 LOT·결재가 바뀌면 멈춤", async () => {
      const { planRecovery, executeRecovery, RecoveryChangedError } = await import("./services/batchRecovery");
      const p = await planRecovery(await conn(), input);
      const before = await snapshot();
      for (const st of ["archived", "reversals_half", "reversed", "voided", "metal", "replanned", "verified", "before_commit"]) {
        await expect(executeRecovery({ ...input, recoveryKey: `F-${st}`, expectedFingerprint: p.fingerprint, actorUserId: 4 },
          { regenerateDaily: false, onStep: (x) => { if (x === st) throw new Error(`주입 ${st}`); } })).rejects.toThrow(`주입 ${st}`);
        expect(await snapshot()).toBe(before);
      }
      await q(`UPDATE h_inventory_lots SET available_quantity = 79 WHERE id = ?`, [ids.lot]);
      const changed = await snapshot();
      await expect(executeRecovery({ ...input, recoveryKey: "F-chg", expectedFingerprint: p.fingerprint, actorUserId: 4 }, { regenerateDaily: false })).rejects.toBeInstanceOf(RecoveryChangedError);
      expect(await snapshot()).toBe(changed);
      await q(`UPDATE h_inventory_lots SET available_quantity = 80 WHERE id = ?`, [ids.lot]);
      await q(`UPDATE h_approval_requests SET status = 'approved' WHERE id = ?`, [ids.apDup]);
      expect((await planRecovery(await conn(), input)).errors.join()).toMatch(/승인되어 있습니다/);
    });
  });
  describe("원장 중복 정리 — 같은 사용 사건의 원 출고 + 옛 보충 출고 (2026-10-19, 생산 건 복구와 별도)", () => {
    const M = 9715, IM = 9168; // 정본 원료 / item_master 공간 id (FK 로만 이어짐)
    const B = { a: 9711, b: 9712, c: 9713 };
    const input = { tenantId: T, materialId: M, batchIds: [B.a, B.b], reason: "시험 — 원장 중복" };
    const clean = async () => {
      await q(`DELETE FROM h_inventory_transactions WHERE tenant_id = ? AND (material_id IN (?, ?) OR source_type = 'LEDGER_DEDUP')`, [T, M, IM]);
      await q(`DELETE FROM h_batch_inputs WHERE batch_id IN (?, ?, ?)`, [B.a, B.b, B.c]);
      await q(`DELETE FROM h_batches WHERE id IN (?, ?, ?)`, [B.a, B.b, B.c]);
      await q(`DELETE FROM h_inventory_lots WHERE id IN (9721, 9722)`);
      await q(`DELETE FROM h_inventory WHERE tenant_id = ? AND material_id = ?`, [T, M]);
      await q(`DELETE FROM h_materials WHERE id = ?`, [M]);
      for (const t of ["h_ledger_dedup_cases", "h_ledger_event_links"]) await q(`DELETE FROM ${t} WHERE tenant_id = ?`, [T]);
    };
    beforeEach(async () => {
      await clean();
      await q(`INSERT INTO h_materials (id, tenant_id, material_code, material_name) VALUES (?, ?, 'RICE-T', '멥쌀(시험)')`, [M, T]);
      await q(`INSERT INTO item_master (id, tenant_id, item_code, item_name, item_type, base_unit, is_active, legacy_material_id) VALUES (?, ?, 'IM-RICE-T', '멥쌀(시험)', 'raw_material', 'kg', 1, ?)`, [IM, T, M]);
      await q(`INSERT INTO h_inventory_lots (id, tenant_id, material_id, lot_number, quantity, current_quantity, available_quantity, unit, status) VALUES
        (9721, ?, ?, 'L-OLD', 100, 30, 30, 'kg', 'available'), (9722, ?, ?, 'L-NEW', 100, 60, 60, 'kg', 'available')`, [T, M, T, M]);
      await q(`INSERT INTO h_inventory (tenant_id, material_id, total_quantity, available_quantity, reserved_quantity, unit) VALUES (?, ?, 90, 90, 0, 'kg')`, [T, M]);
      await q(`INSERT INTO h_batches (id, tenant_id, site_id, batch_code, product_id, planned_quantity, planned_date, status, mode, plan_only, created_by) VALUES
        (?, ?, 1, 'R-A', 99901, 50, '2026-04-20', 'completed', 'auto', 0, 4), (?, ?, 1, 'R-B', 99901, 50, '2026-04-22', 'completed', 'auto', 0, 4), (?, ?, 1, 'R-C', 99901, 50, '2026-04-23', 'completed', 'auto', 0, 4)`,
        [B.a, T, B.b, T, B.c, T]);
      await q(`INSERT INTO h_batch_inputs (id, batch_id, tenant_id, material_id, planned_quantity, actual_quantity, unit, inventory_deducted) VALUES
        (97111, ?, ?, ?, 10, 10, 'kg', 0), (97121, ?, ?, ?, 20, 20, 'kg', 0), (97131, ?, ?, ?, 5, 5, 'kg', 0)`, [B.a, T, M, B.b, T, M, B.c, T, M]);
      // A: 원 거래도 LOT 연결(옛 재조정이 다시 깎음) + 보충 / B: 원 거래 LOT 없음 + 보충만 LOT / C: 보충(줄 id 없음)만 — 원 거래 없음
      await q(`INSERT INTO h_inventory_transactions (id, tenant_id, lot_id, material_id, transaction_type, quantity, unit, unit_cost, amount, transaction_date, reference_type, reference_id, source_type, source_id, source_line_id, created_by) VALUES
        (97201, ?, 9721, ?, 'usage', 10, 'kg', 1050, 10500, '2026-04-20', 'batch', ?, 'BATCH', ?, 97111, 4),
        (97202, ?, 9722, ?, 'usage', 10, 'kg', 1020, 10200, '2026-04-20', NULL, NULL, 'BATCH', ?, NULL, 4),
        (97203, ?, NULL, ?, 'usage', 20, 'kg', 2040, 40800, '2026-04-22', 'batch', ?, 'BATCH', ?, 97121, 4),
        (97204, ?, 9722, ?, 'usage', 20, 'kg', 1020, 20400, '2026-04-22', NULL, NULL, 'BATCH', ?, NULL, 4),
        (97205, ?, 9722, ?, 'usage', 5, 'kg', 1020, 5100, '2026-04-23', NULL, NULL, 'BATCH', ?, NULL, 4)`,
        [T, M, B.a, B.a, T, M, B.a, T, IM, B.b, B.b, T, M, B.b, T, M, B.c]);
    });
    afterAll(clean);
    const stockNow = async () => JSON.stringify([await q(`SELECT id, quantity, current_quantity, available_quantity, status FROM h_inventory_lots WHERE id IN (9721, 9722) ORDER BY id`),
      await q(`SELECT available_quantity FROM h_inventory WHERE tenant_id = ? AND material_id = ?`, [T, M])]);

    it("출고 판정: 줄 id 없는 옛 보충 출고만 있는 줄도 '이미 출고' (원료 id 가 item_master 공간이어도 FK 로 같은 사건) — 자동 출고가 다시 빼지 않음", async () => {
      const { getIssuedBatchLineIds, countUnissuedBatchLines } = await import("./lib/production/issuedBatchLines");
      expect([...(await getIssuedBatchLineIds(B.c, T))]).toEqual([97131]);
      expect(await countUnissuedBatchLines(B.c, T)).toBe(0);
      expect([...(await getIssuedBatchLineIds(B.b, T))]).toEqual([97121]); // 원 거래 원료 = item_master 9168 → FK → 9715
      const before = await stockNow();
      const { autoIssueMaterialsDispatch } = await import("./lib/production/autoMaterialIssueDispatcher");
      for (const b of [B.a, B.b, B.c]) await autoIssueMaterialsDispatch(b, 4, T);
      expect(await stockNow()).toBe(before);
      expect((await q(`SELECT COUNT(*) AS n FROM h_inventory_transactions WHERE tenant_id = ? AND material_id IN (?, ?)`, [T, M, IM]))[0].n).toBe(5);
    });

    it("LOT 붙이기 안전 검사: 같은 배치·원료에 LOT 연결 출고가 이미 있으면 막힘 (옛 유령 재조정 유형)", async () => {
      const { checkLotAttachSafety } = await import("./lib/inventory/usageEventGuard");
      const r = await checkLotAttachSafety(await (await import("./db/connection")).getRawConnection(), T, [97203]);
      expect(r[0]).toMatchObject({ safe: false, reason: expect.stringMatching(/두 번 차감/) });
      await q(`DELETE FROM h_inventory_transactions WHERE id = 97204`);
      expect((await checkLotAttachSafety(await (await import("./db/connection")).getRawConnection(), T, [97203]))[0].safe).toBe(true);
    });

    it("dry-run → 실행: B 는 원장 전용 상계(LOT·집계 그대로, 금액 비움), A 는 연결만 / 재시도·새 키·회사 격리·중간 실패", async () => {
      const { planLedgerDedup, executeLedgerDedup, LedgerDedupBlockedError } = await import("./services/ledgerDedup");
      const pool = await (await import("./db/connection")).getRawConnection();
      const p = await planLedgerDedup(pool, input);
      expect(p.errors).toEqual([]);
      expect(p.events.map((e) => [e.batchId, e.classification, e.quantity])).toEqual([[B.a, "A", 10], [B.b, "B", 20]]);
      expect([p.totals.ledgerUsageBefore, p.totals.ledgerUsageAfter]).toEqual([60, 40]);
      expect(p.aLotImpact).toEqual([{ lotId: 9721, kg: 10, originalTxIds: [97201] }]);
      expect((await planLedgerDedup(pool, { ...input, tenantId: T + 1 })).ok).toBe(false);
      expect((await planLedgerDedup(pool, { ...input, batchIds: [B.a, B.c] })).errors.join()).toMatch(/'원 거래 1 \+ 보충 1' 모양이 아닙니다/);
      const before = await stockNow();
      for (const st of ["planned", "half", "written", "verified", "before_commit"]) {
        await expect(executeLedgerDedup({ ...input, caseKey: `F-${st}`, expectedFingerprint: p.fingerprint, actorUserId: 4 }, { onStep: (x) => { if (x === st) throw new Error(`주입 ${st}`); } })).rejects.toThrow(`주입 ${st}`);
      }
      expect((await q(`SELECT COUNT(*) AS n FROM h_ledger_event_links WHERE tenant_id = ?`, [T]))[0].n).toBe(0);
      const r = await executeLedgerDedup({ ...input, caseKey: "LD-1", expectedFingerprint: p.fingerprint, actorUserId: 4 });
      expect(r.status).toBe("done");
      expect(await stockNow()).toBe(before);
      const off = await q(`SELECT lot_id, transaction_type, quantity + 0 AS qty, amount, reversal_of_id, source_line_id FROM h_inventory_transactions WHERE tenant_id = ? AND source_type = 'LEDGER_DEDUP'`, [T]);
      expect(off.map((o: any) => [o.lot_id, o.transaction_type, Number(o.qty), o.amount, Number(o.reversal_of_id), Number(o.source_line_id)])).toEqual([[null, "return", 20, null, 97203, 97121]]);
      const links = await q(`SELECT batch_input_id, original_tx_id, backfill_tx_id, classification, status FROM h_ledger_event_links WHERE tenant_id = ? ORDER BY batch_id`, [T]);
      expect(links.map((l: any) => [Number(l.batch_input_id), Number(l.original_tx_id), Number(l.backfill_tx_id), l.classification, l.status])).toEqual([
        [97111, 97201, 97202, "A_LOT_REDEDUCTED", "stock_review_pending"], [97121, 97203, 97204, "B_LEDGER_ONLY", "ledger_offset"]]);
      expect((await q(`SELECT COUNT(*) AS n FROM h_inventory_transactions WHERE id IN (97201, 97202, 97203, 97204)`))[0].n).toBe(4); // 원본 보존
      expect((await executeLedgerDedup({ ...input, caseKey: "LD-1", expectedFingerprint: p.fingerprint, actorUserId: 4 })).status).toBe("already_done");
      await expect(executeLedgerDedup({ ...input, caseKey: "LD-2", expectedFingerprint: p.fingerprint, actorUserId: 4 })).rejects.toBeInstanceOf(LedgerDedupBlockedError);
      expect((await q(`SELECT COUNT(*) AS n FROM h_inventory_transactions WHERE tenant_id = ? AND source_type = 'LEDGER_DEDUP'`, [T]))[0].n).toBe(1);
    });

    it("#608 검토 P1: 애매한 옛 출고(줄 10·20 에 출고 10 하나) — 둘 다 출고 완료 아님·다시 빼지 않음·보류·승인 막힘 → 화면에서 인정/새로 출고로 풀기", async () => {
      const { classifyBatchLines, countUnissuedBatchLines } = await import("./lib/production/issuedBatchLines");
      const D = 9714;
      await q(`DELETE FROM h_batch_line_issue_decisions WHERE tenant_id = ?`, [T]);
      await q(`DELETE FROM audit_logs WHERE action = 'batch_input.issue_decision'`);
      await q(`INSERT INTO h_batches (id, tenant_id, site_id, batch_code, product_id, planned_quantity, planned_date, status, mode, plan_only, created_by) VALUES (?, ?, 1, 'R-D', 99901, 30, '2026-04-24', 'in_progress', 'auto', 0, 4)`, [D, T]);
      await q(`INSERT INTO h_batch_inputs (id, batch_id, tenant_id, material_id, planned_quantity, actual_quantity, unit, inventory_deducted) VALUES (97141, ?, ?, ?, 10, 10, 'kg', 0), (97142, ?, ?, ?, 20, 20, 'kg', 0)`, [D, T, M, D, T, M]);
      await q(`INSERT INTO h_inventory_transactions (id, tenant_id, lot_id, material_id, transaction_type, quantity, unit, transaction_date, source_type, source_id, created_by) VALUES (97206, ?, NULL, ?, 'usage', 10, 'kg', '2026-04-24', 'BATCH', ?, 4)`, [T, M, D]);
      try {
        const st = await classifyBatchLines(D, T);
        expect([st.get(97141)!.state, st.get(97142)!.state]).toEqual(["ambiguous", "ambiguous"]);
        expect(await countUnissuedBatchLines(D, T)).toBe(2);
        const before = await stockNow();
        const { autoIssueMaterialsDispatch } = await import("./lib/production/autoMaterialIssueDispatcher");
        await autoIssueMaterialsDispatch(D, 4, T);
        expect(await stockNow()).toBe(before); // 다시 빼지 않음
        expect((await q(`SELECT id, issue_hold FROM h_batch_inputs WHERE batch_id = ? ORDER BY id`, [D])).map((r: any) => Number(r.issue_hold))).toEqual([1, 1]);
        const { prepareBatchForApproval } = await import("./lib/production/batchApprovalGate");
        await expect(prepareBatchForApproval(D, T, 4)).rejects.toThrow();
        // 화면에서 풀기 — 수량 다른 출고는 인정 거부, 맞는 줄에 인정, 나머지 줄은 새로 출고
        const { resolveLineIssue } = await import("./lib/production/lineIssueDecision");
        await expect(resolveLineIssue({ tenantId: T, batchInputId: 97142, action: "existing", txIds: [97206], userId: 4 })).rejects.toThrow(/수량이 다릅니다/);
        await expect(resolveLineIssue({ tenantId: T + 1, batchInputId: 97141, action: "existing", txIds: [97206], userId: 4 })).rejects.toThrow(/이 회사의 투입 줄이 아닙니다/);
        expect((await resolveLineIssue({ tenantId: T, batchInputId: 97141, action: "existing", txIds: [97206], userId: 4 })).state).toBe("decided_existing");
        await expect(resolveLineIssue({ tenantId: T, batchInputId: 97141, action: "issue_new", userId: 4 })).rejects.toThrow(/이미 확인|이미 출고/);
        expect((await classifyBatchLines(D, T)).get(97142)!.state).toBe("none"); // 옛 출고는 줄 97141 에 인정됨
        expect(await countUnissuedBatchLines(D, T)).toBe(1);
        await autoIssueMaterialsDispatch(D, 4, T);
        expect((await q(`SELECT COUNT(*) AS n FROM h_inventory_transactions WHERE source_id = ? AND source_line_id = 97142`, [D]))[0].n).toBe(0); // 아직 보류
        expect((await resolveLineIssue({ tenantId: T, batchInputId: 97142, action: "issue_new", userId: 4 })).state).toBe("none");
        await autoIssueMaterialsDispatch(D, 4, T);
        const issued = await q(`SELECT quantity FROM h_inventory_transactions WHERE source_id = ? AND source_line_id = 97142 AND transaction_type = 'usage'`, [D]);
        expect(issued.reduce((a: number, r: any) => a + Number(r.quantity), 0)).toBe(20);
        await autoIssueMaterialsDispatch(D, 4, T); // 다시 불러도 한 번
        expect((await q(`SELECT COUNT(*) AS n FROM h_inventory_transactions WHERE source_id = ? AND source_line_id = 97142`, [D]))[0].n).toBe(issued.length);
        expect(await countUnissuedBatchLines(D, T)).toBe(0);
        expect((await q(`SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'batch_input.issue_decision' AND entity_id IN (97141, 97142)`))[0].n).toBe(2);
      } finally {
        await q(`DELETE FROM h_inventory_transactions WHERE source_id = ? AND tenant_id = ?`, [D, T]);
        await q(`DELETE FROM h_batch_line_issue_decisions WHERE tenant_id = ?`, [T]);
        await q(`DELETE FROM h_batch_inputs WHERE batch_id = ?`, [D]);
        await q(`DELETE FROM h_batches WHERE id = ?`, [D]);
      }
    });

    it("#610 시범 전 재확인: 단순 미출고 줄 — 판정 없이 '실제 투입 확인 — 출고' 한 번, 공통 출고 엔진으로 그 줄만 · 실패하면 확인은 남고 '다시 출고' 만", async () => {
      const F = 9717, G = 9718;
      const { classifyBatchLines, countUnissuedBatchLines } = await import("./lib/production/issuedBatchLines");
      const { issueLineNow } = await import("./lib/production/lineIssueDecision");
      await q(`DELETE FROM h_batch_line_issue_decisions WHERE tenant_id = ?`, [T]);
      await q(`DELETE FROM audit_logs WHERE action = 'batch_input.issue_decision'`);
      await q(`INSERT INTO h_batches (id, tenant_id, site_id, batch_code, product_id, planned_quantity, planned_date, status, mode, plan_only, created_by) VALUES
        (?, ?, 1, 'R-F', 99901, 30, '2026-04-25', 'in_progress', 'auto', 0, 4), (?, ?, 1, 'R-G', 99901, 30, '2026-04-26', 'planned', 'auto', 1, 4)`, [F, T, G, T]);
      await q(`INSERT INTO h_batch_inputs (id, batch_id, tenant_id, material_id, planned_quantity, actual_quantity, unit, inventory_deducted, issue_hold, issue_hold_reason) VALUES
        (97171, ?, ?, ?, 3, NULL, 'kg', 0, 0, NULL), (97172, ?, ?, ?, 2, NULL, 'kg', 0, 1, '시험 보류'), (97173, ?, ?, 99977, 1, NULL, 'kg', 0, 0, NULL),
        (97174, ?, ?, ?, 1000, NULL, 'kg', 0, 0, NULL), (97181, ?, ?, ?, 1, NULL, 'kg', 0, 0, NULL)`, [F, T, M, F, T, M, F, T, F, T, M, G, T, M]);
      const lineTx = async (id: number) => (await q(`SELECT lot_id, quantity + 0 AS qty, transaction_date FROM h_inventory_transactions WHERE tenant_id = ? AND source_line_id = ? AND transaction_type = 'usage'`, [T, id]));
      const decisions = async (id: number) => Number((await q(`SELECT COUNT(*) AS n FROM h_batch_line_issue_decisions WHERE tenant_id = ? AND batch_input_id = ?`, [T, id]))[0].n);
      try {
        expect(await countUnissuedBatchLines(F, T)).toBe(4);
        // 1) 단순 미출고 줄 — 이 줄만, LOT 연결, 날짜 = 생산일. 같은 배치의 다른 미출고 줄은 그대로
        const r1 = await issueLineNow({ tenantId: T, batchInputId: 97171, userId: 4 });
        expect(r1.issued).toBe(true);
        const t1 = await lineTx(97171);
        expect(t1.reduce((a: number, x: any) => a + Number(x.qty), 0)).toBe(3);
        expect(t1.every((x: any) => x.lot_id != null)).toBe(true);
        expect(String(t1[0].transaction_date).slice(0, 10) === "2026-04-25" || new Date(t1[0].transaction_date).toISOString().startsWith("2026-04-2")).toBe(true);
        expect((await lineTx(97174)).length + (await lineTx(97172)).length + (await lineTx(97173)).length).toBe(0);
        expect(await decisions(97171)).toBe(1);
        // 다시 눌러도(중복 클릭) 한 번 — 출고·확인 기록 그대로
        expect((await issueLineNow({ tenantId: T, batchInputId: 97171, userId: 4 })).messages).toEqual(["이미 출고된 줄입니다."]);
        expect((await lineTx(97171)).length).toBe(t1.length);
        expect(await decisions(97171)).toBe(1);
        // 2) 보류 줄 — 확인하면 보류 해제 + 출고
        expect((await issueLineNow({ tenantId: T, batchInputId: 97172, userId: 4 })).issued).toBe(true);
        expect(Number((await q(`SELECT issue_hold FROM h_batch_inputs WHERE id = 97172`))[0].issue_hold)).toBe(0);
        // 3) 원료 연결이 FK 로 확인되지 않으면 거부 — 확인 기록도 안 남김 / 예정 생산 건 거부 / 다른 회사 거부
        await expect(issueLineNow({ tenantId: T, batchInputId: 97173, userId: 4 })).rejects.toThrow(/원료\(번호 99977\)를 이 회사에서 찾을 수 없습니다.*연결을 확인한 뒤 출고/);
        expect(await decisions(97173)).toBe(0);
        await expect(issueLineNow({ tenantId: T, batchInputId: 97181, userId: 4 })).rejects.toThrow(/예정 생산 건/);
        await expect(issueLineNow({ tenantId: T + 1, batchInputId: 97174, userId: 4 })).rejects.toThrow(/이 회사의 투입 줄이 아닙니다/);
        // 4) 출고 실패(재고 부족 + 음수 금지 회사) → 확인 기록은 남고 미출고 / 고친 뒤 다시 출고 — 판정 기록은 늘지 않음
        process.env.INVENTORY_ALLOW_NEGATIVE_DENY_TENANTS = String(T);
        let r4: any;
        try { r4 = await issueLineNow({ tenantId: T, batchInputId: 97174, userId: 4 }); } finally { delete process.env.INVENTORY_ALLOW_NEGATIVE_DENY_TENANTS; }
        expect(r4.issued).toBe(false);
        expect(r4.messages.length).toBeGreaterThan(0);
        expect((await classifyBatchLines(F, T)).get(97174)!.decision).toBe("issue_new");
        expect((await lineTx(97174)).length).toBe(0);
        expect((await issueLineNow({ tenantId: T, batchInputId: 97174, userId: 4 })).issued).toBe(true);
        expect(await decisions(97174)).toBe(1);
        expect(await countUnissuedBatchLines(F, T)).toBe(1); // 연결 안 된 97173 만 남음
        expect(Number((await q(`SELECT plan_only FROM h_batches WHERE id = ?`, [G]))[0].plan_only)).toBe(1);
      } finally {
        delete process.env.INVENTORY_ALLOW_NEGATIVE_DENY_TENANTS;
        await q(`DELETE FROM h_inventory_transactions WHERE tenant_id = ? AND source_id IN (?, ?)`, [T, F, G]);
        await q(`DELETE FROM h_batch_line_issue_decisions WHERE tenant_id = ?`, [T]);
        await q(`DELETE FROM h_batch_inputs WHERE batch_id IN (?, ?)`, [F, G]);
        await q(`DELETE FROM h_batches WHERE id IN (?, ?)`, [F, G]);
      }
    });

    it("#610 시범 전 재확인: 재고 묶음(inventory_id)에 다른 원료 LOT 이 잘못 묶여 있어도 그 LOT 은 고르지 않는다 — 같은 원료 LOT 으로 출고 (데이터는 그대로)", async () => {
      const H = 9719, OTHER = 9720;
      await q(`INSERT INTO h_materials (id, tenant_id, material_code, material_name) VALUES (?, ?, 'OTHER-T', '다른 원료(시험)')`, [OTHER, T]);
      const [[inv]]: any = await admin.query(`SELECT id FROM h_inventory WHERE tenant_id = ? AND material_id = ?`, [T, M]);
      // 이 원료 묶음에 다른 원료 LOT (기한이 더 빨라 FEFO 가 먼저 고르려 함)
      await q(`INSERT INTO h_inventory_lots (id, tenant_id, inventory_id, material_id, lot_number, quantity, current_quantity, available_quantity, unit, status, expiry_date) VALUES (9723, ?, ?, ?, 'L-WRONG', 500, 500, 500, 'kg', 'available', '2027-01-01')`, [T, inv.id, OTHER]);
      await q(`INSERT INTO h_batches (id, tenant_id, site_id, batch_code, product_id, planned_quantity, planned_date, status, mode, plan_only, created_by) VALUES (?, ?, 1, 'R-H', 99901, 30, '2026-04-27', 'in_progress', 'auto', 0, 4)`, [H, T]);
      await q(`INSERT INTO h_batch_inputs (id, batch_id, tenant_id, material_id, planned_quantity, actual_quantity, unit, inventory_deducted) VALUES (97191, ?, ?, ?, 3, NULL, 'kg', 0)`, [H, T, M]);
      try {
        const { issueLineNow } = await import("./lib/production/lineIssueDecision");
        const r = await issueLineNow({ tenantId: T, batchInputId: 97191, userId: 4 });
        expect(r).toMatchObject({ issued: true });
        const tx = await q(`SELECT lot_id FROM h_inventory_transactions WHERE tenant_id = ? AND source_line_id = 97191`, [T]);
        expect(tx.length).toBeGreaterThan(0);
        expect(tx.every((t: any) => [9721, 9722].includes(Number(t.lot_id)))).toBe(true);
        const wrong = (await q(`SELECT inventory_id, material_id, current_quantity + 0 AS cq FROM h_inventory_lots WHERE id = 9723`))[0];
        expect([Number(wrong.inventory_id), Number(wrong.material_id), Number(wrong.cq)]).toEqual([Number(inv.id), OTHER, 500]); // 잘못 묶인 LOT 은 건드리지 않음
      } finally {
        await q(`DELETE FROM h_inventory_transactions WHERE tenant_id = ? AND source_id = ?`, [T, H]);
        await q(`DELETE FROM h_batch_line_issue_decisions WHERE tenant_id = ?`, [T]);
        await q(`DELETE FROM h_batch_inputs WHERE batch_id = ?`, [H]);
        await q(`DELETE FROM h_batches WHERE id = ?`, [H]);
        await q(`DELETE FROM h_inventory_lots WHERE id = 9723`);
        await q(`DELETE FROM h_materials WHERE id = ?`, [OTHER]);
      }
    });

    it("#609 검토 P1: 한 줄은 직접 연결 + 같은 사건 보충 출고 + 다른 줄은 출고 근거 없음 → 남은 줄은 애매(재출고 0·미출고·승인 막힘)", async () => {
      const { classifyBatchLines, countUnissuedBatchLines } = await import("./lib/production/issuedBatchLines");
      const E = 9716;
      await q(`INSERT INTO h_batches (id, tenant_id, site_id, batch_code, product_id, planned_quantity, planned_date, status, mode, plan_only, created_by) VALUES (?, ?, 1, 'R-E', 99901, 30, '2026-04-25', 'in_progress', 'auto', 0, 4)`, [E, T]);
      await q(`INSERT INTO h_batch_inputs (id, batch_id, tenant_id, material_id, planned_quantity, actual_quantity, unit, inventory_deducted) VALUES (97161, ?, ?, ?, 10, 10, 'kg', 0), (97162, ?, ?, ?, 20, 20, 'kg', 0)`, [E, T, M, E, T, M]);
      await q(`INSERT INTO h_inventory_transactions (id, tenant_id, lot_id, material_id, transaction_type, quantity, unit, transaction_date, reference_type, reference_id, source_type, source_id, source_line_id, created_by) VALUES
        (97207, ?, NULL, ?, 'usage', 10, 'kg', '2026-04-25', 'batch', ?, 'BATCH', ?, 97161, 4),
        (97208, ?, 9722, ?, 'usage', 10, 'kg', '2026-04-25', NULL, NULL, 'BATCH', ?, NULL, 4)`, [T, M, E, E, T, M, E]);
      try {
        const st = await classifyBatchLines(E, T);
        expect([st.get(97161)!.state, st.get(97162)!.state]).toEqual(["line", "ambiguous"]);
        expect(await countUnissuedBatchLines(E, T)).toBe(1);
        const before = await stockNow();
        const { autoIssueMaterialsDispatch } = await import("./lib/production/autoMaterialIssueDispatcher");
        await autoIssueMaterialsDispatch(E, 4, T);
        expect(await stockNow()).toBe(before);
        expect((await q(`SELECT issue_hold FROM h_batch_inputs WHERE id = 97162`))[0].issue_hold).toBe(1);
        const { prepareBatchForApproval } = await import("./lib/production/batchApprovalGate");
        await expect(prepareBatchForApproval(E, T, 4)).rejects.toThrow();
        // 원장 정리로 보충 출고가 줄 97161 사건에 연결돼도, 그 출고는 줄 97162 의 후보가 아니다 → 출고 근거 없음
        await q(`INSERT INTO h_ledger_event_links (tenant_id, case_id, event_key, batch_id, batch_input_id, canonical_material_id, original_tx_id, backfill_tx_id, classification, duplicate_tx_id, quantity, status, created_at)
                 VALUES (?, 0, 'batch_input:97161', ?, 97161, ?, 97207, 97208, 'B_LEDGER_ONLY', 97207, 10, 'ledger_offset', NOW())`, [T, E, M]);
        expect((await classifyBatchLines(E, T)).get(97162)!.state).toBe("none");
      } finally {
        await q(`DELETE FROM h_ledger_event_links WHERE tenant_id = ? AND batch_id = ?`, [T, E]);
        await q(`DELETE FROM h_inventory_transactions WHERE source_id = ? AND tenant_id = ?`, [E, T]);
        await q(`DELETE FROM h_batch_inputs WHERE batch_id = ?`, [E]);
        await q(`DELETE FROM h_batches WHERE id = ?`, [E]);
      }
    });

    it("#608 검토 P1 회귀: 줄 1 ↔ 줄 번호 없는 출고 1 은 수량이 달라도(줄을 나중에 고친 경우) 계속 출고 완료 / 단위가 다르면 애매", async () => {
      const { classifyBatchLines } = await import("./lib/production/issuedBatchLines");
      await q(`UPDATE h_batch_inputs SET actual_quantity = 2.533 WHERE id = 97131`); // 출고 5 → 줄 수정 2.533
      expect((await classifyBatchLines(B.c, T)).get(97131)!.state).toBe("lineless_1to1");
      await q(`UPDATE h_inventory_transactions SET unit = 'g' WHERE id = 97205`);
      expect((await classifyBatchLines(B.c, T)).get(97131)!.state).toBe("ambiguous");
    });

    it("#608 검토 P2: 원장 정리는 투입 줄·원 거래·보충 거래 단위가 같아야 — 숫자만 같으면 멈춤", async () => {
      const { planLedgerDedup } = await import("./services/ledgerDedup");
      await q(`UPDATE h_inventory_transactions SET unit = 'g' WHERE id = 97204`);
      const p = await planLedgerDedup(await (await import("./db/connection")).getRawConnection(), input);
      expect(p.ok).toBe(false);
      expect(p.errors.join()).toMatch(/단위가 같지 않습니다/);
    });

    it("#608 검토 P2: 소모 요약은 원본·원장 정리·유효 사용량을 함께 — 원장 정리 금액은 미확정, 재고는 그대로", async () => {
      const { planLedgerDedup, executeLedgerDedup } = await import("./services/ledgerDedup");
      const { getConsumptionSummary, getOutboundHistory } = await import("./db/production/outboundManagement");
      const pool = await (await import("./db/connection")).getRawConnection();
      const pick = (sum: any) => sum.dailyGroups.flatMap((d: any) => d.materialGroups.flatMap((g: any) => g.items)).filter((i: any) => i.materialId === M);
      const before = pick(await getConsumptionSummary({ year: 2026, month: 4 }, T));
      expect(before.reduce((a: number, i: any) => a + i.quantity, 0)).toBe(65);
      const p = await planLedgerDedup(pool, input);
      await executeLedgerDedup({ ...input, caseKey: "LD-SUM", expectedFingerprint: p.fingerprint, actorUserId: 4 });
      const sum = await getConsumptionSummary({ year: 2026, month: 4 }, T);
      const after = pick(sum);
      expect(after.reduce((a: number, i: any) => a + i.quantity, 0)).toBe(45); // 65 − B 상계 20
      expect(after.reduce((a: number, i: any) => a + i.originalQuantity, 0)).toBe(65); // 원본은 그대로
      const off = after.find((i: any) => i.ledgerOffsetQty > 0);
      expect(off).toMatchObject({ originalQuantity: 20, ledgerOffsetQty: 20, quantity: 0, amountPending: true });
      expect(sum.amountPendingRecords).toBeGreaterThanOrEqual(1);
      const hist = (await getOutboundHistory({ batchId: B.b, limit: 50 }, T)).filter((h: any) => h.id === 97203);
      expect(hist[0]).toMatchObject({ originalQuantity: 20, ledgerOffsetQty: 20, quantity: 0 });
    });

    it("동시 실행 3번 → 한 번, dry-run 뒤 LOT 이 바뀌면 멈춤", async () => {
      const { planLedgerDedup, executeLedgerDedup, LedgerDedupChangedError } = await import("./services/ledgerDedup");
      const pool = await (await import("./db/connection")).getRawConnection();
      const p = await planLedgerDedup(pool, input);
      await q(`UPDATE h_inventory_lots SET available_quantity = 59 WHERE id = 9722`);
      await expect(executeLedgerDedup({ ...input, caseKey: "LD-C0", expectedFingerprint: p.fingerprint, actorUserId: 4 })).rejects.toBeInstanceOf(LedgerDedupChangedError);
      const p2 = await planLedgerDedup(pool, input);
      const run = (k: string) => executeLedgerDedup({ ...input, caseKey: k, expectedFingerprint: p2.fingerprint, actorUserId: 4 });
      const rs = await Promise.allSettled([run("LD-C1"), run("LD-C1"), run("LD-C2")]);
      expect(rs.filter((x) => x.status === "fulfilled" && (x.value as any).status === "done").length).toBe(1);
      expect((await q(`SELECT COUNT(*) AS n FROM h_inventory_transactions WHERE tenant_id = ? AND source_type = 'LEDGER_DEDUP'`, [T]))[0].n).toBe(1);
    });
  });

  describe("공정 그룹 생성 — 빈칸 = 기준 없음, 생성·수정 같은 계약, 부분 저장 없음 (2026-10-20 신규 회사 시험 P1)", () => {
    const O2 = 9;
    let caller: (tenantId: number) => any;
    const ensureCol = async (table: string, col: string, ddl: string) => {
      const [c]: any = await admin.query(`SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`, [table, col]);
      if (!c.length) await admin.query(`ALTER TABLE ${table} ADD COLUMN ${col} ${ddl}`);
    };
    beforeAll(async () => {
      await q(`CREATE TABLE IF NOT EXISTS ccp_process_groups (id int NOT NULL AUTO_INCREMENT PRIMARY KEY, tenant_id int NOT NULL, name varchar(100) NOT NULL, ccp_type varchar(20) NULL, status varchar(20) NOT NULL DEFAULT 'active', sort_order int NOT NULL DEFAULT 0)`);
      for (const [c, d] of [["description", "text NULL"], ["temperature_min", "decimal(5,2) NULL"], ["temperature_max", "decimal(5,2) NULL"], ["time_min", "int NULL"], ["time_max", "int NULL"],
        ["pressure_min", "decimal(6,3) NULL"], ["pressure_max", "decimal(6,3) NULL"], ["ph_min", "decimal(4,2) NULL"], ["ph_max", "decimal(4,2) NULL"], ["monitoring_method", "text NULL"],
        ["monitoring_cycle", "text NULL"], ["corrective_action", "text NULL"], ["equip_group_mode", "varchar(50) NULL DEFAULT 'sequential'"], ["equip_interval_min", "int NULL DEFAULT 10"], ["equip_batch_size", "int NULL DEFAULT 1"]] as const) {
        await ensureCol("ccp_process_groups", c, d);
      }
      await q(`CREATE TABLE IF NOT EXISTS ccp_process_group_equipments (id int NOT NULL AUTO_INCREMENT PRIMARY KEY, tenant_id int NOT NULL, process_group_id int NOT NULL, equipment_id int NOT NULL, sort_order int NULL DEFAULT 0)`);
      await q(`CREATE TABLE IF NOT EXISTS equipments (id int NOT NULL AUTO_INCREMENT PRIMARY KEY, tenant_id int NOT NULL, name varchar(100) NOT NULL, status varchar(20) NOT NULL DEFAULT 'active', default_temperature decimal(6,2) NULL, default_time int NULL, batch_operation_time int NULL)`);
      await q(`DELETE FROM equipments WHERE id IN (8901, 8902)`);
      await q(`INSERT INTO equipments (id, tenant_id, name) VALUES (8901, ?, '시험 교반기 1호'), (8902, ?, '남의 교반기')`, [T, O2]);
      await q(`DELETE ge FROM ccp_process_group_equipments ge JOIN ccp_process_groups g ON g.id = ge.process_group_id WHERE g.name LIKE 'QA-NEW-%'`);
      await q(`DELETE FROM ccp_process_groups WHERE name LIKE 'QA-NEW-%'`);
      const { processGroupsRouter } = await import("./routers/ccpMonitoring/processGroups.router");
      caller = (tenantId: number) => processGroupsRouter.createCaller({ user: { id: 4, role: "admin", tenantId, email: "t@t" }, tenantId } as any);
    });
    const row = async (id: number) => (await q(`SELECT temperature_min + 0 AS tlo, temperature_max AS thi, time_min AS hlo, time_max AS hhi, pressure_min + 0 AS plo, pressure_max AS phi, ph_min AS pho, ph_max AS phh FROM ccp_process_groups WHERE id = ?`, [id]))[0];

    it("하한만 (최소 90℃·10분·0.16MPa, 최대·pH 빈칸) → 생성되고 다시 읽어도 상한 NULL, 설비 연결", async () => {
      const r = await caller(T).createProcessGroup({ name: "QA-NEW-교반", ccpType: "CCP-1B", temperatureMin: 90, temperatureMax: null, timeMin: 10, timeMax: null, pressureMin: 0.16, pressureMax: null, phMin: null, phMax: null, equipmentIds: [8901] });
      const g = await row(r.id);
      expect(Number(g.tlo)).toBe(90); expect(g.thi).toBeNull();
      expect(Number(g.hlo)).toBe(10); expect(g.hhi).toBeNull();
      expect(Number(g.plo)).toBeCloseTo(0.16); expect(g.phi).toBeNull();
      expect(g.pho).toBeNull(); expect(g.phh).toBeNull();
      expect((await q(`SELECT equipment_id FROM ccp_process_group_equipments WHERE process_group_id = ?`, [r.id])).map((x: any) => Number(x.equipment_id))).toEqual([8901]);
    });
    it("상한만 · 양쪽 · 안 보낸 칸 · 0 은 값", async () => {
      const a = await caller(T).createProcessGroup({ name: "QA-NEW-상한만", ccpType: "CCP-2B", temperatureMax: 200 });
      expect((await row(a.id)).tlo).toBeNull(); expect(Number((await row(a.id)).thi)).toBe(200);
      const b = await caller(T).createProcessGroup({ name: "QA-NEW-양쪽", ccpType: "CCP-2B", temperatureMin: 150, temperatureMax: 200, timeMin: 0 });
      const gb = await row(b.id);
      expect([Number(gb.tlo), Number(gb.thi), Number(gb.hlo)]).toEqual([150, 200, 0]); // 0 은 지우지 않음
      expect(gb.hhi).toBeNull();
    });
    it("최소 > 최대 · 남의 회사 설비 → 거부, 공정·연결 아무것도 남지 않음", async () => {
      const before = (await q(`SELECT COUNT(*) AS n FROM ccp_process_groups WHERE name LIKE 'QA-NEW-%'`))[0].n;
      await expect(caller(T).createProcessGroup({ name: "QA-NEW-역전", ccpType: "CCP-1B", temperatureMin: 95, temperatureMax: 90 })).rejects.toThrow(/최소/);
      await expect(caller(T).createProcessGroup({ name: "QA-NEW-남의설비", ccpType: "CCP-1B", temperatureMin: 90, equipmentIds: [8901, 8902] })).rejects.toThrow(/이 회사의 설비가 아닌/);
      expect((await q(`SELECT COUNT(*) AS n FROM ccp_process_groups WHERE name LIKE 'QA-NEW-%'`))[0].n).toBe(before);
      expect((await q(`SELECT COUNT(*) AS n FROM ccp_process_group_equipments WHERE equipment_id = 8902`))[0].n).toBe(0);
    });
    it("수정도 같은 계약 — 빈칸(null)은 지우고, 안 보낸 칸은 그대로", async () => {
      const r = await caller(T).createProcessGroup({ name: "QA-NEW-수정", ccpType: "CCP-1B", temperatureMin: 90, temperatureMax: 99, timeMin: 10 });
      await caller(T).updateProcessGroup({ id: r.id, temperatureMax: null });
      const g = await row(r.id);
      expect(Number(g.tlo)).toBe(90); expect(g.thi).toBeNull(); expect(Number(g.hlo)).toBe(10);
    });
  });

  describe("BOM 신규 저장 — 품목 정체성 번호(item_master)만, 칸마다 종류 확인, 한 번에 저장 (2026-10-20 신규 회사 시험 P1)", () => {
    const PV2 = 8350, IM_P = 8352, MAT = 8726, IM_M = 8351;
    let mf: any;
    beforeAll(async () => {
      await q(`DELETE i FROM h_mf_ingredients i JOIN h_mf_report_versions v ON v.id = i.mf_report_version_id JOIN h_mf_reports r ON r.id = v.mf_report_id WHERE r.report_no LIKE 'QA-MFR-%'`);
      await q(`DELETE v FROM h_mf_report_versions v JOIN h_mf_reports r ON r.id = v.mf_report_id WHERE r.report_no LIKE 'QA-MFR-%'`);
      await q(`DELETE FROM h_mf_reports WHERE report_no LIKE 'QA-MFR-%'`);
      await q(`CREATE TABLE IF NOT EXISTS ccp_process_groups (id int NOT NULL AUTO_INCREMENT PRIMARY KEY, tenant_id int NOT NULL, name varchar(100) NOT NULL, ccp_type varchar(20) NULL, status varchar(20) NOT NULL DEFAULT 'active', sort_order int NOT NULL DEFAULT 0)`);
      await q(`DELETE FROM ccp_process_groups WHERE id = 8701`);
      await q(`INSERT INTO ccp_process_groups (id, tenant_id, name, ccp_type) VALUES (8701, ?, '시험 교반 공정', 'CCP-1B')`, [T]);
      const { mfReportRouter } = await import("./routers/production/mfReport.router");
      mf = mfReportRouter.createCaller({ user: { id: 4, role: "admin", tenantId: T, email: "t@t" }, tenantId: T } as any);
    });
    beforeEach(async () => {
      // 바깥 beforeEach 가 item_master 를 비운다 — 매번 다시 (신규 회사처럼: 생산 제품 8350 ↔ 정체성 8352, 재고 원료 8726 ↔ 정체성 8351, FK 연결)
      await q(`INSERT INTO item_master (id, tenant_id, item_code, item_name, item_type, legacy_product_id, is_active) VALUES (?, ?, '30001', '시험용 찹쌀떡', 'own_product', ?, 1)`, [IM_P, T, PV2]);
      await q(`INSERT INTO item_master (id, tenant_id, item_code, item_name, item_type, base_unit, is_active, legacy_material_id) VALUES (?, ?, 'MAT-001', '시험용 찹쌀', 'raw_material', 'kg', 1, ?)`, [IM_M, T, MAT]);
      // 숫자 우연 일치: 생산 제품 번호 8350 과 같은 정체성 번호가 '원료' 로 같은 회사에 있음
      await q(`INSERT INTO item_master (id, tenant_id, item_code, item_name, item_type, base_unit, is_active) VALUES (?, ?, 'X-COINCIDE', '우연히 같은 번호의 원료', 'raw_material', 'kg', 1)`, [PV2, T]);
    });
    const base = (over: any = {}) => ({ productId: IM_P, reportNo: `QA-MFR-${Math.random().toString(36).slice(2, 8)}`, reportDate: "2026-10-20", reportType: "BASIC", yieldBasis: "BATCH", batchTargetKg: 10,
      ingredients: [{ materialId: IM_M, quantity: 100, unit: "%", isDeductible: 1, materialType: "RAW", processGroupId: 8701 }], ...over });

    it("정체성 번호로 저장 — 머리·버전·원료 줄, 들어가는 공정까지 한 번에", async () => {
      const r = await mf.create(base());
      expect(r.mfReportId).toBeGreaterThan(0);
      const rep = (await q(`SELECT product_id, report_type FROM h_mf_reports WHERE id = ?`, [r.mfReportId]))[0];
      expect(Number(rep.product_id)).toBe(IM_P);
      const ing = (await q(`SELECT i.material_id, i.process_group_id, i.entry_stage, v.batch_target_kg + 0 AS b FROM h_mf_ingredients i JOIN h_mf_report_versions v ON v.id = i.mf_report_version_id WHERE v.mf_report_id = ?`, [r.mfReportId]));
      expect(ing.map((x: any) => [Number(x.material_id), Number(x.process_group_id), x.entry_stage])).toEqual([[IM_M, 8701, null]]);
      expect(Number(ing[0].b)).toBe(10);
    });
    it("공정 없이 '성형에 바로' 도 처음 입력에서", async () => {
      const r = await mf.create(base({ ingredients: [{ materialId: IM_M, quantity: 100, unit: "%", isDeductible: 1, materialType: "RAW", processGroupId: null, entryStage: "direct" }] }));
      const ing = (await q(`SELECT i.process_group_id, i.entry_stage FROM h_mf_ingredients i JOIN h_mf_report_versions v ON v.id = i.mf_report_version_id WHERE v.mf_report_id = ?`, [r.mfReportId]))[0];
      expect(ing.process_group_id).toBeNull(); expect(ing.entry_stage).toBe("direct");
    });
    it("생산 제품 번호(h_products_v2)를 제품 칸에 → 거부 (같은 회사 원료와 숫자가 우연히 같아도), 아무것도 안 남음", async () => {
      const before = (await q(`SELECT COUNT(*) AS n FROM h_mf_reports WHERE report_no LIKE 'QA-MFR-%'`))[0].n;
      await expect(mf.create(base({ productId: PV2 }))).rejects.toThrow(/제품 칸에 맞지 않는 품목/);
      // 재고 원료 번호(h_materials)를 원료 칸에 → 정체성 목록에 없음 → 거부
      await expect(mf.create(base({ ingredients: [{ materialId: MAT, quantity: 100, unit: "%", isDeductible: 1, materialType: "RAW" }] }))).rejects.toThrow(/이 회사의 품목/);
      // 원료 칸에 제품
      await expect(mf.create(base({ ingredients: [{ materialId: IM_P, quantity: 100, unit: "%", isDeductible: 1, materialType: "RAW" }] }))).rejects.toThrow(/원료 칸에 맞지 않는 품목/);
      expect((await q(`SELECT COUNT(*) AS n FROM h_mf_reports WHERE report_no LIKE 'QA-MFR-%'`))[0].n).toBe(before);
    });

    it("배합 승인 흐름 — 초안 → 승인 요청 → 승인, 상태가 맞지 않으면 거부, 상태·이력 한 번에", async () => {
      await q(`CREATE TABLE IF NOT EXISTS h_mf_report_approvals (id bigint NOT NULL AUTO_INCREMENT PRIMARY KEY, mf_report_version_id bigint NOT NULL, action varchar(20) NOT NULL, action_by bigint NOT NULL, action_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, comment text NULL, created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
      const r = await mf.create(base());
      const vid = Number((await q(`SELECT id FROM h_mf_report_versions WHERE mf_report_id = ?`, [r.mfReportId]))[0].id);
      await q(`DELETE FROM h_mf_report_approvals WHERE mf_report_version_id = ?`, [vid]); // 이전 실행이 남긴 같은 번호 이력
      const st = async () => String((await q(`SELECT approval_status AS s FROM h_mf_report_versions WHERE id = ?`, [vid]))[0].s);
      const hist = async () => (await q(`SELECT action FROM h_mf_report_approvals WHERE mf_report_version_id = ? ORDER BY id`, [vid])).map((x: any) => x.action);
      expect(await st()).toBe("DRAFT");
      await mf.requestApproval({ versionId: vid });
      expect(await st()).toBe("PENDING");
      await expect(mf.requestApproval({ versionId: vid })).rejects.toThrow(/지금 상태\(승인 대기\)/);
      await mf.approveVersion({ versionId: vid });
      expect(await st()).toBe("APPROVED");
      expect(Number((await q(`SELECT approved_by FROM h_mf_report_versions WHERE id = ?`, [vid]))[0].approved_by)).toBe(4);
      // 이미 승인된 버전은 다시 승인·반려·요청 불가 (덮어쓰지 않음)
      await expect(mf.approveVersion({ versionId: vid })).rejects.toThrow(/지금 상태\(승인\)/);
      await expect(mf.reject({ versionId: vid, reason: "x" })).rejects.toThrow(/지금 상태\(승인\)/);
      await expect(mf.requestApproval({ versionId: vid })).rejects.toThrow(/지금 상태\(승인\)/);
      expect(await st()).toBe("APPROVED");
      expect(await hist()).toEqual(["REQUESTED", "APPROVED"]);
      // 반려 → 다시 요청 가능
      const r2 = await mf.create(base());
      const v2 = Number((await q(`SELECT id FROM h_mf_report_versions WHERE mf_report_id = ?`, [r2.mfReportId]))[0].id);
      await q(`DELETE FROM h_mf_report_approvals WHERE mf_report_version_id = ?`, [v2]);
      await mf.reject({ versionId: v2, reason: "배합비 확인 필요" });
      expect(String((await q(`SELECT approval_status AS s, rejection_reason AS r FROM h_mf_report_versions WHERE id = ?`, [v2]))[0].r)).toBe("배합비 확인 필요");
      await expect(mf.approveVersion({ versionId: v2 })).rejects.toThrow(/지금 상태\(반려\)/);
      await mf.requestApproval({ versionId: v2 });
      // 다른 회사 caller 는 이 버전을 건드릴 수 없음 (회사 소유 검사)
      const { mfReportRouter } = await import("./routers/production/mfReport.router");
      const other = mfReportRouter.createCaller({ user: { id: 9, role: "admin", tenantId: 99, email: "o@o" }, tenantId: 99 } as any);
      await expect(other.approveVersion({ versionId: v2 })).rejects.toThrow(/이 회사의/);
      expect(String((await q(`SELECT approval_status AS s FROM h_mf_report_versions WHERE id = ?`, [v2]))[0].s)).toBe("PENDING");
    });

    it("1배치 기준량 — 생산 제품 번호 → 품목 정체성 연결로 생산 버전, 생산 건 기록지 저장값이 있으면 그것 먼저, 없으면 '없음'", async () => {
      await mf.create(base({ batchTargetKg: 10 }));
      const { ccpFormRouter } = await import("./routers/haccp/ccpForm.router");
      const cf = ccpFormRouter.createCaller({ user: { id: 4, role: "admin", tenantId: T, email: "t@t" }, tenantId: T } as any);
      // 생산 제품 8350 (BOM 은 정체성 8352 로 저장) — 숫자가 달라도 연결로 찾는다
      expect(await cf.getBomBatchKg({ productId: PV2 })).toMatchObject({ bomBatchKg: 10, source: "bom" });
      // 연결 없는 번호 → 없음 (조회 중으로 남지 않게)
      expect(await cf.getBomBatchKg({ productId: 8999 })).toMatchObject({ bomBatchKg: null, source: "none" });
      // 생산 건 기록지에 저장된 기준이 있으면 그것 (다시 계산하지 않음)
      await q(`DELETE FROM h_ccp_form_records WHERE batch_id = 88901`);
      await q(`DELETE FROM h_batches WHERE id = 88901`);
      await q(`INSERT INTO h_batches (id, tenant_id, site_id, batch_code, product_id, planned_quantity, planned_date, status, created_by) VALUES (88901, ?, 1, 'QA-BOMKG-1', ?, 20, '2026-10-20', 'planned', 4)`, [T, PV2]);
      await q(`INSERT INTO h_ccp_form_records (tenant_id, batch_id, ccp_type, work_date, bom_batch_kg, batch_count) VALUES (?, 88901, 'CCP-1B', '2026-10-20', 12, 2)`, [T]);
      expect(await cf.getBomBatchKg({ productId: PV2, batchId: 88901 })).toMatchObject({ bomBatchKg: 12, batchCount: 2, source: "record" });
      // 다른 회사 생산 건 번호 → 거부
      const other = ccpFormRouter.createCaller({ user: { id: 9, role: "admin", tenantId: 99, email: "o@o" }, tenantId: 99 } as any);
      await expect(other.getBomBatchKg({ productId: PV2, batchId: 88901 })).rejects.toThrow(/생산 건을 찾을 수 없습니다/);
    });

    it("번호 체계 2단계 — 생산 제품 번호는 FK 로만 BOM 을 찾는다 (같은 숫자의 다른 품목 BOM 을 고르지 않음)", async () => {
      const { selectBomVersion, asProductionProductId, bomProductV2IdExpr } = await import("./lib/identity/itemIdentityService");
      const linked = await mf.create(base());
      // 숫자 우연 일치: 생산 제품 8360 (연결 없음) 과 같은 숫자의 정체성 제품 8360 은 '다른 제품' 이고 BOM 이 있다
      await q(`DELETE FROM item_master WHERE id = 8360`);
      await q(`INSERT INTO item_master (id, tenant_id, item_code, item_name, item_type, is_active) VALUES (8360, ?, 'OTHER', '다른 제품', 'own_product', 1)`, [T]);
      await mf.create(base({ productId: 8360 }));
      const pool = await (await import("./db/connection")).getRawConnection();
      expect(await selectBomVersion(asProductionProductId(8360), T, pool)).toBeNull(); // 이전: 다른 제품 BOM 을 골랐다
      const sel = await selectBomVersion(asProductionProductId(PV2), T, pool);
      // 연결된 정체성 제품(IM_P)의 BOM 을 고른다 (같은 블록 앞 시험들이 만든 IM_P 보고서 중 하나일 수 있음)
      expect(Number((await q(`SELECT product_id FROM h_mf_reports WHERE id = ?`, [sel?.reportId]))[0].product_id)).toBe(IM_P);
      // 보고서 → 생산 제품 번호 SQL 도 FK 만: 연결 없는 정체성 제품 8360 의 보고서는 생산 제품 없음
      const [rows]: any = await pool.execute(`SELECT r.id, ${bomProductV2IdExpr("r")} AS pid FROM h_mf_reports r WHERE r.tenant_id = ? AND r.product_id IN (?, ?) ORDER BY r.id`, [T, IM_P, 8360]);
      const byRep = new Map((rows as any[]).map((r) => [Number(r.id), r.pid == null ? null : Number(r.pid)]));
      expect(byRep.get(linked.mfReportId)).toBe(PV2);
      expect(Array.from(byRep.values()).filter((v) => v == null).length).toBe(1);
    });

    it("번호 체계 2c — 투입 줄(재고 번호 칸): 재고 원료면 그대로, 옛 품목 번호는 FK 로만, 이름으로 잇지 않음, 연결 없음은 멈춤", async () => {
      const { inventoryMaterialIdOfStockLine, inventoryMaterialIdOfItem, asItemMasterId } = await import("./lib/identity/itemIdentityService");
      const pool = await (await import("./db/connection")).getRawConnection();
      await q(`DELETE FROM h_materials WHERE id IN (8372, 8373, 8374)`);
      await q(`DELETE FROM item_master WHERE id IN (8371, 8373, 8375)`);
      await q(`INSERT INTO h_materials (id, tenant_id, material_code, material_name) VALUES (8372, ?, 'N1', '이름같은원료'), (8373, ?, 'N2', '재고원료 8373'), (8374, ?, 'N3', '재고원료 8374')`, [T, T, T]);
      // 연결 없는 정체성 원료 8371 — 이름이 재고 원료 8372 와 같아도 잇지 않는다 → 연결 없음 (원래 숫자로 이어 가지 않음)
      await q(`INSERT INTO item_master (id, tenant_id, item_code, item_name, item_type, base_unit, is_active) VALUES (8371, ?, 'I1', '이름같은원료', 'raw_material', 'kg', 1)`, [T]);
      expect(await inventoryMaterialIdOfStockLine(8371, T, pool)).toMatchObject({ ok: false, reason: "unlinked" });
      expect(await inventoryMaterialIdOfItem(asItemMasterId(8371), T, pool)).toBeNull();
      // 같은 숫자 8373: 재고 원료 8373 이면서 정체성 원료 8373 은 재고 8374 에 연결 — 투입 줄은 재고 번호 칸이므로 재고 8373
      //   (이전: '신뢰 안 함' 으로 출고 확인을 막았다)
      await q(`INSERT INTO item_master (id, tenant_id, item_code, item_name, item_type, base_unit, is_active, legacy_material_id) VALUES (8373, ?, 'I2', '재고원료 8374', 'raw_material', 'kg', 1, 8374)`, [T]);
      expect(await inventoryMaterialIdOfStockLine(8373, T, pool)).toMatchObject({ ok: true, inventoryMaterialId: 8373 });
      // 옛 줄의 품목 번호(재고 원료로는 없는 숫자) → FK
      await q(`INSERT INTO item_master (id, tenant_id, item_code, item_name, item_type, base_unit, is_active, legacy_material_id) VALUES (8375, ?, 'I3', '재고원료 8374', 'raw_material', 'kg', 1, 8374)`, [T]);
      expect(await inventoryMaterialIdOfStockLine(8375, T, pool)).toMatchObject({ ok: true, inventoryMaterialId: 8374, itemMasterId: 8375 });
      // 다른 회사·없는 번호
      expect(await inventoryMaterialIdOfStockLine(8372, 99, pool)).toMatchObject({ ok: false, reason: "missing" });
      expect(await inventoryMaterialIdOfItem(asItemMasterId(8373), T, pool)).toBe(8374);
    });
  });

  describe("배치 완료 보고서 — 서버가 받아 같은 주소로 내려줌 · 검증 뒤에만 위치 교체 · 공식 기록지·실제 출고 LOT (2026-10-20 #621-622 재검증)", () => {
    // 서명은 로컬 계산 (네트워크·실제 자격 없음) — 시험용 버킷 이름·가짜 키. 저장소 응답은 fetch 흉내.
    const keep: Record<string, string | undefined> = {};
    const ENV = { AWS_S3_BUCKET: "qa-test-bucket", AWS_ACCESS_KEY_ID: "AKIAQATESTONLY", AWS_SECRET_ACCESS_KEY: "qa-test-secret" } as const;
    const PV = 8350, MAT = 88950, B_OK = 88902, B_OTHER_PATH = 88903, B_DATA = 88904;
    const OLD = "https://cdn.example.test/tenant-2/reports/batch-completion-report-QA-RPT-1-1.pdf";
    const ensureCol = async (table: string, col: string, ddl: string) => {
      const [c]: any = await admin.query(`SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`, [table, col]);
      if (!c.length) await admin.query(`ALTER TABLE ${table} ADD COLUMN ${col} ${ddl}`);
    };
    const caller = async (tenantId: number, role = "admin") => {
      const { batchCrudRouter } = await import("./routers/production/batch.crud.router");
      return (batchCrudRouter as any).createCaller({ user: { id: 4, role, tenantId, email: "t@t" }, tenantId } as any);
    };
    const urlOf = async (id: number) => (await q(`SELECT completion_report_url AS u FROM h_batches WHERE id = ?`, [id]))[0]?.u ?? null;
    const audits = async () => q(`SELECT action, JSON_UNQUOTE(JSON_EXTRACT(changes, '$.stage')) AS stage, tenant_id FROM audit_logs WHERE entity_type = 'batch' AND entity_id = ? ORDER BY id`, [B_OK]);

    beforeAll(async () => {
      for (const k of Object.keys(ENV) as (keyof typeof ENV)[]) { keep[k] = process.env[k]; process.env[k] = ENV[k]; }
      await ensureCol("h_ccp_form_records", "process_group_name", "varchar(100) NULL"); // 운영 표에는 있음 — 시험 DB 만 보충
    });
    afterAll(() => {
      for (const k of Object.keys(ENV)) { if (keep[k] == null) delete process.env[k]; else process.env[k] = keep[k]; }
    });
    beforeEach(async () => {
      await q(`DELETE FROM audit_logs WHERE entity_type = 'batch' AND entity_id IN (?, ?, ?)`, [B_OK, B_OTHER_PATH, B_DATA]);
      await q(`DELETE FROM h_ccp_form_rows WHERE form_record_id BETWEEN 88911 AND 88915`);
      await q(`DELETE FROM h_ccp_form_records WHERE id BETWEEN 88911 AND 88915`);
      await q(`DELETE FROM h_inventory_transactions WHERE reference_type = 'batch' AND reference_id = ?`, [B_DATA]);
      await q(`DELETE FROM h_inventory_lots WHERE id BETWEEN 88921 AND 88924`);
      await q(`DELETE FROM h_materials WHERE id = ?`, [MAT]);
      await q(`DELETE FROM h_batches WHERE id IN (?, ?, ?)`, [B_OK, B_OTHER_PATH, B_DATA]);
      await q(`INSERT INTO h_batches (id, tenant_id, site_id, batch_code, product_id, planned_quantity, planned_date, status, created_by, completion_report_url) VALUES
        (?, ?, 1, 'QA-RPT-1', ?, 20, '2026-10-20', 'completed', 4, ?),
        (?, ?, 1, 'QA-RPT-2', ?, 20, '2026-10-20', 'completed', 4, 'https://cdn.example.test/tenant-9/reports/x.pdf'),
        (?, ?, 1, 'QA-RPT-3', ?, 20, '2026-10-20', 'completed', 4, NULL)`, [B_OK, T, PV, OLD, B_OTHER_PATH, T, PV, B_DATA, T, PV]);
    });

    it("열기: 서버가 이 회사 경로 파일을 받아 PDF 로 넘김 — 브라우저는 저장소 주소를 받지 않는다", async () => {
      const { fetchBatchReport } = await import("./lib/production/batchReportFile");
      const pool = await (await import("./db/connection")).getRawConnection();
      const fetchSpy = vi.spyOn(globalThis, "fetch" as any).mockResolvedValue(new Response("%PDF-1.3 x", { status: 200, headers: { "content-length": "10" } }) as any);
      try {
        const r: any = await fetchBatchReport(pool, T, B_OK);
        expect(r.ok).toBe(true);
        expect(r.contentType).toBe("application/pdf");
        expect(r.fileName).toBe("batch-completion-report-QA-RPT-1.pdf");
        expect(await new Response(r.body).text()).toBe("%PDF-1.3 x");
        // 서버가 받은 주소 = 저장 위치에서 꺼낸 회사 경로 + 새 서명 (저장된 주소를 그대로 쓰지 않음)
        const asked = String(fetchSpy.mock.calls[0]?.[0]);
        expect(asked).toContain("tenant-2/reports/batch-completion-report-QA-RPT-1-1.pdf");
        expect(asked).toMatch(/X-Amz-Signature=/);
        // 저장소가 거부(403) → 오류 이유만 (거부 XML 을 넘기지 않음), 다시 만들기 안내
        fetchSpy.mockResolvedValue(new Response("<Error><Code>AccessDenied</Code></Error>", { status: 403 }) as any);
        const d: any = await fetchBatchReport(pool, T, B_OK);
        expect(d).toMatchObject({ ok: false, status: 502 });
        expect(d.reason).toMatch(/\(403\).*보고서 다시 만들기/);
        // 연결 실패
        fetchSpy.mockRejectedValue(Object.assign(new Error("x"), { name: "TypeError" }));
        expect(await fetchBatchReport(pool, T, B_OK)).toMatchObject({ ok: false, status: 502 });
        fetchSpy.mockClear();
        // 다른 회사 경로가 저장돼 있으면 받지 않음 / 보고서 없음 / 다른 회사 생산 건 — 저장소에 묻지도 않는다
        expect(await fetchBatchReport(pool, T, B_OTHER_PATH)).toMatchObject({ ok: false, status: 404 });
        expect(await fetchBatchReport(pool, T, B_DATA)).toMatchObject({ ok: false, status: 404 });
        expect(await fetchBatchReport(pool, 99, B_OK)).toMatchObject({ ok: false, status: 404, reason: "생산 건을 찾을 수 없습니다." });
        expect(fetchSpy).not.toHaveBeenCalled();
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it("다시 만들기: 새 파일이 서버에서 읽힐 때만 위치 교체 — 실패하면 기존 위치 그대로, 성공·실패 이력 따로", async () => {
      const NEW = "https://cdn.example.test/tenant-2/reports/batch-completion-report-QA-RPT-1-2.pdf";
      let gen: (batchId: number, tenantId?: number) => Promise<string> = async () => NEW;
      vi.doMock("./reports/batchCompletionReport", async (orig) => ({ ...(await orig<any>()), generateBatchCompletionReport: (b: number, t?: number) => gen(b, t) }));
      const fetchSpy = vi.spyOn(globalThis, "fetch" as any).mockResolvedValue(new Response("%", { status: 206 }) as any);
      try {
        const b = await caller(T);
        // 관리자만
        await expect((await caller(T, "worker")).regenerateCompletionReport({ batchId: B_OK })).rejects.toThrow(/관리자/);
        // ① 만들기 실패 → 위치 그대로 + 실패 이력(generate)
        gen = async () => { throw new Error("한글 폰트 파일 없음"); };
        await expect(b.regenerateCompletionReport({ batchId: B_OK })).rejects.toThrow(/보고서를 만들지 못했습니다/);
        expect(await urlOf(B_OK)).toBe(OLD);
        // ② 올렸지만 서버도 못 읽음(403) → 위치 그대로 + 실패 이력(verify)
        gen = async () => NEW;
        fetchSpy.mockResolvedValue(new Response("denied", { status: 403 }) as any);
        await expect(b.regenerateCompletionReport({ batchId: B_OK })).rejects.toThrow(/기존 보고서 위치는 그대로/);
        expect(await urlOf(B_OK)).toBe(OLD);
        // ③ 그 사이 다른 사람이 바꿈 → 덮어쓰지 않음 (CONFLICT) + 실패 이력(swap)
        fetchSpy.mockResolvedValue(new Response("%", { status: 206 }) as any);
        const OTHER = "https://cdn.example.test/tenant-2/reports/batch-completion-report-QA-RPT-1-9.pdf";
        gen = async () => { await q(`UPDATE h_batches SET completion_report_url = ? WHERE id = ?`, [OTHER, B_OK]); return NEW; };
        await expect(b.regenerateCompletionReport({ batchId: B_OK })).rejects.toThrow(/그 사이 다른 사람이/);
        expect(await urlOf(B_OK)).toBe(OTHER);
        // ④ 읽힘 확인 → 교체, 성공 이력. 화면은 같은 주소(/api/batch-report/...)로 연다
        gen = async () => NEW;
        expect(await b.regenerateCompletionReport({ batchId: B_OK })).toEqual({ ok: true, openPath: `/api/batch-report/download/${B_OK}` });
        expect(await urlOf(B_OK)).toBe(NEW);
        const a = await audits();
        expect(a.map((x: any) => [x.action, x.stage])).toEqual([
          ["batch.completion_report.regenerate_failed", "generate"],
          ["batch.completion_report.regenerate_failed", "verify"],
          ["batch.completion_report.regenerate_failed", "swap"],
          ["batch.completion_report.regenerate", null],
        ]);
        expect(a.every((x: any) => Number(x.tenant_id) === T)).toBe(true);
        // 다른 회사는 이 생산 건을 다시 만들 수 없음
        await expect((await caller(99)).regenerateCompletionReport({ batchId: B_OK })).rejects.toThrow(/생산 건을 찾을 수 없습니다/);
      } finally {
        fetchSpy.mockRestore();
        vi.doUnmock("./reports/batchCompletionReport");
      }
    });

    it("보고서 내용: 공식 기록지 행(가열=이 생산 건, 금속검출=이 생산 건 행만, 무효·다른 회사 제외) · 실제 출고 LOT(사용−반환) · 완제품 LOT · 한글 글꼴", async () => {
      await q(`INSERT INTO h_materials (id, tenant_id, material_code, material_name, unit) VALUES (?, ?, 'QA-RPT-M', '시험용 찹쌀', 'kg')`, [MAT, T]);
      await q(`INSERT INTO h_ccp_form_records (id, tenant_id, batch_id, ccp_type, work_date, status, process_group_name, voided_at) VALUES
        (88911, ?, ?, 'CCP-1B', '2026-10-20', 'approved', '증숙', NULL),
        (88912, ?, NULL, 'CCP-4P', '2026-10-20', 'approved', NULL, NULL),
        (88913, ?, ?, 'CCP-1B', '2026-10-20', 'draft', NULL, NOW()),
        (88914, 9, ?, 'CCP-1B', '2026-10-20', 'approved', NULL, NULL)`, [T, B_DATA, T, T, B_DATA, B_DATA]);
      await q(`INSERT INTO h_ccp_form_rows (form_record_id, tenant_id, batch_id, is_deviation, row_version, row_confirmed_version, row_confirmed_at) VALUES
        (88911, ?, ?, 0, 1, 1, NOW()), (88911, ?, ?, 0, 2, 2, NOW()),
        (88912, ?, ?, 0, 1, 1, NOW()), (88912, ?, ?, 1, 1, 1, NOW()), (88912, ?, ?, 0, 1, NULL, NULL),
        (88912, ?, 99999, 0, 1, 1, NOW()), (88912, ?, 99999, 0, 1, 1, NOW()),
        (88913, ?, ?, 0, 1, 1, NOW()), (88914, 9, ?, 0, 1, 1, NOW())`,
        [T, B_DATA, T, B_DATA, T, B_DATA, T, B_DATA, T, B_DATA, T, T, T, B_DATA, B_DATA]);
      await q(`INSERT INTO h_inventory_lots (id, tenant_id, lot_number, material_id, product_id, batch_id, quantity, available_quantity, unit) VALUES
        (88921, ?, 'QA-LOT-A', ?, NULL, NULL, 10, 10, 'kg'), (88922, ?, 'QA-LOT-B', ?, NULL, NULL, 10, 10, 'kg'),
        (88923, ?, 'QA-FG-1', NULL, ?, ?, 18, 18, 'kg')`, [T, MAT, T, MAT, T, PV, B_DATA]);
      await q(`INSERT INTO h_inventory_transactions (tenant_id, material_id, lot_id, transaction_type, quantity, unit, reference_type, reference_id, created_by) VALUES
        (?, ?, 88921, 'usage', -5, 'kg', 'batch', ?, 4), (?, ?, 88921, 'return', 1, 'kg', 'batch', ?, 4),
        (?, ?, 88922, 'usage', -2, 'kg', 'batch', ?, 4), (9, ?, 88922, 'usage', -7, 'kg', 'batch', ?, 4)`,
        [T, MAT, B_DATA, T, MAT, B_DATA, T, MAT, B_DATA, MAT, B_DATA]);
      const { loadBatchReportData, renderBatchReportPdf } = await import("./reports/batchCompletionReport");
      const d = await loadBatchReportData(B_DATA, T);
      expect(d.ccp).toEqual([
        { ccpType: "CCP-1B", processName: "증숙", status: "approved", rows: 2, confirmedRows: 2, deviations: 0 },
        { ccpType: "CCP-4P", processName: null, status: "approved", rows: 3, confirmedRows: 2, deviations: 1 },
      ]);
      expect(d.materials).toEqual([
        { materialName: "시험용 찹쌀", lotNumber: "QA-LOT-A", qty: 4, unit: "kg" },
        { materialName: "시험용 찹쌀", lotNumber: "QA-LOT-B", qty: 2, unit: "kg" },
      ]);
      expect(d.productLots.map((l) => l.lotNumber)).toEqual(["QA-FG-1"]);
      await expect(loadBatchReportData(B_DATA, 99)).rejects.toThrow(/찾을 수 없습니다/);
      const pdf = await renderBatchReportPdf(d);
      expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
      expect(pdf.toString("latin1")).toMatch(/NanumGothic/); // 한글 글꼴이 실제로 들어감 (기본 Helvetica 아님)
      expect(pdf.toString("latin1")).not.toMatch(/\/BaseFont \/Helvetica/);
    });
  });

  describe("번호 체계 2b — 입고·조정·실사·차감 제외·포장 단위·발주 반복 추천: 번호 종류를 밝혀 받고, 섞인 옛 칸은 두 해석이 같을 때만 (2026-10-20 Codex 점검)", () => {
    // 가상: 품목 88600 = 쌀A (FK → 재고 88650). 재고 88600 = 다른 원료 설탕B (숫자 우연 일치). 품목·재고 88651 = 소금C (같은 숫자, 같은 원료).
    //       품목 88660 = 연결 없음. 재고 88670 = 다른 회사.
    const RICE_IM = 88600, RICE_INV = 88650, SUGAR_INV = 88600, SALT = 88651, UNLINKED_IM = 88660, OTHER_INV = 88670, PARTNER = 88690;
    const caller = async (path: string, name: string) => {
      const mod: any = await import(path);
      return mod[name].createCaller({ user: { id: 4, role: "admin", tenantId: T, email: "t@t" }, tenantId: T } as any);
    };
    const lotsOf = async (mid: number) => q(`SELECT id, lot_number, available_quantity + 0 AS a, unit FROM h_inventory_lots WHERE tenant_id = ? AND material_id = ? ORDER BY id`, [T, mid]);
    beforeEach(async () => {
      await q(`DELETE FROM material_pack_units WHERE material_id IN (?, ?, ?, ?)`, [RICE_INV, SUGAR_INV, SALT, OTHER_INV]);
      await q(`DELETE FROM purchase_order_lines WHERE po_id IN (SELECT id FROM (SELECT id FROM purchase_orders WHERE partner_id = ?) x)`, [PARTNER]);
      await q(`DELETE FROM purchase_orders WHERE partner_id = ?`, [PARTNER]);
      await q(`DELETE FROM accounting_purchases WHERE partner_id = ?`, [PARTNER]);
      await q(`DELETE FROM h_materials WHERE id IN (?, ?, ?, ?)`, [SUGAR_INV, RICE_INV, SALT, OTHER_INV]);
      await q(`INSERT INTO h_materials (id, tenant_id, material_code, material_name, unit, is_active) VALUES
        (?, ?, 'QA2B-SUGAR', '설탕B', 'kg', 1), (?, ?, 'QA2B-RICE', '쌀A', 'kg', 1), (?, ?, 'QA2B-SALT', '소금C', 'kg', 1), (?, 9, 'QA2B-OTHER', '남의 원료', 'kg', 1)`,
        [SUGAR_INV, T, RICE_INV, T, SALT, T, OTHER_INV]);
      await q(`INSERT INTO item_master (id, tenant_id, item_code, item_name, item_type, base_unit, legacy_material_id, is_active) VALUES
        (?, ?, 'QA2B-RICE', '쌀A', 'raw_material', 'kg', ?, 1), (?, ?, 'QA2B-SALT', '소금C', 'raw_material', 'kg', ?, 1), (?, ?, 'QA2B-NONE', '연결 없음', 'raw_material', 'kg', NULL, 1)`,
        [RICE_IM, T, RICE_INV, SALT, T, SALT, UNLINKED_IM, T]);
      await q(`INSERT IGNORE INTO partners (id, tenant_id, company_name) VALUES (?, ?, '2b 시험 거래처')`, [PARTNER, T]).catch(async () =>
        q(`INSERT IGNORE INTO partners (id, tenant_id, company_name, partner_type) VALUES (?, ?, '2b 시험 거래처', 'supplier')`, [PARTNER, T]));
    });

    it("변환: 품목 번호는 FK 로만 · 재고 번호는 그대로 · 섞인 옛 칸은 두 해석이 같을 때만 · 연결 없음/다른 회사 거부", async () => {
      const id = await import("./lib/identity/itemIdentityService");
      const pool = await (await import("./db/connection")).getRawConnection();
      expect(Number(await id.inventoryMaterialIdOfRef({ kind: "item", id: RICE_IM as any }, T, pool))).toBe(RICE_INV);
      expect(Number(await id.inventoryMaterialIdOfRef({ kind: "inventory", id: SUGAR_INV as any }, T, pool))).toBe(SUGAR_INV);
      await expect(id.inventoryMaterialIdOfRef({ kind: "item", id: UNLINKED_IM as any }, T, pool)).rejects.toThrow(/연결되지 않았습니다/);
      await expect(id.inventoryMaterialIdOfRef({ kind: "inventory", id: OTHER_INV as any }, T, pool)).rejects.toThrow(/찾을 수 없습니다/);
      expect(() => id.materialRefOf({ itemMasterId: 1, inventoryMaterialId: 2 })).toThrow(/하나만/);
      expect(() => id.materialRefOf({})).toThrow(/하나만/);
      // 섞인 옛 칸
      expect(await id.inventoryMaterialIdOfStoredMixed(RICE_IM, T, pool)).toMatchObject({ ok: false, reason: "ambiguous" }); // 품목 쌀A vs 재고 설탕B
      expect(await id.inventoryMaterialIdOfStoredMixed(RICE_INV, T, pool)).toMatchObject({ ok: true, inventoryMaterialId: RICE_INV, itemMasterId: RICE_IM });
      expect(await id.inventoryMaterialIdOfStoredMixed(SALT, T, pool)).toMatchObject({ ok: true, inventoryMaterialId: SALT, itemMasterId: SALT });
      expect(await id.inventoryMaterialIdOfStoredMixed(UNLINKED_IM, T, pool)).toMatchObject({ ok: false, reason: "unlinked" });
      expect(await id.inventoryMaterialIdOfStoredMixed(OTHER_INV, T, pool)).toMatchObject({ ok: false, reason: "missing" });
      // 발주 줄에 쓸 숫자: 겹치면 FK 재고 번호(다시 읽어도 쌀A), 안 겹치면 품목 번호
      expect(await id.storableMaterialNumberOfItem(RICE_IM as any, T, pool)).toBe(RICE_INV);
      expect(await id.storableMaterialNumberOfItem(SALT as any, T, pool)).toBe(SALT);
      expect(await id.storableMaterialNumberOfItem(UNLINKED_IM as any, T, pool)).toBe(UNLINKED_IM);
    });

    it("입고(화면 품목 번호) → 쌀A 재고로 · 조정 → 쌀A LOT 만 · 연결 없음은 쓰기 전에 거부 · 실사(재고 번호) → 설탕B 그대로", async () => {
      const inv = await caller("./routers/inventory/inventory.router", "inventoryRouter");
      await inv.receiveMaterial({ itemMasterId: RICE_IM, quantity: 10, unit: "kg", receiptDate: "2026-10-17", idempotencyKey: "qa2b-rice-1" });
      await inv.receiveMaterial({ inventoryMaterialId: SUGAR_INV, quantity: 5, unit: "kg", receiptDate: "2026-10-17", idempotencyKey: "qa2b-sugar-1" });
      expect((await lotsOf(RICE_INV)).map((l: any) => Number(l.a))).toEqual([10]);
      expect((await lotsOf(SUGAR_INV)).map((l: any) => Number(l.a))).toEqual([5]); // 이전: 품목 88600 입고가 설탕B 로 갔다
      const headers = async () => Number((await q(`SELECT COUNT(*) AS n FROM h_inbound_headers WHERE tenant_id = ?`, [T]))[0].n);
      const h0 = await headers();
      await expect(inv.receiveMaterial({ itemMasterId: UNLINKED_IM, quantity: 1, unit: "kg", receiptDate: "2026-10-17", idempotencyKey: "qa2b-none-1" })).rejects.toThrow(/연결되지 않았습니다/);
      expect(await headers()).toBe(h0); // 입고 문서도 만들지 않음
      // 조정: 화면이 고른 품목 쌀A → 쌀A LOT 만
      await inv.adjustStockByProduct({ itemMasterId: RICE_IM, quantityChange: -2, reason: "파손" });
      expect((await lotsOf(RICE_INV)).map((l: any) => Number(l.a))).toEqual([8]);
      expect((await lotsOf(SUGAR_INV)).map((l: any) => Number(l.a))).toEqual([5]);
      await expect(inv.adjustStockByProduct({ itemMasterId: UNLINKED_IM, quantityChange: -1, reason: "x" })).rejects.toThrow(/연결되지 않았습니다/);
      await expect(inv.adjustStockByProduct({ itemMasterId: RICE_IM, inventoryMaterialId: RICE_INV, quantityChange: -1, reason: "x" } as any)).rejects.toThrow();
      // 실사: 실사 목록 번호(재고 88600 = 설탕B) → 설탕B 만 (품목 88600=쌀A 로 바꾸지 않음)
      const r = await inv.bulkApplyInventoryCount({ items: [{ materialId: SUGAR_INV, actualQty: 3 }], defaultReason: "정기 실사" });
      expect(r.results?.[0] ?? r).toBeTruthy();
      expect((await lotsOf(SUGAR_INV)).map((l: any) => Number(l.a))).toEqual([3]);
      expect((await lotsOf(RICE_INV)).map((l: any) => Number(l.a))).toEqual([8]);
      // LOT 조회(FEFO·생산 건 원료 추가)도 품목 번호 → 쌀A LOT, 연결 없음 → 빈 목록
      expect((await inv.getLotsByMaterialFefo({ itemMasterId: RICE_IM })).map((l: any) => Number(l.materialId))).toEqual([RICE_INV]);
      expect((await inv.getLotsByMaterialId({ itemMasterId: RICE_IM })).map((l: any) => Number(l.materialId))).toEqual([RICE_INV]);
      expect(await inv.getLotsByMaterialFefo({ itemMasterId: UNLINKED_IM })).toEqual([]);
    });

    it("차감 제외: 추가(품목 번호)·해제(목록의 재고 번호)가 같은 원료로 왕복 · 포장 단위: 쌀A 에 저장, 설탕B 의 기존 배율은 그대로", async () => {
      const ib = await caller("./routers/inventory/inbound.router", "inboundRouter");
      const exempt = async (id: number) => Number((await q(`SELECT stock_exempt AS e FROM h_materials WHERE id = ?`, [id]))[0].e ?? 0);
      await ib.setStockExempt({ itemMasterId: RICE_IM, exempt: true });
      expect([await exempt(RICE_INV), await exempt(SUGAR_INV)]).toEqual([1, 0]);
      const list = await ib.stockExemptMaterials();
      const row = (list as any[]).find((x) => x.materialName === "쌀A");
      expect(row.materialId).toBe(RICE_INV);
      await ib.setStockExempt({ inventoryMaterialId: row.materialId, exempt: false });
      expect([await exempt(RICE_INV), await exempt(SUGAR_INV)]).toEqual([0, 0]);
      // 포장 단위
      const pu = await import("./lib/inventory/inbound/packUnits");
      await pu.upsertPackUnit(admin, { tenantId: T, userId: 4, materialId: SUGAR_INV, packUnit: "bag", baseQty: 50 });
      await ib.savePackUnit({ itemMasterId: RICE_IM, packUnit: "bag", baseQty: 20 });
      const packs = async (mid: number) => (await q(`SELECT base_qty + 0 AS b FROM material_pack_units WHERE tenant_id = ? AND material_id = ? AND pack_unit = 'bag' AND is_active = 1`, [T, mid])).map((r: any) => Number(r.b));
      expect(await packs(RICE_INV)).toEqual([20]);
      expect(await packs(SUGAR_INV)).toEqual([50]); // 이전: 50 → 20 으로 덮였다
      await expect(ib.savePackUnit({ itemMasterId: UNLINKED_IM, packUnit: "bag", baseQty: 10 })).rejects.toThrow(/연결되지 않았습니다/);
    });

    it("발주: 품목 번호로 만들고(겹치면 FK 재고 번호로 저장) 같은 원료로 입고·환산 · 수정 때 안 바꾼 줄은 저장 번호 그대로 · 모호한 옛 줄은 입고 전에 거부", async () => {
      const po = await caller("./routers/accounting/purchaseOrder.router", "purchaseOrderRouter");
      const pu = await import("./lib/inventory/inbound/packUnits");
      await pu.upsertPackUnit(admin, { tenantId: T, userId: 4, materialId: RICE_INV, packUnit: "bag", baseQty: 20 });
      await pu.upsertPackUnit(admin, { tenantId: T, userId: 4, materialId: SUGAR_INV, packUnit: "bag", baseQty: 50 });
      const made = await po.create({ partnerId: PARTNER, orderDate: "2026-10-20", lines: [
        { itemMasterId: RICE_IM, itemName: "쌀A", orderedQty: 2, unit: "bag", unitPrice: 20000 },
        { itemMasterId: SALT, itemName: "소금C", orderedQty: 1, unit: "kg", unitPrice: 500 },
      ] });
      const stored = await q(`SELECT id, material_id FROM purchase_order_lines WHERE po_id = ? ORDER BY line_number`, [made.id]);
      expect(stored.map((r: any) => Number(r.material_id))).toEqual([RICE_INV, SALT]);
      const detail = await po.getById({ id: made.id });
      expect(detail.lines.map((l: any) => l.itemMasterId)).toEqual([RICE_IM, SALT]); // 화면은 품목 번호로
      // 수정: 첫 줄은 안 바꿈(저장 번호 그대로), 둘째 줄은 쌀A 로 새로 고름
      await po.update({ id: made.id, lines: [
        { sameMaterialAsLineId: Number(stored[0].id), itemName: "쌀A", orderedQty: 2, unit: "bag", unitPrice: 20000 },
        { itemMasterId: RICE_IM, itemName: "쌀A", orderedQty: 10, unit: "kg", unitPrice: 1000 },
      ] });
      const after = await q(`SELECT id, material_id FROM purchase_order_lines WHERE po_id = ? ORDER BY line_number`, [made.id]);
      expect(after.map((r: any) => Number(r.material_id))).toEqual([RICE_INV, RICE_INV]);
      await expect(po.update({ id: made.id, lines: [{ sameMaterialAsLineId: 1, itemName: "x", orderedQty: 1, unit: "kg", unitPrice: 1 }] })).rejects.toThrow(/기존 줄이 아닙니다/);
      // 입고: 환산·저장 원료 모두 쌀A
      await q(`UPDATE purchase_orders SET status = 'approved' WHERE id = ?`, [made.id]); // 시험 준비 (승인 흐름은 별도 시험)
      const recv = await po.receivableLines({ poId: made.id });
      expect(recv.map((r: any) => [r.inventoryMaterialId, r.conversion?.factor ?? null])).toEqual([[RICE_INV, 20], [RICE_INV, 1]]);
      await po.receive({ poId: made.id, receiptDate: "2026-10-20", idempotencyKey: "qa2b-po-recv-1", lines: [{ lineId: Number(after[0].id), receivedQty: 2 }] });
      expect((await lotsOf(RICE_INV)).map((l: any) => Number(l.a))).toEqual([40]);
      expect(await lotsOf(SUGAR_INV)).toEqual([]);
      // 모호한 옛 줄 (저장 번호 88600 = 품목 쌀A / 재고 설탕B) → 입고·포장 저장 전에 거부, 아무것도 만들지 않음
      const [h]: any = await admin.query(`INSERT INTO purchase_orders (tenant_id, po_number, partner_id, order_date, status, created_by) VALUES (?, 'QA2B-OLD', ?, '2026-10-01', 'approved', 4)`, [T, PARTNER]);
      const [ol]: any = await admin.query(`INSERT INTO purchase_order_lines (tenant_id, po_id, line_number, material_id, item_name, ordered_qty, unit, unit_price, amount) VALUES (?, ?, 1, ?, '쌀A(옛 줄)', 1, 'bag', 20000, 20000)`, [T, h.insertId, RICE_IM]);
      const oldRecv = await po.receivableLines({ poId: h.insertId });
      expect(oldRecv[0]).toMatchObject({ inventoryMaterialId: null });
      expect(String(oldRecv[0].conversionError)).toMatch(/서로 다른 원료/);
      const lots0 = (await q(`SELECT COUNT(*) AS n FROM h_inventory_lots WHERE tenant_id = ?`, [T]))[0].n;
      await expect(po.receive({ poId: h.insertId, receiptDate: "2026-10-20", idempotencyKey: "qa2b-po-old-1", lines: [{ lineId: ol.insertId, receivedQty: 1 }] })).rejects.toThrow(/서로 다른 원료/);
      expect((await q(`SELECT COUNT(*) AS n FROM h_inventory_lots WHERE tenant_id = ?`, [T]))[0].n).toBe(lots0);
      expect(Number((await q(`SELECT material_id FROM purchase_order_lines WHERE id = ?`, [ol.insertId]))[0].material_id)).toBe(RICE_IM); // 옛 줄 번호를 고치지 않음
    });

    it("반복 추천: 출처·번호 종류를 FK 로 하나의 품목으로 묶고, 구매 단위별로 나누며, 단가는 건수 가중 평균 · 모호한 이력은 합치지 않음", async () => {
      const po = await caller("./routers/accounting/purchaseOrder.router", "purchaseOrderRouter");
      const [p1]: any = await admin.query(`INSERT INTO purchase_orders (tenant_id, po_number, partner_id, order_date, status, created_by) VALUES (?, 'QA2B-H1', ?, '2026-10-01', 'received', 4)`, [T, PARTNER]);
      // 발주 이력: 쌀A — 새 줄(품목 번호를 안전한 재고 번호로 저장) kg 1건
      await admin.query(`INSERT INTO purchase_order_lines (tenant_id, po_id, line_number, material_id, item_name, ordered_qty, unit, unit_price, amount) VALUES (?, ?, 1, ?, '쌀A', 40, 'kg', 1000, 40000)`, [T, p1.insertId, RICE_INV]);
      // 매입 이력: 쌀A kg 3건(단가 2000) · 쌀A bag 1건 · 설탕B(재고 88600, 품목 88600 쌀A 와 숫자만 같음 → 모호) 1건
      const ap = (mid: number, name: string, qty: number, unit: string, price: number) => admin.query(
        `INSERT INTO accounting_purchases (tenant_id, transaction_date, partner_id, item_name, material_id, quantity, unit, unit_price, total_amount, status, created_by) VALUES (?, '2026-10-05', ?, ?, ?, ?, ?, ?, ?, 'approved', 4)`,
        [T, PARTNER, name, mid, qty, unit, price, qty * price]);
      for (let i = 0; i < 3; i++) await ap(RICE_INV, "쌀A", 40, "kg", 2000);
      await ap(RICE_INV, "쌀A", 2, "bag", 20000);
      await ap(SUGAR_INV, "설탕B", 1, "kg", 900);
      const s = await po.suggestRepeatItems({ partnerId: PARTNER, limit: 20 });
      const pick = (im: number | null, unit: string) => (s as any[]).filter((x) => x.itemMasterId === im && String(x.unit).toLowerCase() === unit);
      const riceKg = pick(RICE_IM, "kg"), riceBag = pick(RICE_IM, "bag");
      expect(riceKg).toHaveLength(1);
      expect(riceKg[0]).toMatchObject({ itemName: "쌀A", purchaseCount: 4, avgPrice: 1750 }); // (1000×1 + 2000×3)/4 — 단순 평균(1500) 아님
      expect(riceBag).toHaveLength(1);
      expect(riceBag[0]).toMatchObject({ purchaseCount: 1, avgPrice: 20000, unit: "bag" }); // kg 과 합치지 않음
      const sugar = (s as any[]).filter((x) => x.itemName === "설탕B");
      expect(sugar).toHaveLength(1);
      expect(sugar[0]).toMatchObject({ itemMasterId: null, linked: false }); // 쌀A 추천에 섞이지 않음
      expect(String(sugar[0].materialProblem)).toMatch(/서로 다른 원료/);
    });

    it("2d 조회 화면: 재고 추이·단가 이력·원가 절감·발주 제안 이력 — 품목 번호는 FK 로 쌀A, 연결 없음은 빈 결과 (다른 원료 자료 안 보임)", async () => {
      const inv = await caller("./routers/inventory/inventory.router", "inventoryRouter");
      await inv.receiveMaterial({ itemMasterId: RICE_IM, quantity: 7, unit: "kg", receiptDate: "2026-10-17", idempotencyKey: "qa2d-rice-1" });
      await inv.receiveMaterial({ inventoryMaterialId: SUGAR_INV, quantity: 3, unit: "kg", receiptDate: "2026-10-17", idempotencyKey: "qa2d-sugar-1" });
      const dash = (await import("./routers/dashboard/dashboard.router")).dashboardRouter.createCaller({ user: { id: 4, role: "admin", tenantId: T, siteId: 1, email: "t@t" }, tenantId: T } as any);
      const trend = async (input: any) => ((await dash.getInventoryTrendData({ startDate: "2026-10-01", endDate: "2026-10-31", ...input })) as any).inventoryTrend.reduce((s: number, r: any) => s + Number(r.receiptQuantity ?? 0), 0);
      expect(await trend({ itemMasterId: RICE_IM })).toBe(7); // 이전: 품목 88600 을 재고 번호로 읽어 설탕B(3)
      expect(await trend({ inventoryMaterialId: SUGAR_INV })).toBe(3);
      expect(((await dash.getInventoryTrendData({ startDate: "2026-10-01", endDate: "2026-10-31", itemMasterId: UNLINKED_IM })) as any).inventoryTrend).toEqual([]);
      // 단가 이력 — 공식 이력 표, 쌀A 것만
      await q(`DELETE FROM h_material_price_history WHERE material_id IN (?, ?)`, [RICE_INV, SUGAR_INV]);
      await q(`INSERT INTO h_material_price_history (tenant_id, material_id, old_price, new_price, reason) VALUES (?, ?, NULL, 1000, '쌀'), (?, ?, NULL, 900, '설탕')`, [T, RICE_INV, T, SUGAR_INV]);
      const mat = await caller("./routers/master/material.router", "materialRouter");
      const ph = await mat.getPriceHistory({ itemMasterId: RICE_IM });
      expect(ph.map((r: any) => [r.newPrice, r.price, r.reason])).toEqual([[1000, 1000, "쌀"]]);
      expect(await mat.getPriceHistory({ itemMasterId: UNLINKED_IM })).toEqual([]);
      // 원가 절감 — 쌀A 를 분석 (함수 인자 순서도 바로잡음: 회사, 원료)
      const cs = await caller("./routers/production/costSavingAI.router", "costSavingAIRouter");
      const tr: any = await cs.analyzePriceTrend({ itemMasterId: RICE_IM, startDate: "2026-01-01", endDate: "2026-12-31" });
      expect(tr.materialName ?? tr.material?.materialName).toBe("쌀A");
      await expect(cs.recommendPurchaseTiming({ itemMasterId: UNLINKED_IM })).rejects.toThrow(/연결되지 않았습니다/);
      // 발주 제안 이력 — 연결 없는 품목은 빈 목록
      expect(await inv.getPurchaseProposalHistory({ itemMasterId: UNLINKED_IM })).toEqual([]);
    });

    it("2d 매입 전표: 수정은 새로 고른 품목만(같은 원료로 읽히는 번호로 저장) · 확정은 이름으로 원료를 찾지 않고 · 모호한 번호는 확정 전에 멈춤", async () => {
      const hiR = await caller("./routers/haccp/haccpIntegration.router", "haccpIntegrationRouter");
      const mk = async (id: number, mid: number | null, name: string) => q(
        `INSERT INTO accounting_purchases (id, tenant_id, transaction_date, partner_id, item_name, material_id, quantity, unit, unit_price, total_amount, tax_amount, tax_rate, status, created_by)
         VALUES (?, ?, '2026-10-12', ?, ?, ?, 10, 'kg', 1000, 10000, 0, 0, 'pending', 4)`, [id, T, PARTNER, name, mid]);
      await q(`DELETE FROM accounting_purchases WHERE id IN (88681, 88682, 88683)`);
      await mk(88681, null, "쌀A");
      // 수정 화면: 저장 번호 없음 → 표시 없음 / 쌀A 를 새로 고름 → 다시 읽어도 쌀A 인 재고 번호로 저장
      expect(await hiR.purchaseMaterialItem({ id: 88681 })).toEqual({ itemMasterId: null, problem: null });
      await hiR.updatePurchase({ id: 88681, itemMasterId: RICE_IM });
      expect(Number((await q(`SELECT material_id FROM accounting_purchases WHERE id = 88681`))[0].material_id)).toBe(RICE_INV);
      expect(await hiR.purchaseMaterialItem({ id: 88681 })).toEqual({ itemMasterId: RICE_IM, problem: null });
      // 원료를 안 고른 수정(메모만)은 원료 그대로
      await hiR.updatePurchase({ id: 88681, notes: "메모" });
      expect(Number((await q(`SELECT material_id FROM accounting_purchases WHERE id = 88681`))[0].material_id)).toBe(RICE_INV);
      // 확정: 번호 없는 전표 — 이름이 같아도 원료를 찾지 않는다 (LOT 없음, 분개만)
      const { postPurchase } = await import("./lib/accounting/purchasePost");
      await mk(88682, null, "쌀A");
      await postPurchase(88682, 4, T);
      expect(await lotsOf(RICE_INV)).toEqual([]);
      // 모호한 번호(품목 쌀A / 재고 설탕B) → 확정 전에 멈춤, LOT 도 분개도 없음
      await mk(88683, RICE_IM, "쌀A");
      await expect(postPurchase(88683, 4, T)).rejects.toThrow(/서로 다른 원료/);
      expect(await lotsOf(SUGAR_INV)).toEqual([]);
      expect((await q(`SELECT status FROM accounting_purchases WHERE id = 88683`))[0].status).toBe("pending");
      await q(`DELETE FROM accounting_purchases WHERE id IN (88681, 88682, 88683)`);
    });

    it("2d 중간재 구성: 품목 선택창 번호 → 재고 원료 번호로 저장 (읽는 쪽이 재고 원료로 이어 '미매칭'·다른 원료로 보이지 않게) · 연결 없음 거부", async () => {
      await q(`CREATE TABLE IF NOT EXISTS h_mixed_material_components (id bigint NOT NULL AUTO_INCREMENT PRIMARY KEY, tenant_id int NOT NULL, intermediate_material_id bigint NOT NULL,
        component_material_id bigint NOT NULL, ratio_percent decimal(5,2) NULL, grams_per_kg decimal(10,2) NULL, note text NULL, created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
      await q(`DELETE FROM h_mixed_material_components WHERE intermediate_material_id = ?`, [SALT]);
      const im = await caller("./routers/master/intermediate.router", "intermediateRouter");
      await im.componentAdd({ intermediateId: SALT, itemMasterId: RICE_IM, ratioPercent: 50 });
      expect((await q(`SELECT component_material_id AS c FROM h_mixed_material_components WHERE intermediate_material_id = ?`, [SALT])).map((r: any) => Number(r.c))).toEqual([RICE_INV]); // 이전: 88600(설탕B 재고 번호)
      await expect(im.componentAdd({ intermediateId: SALT, itemMasterId: UNLINKED_IM })).rejects.toThrow(/연결되지 않았습니다/);
      await expect(im.componentAdd({ intermediateId: OTHER_INV, itemMasterId: RICE_IM })).rejects.toThrow(/혼합재제를 찾을 수 없습니다/);
      await q(`DELETE FROM h_mixed_material_components WHERE intermediate_material_id = ?`, [SALT]);
    });
  });

  describe("LOT ↔ 재고 묶음 연결 정리 — 다른 원료 묶음에 연결된 LOT 을 같은 원료 묶음으로, 연결만 (2026-10-21, 단지 재고 정합 1단계)", () => {
    // 원료: 가루(MA) · 쌀(MB) · 묶음 없는 원료(MC) · 다른 원료(MD). 같은 원료 묶음 2개(HOLD_DEST_MULTI)는 운영 스키마의
    //   고유 키 uk_inv_material(tenant_id, material_id) 때문에 만들 수 없다 — 순수 분류 시험(server/lotRelink.test.ts)에서만
    const MA = 9801, MB = 9802, MC = 9803, MD = 9804;
    const INV = { a: 9831, b: 9832, d1: 9833, other: 9835 };
    const L = { ready: 9811, txOther: 9812, noTx: 9813, destNone: 9814, unit: 9816, missing: 9817, ok: 9818, nul: 9819, txNull: 9820, otherTenant: 9821 };
    const lotIds = Object.values(L);
    const clean = async () => {
      await q(`DELETE FROM h_inventory_transactions WHERE id BETWEEN 98200 AND 98299`);
      await q(`DELETE FROM h_inventory_lots WHERE id IN (?)`, [lotIds]);
      await q(`DELETE FROM h_inventory WHERE id IN (?)`, [Object.values(INV)]);
      await q(`DELETE FROM h_materials WHERE id IN (?, ?, ?, ?)`, [MA, MB, MC, MD]);
    };
    beforeEach(async () => {
      await clean();
      await q(`INSERT INTO h_materials (id, tenant_id, material_code, material_name) VALUES (?, ?, 'RL-A', '가루(시험)'), (?, ?, 'RL-B', '쌀(시험)'), (?, ?, 'RL-C', '묶음없음(시험)'), (?, ?, 'RL-D', '묶음둘(시험)')`,
        [MA, T, MB, T, MC, T, MD, T]);
      await q(`INSERT INTO h_inventory (id, tenant_id, material_id, total_quantity, available_quantity, reserved_quantity, unit) VALUES
        (?, ?, ?, 0, 0, 0, 'kg'), (?, ?, ?, 50, 50, 0, 'kg'), (?, ?, ?, 0, 0, 0, 'kg'), (?, ?, ?, 0, 0, 0, 'kg')`,
        [INV.a, T, MA, INV.b, T, MB, INV.d1, T, MD, INV.other, T + 1, MB]);
      const lot = (id: number, mat: number, inv: number | null, unit = "kg", expiry = "2027-06-30") =>
        q(`INSERT INTO h_inventory_lots (id, tenant_id, inventory_id, material_id, lot_number, quantity, current_quantity, available_quantity, unit, status, receipt_date, expiry_date)
           VALUES (?, ?, ?, ?, ?, 10, 10, 10, ?, 'available', '2026-10-01', ?)`, [id, T, inv, mat, `RL-${id}`, unit, expiry]);
      await lot(L.ready, MB, INV.a, "kg", "2026-12-31");   // 쌀 LOT 이 가루 묶음에 — 유통기한이 더 빠름
      await lot(L.txOther, MB, INV.a);
      await lot(L.noTx, MB, INV.a);
      await lot(L.destNone, MC, INV.a);
      await lot(L.unit, MB, INV.a, "g");
      await lot(L.missing, MB, 999999);
      await lot(L.ok, MB, INV.b, "kg", "2027-06-30");      // 바르게 연결된 쌀 LOT — 유통기한 늦음
      await lot(L.nul, MB, null);
      await lot(L.txNull, MB, INV.a);
      await lot(L.otherTenant, MB, INV.other);
      const tx = (id: number, lotId: number, mat: number | null, unit = "kg") =>
        q(`INSERT INTO h_inventory_transactions (id, tenant_id, lot_id, material_id, transaction_type, quantity, unit, transaction_date, created_by) VALUES (?, ?, ?, ?, 'receipt', 10, ?, '2026-10-01', 4)`,
          [id, T, lotId, mat, unit]);
      await tx(98201, L.ready, MB);
      await tx(98202, L.txOther, MB); await tx(98203, L.txOther, MA);
      await tx(98204, L.destNone, MC);
      await tx(98206, L.unit, MB, "g");
      await tx(98207, L.missing, MB);
      await tx(98208, L.ok, MB);
      await tx(98209, L.txNull, null);
      await tx(98210, L.otherTenant, MB);
    });
    afterAll(clean);
    const lib = () => import("../scripts/_lib/lotRelink");
    const lotState = async () => JSON.stringify(await q(`SELECT id, quantity, current_quantity, available_quantity, status, material_id, unit FROM h_inventory_lots WHERE id IN (?) ORDER BY id`, [lotIds]));
    const aggState = async () => JSON.stringify(await q(`SELECT id, total_quantity, available_quantity, reserved_quantity FROM h_inventory WHERE id IN (?) ORDER BY id`, [Object.values(INV)]));
    const txState = async () => JSON.stringify(await q(`SELECT * FROM h_inventory_transactions WHERE id BETWEEN 98200 AND 98299 ORDER BY id`));
    const linkOf = async (id: number) => Number((await q(`SELECT inventory_id FROM h_inventory_lots WHERE id = ?`, [id]))[0].inventory_id);

    it("미리보기: 연결이 틀린 원료 LOT 만, 분류대로 (바른 연결·빈 연결은 대상 아님) · 쓰기 없음", async () => {
      const { loadRelinkEntries } = await lib();
      const before = [await lotState(), await aggState(), await txState()];
      const pool = await (await import("./db/connection")).getRawConnection();
      const got = (await loadRelinkEntries(pool, T)).filter((e) => lotIds.includes(e.lotId));
      expect(Object.fromEntries(got.map((e) => [e.lotId, e.category]))).toEqual({
        [L.ready]: "READY", [L.txOther]: "HOLD_TX_MATERIAL", [L.noTx]: "HOLD_NO_TX", [L.destNone]: "HOLD_DEST_NONE",
        [L.unit]: "HOLD_UNIT", [L.missing]: "REPORT_PARENT_MISSING", [L.txNull]: "HOLD_TX_MATERIAL_NULL", [L.otherTenant]: "REPORT_PARENT_OTHER_TENANT",
      });
      expect(got.find((e) => e.lotId === L.ready)).toMatchObject({ fromInventoryId: INV.a, fromMaterialId: MA, toInventoryId: INV.b });
      expect([await lotState(), await aggState(), await txState()]).toEqual(before);
    });

    it("적용: READY 승인 LOT 의 연결만 바뀜 — 수량·상태·거래·집계 그대로 · 출고 LOT 고르기가 유통기한 빠른 LOT 을 찾게 됨 · 되돌리기", async () => {
      const { loadRelinkEntries, relinkFingerprint, approvedFromPlan, applyRelink, restoreRelink } = await lib();
      const { withInventoryTx } = await import("./lib/inventory/applyInventoryDelta");
      const { allocateLotsFEFO } = await import("./lib/inventory/fefoLotAllocation");
      const pool = await (await import("./db/connection")).getRawConnection();
      // 적용 전: 쌀 묶음에서 2kg 을 고르면 바르게 연결된(유통기한 늦은) LOT 만 보인다 — 빠른 LOT 은 가루 묶음에 숨어 있음
      expect((await allocateLotsFEFO(INV.b, 2, "kg", T, MB)).map((a: any) => a.lotId)).toEqual([L.ok]);
      const lots = await loadRelinkEntries(pool, T);
      const plan = { tool: "lot-inventory-relink" as const, tenant: T, generatedAt: "t", fingerprint: relinkFingerprint(T, lots), lots };
      const before = { lots: await lotState(), agg: await aggState(), tx: await txState() };
      const res = await applyRelink(withInventoryTx, T, approvedFromPlan(plan, T, [L.ready]));
      expect(res).toEqual([{ lotId: L.ready, from: INV.a, to: INV.b, ok: true, reason: "연결 변경" }]);
      expect(await linkOf(L.ready)).toBe(INV.b);
      for (const id of [L.txOther, L.noTx, L.destNone, L.unit, L.txNull]) expect(await linkOf(id)).toBe(INV.a); // 승인 밖·보류는 그대로
      expect(await linkOf(L.missing)).toBe(999999);
      expect([await lotState(), await aggState(), await txState()]).toEqual([before.lots, before.agg, before.tx]);
      // 적용 뒤: 같은 요청이 유통기한 빠른 LOT 부터
      expect((await allocateLotsFEFO(INV.b, 2, "kg", T, MB)).map((a: any) => a.lotId)).toEqual([L.ready]);
      // 같은 승인 다시 실행 → 더 이상 틀린 연결 아님 (건너뜀, 변경 없음)
      expect((await applyRelink(withInventoryTx, T, approvedFromPlan(plan, T, [L.ready])))[0]).toMatchObject({ ok: false, reason: expect.stringMatching(/이미 바뀜/) });
      // 되돌리기: 이 도구가 바꾼 값일 때만
      expect((await restoreRelink(withInventoryTx, T, [{ lotId: L.ready, from: INV.a, to: INV.b }]))[0].ok).toBe(true);
      expect(await linkOf(L.ready)).toBe(INV.a);
      expect((await restoreRelink(withInventoryTx, T, [{ lotId: L.ready, from: INV.a, to: INV.b }]))[0]).toMatchObject({ ok: false });
      expect(await lotState()).toBe(before.lots);
    });

    it("미리보기 뒤 바뀐 LOT 은 건너뜀 — 연결이 바뀜 / 거래가 생겨 보류가 됨 / 다른 회사 번호로는 아무것도 바꾸지 않음", async () => {
      const { loadRelinkEntries, relinkFingerprint, approvedFromPlan, applyRelink } = await lib();
      const { withInventoryTx } = await import("./lib/inventory/applyInventoryDelta");
      const pool = await (await import("./db/connection")).getRawConnection();
      const lots = await loadRelinkEntries(pool, T);
      const plan = { tool: "lot-inventory-relink" as const, tenant: T, generatedAt: "t", fingerprint: relinkFingerprint(T, lots), lots };
      const approved = approvedFromPlan(plan, T, [L.ready]);
      // ① 다른 원료 거래가 생김 → 지금 분류 HOLD_TX_MATERIAL → 건너뜀
      await q(`INSERT INTO h_inventory_transactions (id, tenant_id, lot_id, material_id, transaction_type, quantity, unit, transaction_date, created_by) VALUES (98250, ?, ?, ?, 'usage', 1, 'kg', '2026-10-02', 4)`, [T, L.ready, MA]);
      expect((await applyRelink(withInventoryTx, T, approved))[0]).toMatchObject({ ok: false, reason: expect.stringMatching(/HOLD_TX_MATERIAL/) });
      expect(await linkOf(L.ready)).toBe(INV.a);
      await q(`DELETE FROM h_inventory_transactions WHERE id = 98250`);
      // ② 그 사이 다른 원료 묶음으로 연결이 바뀜 → 미리보기와 다름 → 건너뜀
      await q(`UPDATE h_inventory_lots SET inventory_id = ? WHERE id = ?`, [INV.d1, L.ready]);
      expect((await applyRelink(withInventoryTx, T, approved))[0]).toMatchObject({ ok: false, reason: expect.stringMatching(/지금 연결 9833/) });
      expect(await linkOf(L.ready)).toBe(INV.d1);
      await q(`UPDATE h_inventory_lots SET inventory_id = ? WHERE id = ?`, [INV.a, L.ready]);
      // ③ 다른 회사 번호로 실행 → 그 회사에 이 LOT 없음
      expect((await applyRelink(withInventoryTx, T + 1, approved))[0]).toMatchObject({ ok: false, reason: "LOT 없음" });
      expect(await linkOf(L.ready)).toBe(INV.a);
    });
  });

  describe("원재료 흐름 역대조(materialFlow) — BOM 품목 번호는 FK 로만 재고 원료로, 연결 없으면 따로 보고 (2026-10-21, 번호 체계 2단계 뒤 불러오기 실패 수정)", () => {
    const P = 9851, IMP = 9852, IMR = 9853, MAT = 9854, IMX = 9855, REP = 9856, VER = 9857, B = 9858;
    const clean = async () => {
      await q(`DELETE FROM h_batches WHERE id = ?`, [B]);
      await q(`DELETE FROM h_mf_ingredients WHERE mf_report_version_id = ?`, [VER]);
      await q(`DELETE FROM h_mf_report_versions WHERE id = ?`, [VER]);
      await q(`DELETE FROM h_mf_reports WHERE id = ?`, [REP]);
      await q(`DELETE FROM item_master WHERE id IN (?, ?, ?)`, [IMP, IMR, IMX]);
      await q(`DELETE FROM h_materials WHERE id = ?`, [MAT]);
      await q(`DELETE FROM h_products_v2 WHERE id = ?`, [P]);
    };
    beforeEach(async () => {
      await clean();
      await q(`INSERT INTO h_products_v2 (id, tenant_id, product_code, product_name) VALUES (?, ?, 'MF-P', '흐름시험떡')`, [P, T]);
      await q(`INSERT INTO h_materials (id, tenant_id, material_code, material_name) VALUES (?, ?, 'MF-R', '흐름시험쌀')`, [MAT, T]);
      await q(`INSERT INTO item_master (id, tenant_id, item_code, item_name, item_type, base_unit, is_active, legacy_product_id) VALUES (?, ?, 'IM-MF-P', '흐름시험떡', 'own_product', 'kg', 1, ?)`, [IMP, T, P]);
      await q(`INSERT INTO item_master (id, tenant_id, item_code, item_name, item_type, base_unit, is_active, legacy_material_id) VALUES
        (?, ?, 'IM-MF-R', '흐름시험쌀', 'raw_material', 'kg', 1, ?), (?, ?, 'IM-MF-X', '연결없는원료', 'raw_material', 'kg', 1, NULL)`, [IMR, T, MAT, IMX, T]);
      await q(`INSERT INTO h_mf_reports (id, tenant_id, product_id, report_no, report_date, status) VALUES (?, ?, ?, 'R-MF', '2026-01-01', 'ACTIVE')`, [REP, T, IMP]);
      await q(`INSERT INTO h_mf_report_versions (id, tenant_id, mf_report_id, version_no, effective_from, approval_status, batch_target_kg, reference_finished_kg, mass_basis_enabled)
        VALUES (?, ?, ?, 1, '2026-01-01', 'APPROVED', 10, NULL, 0)`, [VER, T, REP]);
      await q(`INSERT INTO h_mf_ingredients (mf_report_version_id, line_no, material_id, quantity, unit, is_deductible, material_type) VALUES
        (?, 1, ?, '60', '%', 1, 'RAW'), (?, 2, ?, '40', '%', 1, 'RAW')`, [VER, IMR, VER, IMX]);
      await q(`INSERT INTO h_batches (id, tenant_id, site_id, batch_code, product_id, planned_quantity, actual_quantity, planned_date, status, mode, plan_only, created_by)
        VALUES (?, ?, 1, 'MF-B', ?, 10, 10, '2026-02-01', 'completed', 'auto', 0, 4)`, [B, T, P]);
    });
    afterAll(clean);

    it("소요: 연결된 품목 → 재고 원료 번호로 · 연결 없는 품목은 추측하지 않고 unlinked 로", async () => {
      const { batchNeeds } = await import("../scripts/_lib/materialFlow");
      const pool = await (await import("./db/connection")).getRawConnection();
      const n = (await batchNeeds(pool, T, "2026-02-01", "2026-02-01")).find((x) => x.batchId === B)!;
      expect(n.versionId).toBe(VER);
      expect(n.lines).toEqual([{ materialId: MAT, required: 6, unit: "kg", source: "version" }]);
      expect(n.unlinked).toEqual([{ itemMasterId: IMX, required: 4 }]);
    });
  });

  describe("생산 건 승인 — 생산 화면·일괄·배치 상세(approveRequest)도 공통 관문·완료 처리, 승인됐는데 완료가 빠진 건 이어서 끝내기 (2026-10-21, 단지 10/15 마감 검증)", () => {
    const B1 = 9861, B2 = 9862, R1 = 98611, R2 = 98621, MAT = 9863;
    const clean = async () => {
      await q(`DELETE FROM h_inventory_lots WHERE tenant_id = ? AND batch_id IN (?, ?)`, [T, B1, B2]).catch(() => undefined);
      await q(`DELETE FROM h_ccp_form_rows WHERE form_record_id IN (98613, 98623)`);
      await q(`DELETE FROM h_ccp_form_records WHERE id IN (98613, 98623)`);
      await q(`DELETE FROM h_approval_history WHERE request_id IN (?, ?)`, [R1, R2]);
      await q(`DELETE FROM h_approval_requests WHERE id IN (?, ?)`, [R1, R2]);
      await q(`DELETE FROM h_batch_inputs WHERE batch_id IN (?, ?)`, [B1, B2]);
      await q(`DELETE FROM h_batches WHERE id IN (?, ?)`, [B1, B2]);
      await q(`DELETE FROM h_materials WHERE id = ?`, [MAT]);
    };
    beforeEach(async () => {
      await clean();
      await q(`INSERT INTO h_materials (id, tenant_id, material_code, material_name) VALUES (?, ?, 'AP-M', '승인시험원료')`, [MAT, T]);
      await q(`INSERT INTO h_batches (id, tenant_id, site_id, batch_code, product_id, planned_quantity, planned_date, status, mode, plan_only, created_by) VALUES
        (?, ?, 1, 'AP-1', 99901, 20, '2026-10-15', 'in_progress', 'auto', 0, 4), (?, ?, 1, 'AP-2', 99901, 30, '2026-10-15', 'in_progress', 'auto', 0, 4)`, [B1, T, B2, T]);
      // 두 생산 건 모두 공식 CCP 기록지 작업자 제출(시트 확인) 완료 — 기록지 관문은 통과, 원료 관문만 본다
      await q(`INSERT INTO h_ccp_form_records (id, tenant_id, batch_id, ccp_type, status, rows_version, confirmed_by, confirmed_at, confirmed_rows_version) VALUES
        (98613, ?, ?, 'CCP-1B', 'submitted', 1, 4, NOW(), 1), (98623, ?, ?, 'CCP-1B', 'submitted', 1, 4, NOW(), 1)`, [T, B1, T, B2]);
      await q(`INSERT INTO h_ccp_form_rows (tenant_id, form_record_id, batch_seq, is_deviation) VALUES (?, 98613, 1, 0), (?, 98623, 1, 0)`, [T, T]);
      // B1: 출고 보류 줄 1개 (복구 때 남긴 미출고) — 승인 관문이 막아야 한다
      await q(`INSERT INTO h_batch_inputs (id, batch_id, tenant_id, material_id, planned_quantity, actual_quantity, unit, inventory_deducted, issue_hold, issue_hold_reason) VALUES (98612, ?, ?, ?, 0.5, 0.5, 'kg', 0, 1, '시험 보류')`, [B1, T, MAT]);
      await q(`INSERT INTO h_approval_requests (id, tenant_id, request_type, reference_type, reference_id, title, status, requested_by) VALUES
        (?, ?, 'batch_production', 'batch', ?, '[생산] AP-1', 'pending', 4), (?, ?, 'batch_production', 'batch', ?, '[생산] AP-2', 'pending', 4)`, [R1, T, B1, R2, T, B2]);
    });
    afterAll(clean);
    const reqStatus = async (id: number) => (await q(`SELECT status FROM h_approval_requests WHERE id = ?`, [id]))[0].status;
    const batch = async (id: number) => (await q(`SELECT status, actual_quantity + 0 AS a, completed_at FROM h_batches WHERE id = ?`, [id]))[0];

    it("관문에 걸리면(출고 안 된 줄) 요청도 승인하지 않음 — 생산 건·재고 그대로 · 보류 줄을 자동 출고하지 않음", async () => {
      const { approveRequest } = await import("./db/system/auditApprovalSupplier");
      const txBefore = (await q(`SELECT COUNT(*) AS n FROM h_inventory_transactions WHERE tenant_id = ? AND material_id = ?`, [T, MAT]))[0].n;
      await expect(approveRequest(R1, 4)).rejects.toThrow(/출고되지 않았습니다/);
      expect(await reqStatus(R1)).toBe("pending");
      expect((await batch(B1)).status).toBe("in_progress");
      expect((await q(`SELECT COUNT(*) AS n FROM h_inventory_transactions WHERE tenant_id = ? AND material_id = ?`, [T, MAT]))[0].n).toBe(txBefore);
      expect(Number((await q(`SELECT issue_hold FROM h_batch_inputs WHERE id = 98612`))[0].issue_hold)).toBe(1);
    });

    it("관문 통과 → 요청 승인 + 생산 완료(실제 처리 시각) + 후속 처리 경고를 돌려줌 (이전: 요청만 approved)", async () => {
      const { approveRequest } = await import("./db/system/auditApprovalSupplier");
      const r = await approveRequest(R2, 4);
      expect(await reqStatus(R2)).toBe("approved");
      const b = await batch(B2);
      expect(b.status).toBe("completed");
      expect(b.completed_at).not.toBeNull();
      expect(Array.isArray(r.warnings)).toBe(true);
    });

    it("이어서 끝내기: 승인된 요청 + 미완료 생산 건만 · 출고 안 된 줄이 있으면 거부(재출고 없음) · 실제 생산량은 비어 있을 때만", async () => {
      const { resumeApprovedBatchCompletion } = await import("./lib/production/batchApprovalGate");
      // 승인 요청이 아직 대기 → 거부 (승인을 새로 만들지 않음)
      await expect(resumeApprovedBatchCompletion(B2, T, 4, 30)).rejects.toThrow(/승인된 생산 승인 요청이 없습니다/);
      // 예전 생산 화면 승인처럼 요청만 approved 인 상태
      await q(`UPDATE h_approval_requests SET status = 'approved' WHERE id IN (?, ?)`, [R1, R2]);
      await expect(resumeApprovedBatchCompletion(B1, T, 4, 20)).rejects.toThrow(/원료 1줄이 출고되지 않았습니다 — 이어서 끝내기는 원료를 다시 출고하지 않습니다/);
      expect((await batch(B1)).status).toBe("in_progress");
      await expect(resumeApprovedBatchCompletion(B2, T + 1, 4, 30)).rejects.toThrow(/이 회사의 생산 건이 아닙니다/);
      const r = await resumeApprovedBatchCompletion(B2, T, 4, 29.5);
      expect(r.requestId).toBe(R2);
      const b = await batch(B2);
      expect([b.status, Number(b.a)]).toEqual(["completed", 29.5]);
      await expect(resumeApprovedBatchCompletion(B2, T, 4, 30)).rejects.toThrow(/이미 completed/);
    });

    it("완료 전 점검: 예전 방식 공식 기록지(field_mode 0)도 확인 제출이면 CCP 완료 — 예전 점검 기록만 세지 않음 · 확인 뒤 바뀌면 미완료", async () => {
      const { checkBatchCompletionReadiness } = await import("./db/production/batchLifecycle");
      await q(`INSERT INTO h_batch_inputs (id, batch_id, tenant_id, material_id, planned_quantity, actual_quantity, unit, inventory_deducted) VALUES (98622, ?, ?, ?, 1, 1, 'kg', 1)`, [B2, T, MAT]);
      expect(Number((await q(`SELECT COALESCE(field_mode, 0) AS fm FROM h_ccp_form_records WHERE id = 98623`))[0].fm)).toBe(0);
      const ok = await checkBatchCompletionReadiness(B2, T);
      expect([ok.canComplete, ok.checks.ccpCompleted.message]).toEqual([true, "CCP 점검 완료 (1/1)"]);
      await q(`UPDATE h_ccp_form_records SET rows_version = 2 WHERE id = 98623`); // 확인 뒤 행이 바뀜
      const no = await checkBatchCompletionReadiness(B2, T);
      expect([no.canComplete, no.checks.ccpCompleted.message]).toEqual([false, "CCP 점검 미완료 (0/1)"]);
    });
  });

  describe("실사 반영 — 지난 실사일이면 그날 센 수량 + 그 뒤 LOT 이동으로 비교, 자동으로 정할 수 없으면 '확인 필요' (2026-10-21, 단지 10/18 실사 정합)", () => {
    const M = 9871, L1 = 98711, L2 = 98712, L3 = 98713, CD = "2026-10-18";
    const clean = async () => {
      await q(`DELETE FROM h_inventory_transactions WHERE tenant_id = ? AND (material_id = ? OR lot_id IN (?, ?, ?))`, [T, M, L1, L2, L3]);
      await q(`DELETE FROM h_inventory_lots WHERE tenant_id = ? AND material_id = ?`, [T, M]);
      await q(`DELETE FROM h_inventory WHERE tenant_id = ? AND material_id = ?`, [T, M]);
      await q(`DELETE FROM h_materials WHERE id = ?`, [M]);
    };
    beforeEach(async () => {
      await clean();
      await q(`INSERT INTO h_materials (id, tenant_id, material_code, material_name, unit) VALUES (?, ?, 'PC-M', '실사시험전분', 'kg')`, [M, T]);
      await q(`INSERT INTO h_inventory (tenant_id, material_id, total_quantity, available_quantity, reserved_quantity, unit) VALUES (?, ?, 1020, 1020, 0, 'kg')`, [T, M]);
      // 10/01 입고 50 (실사 전) · 10/19 입고 1000 · 10/20 사용 30 (실사 뒤) → 지금 50 + 970 = 1020
      await q(`INSERT INTO h_inventory_lots (id, tenant_id, material_id, lot_number, quantity, current_quantity, available_quantity, unit, status, receipt_date, created_at) VALUES
        (?, ?, ?, 'PC-1', 50, 50, 50, 'kg', 'available', '2026-10-01', '2026-10-01 09:00:00'), (?, ?, ?, 'PC-2', 970, 970, 970, 'kg', 'available', '2026-10-19', '2026-10-19 09:00:00')`, [L1, T, M, L2, T, M]);
      await q(`INSERT INTO h_inventory_transactions (tenant_id, lot_id, material_id, transaction_type, quantity, unit, transaction_date, created_by) VALUES
        (?, ?, ?, 'receipt', 50, 'kg', '2026-10-01', 4), (?, ?, ?, 'receipt', 1000, 'kg', '2026-10-19', 4), (?, ?, ?, 'usage', 30, 'kg', '2026-10-20', 4),
        (?, NULL, ?, 'usage', 5, 'kg', '2026-10-20', 4)`, [T, L1, M, T, L2, M, T, L2, M, T, M]); // 마지막: LOT 없는 원장 전용 행 — 재고를 바꾸지 않았으므로 빼지 않음
    });
    afterAll(clean);
    const subject = { material: { kind: "inventory" as const, id: M as any } };
    const run = async (actualQty: number, countDate: string | null) => {
      const { withInventoryTx } = await import("./lib/inventory/applyInventoryDelta");
      const { applyPhysicalCount } = await import("./lib/inventory/stockAdjustment");
      return withInventoryTx((c) => applyPhysicalCount(c, { tenantId: T, subject, actualQty, reason: "시험 실사", userId: 4, unit: "kg", countDate }), "pc-test");
    };
    const avail = async () => (await q(`SELECT id, available_quantity + 0 AS a FROM h_inventory_lots WHERE material_id = ? ORDER BY id`, [M])).map((r: any) => Number(r.a));

    it("10/18 에 40 셌으면 지금 기대량 = 40 + 1000 − 30 = 1010 → 10 만 줄임 (이전: 40 − 1020 = −980 으로 실사 뒤 입고를 지움) · 조정 거래는 실사일로", async () => {
      const r = await run(40, CD);
      expect([r.status, r.countedQty, r.postCountNet, r.expectedNow, r.before, r.diff]).toEqual(["applied", 40, 970, 1010, 1020, -10]);
      expect(await avail()).toEqual([40, 970]); // 오래된 LOT 부터
      const adj = await q(`SELECT quantity + 0 AS q, DATE_FORMAT(transaction_date, '%Y-%m-%d') AS d FROM h_inventory_transactions WHERE material_id = ? AND transaction_type = 'adjustment'`, [M]);
      expect(adj.map((a: any) => [Number(a.q), a.d])).toEqual([[-10, CD]]);
      // 다시 같은 실사 → 조정 거래(10/18)가 실사일 '당일' 거래가 되어 이제는 확인 필요 (두 번 맞추지 않음)
      expect((await run(40, CD)).status).toBe("needs_review");
      expect(await avail()).toEqual([40, 970]);
    });

    it("실사일이 오늘이면 그 뒤 이동 없음 — 센 수량 그대로 비교 (기존 동작)", async () => {
      const { todayKST } = await import("./utils/timezone");
      const r = await run(1000, todayKST());
      expect([r.status, r.postCountNet, r.expectedNow, r.diff]).toEqual(["applied", 0, 1000, -20]);
    });

    it("확인 필요(아무것도 바꾸지 않음): 실사일 당일 거래 · 단위 다른 거래 · 쓸 수 없는 상태 LOT 의 잔량 · 기대량 음수 / 미래 실사일은 거부", async () => {
      const before = await avail();
      await q(`INSERT INTO h_inventory_transactions (tenant_id, lot_id, material_id, transaction_type, quantity, unit, transaction_date, created_by) VALUES (?, ?, ?, 'usage', 1, 'kg', ?, 4)`, [T, L1, M, CD]);
      expect((await run(40, CD)).message).toMatch(/당일 거래 1건/);
      await q(`DELETE FROM h_inventory_transactions WHERE material_id = ? AND transaction_date = ?`, [M, CD]);
      await q(`INSERT INTO h_inventory_transactions (tenant_id, lot_id, material_id, transaction_type, quantity, unit, transaction_date, created_by) VALUES (?, ?, ?, 'usage', 2, 'g', '2026-10-20', 4)`, [T, L2, M]);
      expect((await run(40, CD)).message).toMatch(/단위가 kg 와 다름/);
      await q(`DELETE FROM h_inventory_transactions WHERE material_id = ? AND unit = 'g'`, [M]);
      await q(`INSERT INTO h_inventory_lots (id, tenant_id, material_id, lot_number, quantity, current_quantity, available_quantity, unit, status, receipt_date) VALUES (?, ?, ?, 'PC-3', 9, 9, 9, 'kg', 'used', '2026-09-01')`, [L3, T, M]);
      const st = await run(40, CD);
      expect([st.status, st.message]).toEqual(["needs_review", expect.stringMatching(/쓸 수 없는 상태.*LOT 1개에 잔량 9/)]);
      await q(`DELETE FROM h_inventory_lots WHERE id = ?`, [L3]);
      // 실사 뒤 출고가 센 양보다 많음: 실사 0, 그 뒤 +1000 −30 이면 양수라 통과 → 사용을 크게
      await q(`INSERT INTO h_inventory_transactions (tenant_id, lot_id, material_id, transaction_type, quantity, unit, transaction_date, created_by) VALUES (?, ?, ?, 'usage', 2000, 'kg', '2026-10-20', 4)`, [T, L2, M]);
      expect((await run(0, CD)).message).toMatch(/0 보다 작음/);
      await q(`DELETE FROM h_inventory_transactions WHERE material_id = ? AND quantity = 2000`, [M]);
      expect(await avail()).toEqual(before);
      await expect(run(40, "2099-01-01")).rejects.toThrow(/오늘보다 뒤/);
    });
  });
});
