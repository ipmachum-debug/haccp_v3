/**
 * 생산완료 분개 — 계정 선택 통합 경로 (2026-10-15, 단지 12일 배치 승인 검증에서 발견)
 *
 * 사고: 단지에는 제품(1430) 계정이 없고 '제품매출'(4010, 수익)만 있다. 이전 폴백(`name LIKE '%제품%'`)이
 *   제품매출을 골라 생산완료 분개 751~754 (1,821,793.71원) 의 차변이 매출 계정으로 전기됐다.
 * 고정: 계정표는 단지 실제 값. 제품매출을 고르지 않고 → 제품(1430, 자산) 시드 → 재조회 → 그 계정으로 전기.
 *   멱등 검사는 BATCH-110 이 BATCH-1104 전표에 걸리지 않는다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Acc = { id: number; tenant_id: number; code: string; name: string; category: string; system_code: string | null };
const db = vi.hoisted(() => ({
  accounts: [] as any[],
  entries: [] as Array<{ id: number; tenant_id: number; description: string }>,
  lines: [] as any[],
  nextId: 1000,
}));

vi.mock("./db/connection", () => {
  const exec = async (sql: string, p: any[] = []) => {
    if (/FROM h_batches/.test(sql)) return [[{ id: p[0], batch_code: "30080-20261012-001", status: "completed", planned_date: "2026-10-12", material_cost: 0, actual_cost: 0 }]];
    if (/FROM h_batch_inputs/.test(sql)) return [[{ total: "924024.87" }]];
    if (/FROM accounting_accounts/.test(sql)) {
      const t = db.accounts.filter((a) => a.tenant_id === p[0]);
      if (/WHERE tenant_id = \? AND system_code = \? AND is_active/.test(sql)) return [t.filter((a) => a.system_code === p[1]).slice(0, 1)];
      if (/system_code IS NULL OR/.test(sql)) {
        const [, sc, cat, v] = p;
        const f = /AND code = \?/.test(sql) ? "code" : "name";
        return [t.filter((a) => (!a.system_code || a.system_code === sc) && a.category === cat && a[f] === v).slice(0, 2)];
      }
      if (/system_code = \? LIMIT 1/.test(sql)) return [t.filter((a) => a.system_code === p[1])];
      if (/code = \? LIMIT 1/.test(sql)) return [t.filter((a) => a.code === p[1])];
      return [[]];
    }
    if (/UPDATE accounting_accounts SET system_code/.test(sql)) {
      const [sc, tid, code, cat] = p;
      const hit = db.accounts.filter((a) => a.tenant_id === tid && a.code === code && !a.system_code && a.category === cat);
      hit.forEach((a) => { a.system_code = sc; });
      return [{ affectedRows: hit.length }];
    }
    if (/INSERT INTO accounting_accounts/.test(sql)) {
      const [tid, category, code, name, system_code] = p;
      db.accounts.push({ id: ++db.nextId, tenant_id: tid, category, code, name, system_code });
      return [{ insertId: db.nextId }];
    }
    if (/FROM expense_journal_entries/.test(sql)) {
      const [tid, exact, like] = p;
      const prefix = String(like).replace(/%$/, "");
      return [db.entries.filter((e) => e.tenant_id === tid && (e.description === exact || e.description.startsWith(prefix)))];
    }
    if (/INSERT INTO expense_journal_entries/.test(sql)) {
      db.entries.push({ id: ++db.nextId, tenant_id: p[0], description: p[2] });
      return [{ insertId: db.nextId }];
    }
    // 제품 LOT 단가 = 생산원가 (같은 트랜잭션, 2026-10-15) — 이 테스트는 계정만 보므로 LOT 없음
    if (/FROM h_inventory_lots l/.test(sql)) return [[]];
    if (/INSERT INTO expense_journal_lines/.test(sql)) { db.lines.push({ account_id: p[2], account_code: p[3], account_name: p[4], debit: p[5], credit: p[6] }); return [{}]; }
    throw new Error(`unexpected SQL: ${sql.slice(0, 80)}`);
  };
  const pool = { execute: exec };
  return {
    getRawConnection: vi.fn(async () => pool),
    withTransaction: vi.fn(async (fn: any) => fn(pool)),
  };
});

import { postProductionCompletionJournal } from "./lib/production/productionCompletionJournal";

const DANJI: Acc[] = [
  { id: 54, tenant_id: 2, code: "1410", name: "원재료", category: "assets", system_code: "INVENTORY_RAW" },
  { id: 55, tenant_id: 2, code: "4010", name: "제품매출", category: "revenue", system_code: "SALES_REVENUE" },
  { id: 56, tenant_id: 2, code: "4020", name: "상품매출", category: "revenue", system_code: "SERVICE_REVENUE" },
  { id: 63, tenant_id: 2, code: "1420", name: "상품", category: "assets", system_code: "INVENTORY_GOODS" },
];

beforeEach(() => {
  db.accounts = DANJI.map((a) => ({ ...a }));
  db.entries = []; db.lines = []; db.nextId = 1000;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  delete process.env.PRODUCTION_JOURNAL_ENABLED;
  delete process.env.PRODUCTION_JOURNAL_START_DATE;
});

describe("생산완료 분개 — 제품매출만 있는 회사", () => {
  it("제품매출(55)을 쓰지 않고 제품(1430, 자산)을 만들어 차변 처리, 대변은 원재료(54)", async () => {
    const r = await postProductionCompletionJournal({ batchId: 1104, tenantId: 2, userId: 1 });
    expect(r.posted).toBe(true);
    const fin = db.accounts.find((a) => a.system_code === "INVENTORY_FINISHED")!;
    expect(fin).toMatchObject({ tenant_id: 2, code: "1430", name: "제품", category: "assets" });
    expect(db.lines).toEqual([
      { account_id: fin.id, account_code: "1430", account_name: "제품", debit: 924024.87, credit: 0 },
      { account_id: 54, account_code: "1410", account_name: "원재료", debit: 0, credit: 924024.87 },
    ]);
    expect(db.lines.some((l) => l.account_id === 55)).toBe(false);
  });

  it("멱등 — 같은 배치는 한 번만, BATCH-110 은 BATCH-1104 전표에 걸리지 않음", async () => {
    await postProductionCompletionJournal({ batchId: 1104, tenantId: 2, userId: 1 });
    const again = await postProductionCompletionJournal({ batchId: 1104, tenantId: 2, userId: 1 });
    expect(again).toMatchObject({ posted: false, reason: "already" });
    const other = await postProductionCompletionJournal({ batchId: 110, tenantId: 2, userId: 1 });
    expect(other.posted).toBe(true);
    expect(db.entries.map((e) => e.description.split(" ").slice(0, 2).join(" "))).toEqual(["[생산완료] BATCH-1104", "[생산완료] BATCH-110"]);
  });
});
