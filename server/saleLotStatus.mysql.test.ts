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
    for (const t of ["product_skus", "item_master", "sku_bundles", "h_inventory", "accounting_sales", "h_inventory_lots", "h_inventory_transactions", "expense_journal_entries", "expense_journal_lines", "accounting_accounts", "h_product_outbound", "bundle_lots"]) {
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
});
