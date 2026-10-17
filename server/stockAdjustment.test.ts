import { describe, it, expect, vi } from "vitest";
import { adjustLot, adjustBySubject, applyPhysicalCount, NoActiveLotsError, StockShortageError } from "./lib/inventory/stockAdjustment";

vi.mock("./lib/identity/itemIdentityService", () => ({
  toInventoryMaterialId: vi.fn(async (id: number) => ({ id: id === 168 ? 615 : id, trusted: true, source: "hm_direct", itemMasterId: null })),
}));

/** stockAdjustment + applyLotDelta 내부 SQL 을 모두 받아주는 mock conn */
function makeConn(lots: any[], inv = { id: 7, reserved_quantity: "0", unit: "kg" }) {
  const calls: Array<{ sql: string; params: any[] }> = [];
  const state = new Map(lots.map((l) => [l.id, { ...l }]));
  const conn = {
    async execute(sql: string, params: any[] = []) {
      const s = sql.replace(/\s+/g, " ").trim();
      calls.push({ sql: s, params });
      if (/^SELECT id, lot_number, quantity, available_quantity, unit, material_id, product_id, created_at FROM h_inventory_lots WHERE id = \?/.test(s)) {
        const l = state.get(params[0]); return [l ? [l] : [], []];
      }
      if (/^SELECT id, lot_number, .* FROM h_inventory_lots WHERE tenant_id = \? AND (product_id|material_id) IN/.test(s)) {
        const ids = params.slice(1).map(Number);
        const col = /product_id IN/.test(s) ? "product_id" : "material_id";
        const rows = [...state.values()].filter((l) => ids.includes(Number(l[col])) && l.status === "available");
        rows.sort((a, b) => (/DESC/.test(s) ? b.id - a.id : a.id - b.id));
        return [rows, []];
      }
      if (/^SELECT id, quantity, available_quantity, current_quantity, unit, status, material_id, product_id FROM h_inventory_lots/.test(s)) {
        const l = state.get(params[0]); return [l ? [l] : [], []];
      }
      if (/^UPDATE h_inventory_lots SET quantity = /.test(s) || /^UPDATE h_inventory_lots SET quantity = GREATEST/.test(s)) {
        const id = params[params.length - 1]; const l = state.get(id); const q = params[0];
        if (l) { const inc = /quantity \+ \?/.test(s); l.available_quantity = String((parseFloat(l.available_quantity) + (inc ? q : -q))); }
        return [{ affectedRows: 1 }, []];
      }
      if (/^SELECT id, reserved_quantity, unit FROM h_inventory/.test(s)) return [[inv], []];
      if (/COALESCE\(SUM\(available_quantity\), 0\) AS avail/.test(s)) {
        const col = /product_id = \?/.test(s) ? "product_id" : "material_id";
        const sum = [...state.values()].filter((l) => Number(l[col]) === Number(params[1]) && l.status === "available").reduce((a, l) => a + parseFloat(l.available_quantity), 0);
        return [[{ avail: String(sum), lot_unit: "kg" }], []];
      }
      if (/^INSERT INTO h_inventory_lots/.test(s)) return [{ insertId: 777 }, []];
      if (/^INSERT INTO/.test(s)) return [{ insertId: 500 }, []];
      if (/available_quantity < -/.test(s)) return [[], []];
      return [{ affectedRows: 1 }, []];
    },
  } as any;
  return { conn, calls, state };
}

const L = (id: number, avail: string, extra: any = {}) => ({
  id, lot_number: `LOT-${id}`, quantity: avail, available_quantity: avail, current_quantity: avail,
  unit: "kg", status: "available", material_id: null, product_id: 82, created_at: `2026-0${id}-01`, ...extra,
});

