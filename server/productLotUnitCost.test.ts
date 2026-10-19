/**
 * 제품 LOT 단가 = 생산원가 (2026-10-15, Codex #518·#519 검증 ① → #521 안전성 리뷰 회귀 테스트)
 * 고정 값은 단지 10/12 배치 실제 값 (승인 후 백업): LOT 에 판매가 3,800·9,000·0·0 이 들어가 있었다.
 *
 * Codex 리뷰 요청 1~6:
 *   1. 출고 이력 LOT 재평가 금지 — 단가·전표 불변
 *   2. 출고 취소로 잔량이 복원된 LOT 도 거래 이력으로 판단
 *   3. 여러 LOT 중 두 번째 갱신 실패 → 전체 변경 0
 *   4. 원가 적용 실패 → 생산완료 분개도 남지 않음
 *   5. 재시도·멱등 — 분개가 있으면 단가 확정 (다시 바꾸지 않음)
 *   6. 반올림 잔차를 결과로 돌려줌
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Lot = { id: number; batch_id: number; quantity: number; available_quantity: number; unit_price: number; kg_per_sales_unit: number | null };
const db = vi.hoisted(() => ({
  batch: null as any,
  inputsTotal: 0,
  lots: [] as any[],
  txs: [] as Array<{ lot_id: number; transaction_type: string }>,
  outbounds: [] as Array<{ lot_id: number }>,
  entries: [] as Array<{ id: number; tenant_id: number; description: string; total_debit: number }>,
  lines: [] as any[],
  failUpdateOnLot: null as number | null,
  nextId: 900,
}));

/** 아주 작은 트랜잭션 흉내 — 쓰기는 버퍼에 모았다가 commit 때 반영, 예외면 버림 */
function makeExec(pending: Array<() => void> | null) {
  const apply = (fn: () => void) => (pending ? pending.push(fn) : fn());
  return async (q: string, p: any[] = []) => {
    if (/FROM h_batches/.test(q)) return [db.batch && p[1] === 2 ? [db.batch] : []];
    if (/FROM h_batch_inputs/.test(q)) return [[{ total: db.inputsTotal }]];
    if (/FROM accounting_accounts/.test(q)) {
      const sc = /system_code = \? AND is_active/.test(q) ? p[1] : null;
      const map: any = { INVENTORY_FINISHED: { id: 159, code: "1430", name: "제품", category: "assets" }, INVENTORY_RAW: { id: 54, code: "1410", name: "원재료", category: "assets" } };
      return [sc && map[sc] ? [map[sc]] : []];
    }
    if (/FROM h_inventory_lots l/.test(q) && /FOR UPDATE/.test(q)) {
      return [db.lots.filter((l) => l.batch_id === p[0] && p[1] === 2).map((l) => ({ ...l }))];
    }
    if (/FROM h_inventory_transactions t/.test(q)) {
      const ids = new Set(p.slice(1, p.indexOf("inbound")));
      const a = db.txs.filter((t) => ids.has(t.lot_id) && !["inbound", "receipt"].includes(t.transaction_type)).map((t) => ({ lot_id: t.lot_id }));
      const b = db.outbounds.filter((o) => ids.has(o.lot_id)).map((o) => ({ lot_id: o.lot_id }));
      return [[...a, ...b]];
    }
    if (/UPDATE h_inventory_lots SET unit_price/.test(q)) {
      if (db.failUpdateOnLot === p[1]) throw new Error(`UPDATE 실패 (LOT ${p[1]})`);
      apply(() => { const l = db.lots.find((x) => x.id === p[1]); if (l) l.unit_price = Number(p[0]); });
      return [{ affectedRows: 1 }];
    }
    if (/FROM expense_journal_entries/.test(q)) {
      const [tid, exact, like] = p;
      const prefix = String(like).replace(/%$/, "");
      return [db.entries.filter((e) => e.tenant_id === tid && (e.description === exact || e.description.startsWith(prefix)))];
    }
    if (/INSERT INTO expense_journal_entries/.test(q)) {
      const id = ++db.nextId;
      apply(() => db.entries.push({ id, tenant_id: p[0], description: p[2], total_debit: Number(p[3]) }));
      return [{ insertId: id }];
    }
    if (/INSERT INTO expense_journal_lines/.test(q)) { apply(() => db.lines.push({ account_id: p[2], debit: p[5], credit: p[6] })); return [{}]; }
    throw new Error(`unexpected SQL: ${q.slice(0, 80)}`);
  };
}

