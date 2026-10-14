/**
 * 메뉴 정의의 역할 값 회귀 테스트 (2026-10-14, UI/UX 개편 0-3)
 *
 * 메뉴 정의 5곳(DashboardLayout 배열 · clientMenuEngine 공통 · 업종 플러그인)의 roles 에
 * 실제 users.role enum 에 없는 값("user" 등)이 들어가면 실패한다.
 * 또한 관리자·작업자·품질 담당자가 보던 핵심 메뉴가 계속 보이는지 고정한다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const ROLE_ENUM = ["super_admin", "admin", "accountant", "worker", "monitor", "inspector", "employee"];

const FILES = [
  "client/src/components/dashboard/DashboardLayout.tsx",
  "client/src/domain/engines/clientMenuEngine.ts",
  "server/domain/plugins/food.ts",
  "server/domain/plugins/cosmetic.ts",
  "server/domain/plugins/general-manufacturing.ts",
  "server/domain/plugins/health-functional.ts",
  "server/domain/plugins/medical-device.ts",
  "server/domain/plugins/pharmaceutical.ts",
];

const ITEM_RE = /label:\s*"([^"]+)",\s*path:\s*([^,]+),\s*roles:\s*\[([^\]]*)\]/g;

function readItems(file: string) {
  const text = readFileSync(join(ROOT, file), "utf-8");
  const items: Array<{ label: string; path: string; roles: string[] }> = [];
  for (const m of text.matchAll(ITEM_RE)) {
    items.push({
      label: m[1],
      path: m[2].trim().replace(/^["'`]|["'`]$/g, ""),
      roles: m[3].split(",").map((r) => r.trim().replace(/^["']|["']$/g, "")).filter(Boolean),
    });
  }
  return items;
}

describe("메뉴 roles 는 실제 역할 enum 값만 쓴다", () => {
  for (const file of FILES) {
    it(file, () => {
      const items = readItems(file);
      expect(items.length).toBeGreaterThan(0);
      const bad = items.flatMap((i) => i.roles.filter((r) => !ROLE_ENUM.includes(r)).map((r) => `${i.label} (${i.path}) → "${r}"`));
      expect(bad).toEqual([]);
    });
  }
});

describe("핵심 메뉴 노출 회귀 — 관리자·작업자·품질 담당자", () => {
  const layout = readItems("client/src/components/dashboard/DashboardLayout.tsx");
  const byPath = (p: string) => layout.filter((i) => i.path === p);

  it("admin 은 생산관리·CCP 관리·재고 관리·매출 조회·시스템 관리를 본다", () => {
    for (const p of ["/dashboard/production-management", "/quality/ccp-monitoring", "/inventory-management", "/dashboard/accounting/sales/list", "/admin/settings"]) {
      expect(byPath(p).some((i) => i.roles.includes("admin")), p).toBe(true);
    }
  });

  it("worker 는 생산관리·CCP 관리·재고 관리·Today 를 보고, 회계 메뉴는 보지 않는다", () => {
    for (const p of ["/dashboard/production-management", "/quality/ccp-monitoring", "/inventory-management", "/dashboard/today"]) {
      expect(byPath(p).some((i) => i.roles.includes("worker")), p).toBe(true);
    }
    for (const p of ["/dashboard/accounting/sales/list", "/dashboard/accounting/journal-entries", "/dashboard/accounting/payroll"]) {
      expect(byPath(p).some((i) => i.roles.includes("worker")), p).toBe(false);
    }
  });

  it("inspector 는 CCP 관리·검사 관리·체크리스트를 보고, monitor 는 승인 관리를 본다", () => {
    for (const p of ["/quality/ccp-monitoring", "/dashboard/inspections", "/quality/checklists"]) {
      expect(byPath(p).some((i) => i.roles.includes("inspector")), p).toBe(true);
    }
    expect(byPath("/dashboard/approval").some((i) => i.roles.includes("monitor"))).toBe(true);
  });
});