describe("adjustLot", () => {
  it("감소: LOT 차감 + 원장 음수(adjustment 규약) + 집계 재계산", async () => {
    const { conn, calls } = makeConn([L(1, "10.000")]);
    const r = await adjustLot(conn, { tenantId: 2, lotId: 1, delta: -3, reason: "파손", userId: 9 });
    expect(r).toMatchObject({ lotId: 1, lotNumber: "LOT-1", changeQty: -3, before: 10 });
    expect(r.newAvailable).toBeCloseTo(7, 6);
    const ledger = calls.find((c) => c.sql.startsWith("INSERT INTO h_inventory_transactions"))!;
    expect(ledger.params[3]).toBe("adjustment");
    expect(ledger.params[4]).toBe(-3);                 // 감소분 음수
    expect(ledger.params[9]).toBe("adjustment");       // reference_type
    // 제품 LOT — 제품 집계(h_inventory.product_id) 는 쓰지 않는다 (2026-10-17 재고 결정 D2: SKU 단위가 섞임)
    expect(calls.some((c) => c.sql.startsWith("UPDATE h_inventory SET total_quantity"))).toBe(false);
  });

  it("증가: 원장 양수", async () => {
    const { conn, calls } = makeConn([L(1, "10.000")]);
    await adjustLot(conn, { tenantId: 2, lotId: 1, delta: 2.5, reason: "실사 초과", userId: 9 });
    const ledger = calls.find((c) => c.sql.startsWith("INSERT INTO h_inventory_transactions"))!;
    expect(ledger.params[4]).toBe(2.5);
  });

  it("delta 0 / 없는 LOT 는 throw", async () => {
    const { conn } = makeConn([]);
    await expect(adjustLot(conn, { tenantId: 2, lotId: 1, delta: 0, reason: "x", userId: 9 })).rejects.toThrow("변동이 없습니다");
    await expect(adjustLot(conn, { tenantId: 2, lotId: 1, delta: 1, reason: "x", userId: 9 })).rejects.toThrow("LOT을 찾을 수 없습니다");
  });
});

