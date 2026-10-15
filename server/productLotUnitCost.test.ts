/**
 * 제품 LOT 단가 = 생산원가 (2026-10-15, Codex #518·#519 검증 ①)
 * 고정 값은 단지 10/12 배치 실제 값 (승인 후 백업): LOT 에 판매가 3,800·9,000·0·0 이 들어가 있었다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const st = vi.hoisted(() => ({
  batch: null as any, inputsTotal: 0, lots: [] as any[], updates: [] as Array<[string, number]>,
}));
vi.mock("./db/connection", () => ({
  getRawConnection: vi.fn(async () => ({
    execute: vi.fn(async (q: string, p: any[]) => {
      if (/FROM h_batches/.test(q)) return [st.batch && p[1] === 2 ? [st.batch] : []];
      if (/FROM h_batch_inputs/.test(q)) return [[{ total: st.inputsTotal }]];
      if (/FROM h_inventory_lots l/.test(q)) return [p[1] === 2 ? st.lots : []];
      if (/UPDATE h_inventory_lots SET unit_price/.test(q)) { st.updates.push([p[0], p[1]]); return [{ affectedRows: 1 }]; }
      throw new Error(`unexpected SQL ${q.slice(0, 60)}`);
    }),
  })),
  withTransaction: vi.fn(),
}));

import { allocateLotUnitCosts, applyProductLotUnitCost } from "./lib/production/productLotUnitCost";
import { REPO_ROOT } from "./__helpers__/appRoutes";

beforeEach(() => {
  st.batch = null; st.inputsTotal = 0; st.lots = []; st.updates = [];
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
});

describe("applyProductLotUnitCost — 단지 10/12 배치", () => {
  const DANJI = [
    { batch: 1105, lot: 1825, qty: 52, kpu: 1.8, cost: 307044.03, expect: "5904.69" },
    { batch: 1106, lot: 1826, qty: 190, kpu: 1, cost: 434028.46, expect: "2284.36" },
    { batch: 1107, lot: 1827, qty: 40, kpu: null, cost: 156696.35, expect: "3917.41" },
    { batch: 1104, lot: 1828, qty: 475, kpu: 0.8, cost: 924024.87, expect: "1945.32" },
  ];
  for (const d of DANJI) {
    it(`배치 ${d.batch} → LOT ${d.lot} 단가 ${d.expect}`, async () => {
      st.batch = { id: d.batch, planned_date: "2026-10-12", material_cost: null, actual_cost: null };
      st.inputsTotal = d.cost;
      st.lots = [{ id: d.lot, quantity: String(d.qty), kg_per_sales_unit: d.kpu }];
      const r = await applyProductLotUnitCost(d.batch, 2);
      expect(r.applied).toBe(true);
      expect(st.updates).toEqual([[d.expect, d.lot]]);
    });
  }
  it("전기 시작일(2026-10-12) 이전 생산 배치는 건드리지 않음 (소급 없음)", async () => {
    st.batch = { id: 1082, planned_date: "2026-10-06", material_cost: 5000 };
    st.lots = [{ id: 1, quantity: 10, kg_per_sales_unit: 1 }];
    expect(await applyProductLotUnitCost(1082, 2)).toEqual({ applied: false, reason: "before_start" });
    expect(st.updates).toEqual([]);
  });
  it("원가 0 이면 그대로, 다른 회사 배치는 찾지 못함", async () => {
    st.batch = { id: 1, planned_date: "2026-10-13", material_cost: 0, actual_cost: 0 };
    st.lots = [{ id: 1, quantity: 10, kg_per_sales_unit: 1 }];
    expect(await applyProductLotUnitCost(1, 2)).toEqual({ applied: false, reason: "zero_cost" });
    expect(await applyProductLotUnitCost(1, 9)).toEqual({ applied: false, reason: "not_found" });
    expect(st.updates).toEqual([]);
  });
});

describe("완료 훅 — 생산완료 분개 전에 LOT 원가 단가 적용", () => {
  it("runBatchCompletionHooks 가 (3-1) 원가 단가 → (4) 생산완료 분개 순서로 호출", () => {
    const src = readFileSync(join(REPO_ROOT, "server/lib/production/batchCompletionHooks.ts"), "utf-8");
    const a = src.indexOf("applyProductLotUnitCost(batchId, tenantId)");
    const b = src.indexOf("postProductionCompletionJournal({ batchId, tenantId");
    expect(a).toBeGreaterThan(-1);
    expect(a).toBeLessThan(b);
  });
});