// 출고 판정(issuedBatchLines) 은 이 시험 대상이 아님 — 미출고 줄 없음으로 (실제 판정은 saleLotStatus.mysql.test)
vi.mock("./lib/production/issuedBatchLines", () => ({ countUnissuedBatchLines: vi.fn(async () => 0) }));
vi.mock("./db/connection", () => ({
  getRawConnection: vi.fn(async () => ({ execute: makeExec(null) })),
  withTransaction: vi.fn(async (fn: any) => {
    const pending: Array<() => void> = [];
    const r = await fn({ execute: makeExec(pending) });
    pending.forEach((f) => f()); // commit
    return r;
  }),
}));

import { allocateLotUnitCosts, revalueProductLotsFromPostedJournal } from "./lib/production/productLotUnitCost";
import { postProductionCompletionJournal } from "./lib/production/productionCompletionJournal";
import { REPO_ROOT } from "./__helpers__/appRoutes";

const lot = (id: number, batch_id: number, quantity: number, unit_price: number, kg: number | null): Lot =>
  ({ id, batch_id, quantity, available_quantity: quantity, unit_price, kg_per_sales_unit: kg });
const DANJI = [
  { batch: 1105, lot: lot(1825, 1105, 52, 9000, 1.8), cost: 307044.03, unit: 5904.69, residual: 0.15 },
  { batch: 1106, lot: lot(1826, 1106, 190, 0, 1), cost: 434028.46, unit: 2284.36, residual: 0.06 },
  { batch: 1107, lot: lot(1827, 1107, 40, 0, null), cost: 156696.35, unit: 3917.41, residual: -0.05 },
  { batch: 1104, lot: lot(1828, 1104, 475, 3800, 0.8), cost: 924024.87, unit: 1945.32, residual: -2.13 },
];
const setBatch = (d: (typeof DANJI)[number]) => {
  db.batch = { id: d.batch, batch_code: `B${d.batch}`, status: "completed", planned_date: "2026-10-12", material_cost: null, actual_cost: null };
  db.inputsTotal = d.cost;
  db.lots = [{ ...d.lot }];
};