describe("adjustBySubject", () => {
  it("감소: 오래된 LOT 부터 연쇄 차감, 합계 보존", async () => {
    const { conn } = makeConn([L(1, "4.000"), L(2, "10.000")]);
    const r = await adjustBySubject(conn, { tenantId: 2, subject: { productId: 82 }, delta: -6, reason: "실사", userId: 9 });
    expect(r.before).toBe(14);
    expect(r.after).toBe(8);
    expect(r.affected.map((a) => [a.lotId, a.changeQty])).toEqual([[1, -4], [2, -2]]);
  });

  it("증가: 최신 LOT 1개에 전량", async () => {
    const { conn } = makeConn([L(1, "4.000"), L(2, "10.000")]);
    const r = await adjustBySubject(conn, { tenantId: 2, subject: { productId: 82 }, delta: 5, reason: "실사", userId: 9 });
    expect(r.affected).toHaveLength(1);
    expect(r.affected[0].lotId).toBe(2);
    expect(r.affected[0].newAvailable).toBeCloseTo(15, 6);
  });

  it("가용 부족 → StockShortageError (부분 차감 없음)", async () => {
    const { conn, calls } = makeConn([L(1, "4.000")]);
    await expect(adjustBySubject(conn, { tenantId: 2, subject: { productId: 82 }, delta: -9, reason: "실사", userId: 9 })).rejects.toBeInstanceOf(StockShortageError);
    expect(calls.some((c) => c.sql.startsWith("UPDATE h_inventory_lots"))).toBe(false);
  });

  it("활성 LOT 없음 → NoActiveLotsError", async () => {
    const { conn } = makeConn([]);
    await expect(adjustBySubject(conn, { tenantId: 2, subject: { productId: 82 }, delta: 1, reason: "실사", userId: 9 })).rejects.toBeInstanceOf(NoActiveLotsError);
  });

  it("자재는 ItemIdentityService 로 canonical id 변환 후 원본 id 도 함께 조회 (168 → 615)", async () => {
    const { conn, calls } = makeConn([L(1, "20.000", { product_id: null, material_id: 615 })]);
    const r = await adjustBySubject(conn, { tenantId: 2, subject: { materialId: 168 }, delta: -5, reason: "실사", userId: 9 });
    const sel = calls.find((c) => /material_id IN/.test(c.sql))!;
    expect(sel.params).toEqual([2, 615, 168]);
    expect(r.affected[0].changeQty).toBe(-5);
    const agg = calls.find((c) => /COALESCE\(SUM\(available_quantity\)/.test(c.sql))!;
    expect(agg.params[1]).toBe(615); // 집계 재계산은 canonical 로
  });

  it("subject 둘 다 / 둘 다 없음 → throw", async () => {
    const { conn } = makeConn([]);
    await expect(adjustBySubject(conn, { tenantId: 2, subject: { productId: 1, materialId: 1 }, delta: 1, reason: "x", userId: 9 })).rejects.toThrow("하나만");
    await expect(adjustBySubject(conn, { tenantId: 2, subject: {}, delta: 1, reason: "x", userId: 9 })).rejects.toThrow("하나만");
  });
});

describe("applyPhysicalCount (실사 1품목)", () => {
  it("차이 없음 → skipped, 쓰기 없음", async () => {
    const { conn, calls } = makeConn([L(1, "10.000")]);
    const r = await applyPhysicalCount(conn, { tenantId: 2, subject: { productId: 82 }, actualQty: 10, reason: "실사", userId: 9 });
    expect(r.status).toBe("skipped");
    expect(calls.some((c) => /^(UPDATE|INSERT)/.test(c.sql))).toBe(false);
  });

  it("감소 실사 → 오래된 LOT 부터 차감 (adjustBySubject 경유)", async () => {
    const { conn } = makeConn([L(1, "4.000"), L(2, "10.000")]);
    const r = await applyPhysicalCount(conn, { tenantId: 2, subject: { productId: 82 }, actualQty: 8, reason: "실사", userId: 9 });
    expect(r.status).toBe("applied");
    expect(r.diff).toBe(-6);
    expect(r.affected.map((a) => [a.lotId, a.changeQty])).toEqual([[1, -4], [2, -2]]);
  });

  it("활성 LOT 없음 + 실사 수량 > 0 → 실사 LOT 신규 생성 (adjustment 원장, receipt 아님)", async () => {
    const { conn, calls } = makeConn([]);
    const r = await applyPhysicalCount(conn, { tenantId: 2, subject: { materialId: 615 }, actualQty: 25.5, reason: "실사", userId: 9, unit: "kg" });
    expect(r.status).toBe("applied");
    expect(r.createdLotNumber).toMatch(/^COUNT-M615-\d{8}-[A-Z0-9]{4}$/);
    expect(r.affected).toEqual([{ lotId: 777, lotNumber: r.createdLotNumber, changeQty: 25.5, newAvailable: 25.5 }]);
    const lotIns = calls.find((c) => c.sql.startsWith("INSERT INTO h_inventory_lots"))!;
    expect(lotIns.params[2]).toBe(615);   // material_id
    expect(lotIns.params[8]).toBe(25.5);  // quantity (batch_id·sku_id·sku_name·inbound_line_id 뒤)
    const ledger = calls.find((c) => c.sql.startsWith("INSERT INTO h_inventory_transactions"))!;
    expect(ledger.params[3]).toBe("adjustment");
    expect(ledger.params[4]).toBe(25.5);
    expect(calls.some((c) => c.sql.startsWith("UPDATE h_inventory SET total_quantity"))).toBe(true); // 집계
  });

  it("활성 LOT 없음 + 실사 0 → skipped (차이 없음)", async () => {
    const { conn } = makeConn([]);
    const r = await applyPhysicalCount(conn, { tenantId: 2, subject: { productId: 82 }, actualQty: 0, reason: "실사", userId: 9 });
    expect(r.status).toBe("skipped");
  });

  it("음수 실사 수량은 throw", async () => {
    const { conn } = makeConn([]);
    await expect(applyPhysicalCount(conn, { tenantId: 2, subject: { productId: 82 }, actualQty: -1, reason: "실사", userId: 9 })).rejects.toThrow("0 이상");
  });
});
