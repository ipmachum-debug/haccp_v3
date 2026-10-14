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
  isChildRouteOf,
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
  it("플러그인 공통 그룹은 기존 clientMenuEngine 과 같은 4그룹 8항목", () => {
    expect(PLUGIN_COMMON_GROUPS.map((g) => [g.name, g.order, g.items.length])).toEqual([
      ["대시보드", 0, 1], ["재고·운영", 40, 4], ["마스터", 50, 2], ["시스템", 100, 1],
    ]);
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
