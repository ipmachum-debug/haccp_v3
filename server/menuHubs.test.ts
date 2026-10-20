/**
 * 허브 사이드바 테스트 (UI/UX 개편 2-b-1, 2026-10-14)
 *
 * 2-b-1 의 약속: 사용자가 보는 메뉴 항목의 **집합은 탭 사이드바와 같고 배치만 허브**다.
 *  - 레지스트리의 모든 경로가 허브를 가진다 (미분류 0)
 *  - 탭 세 개(+슈퍼관리자) 항목을 합쳐 허브로 묶으면 경로 집합이 그대로이고 중복이 없다
 *  - 허브 순서는 14 명세 §3 (오늘 할 일 → 구매·입고 → 품목·재고 → 생산관리 → 품질·규정 → 판매·출고 → 회계·경영 → 환경설정 → 플랫폼)
 *  - 허브별 항목 목록은 server/__fixtures__/menu-hubs-snapshot-2026-10-14.json 과 같다 (2-b-2 에서 의도한 차이만큼 갱신)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MENU_PLACEMENTS, HUBS, HUB_BY_PATH, hubOf, buildHubMenu, selectTabMenu, PLUGIN_COMMON_GROUPS,
} from "../shared/navigation/menuRegistry";

const fixture = JSON.parse(readFileSync(join(__dirname, "__fixtures__", "menu-hubs-snapshot-2026-10-14.json"), "utf-8")) as Record<string, string[]>;

/** 레이아웃이 허브 모드에서 합치는 것과 같은 순서: WORK → HACCP 폴백 → 회계 → 슈퍼관리자 (통합 모드, 플러그인 없음) */
function unionLikeLayout() {
  const ctx = { isErpOnly: false };
  return [
    ...selectTabMenu("work", ctx),
    ...selectTabMenu("haccp", ctx),
    ...selectTabMenu("finance", ctx),
    ...selectTabMenu("superAdmin", ctx),
  ];
}

describe("2-b-1 허브 — 경로 전부 허브를 가진다", () => {
  it("레지스트리의 모든 경로가 HUB_BY_PATH 에 있다", () => {
    const missing = [...new Set(MENU_PLACEMENTS.map((p) => p.path))].filter((p) => !HUB_BY_PATH[p]);
    expect(missing).toEqual([]);
    for (const g of PLUGIN_COMMON_GROUPS) for (const i of g.items) expect(HUB_BY_PATH[i.path], i.path).toBeTruthy();
  });

  it("업종 품질 경로는 등록이 없어도 품질·규정, 그 외 미등록은 환경설정(숨기지 않음)", () => {
    expect(hubOf("/dashboard/food/some-new-quality-page")).toBe("quality");
    expect(hubOf("/dashboard/cosmetic/anything")).toBe("quality");
    expect(hubOf("/totally/unknown")).toBe("settings");
  });

  it("허브 순서 = 명세 §3", () => {
    expect([...HUBS].sort((a, b) => a.order - b.order).map((h) => h.label)).toEqual([
      "오늘 할 일", "매입·매출 관리", "품목·재고", "생산관리", "생산 설계", "품질·규정", "회계·경영", "환경설정", "플랫폼 관리",
    ]);
    expect(HUBS.find((h) => h.id === "platform")?.superAdminOnly).toBe(true);
  });
});

