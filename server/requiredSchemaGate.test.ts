/**
 * 필수 스키마 관문 — listen 전에 (2026-10-16, Codex #527 배포 리뷰 P2)
 * 부팅 마이그레이션은 listen 뒤에 돌고 실패를 삼켜, 컬럼 생성이 실패해도 새 코드가 요청을 받을 수 있었다.
 * 고정: ensureRequiredSchema 가 필수 컬럼을 만들어 보고 그래도 없으면 ok:false → 서버가 listen 하지 않고 종료.
 *   인덱스 실패는 경고만. 실 MySQL 동작은 saleLotStatus.mysql.test.ts 끝의 케이스.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./__helpers__/appRoutes";

vi.mock("./db/connection", () => ({ getRawConnection: vi.fn(), getDb: vi.fn(), withTransaction: vi.fn() }));
import { ensureRequiredSchema } from "./db/startupMigrations";

/** 가짜 연결 — 컬럼·인덱스 유무와 DDL 실패를 주입 */
function fakeConn(o: { hasColumn: boolean; hasIndex: boolean; alterFails?: boolean; indexFails?: boolean }) {
  const ddl: string[] = [];
  const state = { ...o };
  return {
    ddl,
    query: vi.fn(async (q: string) => {
      if (/^ALTER TABLE `accounting_sales` ADD COLUMN `sku_id`/.test(q)) {
        ddl.push("alter");
        if (state.alterFails) throw Object.assign(new Error("ALTER command denied"), { code: "ER_TABLEACCESS_DENIED_ERROR" });
        state.hasColumn = true; return [{}];
      }
      if (/^CREATE INDEX `idx_sales_tenant_sku`/.test(q)) {
        ddl.push("index");
        if (state.indexFails) throw new Error("lock wait timeout");
        state.hasIndex = true; return [{}];
      }
      if (/INFORMATION_SCHEMA\.COLUMNS/.test(q)) return [state.hasColumn ? [{ COLUMN_NAME: "sku_id" }] : []];
      if (/INFORMATION_SCHEMA\.STATISTICS/.test(q)) return [state.hasIndex ? [{ 1: 1 }] : []];
      return [[]];
    }),
  };
}

describe("ensureRequiredSchema", () => {
  it("컬럼 없음 → 만들어서 ok", async () => {
    const c = fakeConn({ hasColumn: false, hasIndex: false });
    expect(await ensureRequiredSchema(c, { allowDdl: true })).toEqual({ ok: true, missing: [], warnings: [] });
    expect(c.ddl).toEqual(["alter", "index"]);
  });
  it("컬럼 생성 실패(권한 등) → ok:false, 누락 컬럼을 알려 줌", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await ensureRequiredSchema(fakeConn({ hasColumn: false, hasIndex: false, alterFails: true }), { allowDdl: true });
    expect(r.ok).toBe(false);
    expect(r.missing[0]).toMatch(/^accounting_sales\.sku_id/);
  });
  it("인덱스 생성만 실패 → ok (경고만 — 성능 영향)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await ensureRequiredSchema(fakeConn({ hasColumn: true, hasIndex: false, indexFails: true }), { allowDdl: true });
    expect(r.ok).toBe(true);
    expect(r.warnings[0]).toMatch(/idx_sales_tenant_sku 없음/);
  });
  it("RUN_STARTUP_MIGRATIONS=false (allowDdl=false) → DDL 없이 검사만, 없으면 ok:false", async () => {
    const c = fakeConn({ hasColumn: false, hasIndex: false });
    const r = await ensureRequiredSchema(c, { allowDdl: false });
    expect(c.ddl).toEqual([]);
    expect(r.ok).toBe(false);
  });
});

describe("서버 시작 순서", () => {
  it("listen 전에 필수 스키마 확인, 누락이면 listen 하지 않고 종료, DB 연결 실패는 기존처럼 계속", () => {
    const src = read("server/_core/index.ts");
    const gate = src.indexOf("ensureRequiredSchema(await getRawConnection()");
    const listen = src.indexOf("server.listen(port, '0.0.0.0'");
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(listen);
    const block = src.slice(gate, listen);
    expect(block).toMatch(/if \(schemaCheck && !schemaCheck\.ok\) \{[\s\S]*process\.exit\(1\);/);
    expect(block).toContain("DB 연결 문제로 보고 계속 시작");
  });
});

function read(p: string) { return readFileSync(join(REPO_ROOT, p), "utf-8"); }
