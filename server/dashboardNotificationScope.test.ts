/**
 * 경영 상황판 "읽지 않은 알림" 범위 (2026-10-14 대표 보고: 대시보드 203건 / 알림 센터 0건)
 * 대시보드 숫자는 상단 알림 종·알림 센터·모바일 하단바와 같은 범위 — 로그인 사용자 본인 + 브로드캐스트(user_id=0) — 여야 한다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf-8");

describe("대시보드 미읽음 알림 = 본인 + 전체 공지", () => {
  it("집계 쿼리에 사용자 조건이 있고, 라우터가 로그인 사용자를 넘긴다", () => {
    expect(read("server/db/system/dashboardStats.ts")).toContain("is_read = 0 AND (user_id = ? OR user_id = 0)");
    expect(read("server/routers/dashboard/dashboard.router.ts")).toContain("getDashboardStats(ctx.tenantId, ctx.user?.id)");
  });

  it("알림 목록 API 도 같은 범위 (본인 또는 user_id=0)", () => {
    expect(read("server/db/system/notificationFunctions.ts")).toContain("or(eq(hNotifications.userId, userId), eq(hNotifications.userId, 0))");
  });
});