describe("2-b-1 허브 — 항목 집합 불변", () => {
  const union = unionLikeLayout();
  const sections = buildHubMenu(union);

  it("합친 경로 집합 = 허브에 묶인 경로 집합, 중복 0", () => {
    const before = new Set(union.map((p) => p.path));
    const after = sections.flatMap((s) => s.items.map((i) => i.path));
    expect(new Set(after)).toEqual(before);
    expect(after.length).toBe(new Set(after).size);
  });

  it("같은 경로의 roles 는 합집합 — 아무도 메뉴를 잃지 않는다 (예: 알림 관리 WORK[admin,worker] ∪ HACCP[…accountant…])", () => {
    const noti = sections.flatMap((s) => s.items).find((i) => i.path === "/dashboard/notifications")!;
    for (const r of ["admin", "worker", "accountant", "monitor", "inspector"]) expect(noti.roles).toContain(r);
    const dash = sections.flatMap((s) => s.items).find((i) => i.path === "/dashboard")!;
    expect(dash.roles).toContain("super_admin");
    expect(dash.roles).toContain("accountant");
  });

  it("라벨·아이콘은 먼저 온 항목(WORK 탭) 기준 — /dashboard 는 '통합 대시보드'", () => {
    const dash = sections.flatMap((s) => s.items).find((i) => i.path === "/dashboard")!;
    expect(dash.label).toBe("통합 대시보드");
  });

  it("허브별 항목 목록이 스냅샷과 같다", () => {
    const got = Object.fromEntries(sections.map((s) => [s.hub.id, s.items.map((i) => `${i.path} | ${i.label}`)]));
    expect(got).toEqual(fixture);
  });

  it("플랫폼 허브 항목은 super_admin 만", () => {
    const platform = sections.find((s) => s.hub.id === "platform")!;
    expect(platform.items.length).toBeGreaterThan(0);
    for (const i of platform.items) expect(i.roles).toEqual(["super_admin"]);
  });
});

describe("사이드바 하단 정리 (2026-10-14 대표 지시)", () => {
  const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf-8");

  it("자동화 에이전트: 플랫폼 허브 'AI·자동화', 노출 조건(허용 이메일 5개)은 그대로", async () => {
    const { AGENT_ALLOWED_EMAILS, AGENT_PLACEMENT, canSeeAgent } = await import("../shared/navigation/menuRegistry");
    expect([...AGENT_ALLOWED_EMAILS]).toEqual(["ipmachum@gmail.com", "sokoorymall@naver.com", "dduckdanji@naver.com", "danjimall@naver.com", "sokoorymall1@naver.com"]);
    expect(hubOf("/dashboard/agent")).toBe("platform");
    expect(canSeeAgent("ipmachum@gmail.com")).toBe(true);
    expect(canSeeAgent("someone@example.com")).toBe(false);
    // admin 인 허용 사용자: 플랫폼 허브에 에이전트 한 항목만, 소구역 제목 유지
    const sections = buildHubMenu([{ ...AGENT_PLACEMENT, roles: ["admin"] }]);
    expect(sections.map((s) => s.hub.id)).toEqual(["platform"]);
    expect(sections[0].items[0].section).toBe("AI·자동화");
  });

  it("레이아웃: 하단 에이전트 버튼은 탭 사이드바(플래그 off)에서만, 사이드바 출퇴근 위젯은 제거, 헤더 출퇴근은 기존 역할 그대로", async () => {
    const layout = read("client/src/components/dashboard/DashboardLayout.tsx");
    expect(layout).toContain("{!hubMode && user && canSeeAgent(user.email) && (");
    expect(layout).not.toContain("ClockInOutWidget");
    expect(layout).toContain("<HeaderAttendance />");
    expect(layout).toContain("<HeaderAttendance compact />");
    const { ATTENDANCE_ROLES } = await import("../client/src/components/dashboard/HeaderAttendance");
    expect([...ATTENDANCE_ROLES]).toEqual(["worker", "admin", "super_admin", "inspector"]);
  });

  it("헤더 출퇴근은 기존 근태 API 만 쓴다 (myToday / clockIn / clockOut)", () => {
    const src = read("client/src/components/dashboard/HeaderAttendance.tsx");
    const calls = [...new Set([...src.matchAll(/trpc\.hr\.(\w+)/g)].map((m) => m[1]))].sort();
    expect(calls).toEqual(["clockIn", "clockOut", "myToday"]);
  });
});

