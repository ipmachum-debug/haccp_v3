/**
 * 제품 LOT 단가 = 생산원가 (2026-10-15, Codex #518·#519 검증 ①)
 * 고정 값은 단지 10/12 배치 실제 값 (승인 후 백업): LOT 에 판매가 3,800·9,000·0·0 이 들어가 있었다.
 * #521 배포 후 안전점검 P1 2건 (출고 LOT 재평가 차단 · 다중 LOT 원자 적용) 회귀 포함.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const st = vi.hoisted(() => ({
  batch: null as any, inputsTotal: 0, lots: [] as any[], updates: [] as Array<[string, number]>,
  failOnUpdateIndex: -1 as number, tx: [] as string[],
}));
vi.mock("./db/connection", () => {
  const execute = vi.fn(async (q: string, p: any[]) => {
    if (/FROM h_batches/.test(q) && /FOR UPDATE/.test(q)) { st.tx.push("lock:batch"); return [[{ id: p[0] }]]; }
    if (/FROM h_batches/.test(q)) return [st.batch && p[1] === 2 ? [st.batch] : []];
    if (/FROM h_batch_inputs/.test(q)) return [[{ total: st.inputsTotal }]];
    if (/FROM h_inventory_lots l/.test(q)) {
      if (!/FOR UPDATE/.test(q)) throw new Error("LOT 조회는 행 잠금(FOR UPDATE) 이어야 함");
      st.tx.push("lock:lots");
      return [p[1] === 2 ? st.lots.map((l) => ({ unit_price: "0.00", issued: 0, ...l })) : []];
    }
    if (/UPDATE h_inventory_lots SET unit_price/.test(q)) {
      if (st.updates.length === st.failOnUpdateIndex) throw new Error("synthetic second LOT write failure");
      st.updates.push([p[0], p[1]]); return [{ affectedRows: 1 }];
    }
    throw new Error(`unexpected SQL ${q.slice(0, 60)}`);
  });
  const conn = { execute, query: execute };
  return {
    getRawConnection: vi.fn(async () => conn),
    withTransaction: vi.fn(async (fn: (c: any) => Promise<any>) => {
      st.tx.push("begin");
      try { const r = await fn(conn); st.tx.push("commit"); return r; }
      catch (e) { st.tx.push("rollback"); st.updates = []; throw e; } // 롤백 = 트랜잭션 안의 쓰기 전부 취소
    }),
  };
});

import { allocateLotUnitCosts, applyProductLotUnitCost, sameUnitCost } from "./lib/production/productLotUnitCost";
import { REPO_ROOT } from "./__helpers__/appRoutes";

beforeEach(() => {
  st.batch = null; st.inputsTotal = 0; st.lots = []; st.updates = []; st.failOnUpdateIndex = -1; st.tx = [];
  delete process.env.PRODUCTION_JOURNAL_START_DATE;
});

describe("allocateLotUnitCosts — kg 비율 배분", () => {
  it("단일 SKU: 1104 아끼니찹쌀떡 475팩 × 0.8kg, 원가 924,024.87 → 팩당 1,945.32 (판매가 3,800 아님)", () => {
    expect(allocateLotUnitCosts(924024.87, [{ id: 1828, quantity: 475, kgPerUnit: 0.8 }])).toEqual([{ id: 1828, unitCost: 1945.32 }]);
  });
  it("여러 SKU: kg 비율로 나누고 (수량 × 단가) 합 ≈ 배치 원가", () => {
    const lots = [{ id: 1, quantity: 100, kgPerUnit: 0.8 }, { id: 2, quantity: 30, kgPerUnit: 1.8 }, { id: 3, quantity: 26, kgPerUnit: 1 }];
    const r = allocateLotUnitCosts(300000, lots);
    const perKg = 300000 / (80 + 54 + 26);
    expect(r).toEqual([{ id: 1, unitCost: Math.round(perKg * 0.8 * 100) / 100 }, { id: 2, unitCost: Math.round(perKg * 1.8 * 100) / 100 }, { id: 3, unitCost: Math.round(perKg * 100) / 100 }]);
    const total = r.reduce((a, x, i) => a + x.unitCost * lots[i].quantity, 0);
    expect(Math.abs(total - 300000)).toBeLessThan(1);
  });
  it("원가 0·kg 0 이면 배분 없음, 수량 0 LOT 은 제외", () => {
    expect(allocateLotUnitCosts(0, [{ id: 1, quantity: 10, kgPerUnit: 1 }])).toEqual([]);
    expect(allocateLotUnitCosts(1000, [{ id: 1, quantity: 0, kgPerUnit: 1 }])).toEqual([]);
    expect(allocateLotUnitCosts(1000, [{ id: 1, quantity: 10, kgPerUnit: 1 }, { id: 2, quantity: 0, kgPerUnit: 1 }])).toEqual([{ id: 1, unitCost: 100 }]);
  });
  it("반올림 잔차 (단지 10/12 4건): 소수 2자리 단가 × 수량 합이 배치 원가와 +1.97원 차이 — 10원 허용 안", () => {
    const danji = [
      { q: 475, cost: 924024.87, kpu: 0.8 }, { q: 52, cost: 307044.03, kpu: 1.8 },
      { q: 190, cost: 434028.46, kpu: 1 }, { q: 40, cost: 156696.35, kpu: 1 },
    ];
    let diff = 0;
    for (const d of danji) {
      const [r] = allocateLotUnitCosts(d.cost, [{ id: 1, quantity: d.q, kgPerUnit: d.kpu }]);
      diff += r.unitCost * d.q - d.cost;
    }
    expect(Math.round(diff * 100) / 100).toBe(1.97);
    expect(Math.abs(diff)).toBeLessThan(10);
  });
  it("sameUnitCost — DECIMAL(10,2) 문자열과 2자리 계산값 비교", () => {
    expect(sameUnitCost("1945.32", 1945.32)).toBe(true);
    expect(sameUnitCost("3800.00", 1945.32)).toBe(false);
    expect(sameUnitCost(null, 0)).toBe(true);
    expect(sameUnitCost(null, 100)).toBe(false);
  });
});

describe("applyProductLotUnitCost — 단지 10/12 배치", () => {
  const DANJI = [
    { batch: 1105, lot: 1825, qty: 52, kpu: 1.8, cost: 307044.03, price: "9000.00", expect: "5904.69" },
    { batch: 1106, lot: 1826, qty: 190, kpu: 1, cost: 434028.46, price: "0.00", expect: "2284.36" },
    { batch: 1107, lot: 1827, qty: 40, kpu: null, cost: 156696.35, price: "0.00", expect: "3917.41" },
    { batch: 1104, lot: 1828, qty: 475, kpu: 0.8, cost: 924024.87, price: "3800.00", expect: "1945.32" },
  ];
  for (const d of DANJI) {
    it(`배치 ${d.batch} → LOT ${d.lot} 단가 ${d.price} → ${d.expect} (입고 1건뿐, 출고 없음)`, async () => {
      st.batch = { id: d.batch, planned_date: "2026-10-12", material_cost: null, actual_cost: null };
      st.inputsTotal = d.cost;
      st.lots = [{ id: d.lot, quantity: String(d.qty), unit_price: d.price, kg_per_sales_unit: d.kpu, issued: 0 }];
      const r = await applyProductLotUnitCost(d.batch, 2);
      expect(r.applied).toBe(true);
      expect(st.updates).toEqual([[d.expect, d.lot]]);
      expect(st.tx).toEqual(["begin", "lock:batch", "lock:lots", "commit"]);
    });
  }
  it("전기 시작일(2026-10-12) 이전 생산 배치는 건드리지 않음 (소급 없음)", async () => {
    st.batch = { id: 1082, planned_date: "2026-10-06", material_cost: 5000 };
    st.lots = [{ id: 1, quantity: 10, kg_per_sales_unit: 1 }];
    expect(await applyProductLotUnitCost(1082, 2)).toEqual({ applied: false, reason: "before_start" });
    expect(st.updates).toEqual([]);
    expect(st.tx).toEqual([]);
  });
  it("원가 0 이면 그대로, 다른 회사 배치는 찾지 못함", async () => {
    st.batch = { id: 1, planned_date: "2026-10-13", material_cost: 0, actual_cost: 0 };
    st.lots = [{ id: 1, quantity: 10, kg_per_sales_unit: 1 }];
    expect(await applyProductLotUnitCost(1, 2)).toEqual({ applied: false, reason: "zero_cost" });
    expect(await applyProductLotUnitCost(1, 9)).toEqual({ applied: false, reason: "not_found" });
    expect(st.updates).toEqual([]);
  });
  it("멱등: 이미 같은 단가면 UPDATE 0건 (changed=0)", async () => {
    st.batch = { id: 1104, planned_date: "2026-10-12", material_cost: 924024.87 };
    st.lots = [{ id: 1828, quantity: "475", unit_price: "1945.32", kg_per_sales_unit: 0.8 }];
    const r = await applyProductLotUnitCost(1104, 2);
    expect(r).toMatchObject({ applied: true, changed: 0 });
    expect(st.updates).toEqual([]);
  });
});

describe("P1-1 출고 이력이 있는 LOT 은 재평가하지 않음", () => {
  it("수량 10·잔량 5 (출고 거래 있음) LOT 에 원가 1000 → UPDATE 없음, lot_issued", async () => {
    st.batch = { id: 7, planned_date: "2026-10-13", material_cost: 1000 };
    st.lots = [{ id: 990011, quantity: "10", unit_price: "3800.00", kg_per_sales_unit: 1, issued: 1 }];
    const r = await applyProductLotUnitCost(7, 2);
    expect(r).toEqual({ applied: false, reason: "lot_issued", batchCost: 1000, issuedLots: [{ id: 990011, currentUnitPrice: 3800, unitCost: 100 }] });
    expect(st.updates).toEqual([]);
  });
  it("출고 취소로 잔량이 복원돼도 거래 이력 기준 — 그대로 차단 (quantity=available 만 보지 않음)", async () => {
    st.batch = { id: 7, planned_date: "2026-10-13", material_cost: 1000 };
    // 조회 쿼리가 EXISTS(h_inventory_transactions 입고 외 / h_product_outbound 취소 포함 / bundle_lots) 로 판정
    const src = readFileSync(join(REPO_ROOT, "server/lib/production/productLotUnitCost.ts"), "utf-8");
    expect(src).toMatch(/h_inventory_transactions t[\s\S]*transaction_type NOT IN \('receipt', 'inbound'\)/);
    expect(src).toMatch(/FROM h_product_outbound o[\s\S]*o\.lot_id = l\.id\)/); // status 조건 없음 — 취소도 이력
    expect(src).toMatch(/FROM bundle_lots bl[\s\S]*bl\.child_lot_id = l\.id/);
    expect(src).not.toMatch(/available_quantity/);
    st.lots = [{ id: 1, quantity: "10", unit_price: "3800.00", kg_per_sales_unit: 1, issued: 1 }];
    expect((await applyProductLotUnitCost(7, 2)).applied).toBe(false);
    expect(st.updates).toEqual([]);
  });
  it("출고 LOT 이라도 현재 단가가 계산값과 같으면(멱등 재실행) 통과하고 다른 LOT 만 갱신", async () => {
    st.batch = { id: 7, planned_date: "2026-10-13", material_cost: 2000 };
    st.lots = [
      { id: 1, quantity: "10", unit_price: "100.00", kg_per_sales_unit: 1, issued: 1 },
      { id: 2, quantity: "10", unit_price: "0.00", kg_per_sales_unit: 1, issued: 0 },
    ];
    const r = await applyProductLotUnitCost(7, 2);
    expect(r).toMatchObject({ applied: true, changed: 1 });
    expect(st.updates).toEqual([["100.00", 2]]);
  });
  it("출고 LOT 하나라도 단가가 다르면 배치 전체 미적용 (일부 LOT 만 바꾸면 합 ≠ 배치 원가)", async () => {
    st.batch = { id: 7, planned_date: "2026-10-13", material_cost: 2000 };
    st.lots = [
      { id: 1, quantity: "10", unit_price: "3800.00", kg_per_sales_unit: 1, issued: 1 },
      { id: 2, quantity: "10", unit_price: "0.00", kg_per_sales_unit: 1, issued: 0 },
    ];
    expect((await applyProductLotUnitCost(7, 2)).applied).toBe(false);
    expect(st.updates).toEqual([]);
  });
});

describe("P1-2 다중 LOT 갱신은 한 트랜잭션 (전체 또는 전무)", () => {
  it("두 번째 LOT UPDATE 실패 → 롤백, 첫 번째 변경도 남지 않고 오류가 전파됨", async () => {
    st.batch = { id: 8, planned_date: "2026-10-13", material_cost: 2000 };
    st.lots = [
      { id: 990021, quantity: "10", unit_price: "0.00", kg_per_sales_unit: 1 },
      { id: 990022, quantity: "10", unit_price: "0.00", kg_per_sales_unit: 1 },
    ];
    st.failOnUpdateIndex = 1;
    await expect(applyProductLotUnitCost(8, 2)).rejects.toThrow("synthetic second LOT write failure");
    expect(st.tx).toEqual(["begin", "lock:batch", "lock:lots", "rollback"]);
    expect(st.updates).toEqual([]);
  });
  it("성공 시 배치 행 → LOT 행 순서로 잠그고 한 번에 커밋", async () => {
    st.batch = { id: 8, planned_date: "2026-10-13", material_cost: 2000 };
    st.lots = [
      { id: 1, quantity: "10", unit_price: "0.00", kg_per_sales_unit: 1 },
      { id: 2, quantity: "10", unit_price: "0.00", kg_per_sales_unit: 1 },
    ];
    const r = await applyProductLotUnitCost(8, 2);
    expect(r).toMatchObject({ applied: true, changed: 2 });
    expect(st.updates).toEqual([["100.00", 1], ["100.00", 2]]);
    expect(st.tx).toEqual(["begin", "lock:batch", "lock:lots", "commit"]);
  });
});

describe("완료 훅 — 원가 단가가 확정돼야 생산완료 분개", () => {
  const src = readFileSync(join(REPO_ROOT, "server/lib/production/batchCompletionHooks.ts"), "utf-8");
  it("runBatchCompletionHooks 가 (3-1) 원가 단가 → (4) 생산완료 분개 순서로 호출", () => {
    const a = src.indexOf("applyProductLotUnitCost(batchId, tenantId)");
    const b = src.indexOf("postProductionCompletionJournal({ batchId, tenantId");
    expect(a).toBeGreaterThan(-1);
    expect(a).toBeLessThan(b);
  });
  it("(3-1) 이 throw 하거나 lot_issued 면 lotCostSettled=false → (4) 분개를 호출하지 않음", () => {
    expect(src).toMatch(/catch \(e: any\) \{\s*lotCostSettled = false;/);
    expect(src).toMatch(/cr\.reason === "lot_issued"\) \{\s*lotCostSettled = false;/);
    const gate = src.indexOf("if (!lotCostSettled) {");
    const journal = src.indexOf("postProductionCompletionJournal({ batchId, tenantId");
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(journal);
    expect(src.slice(gate, journal)).toMatch(/\} else \{/);
  });
});
