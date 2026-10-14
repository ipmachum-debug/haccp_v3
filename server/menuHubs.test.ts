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
      "오늘 할 일", "구매·입고", "품목·재고", "생산관리", "품질·규정", "판매·출고", "회계·경영", "환경설정", "플랫폼 관리",
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