describe("매입·매출 관리 허브 (2026-10-14 대표 결정)", () => {
  it("구매·입고 + 판매·출고 → 허브 하나, 안에 [매입 | 매출] 탭", async () => {
    const { HUB_TABS } = await import("../shared/navigation/menuRegistry");
    expect(HUBS.map((h) => h.id)).not.toContain("purchase");
    expect(HUBS.map((h) => h.id)).not.toContain("sales");
    expect(HUB_TABS.trade?.map((t) => t.label)).toEqual(["매입", "매출"]);
  });

  it("탭별 항목: 매입 = 발주서 → 매입 입력 → 매입 조회 / 매출 = 견적서 → 매출 입력 → 매출 조회 + 정산 / 거래처는 두 탭 공통", () => {
    const ctx = { isErpOnly: false };
    const trade = buildHubMenu([...selectTabMenu("finance", ctx)]).find((s) => s.hub.id === "trade")!;
    const inTab = (t: string) => trade.items.filter((i) => !i.hubTab || i.hubTab === t).map((i) => `${i.section ?? ""}:${i.label}`);
    expect(inTab("purchase")).toEqual([
      ":발주서", ":매입 입력", ":매입 조회",
      "거래처:거래처 피드 (CRM)", "거래처:거래처", "거래처:커뮤니케이션 로그", "거래처:단가표",
    ]);
    expect(inTab("sales")).toEqual([
      ":견적서", ":매출 입력", ":매출 조회", "정산:세금계산서", "정산:B2C 플랫폼 정산",
      "거래처:거래처 피드 (CRM)", "거래처:거래처", "거래처:커뮤니케이션 로그", "거래처:단가표",
    ]);
  });

  it("상세·작성 화면도 같은 탭으로 (현재 화면 따라 탭 자동 전환)", async () => {
    const { hubTabOf } = await import("../shared/navigation/menuRegistry");
    expect(hubTabOf("/dashboard/accounting/purchase-orders/create")).toBe("purchase");
    expect(hubTabOf("/dashboard/accounting/purchases/123")).toBe("purchase");
    expect(hubTabOf("/dashboard/accounting/quotations/create")).toBe("sales");
    expect(hubTabOf("/dashboard/accounting/sales/77")).toBe("sales");
    expect(hubTabOf("/dashboard/accounting/partners")).toBeNull();
    expect(hubTabOf("/dashboard/accounting/journal-entries")).toBeNull();
  });

  it("권한·라우트 불변 — 6개 모두 super_admin·admin, 경로 그대로", () => {
    const six = ["/dashboard/accounting/purchase-orders", "/dashboard/accounting/purchases/create", "/dashboard/accounting/purchases/list",
      "/dashboard/accounting/quotations", "/dashboard/accounting/sales/create", "/dashboard/accounting/sales/list"];
    for (const p of six) {
      const m = MENU_PLACEMENTS.find((x) => x.path === p)!;
      expect(m, p).toBeTruthy();
      expect([...m.roles], p).toEqual(["super_admin", "admin"]);
      expect(hubOf(p), p).toBe("trade");
    }
  });
});

describe("AI 어시스턴트 → 플랫폼 허브 'AI·자동화' (2026-10-14)", () => {
  it("노출 조건 그대로 (super_admin·admin·inspector, 데모 제외), 플랫폼 허브에서 자동화 에이전트 위", async () => {
    const { AI_ASSISTANT_PLACEMENT, AGENT_PLACEMENT, canSeeAiAssistant } = await import("../shared/navigation/menuRegistry");
    expect(hubOf("/dashboard/ai-assistant")).toBe("platform");
    for (const r of ["super_admin", "admin", "inspector"]) expect(canSeeAiAssistant(r, false), r).toBe(true);
    for (const r of ["worker", "monitor", "accountant", "employee"]) expect(canSeeAiAssistant(r, false), r).toBe(false);
    expect(canSeeAiAssistant("admin", true)).toBe(false);
    // 슈퍼관리자 플랫폼 항목 뒤에 AI·자동화 소구역
    const union = [...selectTabMenu("superAdmin", { isErpOnly: false }), { ...AI_ASSISTANT_PLACEMENT, roles: ["super_admin"] }, { ...AGENT_PLACEMENT, roles: ["super_admin"] }];
    const platform = buildHubMenu(union).find((s) => s.hub.id === "platform")!;
    expect(platform.items.slice(-2).map((i) => `${i.section}:${i.label}`)).toEqual(["AI·자동화:AI 어시스턴트", "AI·자동화:자동화 에이전트"]);
    const layout = readFileSync(join(__dirname, "..", "client/src/components/dashboard/DashboardLayout.tsx"), "utf-8");
    expect(layout).toContain("{!hubMode && user && canSeeAiAssistant(user.role, isDemo) && (");
  });
});

