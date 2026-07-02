/**
 * applyInventoryDelta 단위 테스트 (P2, 병② 관문)
 * 실 DB 없이 mock conn 으로 3 leg 규약을 검증.
 */
import { describe, it, expect } from "vitest";
import {
  recomputeAggregateFromLots,
  applyLotDelta,
  InventoryShortageError,
  type InvConn,
} from "./applyInventoryDelta";

/** SQL 첫 토큰/테이블로 분기해 canned 결과를 돌려주는 mock conn */
function makeConn(opts: {
  invRow?: any; // h_inventory 기존 행 (없으면 INSERT 경로)
  lotAvailSum?: number; // ΣLOT.available
  lotUnit?: string;
  lotRow?: any; // applyLotDelta 대상 LOT
}) {
  const calls: Array<{ sql: string; params: any[] }> = [];
  const conn: InvConn = {
    async execute(sql: string, params?: any[]) {
      const s = String(sql).replace(/\s+/g, " ").trim();
      calls.push({ sql: s, params: params ?? [] });
      if (/^SELECT id, reserved_quantity, unit FROM h_inventory/i.test(s)) {
        return [opts.invRow ? [opts.invRow] : [], []] as any;
      }
      if (/COALESCE\(SUM\(available_quantity\), 0\) AS avail/i.test(s)) {
        return [[{ avail: String(opts.lotAvailSum ?? 0), lot_unit: opts.lotUnit ?? "kg" }], []] as any;
      }
      if (/^SELECT id, quantity, available_quantity, current_quantity, unit, status FROM h_inventory_lots/i.test(s)) {
        return [opts.lotRow ? [opts.lotRow] : [], []] as any;
      }
      if (/^INSERT INTO/i.test(s)) {
        return [{ insertId: 999 }, []] as any;
      }
      // UPDATE 등
      return [{ affectedRows: 1 }, []] as any;
    },
  };
  return { conn, calls };
}

describe("recomputeAggregateFromLots", () => {
  it("subject 가 material/product 둘 다면 throw", async () => {
    const { conn } = makeConn({});
    await expect(
      recomputeAggregateFromLots(conn, {
        tenantId: 2,
        subject: { materialId: 1, productId: 1 },
      }),
    ).rejects.toThrow(/정확히 하나/);
  });

  it("subject 가 아무것도 없으면 throw", async () => {
    const { conn } = makeConn({});
    await expect(
      recomputeAggregateFromLots(conn, { tenantId: 2, subject: {} }),
    ).rejects.toThrow(/정확히 하나/);
  });

  it("기존 집계 있음: available=ΣLOT, total=available+reserved 로 UPDATE", async () => {
    const { conn, calls } = makeConn({
      invRow: { id: 55, reserved_quantity: "2.000", unit: "kg" },
      lotAvailSum: 10,
    });
    const r = await recomputeAggregateFromLots(conn, {
      tenantId: 2,
      subject: { materialId: 615 },
    });
    expect(r).toEqual({ available: 10, total: 12, reserved: 2 });
    const upd = calls.find((c) => /^UPDATE h_inventory SET total_quantity/i.test(c.sql));
    expect(upd).toBeTruthy();
    // params: [total, available, id]
    expect(upd!.params).toEqual([12, 10, 55]);
  });

  it("집계 없음: reserved=0 으로 total=available INSERT", async () => {
    const { conn, calls } = makeConn({ invRow: undefined, lotAvailSum: 7 });
    const r = await recomputeAggregateFromLots(conn, {
      tenantId: 2,
      subject: { productId: 168 },
    });
    expect(r).toEqual({ available: 7, total: 7, reserved: 0 });
    const ins = calls.find((c) => /^INSERT INTO h_inventory /i.test(c.sql));
    expect(ins).toBeTruthy();
    expect(ins!.sql).toMatch(/product_id/);
  });
});

describe("applyLotDelta", () => {
  it("소진인데 가용 부족 + allowNegative=false → InventoryShortageError", async () => {
    const { conn } = makeConn({
      lotRow: { id: 3, quantity: "5", available_quantity: "5", current_quantity: "5", unit: "kg", status: "available" },
    });
    await expect(
      applyLotDelta(conn, {
        tenantId: 2,
        lotId: 3,
        subject: { materialId: 615 },
        quantity: 10,
        direction: "decrease",
        transactionType: "usage",
        unit: "kg",
        createdBy: 1,
      }),
    ).rejects.toBeInstanceOf(InventoryShortageError);
  });

  it("소진 충분 → LOT 차감 + 양수 usage 원장 + 집계 재계산", async () => {
    const { conn, calls } = makeConn({
      lotRow: { id: 3, quantity: "20", available_quantity: "20", current_quantity: "20", unit: "kg", status: "available" },
      invRow: { id: 55, reserved_quantity: "0", unit: "kg" },
      lotAvailSum: 12, // 차감 후 잔량 가정
    });
    const res = await applyLotDelta(conn, {
      tenantId: 2,
      lotId: 3,
      subject: { materialId: 615 },
      quantity: 8,
      direction: "decrease",
      transactionType: "usage",
      unit: "kg",
      createdBy: 1,
    });
    expect(res.remaining).toBe(12);
    // LOT 차감 UPDATE
    expect(calls.some((c) => /UPDATE h_inventory_lots SET quantity = GREATEST/i.test(c.sql))).toBe(true);
    // 원장: 양수 quantity(=8)
    const led = calls.find((c) => /INSERT INTO h_inventory_transactions/i.test(c.sql));
    expect(led).toBeTruthy();
    expect(led!.params).toContain(8); // Math.abs(quantity)
    // 집계 재계산이 뒤따랐는지
    expect(calls.some((c) => /^UPDATE h_inventory SET total_quantity/i.test(c.sql))).toBe(true);
  });
});