beforeEach(() => {
  db.batch = null; db.inputsTotal = 0; db.lots = []; db.txs = []; db.outbounds = []; db.entries = []; db.lines = [];
  db.failUpdateOnLot = null; db.nextId = 900;
  delete process.env.PRODUCTION_JOURNAL_START_DATE;
  delete process.env.PRODUCTION_JOURNAL_ENABLED;
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("allocateLotUnitCosts — kg 비율 배분", () => {
  it("단일 SKU: 1104 아끼니찹쌀떡 475팩 × 0.8kg, 원가 924,024.87 → 팩당 1,945.32 (판매가 3,800 아님)", () => {
    expect(allocateLotUnitCosts(924024.87, [{ id: 1828, quantity: 475, kgPerUnit: 0.8 }])).toEqual([{ id: 1828, unitCost: 1945.32 }]);
  });
  it("여러 SKU: kg 비율로 나누고 (수량 × 단가) 합 ≈ 배치 원가", () => {
    const lots = [{ id: 1, quantity: 100, kgPerUnit: 0.8 }, { id: 2, quantity: 30, kgPerUnit: 1.8 }, { id: 3, quantity: 26, kgPerUnit: 1 }];
    const r = allocateLotUnitCosts(300000, lots);
    const total = r.reduce((a, x, i) => a + x.unitCost * lots[i].quantity, 0);
    expect(Math.abs(total - 300000)).toBeLessThan(1);
  });
  it("원가 0·kg 0 이면 배분 없음, 수량 0 LOT 은 제외", () => {
    expect(allocateLotUnitCosts(0, [{ id: 1, quantity: 10, kgPerUnit: 1 }])).toEqual([]);
    expect(allocateLotUnitCosts(1000, [{ id: 1, quantity: 0, kgPerUnit: 1 }])).toEqual([]);
    expect(allocateLotUnitCosts(1000, [{ id: 1, quantity: 10, kgPerUnit: 1 }, { id: 2, quantity: 0, kgPerUnit: 1 }])).toEqual([{ id: 1, unitCost: 100 }]);
  });
});

describe("생산완료 분개와 같은 트랜잭션에서 LOT 단가 = 생산원가 (단지 10/12)", () => {
  for (const d of DANJI) {
    it(`배치 ${d.batch} → 분개 ${d.cost} + LOT ${d.lot.id} 단가 ${d.unit}, 반올림 잔차 ${d.residual}`, async () => {
      setBatch(d);
      const r: any = await postProductionCompletionJournal({ batchId: d.batch, tenantId: 2, userId: 1 });
      expect(r.posted).toBe(true);
      expect(r.lotCost).toEqual({ applied: true, batchCost: d.cost, lots: [{ id: d.lot.id, unitCost: d.unit }], residual: d.residual });
      expect(db.lots[0].unit_price).toBe(d.unit);
      expect(db.entries).toHaveLength(1);
    });
  }
  it("6. 4건 반올림 잔차 합 −1.97원 (배치 원가 − 수량 × 단가) — 제품 계정 잔액에 남고 점검 허용 범위 안", () => {
    expect(Math.round(DANJI.reduce((a, d) => a + d.residual, 0) * 100) / 100).toBe(-1.97);
  });

  it("1. 판매(usage) 이력이 있는 LOT 은 재평가 안 함 — 분개는 전기, 단가 그대로", async () => {
    setBatch(DANJI[3]);
    db.lots[0].available_quantity = 400;
    db.txs = [{ lot_id: 1828, transaction_type: "inbound" }, { lot_id: 1828, transaction_type: "usage" }];
    const r: any = await postProductionCompletionJournal({ batchId: 1104, tenantId: 2, userId: 1 });
    expect(r.posted).toBe(true);
    expect(r.lotCost).toEqual({ applied: false, reason: "has_movement", detail: "LOT 1828" });
    expect(db.lots[0].unit_price).toBe(3800);
  });
  it("2. 판매 취소로 잔량이 원래대로 돌아온 LOT 도 거래 이력(return)으로 재평가 안 함", async () => {
    setBatch(DANJI[3]);
    db.txs = [{ lot_id: 1828, transaction_type: "inbound" }, { lot_id: 1828, transaction_type: "usage" }, { lot_id: 1828, transaction_type: "return" }];
    const r: any = await postProductionCompletionJournal({ batchId: 1104, tenantId: 2, userId: 1 });
    expect(r.lotCost.reason).toBe("has_movement");
    expect(db.lots[0].unit_price).toBe(3800);
  });
  it("1-2. 제품 출고 기록만 있어도 (거래 원장 없이) 재평가 안 함", async () => {
    setBatch(DANJI[3]);
    db.outbounds = [{ lot_id: 1828 }];
    const r: any = await postProductionCompletionJournal({ batchId: 1104, tenantId: 2, userId: 1 });
    expect(r.lotCost.reason).toBe("has_movement");
  });
  it("1-3. 여러 LOT 중 하나라도 움직였으면 배치 전체를 건너뜀 (일부만 바꾸면 배분 합이 깨짐)", async () => {
    setBatch(DANJI[3]);
    db.lots = [lot(1, 1104, 100, 3800, 0.8), lot(2, 1104, 50, 9000, 1.8)];
    db.txs = [{ lot_id: 2, transaction_type: "usage" }];
    const r: any = await postProductionCompletionJournal({ batchId: 1104, tenantId: 2, userId: 1 });
    expect(r.lotCost).toMatchObject({ applied: false, reason: "has_movement", detail: "LOT 2" });
    expect(db.lots.map((l) => l.unit_price)).toEqual([3800, 9000]);
  });

  it("3·4. 두 번째 LOT 갱신 실패 → 첫 LOT 단가도, 생산완료 분개도 남지 않음 (통째로 되돌림)", async () => {
    setBatch(DANJI[3]);
    db.lots = [lot(1, 1104, 100, 3800, 0.8), lot(2, 1104, 50, 9000, 1.8)];
    db.failUpdateOnLot = 2;
    await expect(postProductionCompletionJournal({ batchId: 1104, tenantId: 2, userId: 1 })).rejects.toThrow(/UPDATE 실패/);
    expect(db.lots.map((l) => l.unit_price)).toEqual([3800, 9000]);
    expect(db.entries).toEqual([]);
    expect(db.lines).toEqual([]);
    // 재시도 — 원인이 사라지면 분개와 단가가 함께 들어간다
    db.failUpdateOnLot = null;
    const r: any = await postProductionCompletionJournal({ batchId: 1104, tenantId: 2, userId: 1 });
    expect(r.posted).toBe(true);
    expect(db.entries).toHaveLength(1);
    expect(db.lots.every((l) => l.unit_price !== 3800 && l.unit_price !== 9000)).toBe(true);
  });

  it("5. 분개가 이미 있으면 단가 확정 — 완료 훅 재실행·원가 변경에도 다시 바꾸지 않음", async () => {
    setBatch(DANJI[3]);
    await postProductionCompletionJournal({ batchId: 1104, tenantId: 2, userId: 1 });
    expect(db.lots[0].unit_price).toBe(1945.32);
    db.inputsTotal = 999999; // 나중에 투입 원가가 바뀌어도
    db.lots[0].unit_price = 1945.32;
    const again: any = await postProductionCompletionJournal({ batchId: 1104, tenantId: 2, userId: 1 });
    expect(again).toMatchObject({ posted: false, reason: "already" });
    expect(db.lots[0].unit_price).toBe(1945.32);
    expect(db.entries).toHaveLength(1);
  });

  it("전기 시작일 이전 생산 배치는 분개도 단가도 그대로 (소급 없음)", async () => {
    setBatch(DANJI[3]);
    db.batch.planned_date = "2026-10-06";
    const r: any = await postProductionCompletionJournal({ batchId: 1104, tenantId: 2, userId: 1 });
    expect(r).toMatchObject({ posted: false, reason: "before_start" });
    expect(db.lots[0].unit_price).toBe(3800);
  });
});

describe("기존 LOT 보정 — 전기된 분개 금액으로 (단지 1825~1828 1회성)", () => {
  it("분개 금액으로 단가 맞춤, 다시 실행해도 같은 값", async () => {
    db.lots = [lot(1828, 1104, 475, 3800, 0.8)];
    db.entries = [{ id: 754, tenant_id: 2, description: "[생산완료] BATCH-1104 30080-20261012-001 원재료 → 제품", total_debit: 924024.87 }];
    const r: any = await revalueProductLotsFromPostedJournal(1104, 2);
    expect(r).toEqual({ applied: true, batchCost: 924024.87, lots: [{ id: 1828, unitCost: 1945.32 }], residual: -2.13 });
    await revalueProductLotsFromPostedJournal(1104, 2);
    expect(db.lots[0].unit_price).toBe(1945.32);
  });
  it("BATCH-110 은 BATCH-1104 분개를 쓰지 않음 → not_posted, 움직임 있으면 거부", async () => {
    db.lots = [lot(1, 110, 10, 100, 1)];
    db.entries = [{ id: 754, tenant_id: 2, description: "[생산완료] BATCH-1104 x", total_debit: 924024.87 }];
    expect(await revalueProductLotsFromPostedJournal(110, 2)).toEqual({ applied: false, reason: "not_posted" });
    db.lots = [lot(1828, 1104, 475, 3800, 0.8)];
    db.txs = [{ lot_id: 1828, transaction_type: "usage" }];
    expect(await revalueProductLotsFromPostedJournal(1104, 2)).toMatchObject({ applied: false, reason: "has_movement" });
    expect(db.lots[0].unit_price).toBe(3800);
  });
});

describe("호출 구조", () => {
  it("완료 훅은 단가를 따로 바꾸지 않고, 생산완료 분개가 같은 트랜잭션에서 INSERT 뒤 LOT 단가를 맞춘다", () => {
    const hooks = readFileSync(join(REPO_ROOT, "server/lib/production/batchCompletionHooks.ts"), "utf-8");
    expect(hooks).not.toMatch(/applyProductLotUnitCost|valueProductLotsInTx\(/);
    const j = readFileSync(join(REPO_ROOT, "server/lib/production/productionCompletionJournal.ts"), "utf-8");
    const tx = j.slice(j.indexOf("return await withTransaction(async (conn)"));
    expect(tx.indexOf("INSERT INTO expense_journal_entries")).toBeGreaterThan(-1);
    expect(tx.indexOf("valueProductLotsInTx(conn, p.batchId, p.tenantId, amount)")).toBeGreaterThan(tx.indexOf("INSERT INTO expense_journal_entries"));
  });
});