describe("2-b-4 모바일 하단바 — 레지스트리 기반 역할별", () => {
  const roles = ["super_admin", "admin", "worker", "inspector", "monitor", "accountant"];
  /** 레이아웃처럼: 탭 항목을 합쳐 허브로 묶고 그 역할에게 보이는 경로만 (통합 모드, 플러그인 없음) */
  const visibleFor = (role: string) => {
    const items = unionLikeLayout().filter((i) => i.roles.includes(role));
    return new Set(buildHubMenu(items).flatMap((s) => s.items.map((i) => i.path)));
  };

  it("모든 역할: 핵심 화면 ≤ 3 + 알림 + 메뉴, 핵심 화면은 그 역할에게 보이는 메뉴만, 라벨 정의됨", async () => {
    const { mobileNavFor, MOBILE_NAV_LABELS } = await import("../shared/navigation/menuRegistry");
    for (const role of roles) {
      const visible = visibleFor(role);
      const nav = mobileNavFor(role, visible, () => "FileText");
      const links = nav.filter((n) => n.kind === "link");
      expect(links.length, role).toBeGreaterThan(0);
      expect(links.length, role).toBeLessThanOrEqual(3);
      expect(nav.slice(-2).map((n) => n.kind), role).toEqual(["alerts", "menu"]);
      for (const l of links) {
        expect(visible.has((l as any).path), `${role} ${(l as any).path}`).toBe(true);
        expect(MOBILE_NAV_LABELS[(l as any).path], (l as any).path).toBeTruthy();
      }
    }
  });

  it("역할별 결과 고정 — worker 는 생산(하나의 생산 화면)·CCP·재고, 회계 화면 없음", async () => {
    const { mobileNavFor } = await import("../shared/navigation/menuRegistry");
    const labels = (role: string) => mobileNavFor(role, visibleFor(role), () => "x").map((n) => n.label);
    expect(labels("worker")).toEqual(["생산", "CCP", "재고", "알림", "메뉴"]);
    expect(labels("admin")).toEqual(["대시보드", "생산", "매출", "알림", "메뉴"]);
    expect(labels("inspector")).toEqual(["오늘", "CCP", "체크리스트", "알림", "메뉴"]);
    // monitor 는 메뉴에서 Today 를 볼 수 없다 (기존 권한) → 승인부터
    expect(labels("monitor")).toEqual(["승인", "CCP", "체크리스트", "알림", "메뉴"]);
    for (const n of mobileNavFor("worker", visibleFor("worker"), () => "x")) {
      if (n.kind !== "menu") expect(n.path.includes("/accounting"), n.path).toBe(false);
    }
  });

  it("employee 는 공지·알림만 (사이드바 없음)", async () => {
    const { mobileNavFor } = await import("../shared/navigation/menuRegistry");
    expect(mobileNavFor("employee", new Set(), () => "x").map((n) => n.kind === "menu" ? "menu" : n.path)).toEqual(["/board", "/board/alerts"]);
  });

  it("하단바가 가리키는 경로는 전부 실제 라우트", async () => {
    const { mobileNavFor } = await import("../shared/navigation/menuRegistry");
    const { readAppRoutes, firstMatch } = await import("./__helpers__/appRoutes");
    const routes = readAppRoutes();
    for (const role of [...roles, "employee"]) {
      for (const n of mobileNavFor(role, visibleFor(role), () => "x")) {
        if (n.kind !== "menu") expect(firstMatch(routes, n.path), `${role} ${n.path}`).not.toBeNull();
      }
    }
  });
});

describe("사이드바 로고 = 홈 (2026-10-14 대표 요청)", () => {
  it("펼친 사이드바의 로고를 누르면 통합 대시보드(/dashboard)로", () => {
    const layout = readFileSync(join(__dirname, "..", "client/src/components/dashboard/DashboardLayout.tsx"), "utf-8");
    const i = layout.indexOf('data-testid="sidebar-logo-home"');
    expect(i).toBeGreaterThan(0);
    expect(layout.slice(i - 400, i)).toContain('onClick={() => setLocation("/dashboard")}');
  });
});
