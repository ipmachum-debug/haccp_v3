/**
 * 3-b 허브 입구 · 역할별 첫 화면 / 3-c 화면 적용 (UI/UX 개편, 2026-10-14)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HUBS, HUBS_WITH_HOME, hubHomePath, homePathFor, HOME_PATH_BY_ROLE, routeHubOf } from "../shared/navigation/menuRegistry";
import { readAppRoutes, firstMatch } from "./__helpers__/appRoutes";
import { resolveStatus } from "../client/src/lib/statusDictionary";

const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf-8");

describe("3-b 허브 입구", () => {
  const routes = readAppRoutes();

  it("업무 허브 6개에 입구 /hub/{허브} — 실제 라우트로 열린다, 환경설정·플랫폼은 입구 없음", () => {
    expect([...HUBS_WITH_HOME]).toEqual(["today", "trade", "items", "production", "quality", "finance"]);
    for (const h of HUBS_WITH_HOME) {
      expect(HUBS.some((x) => x.id === h)).toBe(true);
      expect(firstMatch(routes, hubHomePath(h))?.component, h).toContain("HubHome");
    }
    expect(routeHubOf("/hub/:hubId")).not.toBeNull();
  });

  it("입구 화면은 기존 조회 API 만 쓴다 (새 집계 없음) — 카드가 쓰는 API 목록 고정", () => {
    const src = read("client/src/pages/hub/HubHome.tsx");
    const calls = [...new Set([...src.matchAll(/trpc\.([a-zA-Z.]+)\.useQuery/g)].map((m) => m[1]))].sort();
    expect(calls).toEqual([
      "cashFlow.dashboard", "checklistDashboard.getStats", "dashboard.ccpDeviations", "dashboard.getAccountingSummary",
      "dashboard.getExpiringMaterials", "dashboard.getStats", "inventory.getLowStock", "partnerCredit.summary",
      "purchaseOrder.list", "quotation.stats",
    ]);
  });

  it("입구 화면의 업무 바로가기는 레이아웃이 계산한 '보이는 메뉴'(컨텍스트) — 레이아웃 안쪽에서 읽는다", () => {
    const src = read("client/src/pages/hub/HubHome.tsx");
    expect(src).toContain("function HubHomeBody");
    expect(src.indexOf("useHubMenu()")).toBeGreaterThan(src.indexOf("function HubHomeBody"));
    expect(read("client/src/components/dashboard/DashboardLayout.tsx")).toContain("<HubMenuContext.Provider value={hubSections}>");
  });

  it("사이드바 허브마다 '한눈에 보기' 링크", () => {
    expect(read("client/src/components/dashboard/HubSidebarMenu.tsx")).toContain("HUBS_WITH_HOME.includes(hub.id)");
  });
});

describe("3-b 역할별 첫 화면", () => {
  it("작업자 = 오늘의 생산 / 품질 = 품질 입구 / 회계 = 회계 입구 / 관리자 = 통합 대시보드 / 슈퍼관리자·직원 기존 그대로", () => {
    expect(homePathFor("worker")).toBe("/dashboard/production/today");
    expect(homePathFor("inspector")).toBe("/hub/quality");
    expect(homePathFor("monitor")).toBe("/hub/quality");
    expect(homePathFor("accountant")).toBe("/hub/finance");
    expect(homePathFor("admin")).toBe("/dashboard");
    expect(homePathFor("super_admin")).toBe("/dashboard/super-admin");
    expect(homePathFor("employee")).toBe("/board");
    expect(homePathFor(undefined)).toBe("/dashboard");
  });

  it("첫 화면 경로는 전부 실제 라우트", () => {
    const routes = readAppRoutes();
    for (const [role, p] of Object.entries(HOME_PATH_BY_ROLE)) expect(firstMatch(routes, p), role).not.toBeNull();
  });

  it("로그인 직후 이동이 레지스트리를 따른다", () => {
    expect(read("client/src/pages/system/Login.tsx")).toContain("setLocation(homePathFor(response?.role));");
  });
});

describe("3-c 화면 적용 — 매출 조회 · 매입 조회 · 발주서 · 재고 관리 · CCP 모니터링", () => {
  const screens = {
    sales: "client/src/pages/accounting/SalesList.tsx",
    purchases: "client/src/pages/accounting/PurchasesList.tsx",
    po: "client/src/pages/accounting/PurchaseOrderList.tsx",
    inventory: "client/src/pages/inventory/InventoryManagementIntegrated.tsx",
    ccp: "client/src/pages/haccp/CCPMonitoring.tsx",
  };

  it("다섯 화면 모두 PageHeader", () => {
    for (const [k, f] of Object.entries(screens)) expect(read(f), k).toContain("<PageHeader");
  });

  it("매출·매입·발주 상태는 StatusBadge — 업무 문구 유지", () => {
    expect(read(screens.sales)).toContain('<StatusBadge status={status} domain="sale" />');
    expect(read(screens.purchases)).toContain('<StatusBadge status={status} domain="purchase" />');
    expect(read(screens.po)).toContain('<StatusBadge status={po.status} domain="purchaseOrder" />');
    expect(resolveStatus("received", "sale").label).toBe("수금 완료");
    expect(resolveStatus("paid", "purchase").label).toBe("지급 완료");
    expect(resolveStatus("POSTED", "purchase").label).toBe("확정");
    expect(resolveStatus("partial_received", "purchaseOrder")).toMatchObject({ label: "일부 입고", tone: "blue" });
    expect(resolveStatus("received", "purchaseOrder").label).toBe("전량 입고");
    expect(resolveStatus("pending", "sale").label).toBe("승인 대기");
  });

  it("매출 조회의 개발 진단 표시(빌드 번호·클릭 카운터)는 슈퍼관리자에게만, 실패 상세 메시지는 모두에게", () => {
    const s = read(screens.sales);
    const gate = s.indexOf('{user?.role === "super_admin" && (');
    expect(gate).toBeGreaterThan(0);
    expect(s.indexOf("build {SALES_LIST_BUILD_TAG}")).toBeGreaterThan(gate);
    expect(s).toContain('lastActionInfo?.fullMessage && lastActionInfo.kind === "fail"');
  });
});
