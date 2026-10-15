/**
 * LOT UPDATE 대입 순서 고정 (2026-10-16, Codex #525 승인 전 검증)
 *
 * MySQL 단일 테이블 UPDATE 는 SET 을 왼쪽부터 평가하고, 앞에서 바꾼 값을 뒤 식이 읽는다.
 *   - status 식이 `available_quantity - ?` 로 한 번 더 빼면 잔량이 있어도 'used'/'disposed' (LOT #1834 358−240=118 → used)
 *   - `quantity` 를 먼저 바꾼 뒤 `COALESCE(current_quantity, quantity)` 를 읽으면 current 가 NULL 일 때 두 번 빠짐
 * 이 테스트는 서버 코드의 모든 `UPDATE h_inventory_lots … SET …` 을 훑어 같은 모양이 다시 들어오지 못하게 한다.
 * 실제 엔진 동작은 saleLotStatus.mysql.test.ts (실 MySQL 8) 에서 확인.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { REPO_ROOT } from "./__helpers__/appRoutes";

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (n === "node_modules" || n === "__fixtures__") continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".ts") && !p.includes(".test.")) out.push(p);
  }
  return out;
}
function splitTop(s: string): string[] {
  const out: string[] = []; let d = 0; let cur = "";
  for (const ch of s) {
    if (ch === "(") d++;
    if (ch === ")") d--;
    if (ch === "," && d === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out;
}

const statements = walk(join(REPO_ROOT, "server")).flatMap((f) => {
  const src = readFileSync(f, "utf-8");
  return [...src.matchAll(/UPDATE\s+h_inventory_lots\s+SET\s+([\s\S]*?)\s+WHERE/gi)].map((m) => ({
    where: `${relative(REPO_ROOT, f)}:${src.slice(0, m.index).split("\n").length}`,
    sets: splitTop(m[1]).map((p) => p.trim().match(/^(?:\w+\.)?(\w+)\s*=\s*([\s\S]*)$/)).filter(Boolean).map((x) => ({ col: x![1], rhs: x![2] })),
  }));
});

describe("h_inventory_lots UPDATE 대입 순서", () => {
  it("검사 대상이 실제로 잡힌다 (판매 확정·매입 취소·공통 재고 이동 포함)", () => {
    const files = statements.map((s) => s.where.split(":")[0]);
    for (const f of ["server/lib/accounting/productSalePost.ts", "server/lib/accounting/purchaseCancel.ts", "server/lib/inventory/applyInventoryDelta.ts"]) {
      expect(files).toContain(f);
    }
    expect(statements.length).toBeGreaterThan(15);
  });
  it("available_quantity 를 바꾼 뒤의 식은 available_quantity 에서 다시 빼지 않는다", () => {
    const bad: string[] = [];
    for (const s of statements) {
      const i = s.sets.findIndex((x) => x.col === "available_quantity");
      if (i < 0) continue;
      for (const later of s.sets.slice(i + 1)) {
        if (/available_quantity\s*[-+]\s*\?/.test(later.rhs)) bad.push(`${s.where} ${later.col}`);
      }
    }
    expect(bad).toEqual([]);
  });
  it("quantity 를 바꾼 뒤에 COALESCE(current_quantity, quantity) 를 읽지 않는다 (current_quantity 를 먼저)", () => {
    const bad: string[] = [];
    for (const s of statements) {
      const i = s.sets.findIndex((x) => x.col === "quantity");
      if (i < 0) continue;
      for (const later of s.sets.slice(i + 1)) {
        if (/COALESCE\(\s*current_quantity\s*,\s*quantity\s*\)/.test(later.rhs)) bad.push(`${s.where} ${later.col}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
