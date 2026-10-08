import { describe, it, expect, vi, afterEach } from "vitest";
import { planFefoAllocation } from "./lib/inventory/fefoLotAllocation";
import { isNegativeStockAllowed, minusExpr, isNegativeQty, negativePlaceholderLotNumber } from "./lib/inventory/negativeStockPolicy";
import { reconcileNegativeLots } from "./lib/inventory/negativeLotReconcile";

const lots = [
  { id: 1, availableQuantity: "1.730", unitPrice: "1000", expiryDate: "2026-11-01" }, // 냉동쑥 잔량
  { id: 2, availableQuantity: "0.500", unitPrice: "1100", expiryDate: "2026-12-01" },
];

describe("planFefoAllocation", () => {
  it("가용량이 충분하면 FEFO 순으로 배분하고 remaining 0", () => {
    const r = planFefoAllocation(lots, 2.0);
    expect(r.allocations.map((a) => [a.lotId, a.quantity])).toEqual([[1, 1.73], [2, 0.27]]);
    expect(r.remaining).toBeCloseTo(0, 6);
    expect(r.allocations.some((a) => a.negative)).toBe(false);
  });

  it("음수 비허용: 부족분은 remaining 으로 남긴다 (호출측이 throw)", () => {
    const r = planFefoAllocation(lots, 11.5);
    expect(r.allocations).toHaveLength(2);
    expect(r.remaining).toBeCloseTo(11.5 - 2.23, 6);
  });

  it("음수 허용: 있는 LOT 는 다 쓰고 부족분은 sink LOT 에 음수로 몰아준다", () => {
    const sink = { id: 2, availableQuantity: "0.500", unitPrice: "1100", expiryDate: null };
    const r = planFefoAllocation(lots, 11.5, { allowNegative: true, sinkLot: sink });
    expect(r.remaining).toBe(0);
    // LOT 2 는 FEFO 로 0.5 + 부족분 9.27 = 9.77 (음수 표시)
    const lot2 = r.allocations.find((a) => a.lotId === 2)!;
    expect(lot2.quantity).toBeCloseTo(0.5 + (11.5 - 2.23), 6);
    expect(lot2.negative).toBe(true);
    // LOT 1 은 정상 1.73 → LOT 추적 유지
    expect(r.allocations.find((a) => a.lotId === 1)!.negative).toBeUndefined();
  });

  it("음수 허용 + 가용 LOT 0건: sink 에 전량 음수", () => {
    const sink = { id: 9, availableQuantity: "-3.000", unitPrice: "0", expiryDate: null };
    const r = planFefoAllocation([], 339.5, { allowNegative: true, sinkLot: sink });
    expect(r.allocations).toEqual([{ lotId: 9, quantity: 339.5, unitCost: 0, expiryDate: null, negative: true }]);
    expect(r.remaining).toBe(0);
  });

  it("음수 허용인데 sink 가 없으면 remaining 을 남긴다 (호출측이 자리표시 LOT 생성)", () => {
    const r = planFefoAllocation([], 5, { allowNegative: true, sinkLot: null });
    expect(r.allocations).toHaveLength(0);
    expect(r.remaining).toBe(5);
  });
});

describe("negativeStockPolicy", () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });

  it("기본값은 허용", () => {
    delete process.env.INVENTORY_ALLOW_NEGATIVE;
    delete process.env.INVENTORY_ALLOW_NEGATIVE_DENY_TENANTS;
    expect(isNegativeStockAllowed(2)).toBe(true);
  });

  it("INVENTORY_ALLOW_NEGATIVE=false 면 전체 금지", () => {
    process.env.INVENTORY_ALLOW_NEGATIVE = "false";
    expect(isNegativeStockAllowed(2)).toBe(false);
  });

  it("DENY_TENANTS 에 있는 테넌트만 금지", () => {
    process.env.INVENTORY_ALLOW_NEGATIVE = "true";
    process.env.INVENTORY_ALLOW_NEGATIVE_DENY_TENANTS = "3, 9";
    expect(isNegativeStockAllowed(3)).toBe(false);
    expect(isNegativeStockAllowed(2)).toBe(true);
  });

  it("SQL 조각 / 음수 판정 / 자리표시 LOT 번호", () => {
    expect(minusExpr("available_quantity", true)).toBe("available_quantity - ?");
    expect(minusExpr("available_quantity", false)).toBe("GREATEST(available_quantity - ?, 0)");
    expect(isNegativeQty("-9.770")).toBe(true);
    expect(isNegativeQty("0.000")).toBe(false);
    expect(isNegativeQty(-0.0001)).toBe(false); // 소수 오차는 음수로 안 본다
    expect(negativePlaceholderLotNumber(615, new Date("2026-10-08T00:00:00Z"))).toMatch(/^NEG-615-20261008-[A-Z0-9]{4}$/);
  });
});

