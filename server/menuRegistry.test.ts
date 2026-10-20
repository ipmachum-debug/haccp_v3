/**
 * 메뉴 레지스트리 스냅샷 테스트 (UI/UX 개편 2-a, 2026-10-14)
 *
 * 2-a 의 약속: 메뉴 출처를 한 곳으로 모아도 **화면상 메뉴는 기존과 완전히 같다.**
 * 기준값은 2-a 이전 DashboardLayout 배열에서 뽑은 server/__fixtures__/menu-snapshot-2026-10-14.json.
 * 2-b 에서 허브로 바꿀 때는 이 테스트의 기대값(픽스처)을 의도한 차이만큼 갱신한다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  selectTabMenu, selectAllMenus, CHILD_ROUTES, DEMO_ALLOWED_PATHS, PLUGIN_COMMON_GROUPS, MENU_PLACEMENTS,
  isChildRouteOf, CONSOLIDATED_PLACEMENTS, HUB_BY_PATH,
} from "../shared/navigation/menuRegistry";
import { ROUTES } from "../client/src/lib/routePaths";

type Snap = {
  haccpLegacy: { base: any[]; withGogogopick: any[] };
  work: { erpOnly: any[]; full: any[] };
  finance: { erpOnly: any[]; full: any[] };
  superAdmin: any[];
  childRoutes: Record<string, string[]>;
  demoAllowedPaths: string[];
};
const snap: Snap = JSON.parse(readFileSync(join(__dirname, "__fixtures__", "menu-snapshot-2026-10-14.json"), "utf-8"));

const strip = (p: any) => {
  const o: any = { icon: p.icon, label: p.label, path: p.path, roles: [...p.roles] };
  if (p.group) o.group = p.group;
  if (p.requireModule) o.requireModule = p.requireModule;
  if (p.category) o.category = p.category;
  if (p.highlight) o.highlight = true;
  return o;
};

describe("2-a 메뉴 레지스트리 — 탭별 결과가 2026-10-14 스냅샷과 같다", () => {
  it("HACCP 탭 폴백 (플러그인 없음) — 기본 / GOGOGOPICK 플래그", () => {
    expect(selectTabMenu("haccp", { isErpOnly: false }).map(strip)).toEqual(snap.haccpLegacy.base);
    expect(selectTabMenu("haccp", { isErpOnly: false, features: { GOGOGOPICK_INTEGRATION: true } }).map(strip)).toEqual(snap.haccpLegacy.withGogogopick);
  });

  it("WORK 탭 — ERP 전용 / 통합", () => {
    expect(selectTabMenu("work", { isErpOnly: true }).map(strip)).toEqual(snap.work.erpOnly);
    expect(selectTabMenu("work", { isErpOnly: false }).map(strip)).toEqual(snap.work.full);
  });

  it("회계 탭 — ERP 전용(품목·재고 + 설정 포함) / 통합", () => {
    expect(selectTabMenu("finance", { isErpOnly: true }).map(strip)).toEqual(snap.finance.erpOnly);
    expect(selectTabMenu("finance", { isErpOnly: false }).map(strip)).toEqual(snap.finance.full);
  });

  it("슈퍼관리자 탭", () => {
    expect(selectTabMenu("superAdmin", { isErpOnly: false }).map(strip)).toEqual(snap.superAdmin);
  });

  it("전체 목록 순서 = haccp → finance → work → superAdmin (즐겨찾기·활성 메뉴 판별 기존 순서)", () => {
    const all = selectAllMenus({ isErpOnly: false });
    expect(all.length).toBe(snap.haccpLegacy.base.length + snap.finance.full.length + snap.work.full.length + snap.superAdmin.length);
    expect(all[0].path).toBe(snap.haccpLegacy.base[0].path);
    expect(all[all.length - 1].path).toBe(snap.superAdmin[snap.superAdmin.length - 1].path);
  });

  it("하위 경로 매핑·데모 허용 경로가 그대로", () => {
    expect(Object.fromEntries(Object.entries(CHILD_ROUTES).map(([k, v]) => [k, [...v]]))).toEqual(snap.childRoutes);
    expect([...DEMO_ALLOWED_PATHS]).toEqual(snap.demoAllowedPaths);
    expect(isChildRouteOf("/dashboard/production-management", "/dashboard/batch/1102")).toBe(true);
    expect(isChildRouteOf("/dashboard/production-management", "/dashboard/inspections")).toBe(false);
    expect(isChildRouteOf("/no-such-menu", "/dashboard/batch/1")).toBe(false);
  });
});

describe("2-a 메뉴 레지스트리 — 정합성", () => {
  it("플러그인 공통 그룹은 기존 clientMenuEngine 과 같은 4그룹 8항목 + 생산 현장 1항목 + 생산 설계 4항목 (2026-10-19)", () => {
    expect(PLUGIN_COMMON_GROUPS.map((g) => [g.name, g.order, g.items.length])).toEqual([
      ["대시보드", 0, 1], ["생산 현장", 15, 1], ["생산 설계", 30, 4], ["재고·운영", 40, 4], ["마스터", 50, 2], ["시스템", 100, 1],
    ]);
  });

  it("생산 화면 하나는 기본 메뉴와 업종 플러그인 공통 그룹(허브 사이드바) 양쪽에 있다 — 같은 정의 하나, 현장 확인 메뉴는 따로 없음 (2026-10-20)", () => {
    expect(MENU_PLACEMENTS.filter((p) => p.path === ROUTES.PRODUCTION_TODAY)).toHaveLength(1);
    expect(MENU_PLACEMENTS.some((p) => p.path === ROUTES.FIELD_WORK)).toBe(false);
    const g = PLUGIN_COMMON_GROUPS.find((x) => x.items.some((i) => i.path === ROUTES.PRODUCTION_TODAY));
    expect(g?.name).toBe("생산 현장");
    expect(g?.items.find((i) => i.path === ROUTES.PRODUCTION_TODAY)?.roles).toEqual(expect.arrayContaining(["worker", "admin", "inspector"]));
  });

  it("ROUTES 상수로 등록된 경로는 레지스트리에도 같은 문자열로 있다 (drift 차단)", () => {
    const paths = new Set(MENU_PLACEMENTS.map((p) => p.path));
    for (const key of ["PRODUCTION_TODAY", "PARTNERS_FEED", "ACCOUNTING_PARTNERS", "ACCOUNTING_COMMUNICATION_LOG", "ACCOUNTING_PARTNER_CREDIT", "ACCOUNTING_PARTNER_PRICES", "ACCOUNTING_ACCOUNTS", "ACCOUNTING_FIXED_ASSETS"] as const) {
      expect(paths.has(ROUTES[key]), key).toBe(true);
    }
  });

  it("모든 항목의 roles 는 실제 역할 enum 값만", () => {
    const ENUM = ["super_admin", "admin", "accountant", "worker", "monitor", "inspector", "employee"];
    const bad = MENU_PLACEMENTS.flatMap((p) => p.roles.filter((r) => !ENUM.includes(r)).map((r) => `${p.label} → ${r}`));
    expect(bad).toEqual([]);
  });
});

describe("2-b-2 통합 — 메뉴에서 빠져도 경로·즐겨찾기는 산다", () => {
  it("통합 항목은 사이드바에 없고, 허브 매핑과 즐겨찾기용 목록에는 있다 (매입·매출 입력은 2026-10-14 허브 개편으로 메뉴 복귀)", () => {
    const menuPaths = new Set(MENU_PLACEMENTS.map((p) => p.path));
    expect(CONSOLIDATED_PLACEMENTS.map((p) => p.path)).toEqual(["/dashboard/haccp/f3-trends"]);
    expect(MENU_PLACEMENTS.find((p) => p.path === "/dashboard/accounting/purchases/create")?.label).toBe("매입 입력");
    expect(MENU_PLACEMENTS.find((p) => p.path === "/dashboard/accounting/sales/create")?.label).toBe("매출 입력");
    for (const p of CONSOLIDATED_PLACEMENTS) {
      expect(menuPaths.has(p.path), p.path).toBe(false);
      expect(HUB_BY_PATH[p.path], p.path).toBeTruthy();
    }
  });

  it("통합 진입점(버튼·링크)이 상위 화면에 있다", () => {
    const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf-8");
    expect(read("client/src/pages/accounting/PurchasesList.tsx")).toContain('navigate("/dashboard/accounting/purchases/create")');
    expect(read("client/src/pages/accounting/SalesList.tsx")).toContain('navigate("/dashboard/accounting/sales/create")');
    expect(read("client/src/pages/haccp/F3Dashboard.tsx")).toContain('href="/dashboard/haccp/f3-trends"');
  });

  it("허브 사이드바 겹침 회귀 — 허브 블록과 메뉴 목록은 flex 축소 금지", () => {
    const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf-8");
    expect(read("client/src/components/dashboard/HubSidebarMenu.tsx")).toContain('className="flex flex-col gap-1 shrink-0"');
    expect(read("client/src/components/dashboard/DashboardLayout.tsx")).toContain('<SidebarMenu className="px-3 py-1 shrink-0">');
  });
});
