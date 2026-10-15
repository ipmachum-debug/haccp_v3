/**
 * 재고·LOT 정합성 점검 — 생산 흐름 (2026-10-15)
 *  - 읽기 전용: 실행되는 SQL 은 전부 SELECT
 *  - 회사 격리: 생산 흐름 조회의 첫 바인딩은 tenantId
 *  - kg 환산 비교·기간 검증·생산완료 분개 시작일
 *  - 관리자 전용
 * SQL 결과 값은 10/14 덤프에서 수작업 대조와 같은 값임을 확인함 (미출고 15줄/4월 2배치, kg 불일치 4월 1건, 판매 미차감 6월 6건).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({ executed: [] as Array<{ sql: string; params: any[] }> }));
vi.mock("./db/connection", () => ({
  getDb: vi.fn(async () => null),
  getRawConnection: vi.fn(async () => ({
    execute: vi.fn(async (sql: string, params: any[]) => {
      state.executed.push({ sql, params });
      if (/kg_per_sales_unit/.test(sql)) return [[
        { batch_id: 1082, batch_code: "30080-20261006-001", planned_date: "2026-10-06", actual_quantity: 380, lot_kg: 380, unconvertible_lots: 0 },
        { batch_id: 483, batch_code: "30063-20260407-001", planned_date: "2026-04-07", actual_quantity: 48, lot_kg: 46.8, unconvertible_lots: 0 },
        { batch_id: 9, batch_code: "X", planned_date: "2026-10-06", actual_quantity: 10, lot_kg: null, unconvertible_lots: 1 },
      ]];
      if (/pending_count/.test(sql)) return [[{ month: "2026-09", pending_count: 441, pending_amount: 1 }]];
      return [[]];
    }),
  })),
}));

import { consistencyRouter, validateRange } from "./routers/system/consistency.router";
import { kgMismatch, productionJournalStartDate, systemAccountNameMismatch } from "./lib/consistency/productionChainChecks";

const caller = (role = "admin") => consistencyRouter.createCaller({ user: { id: 4, role, tenantId: 2 }, tenantId: 2, req: {} as any, res: {} as any } as any);

beforeEach(() => { state.executed = []; delete process.env.PRODUCTION_JOURNAL_START_DATE; });

describe("생산 흐름 점검", () => {
  it("읽기 전용 — 모든 SQL 이 SELECT, 생산 흐름 조회는 회사가 첫 조건", async () => {
    const r = await caller().productionChain({ from: "2026-10-01", to: "2026-10-14" });
    expect(state.executed.length).toBeGreaterThanOrEqual(9);
    for (const e of state.executed) expect(e.sql.trim()).toMatch(/^SELECT/i);
    const chain = state.executed.filter((e) => /h_batches b|accounting_sales s/.test(e.sql));
    expect(chain.length).toBe(7);
    for (const e of chain) expect(e.params[0]).toBe(2);
    expect(r.range).toEqual({ from: "2026-10-01", to: "2026-10-14" });
  });

  it("kg 불일치: 4월 #483(48 vs 46.8)·환산 불가 LOT 은 잡고, #1082(380=475팩×0.8) 는 정상", async () => {
    const r = await caller().productionChain({ from: "2026-04-01", to: "2026-10-14" });
    const f = r.findings.find((x: any) => x.code === "PROD_LOT_KG_MISMATCH")!;
    expect(f.count).toBe(2);
    expect(f.samples.map((s: any) => s.batch_id)).toEqual([483, 9]);
    expect(r.findings.find((x: any) => x.code === "SALE_PENDING_BACKLOG")).toMatchObject({ count: 441, severity: "medium" });
  });

  it("생산완료 분개 — 시작일(기본 2026-10-12) 이전 기간이면 조회하지 않음, 이후는 시작일부터", async () => {
    expect(productionJournalStartDate()).toBe("2026-10-12");
    await caller().productionChain({ from: "2026-09-01", to: "2026-09-30" });
    expect(state.executed.some((e) => /\[생산완료\] BATCH-/.test(e.sql) && /h_batches b/.test(e.sql))).toBe(false);
    state.executed = [];
    await caller().productionChain({ from: "2026-10-01", to: "2026-10-14" });
    const j = state.executed.find((e) => /\[생산완료\] BATCH-/.test(e.sql) && /h_batches b/.test(e.sql))!;
    expect(j.params).toEqual([2, "2026-10-12", "2026-10-14"]);
  });

  it("기간 검증·관리자 전용", async () => {
    expect(validateRange("2026-10-14", "2026-10-01")).toMatch(/늦습니다/);
    expect(validateRange("2025-01-01", "2026-10-14")).toMatch(/1년/);
    expect(validateRange("2026-01-01", "2026-10-14")).toBeNull();
    await expect(caller().productionChain({ from: "2026-10-14", to: "2026-10-01" })).rejects.toThrow(/늦습니다/);
    await expect(caller("worker").productionChain({ from: "2026-10-01", to: "2026-10-14" })).rejects.toThrow();
  });

  it("kgMismatch — 1% 또는 0.5kg 허용", () => {
    expect(kgMismatch(380, 380)).toBe(false);
    expect(kgMismatch(48, 46.8)).toBe(true);
    expect(kgMismatch(1000, 995)).toBe(false);
    expect(kgMismatch(10, 10.4)).toBe(false);
    expect(kgMismatch(10, 10.6)).toBe(true);
  });
});

describe("자동분개 계정 검증 (단지 10/12 생산완료 4건·매출원가 33건이 제품매출로 전기)", () => {
  it("생산완료·매출원가 분개의 계정 역할을 대조하는 조회를 회사·기간으로 실행", async () => {
    const r = await caller().productionChain({ from: "2026-10-01", to: "2026-10-14" });
    const q = state.executed.find((e) => /expense_journal_lines l/.test(e.sql))!;
    expect(q.params).toEqual([2, "2026-10-01", "2026-10-14"]);
    expect(q.sql).toMatch(/l\.debit_amount > 0 AND COALESCE\(a\.system_code, ''\) <> 'INVENTORY_FINISHED'/);
    expect(q.sql).toMatch(/l\.credit_amount > 0 AND COALESCE\(a\.system_code, ''\) <> 'INVENTORY_RAW'/);
    expect(q.sql).toMatch(/l\.credit_amount > 0 AND COALESCE\(a\.category, ''\) <> 'assets'/);
    expect(r.findings.find((x: any) => x.code === "JOURNAL_WRONG_ACCOUNT")).toMatchObject({ severity: "critical", count: 0 });
    expect(r.findings.find((x: any) => x.code === "SYSTEM_ACCOUNT_NAME_MISMATCH")).toBeTruthy();
  });
  it("생산완료 분개 존재 점검은 BATCH-110 이 BATCH-1104 에 걸리지 않게 공백까지 비교", async () => {
    await caller().productionChain({ from: "2026-10-01", to: "2026-10-14" });
    const q = state.executed.find((e) => /\[생산완료\] BATCH-/.test(e.sql) && /h_batches b/.test(e.sql))!;
    expect(q.sql).toMatch(/LIKE CONCAT\('\[생산완료\] BATCH-', b\.id, ' %'\)/);
  });
  it("시스템 계정 이름 점검 — 매출원가 역할이 '급여', 제품 역할이 수익 계정이면 잡음", () => {
    expect(systemAccountNameMismatch("COST_OF_GOODS", "급여")).toBe(true);
    expect(systemAccountNameMismatch("COST_OF_GOODS", "매출원가")).toBe(false);
    expect(systemAccountNameMismatch("INVENTORY_FINISHED", "제품매출", "revenue")).toBe(true);
    expect(systemAccountNameMismatch("INVENTORY_FINISHED", "제품", "assets")).toBe(false);
    expect(systemAccountNameMismatch("ACCOUNTS_PAYABLE", "미지급금")).toBe(false);
    expect(systemAccountNameMismatch("CASH", "아무거나")).toBe(false);
  });
});

describe("혼합(번들) 매출 차감 연결 — 오탐 수정 (운영 백업 10/15: 222건 → 85건)", () => {
  it("판매 미차감 점검이 bundle_lots('sales:<id>')·BUNDLE_OUTBOUND reference 로 혼합 차감을 인정", async () => {
    await caller().productionChain({ from: "2026-04-01", to: "2026-10-15" });
    const q = state.executed.find((e) => /accounting_sales s/.test(e.sql) && /approved/.test(e.sql))!;
    expect(q.sql).toMatch(/bundle_lots bl WHERE bl\.tenant_id = s\.tenant_id AND bl\.notes = CONCAT\('sales:', s\.id\)/);
    expect(q.sql).toMatch(/t2\.source_type = 'BUNDLE_OUTBOUND' AND t2\.reference_type = 'sales' AND t2\.reference_id = s\.id/);
    expect(q.sql).not.toMatch(/IN \('SALE', 'SALE_LEGACY', 'BUNDLE_OUTBOUND'\)/); // source_id 로는 혼합 LOT 번호라 매칭 불가
  });
  it("혼합 차감 거래에 판매 번호를 함께 기록 (reference_type·reference_id)", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { REPO_ROOT } = await import("./__helpers__/appRoutes");
    const src = readFileSync(join(REPO_ROOT, "server/lib/production/decomposeBundleOutbound.ts"), "utf-8");
    expect(src.match(/performed_by, created_by(, notes)?, reference_type, reference_id\)/g)?.length).toBe(2);
    expect(src.match(/params\.referenceType \?\? null, params\.referenceId \?\? null/g)?.length).toBe(2);
  });
});