/** execute 호출 순서대로 미리 정한 결과를 돌려주는 가짜 커넥션 */
function scriptedConn(selects: Record<string, any[]>) {
  const calls: Array<{ sql: string; params: any[] }> = [];
  const execute = vi.fn(async (sqlText: string, params: any[] = []) => {
    calls.push({ sql: sqlText.replace(/\s+/g, " ").trim(), params });
    if (/available_quantity < -/.test(sqlText)) return [selects.negatives, []];
    if (/available_quantity > /.test(sqlText) && /SELECT/.test(sqlText)) return [selects.positives, []];
    return [{ affectedRows: 1, insertId: 0 }, []];
  });
  return { conn: { execute } as any, calls };
}

describe("reconcileNegativeLots", () => {
  afterEach(() => { delete process.env.INVENTORY_ALLOW_NEGATIVE; });

  it("음수 LOT -9.77 을 신규 LOT +20 으로 메꾸고 NEGATIVE_RECONCILE 1건 남긴다", async () => {
    const { conn, calls } = scriptedConn({
      negatives: [{ id: 50, available_quantity: "-9.770", unit: "kg", inventory_id: 7, lot_number: "LOT-A" }],
      positives: [{ id: 51, available_quantity: "20.000", unit: "kg", inventory_id: 7 }],
    });
    const r = await reconcileNegativeLots(conn, { materialId: 615, tenantId: 2, userId: 1, transactionDate: "2026-10-08", source: "test" });
    expect(r.pairs).toEqual([{ negativeLotId: 50, sourceLotId: 51, quantity: 9.77 }]);
    expect(r.covered).toBeCloseTo(9.77, 6);
    expect(r.remainingDebt).toBe(0);

    const updates = calls.filter((c) => c.sql.startsWith("UPDATE h_inventory_lots"));
    expect(updates).toHaveLength(2); // 양수 LOT 차감 1 + 음수 LOT 복원 1 (자리표시 아님 → used 전환 없음)
    expect(updates[0].params.slice(0, 3)).toEqual([9.77, 9.77, 9.77]);
    expect(updates[0].params[3]).toBe(51);
    expect(updates[1].params[2]).toBe(50);

    const inserts = calls.filter((c) => c.sql.startsWith("INSERT INTO h_inventory_transactions"));
    expect(inserts).toHaveLength(1);
    expect(inserts[0].sql).toContain("'transfer'");
    expect(inserts[0].sql).toContain("NEGATIVE_RECONCILE");
    // lot_id = 메꾼 LOT(51), reference_id = 메꿔진 LOT(50), tenant 격리
    expect(inserts[0].params[0]).toBe(2);
    expect(inserts[0].params[2]).toBe(51);
    expect(inserts[0].params[7]).toBe(50);
  });

  it("양수가 모자라면 일부만 메꾸고 remainingDebt 를 남긴다", async () => {
    const { conn } = scriptedConn({
      negatives: [{ id: 50, available_quantity: "-339.500", unit: "kg", inventory_id: 7, lot_number: "NEG-615-20261007-AB12" }],
      positives: [{ id: 51, available_quantity: "100.000", unit: "kg", inventory_id: 7 }],
    });
    const r = await reconcileNegativeLots(conn, { materialId: 615, tenantId: 2 });
    expect(r.covered).toBeCloseTo(100, 6);
    expect(r.remainingDebt).toBeCloseTo(239.5, 6);
  });

  it("자리표시 LOT(NEG-) 가 0 이 되면 used 로 닫는다", async () => {
    const { conn, calls } = scriptedConn({
      negatives: [{ id: 50, available_quantity: "-5.000", unit: "kg", inventory_id: 7, lot_number: "NEG-615-20261007-AB12" }],
      positives: [{ id: 51, available_quantity: "8.000", unit: "kg", inventory_id: 7 }],
    });
    await reconcileNegativeLots(conn, { materialId: 615, tenantId: 2 });
    const closing = calls.find((c) => c.sql.includes("SET status = 'used'") && c.params[0] === 50);
    expect(closing).toBeTruthy();
  });

  it("음수 LOT 가 없으면 아무것도 쓰지 않는다", async () => {
    const { conn, calls } = scriptedConn({ negatives: [], positives: [] });
    const r = await reconcileNegativeLots(conn, { materialId: 615, tenantId: 2 });
    expect(r.skipped).toBe("no_negative");
    expect(calls.filter((c) => !c.sql.startsWith("SELECT"))).toHaveLength(0);
  });

  it("정책 OFF 면 조회조차 하지 않는다", async () => {
    process.env.INVENTORY_ALLOW_NEGATIVE = "false";
    const { conn, calls } = scriptedConn({ negatives: [], positives: [] });
    const r = await reconcileNegativeLots(conn, { materialId: 615, tenantId: 2 });
    expect(r.skipped).toBe("policy_off");
    expect(calls).toHaveLength(0);
  });
});
