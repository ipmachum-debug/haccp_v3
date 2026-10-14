/**
 * 화면 안 깨진 링크 정리 (2026-10-14) — 사용자가 열 수 있는 화면의 깨진 링크 18 → 0
 * 같은 기능의 화면이 있으면 그 화면으로 보내고 해당 항목을 바로 연다(?id= 등). 화면이 없으면 404 버튼을 뺀다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readAppRoutes, firstMatch, scanClientLinks, reachableClientFiles } from "./__helpers__/appRoutes";

const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf-8");

describe("사용 중 화면의 깨진 링크 0", () => {
  it("라우트에 연결된 화면 안에서 없는 경로로 가는 링크가 없다", () => {
    const routes = readAppRoutes(); const reach = reachableClientFiles();
    const bad = scanClientLinks().filter((l) => reach.has(l.file) && !firstMatch(routes, l.url)).map((l) => `${l.file} → ${l.raw}`);
    expect(bad).toEqual([]);
  });

  it("라우트 없는 lazy 화면(검사 목록·상세 6개)은 사용 중으로 세지 않는다", () => {
    const reach = reachableClientFiles();
    expect(reach.has("client/src/pages/quality/HygieneInspections.tsx")).toBe(false);
    expect(reach.has("client/src/pages/hub/HubHome.tsx")).toBe(true);
  });
});

describe("연결 방식", () => {
  it("시정조치 관리 '상세' → 처리 화면 ?id= 로 그 건을 바로 연다", () => {
    expect(read("client/src/pages/haccp/CorrectiveActionList.tsx")).toContain("`/dashboard/haccp/corrective-action?id=${action.id}`");
    expect(read("client/src/pages/haccp/CorrectiveAction.tsx")).toContain("trpc.food.correctiveAction.getById.useQuery({ id: idParam }");
  });
  it("레시피 '수정'·'버전 이력' → 레시피 관리 ?edit= / ?versions=", () => {
    expect(read("client/src/pages/production/RecipeDetail.tsx")).toContain("`/master/recipe?edit=${recipeId}`");
    expect(read("client/src/pages/production/RecipeDetail.tsx")).toContain("`/master/recipe?versions=${recipeId}`");
    expect(read("client/src/pages/production/RecipeList.tsx")).toContain("`/master/recipe?edit=${recipe.id}`");
    const m = read("client/src/pages/production/RecipeManagement.tsx");
    expect(m).toContain('search.get("edit")');
    expect(m).toContain('search.get("versions")');
  });
  it("승인 대시보드: 제조보고 → 목록 ?detail= 상세 창, 재고조정 → 재고 관리 조정 탭", () => {
    const a = read("client/src/pages/system/ApprovalDashboard.tsx");
    expect(a).toContain("`/dashboard/mf-reports?detail=${id}`");
    expect(a).toContain("`/inventory-management?tab=adjustment`");
    expect(read("client/src/pages/production/MfReportList.tsx")).toContain('get("detail")');
  });
  it("모바일 빠른 점검 '점검' → CCP 관리, 교육과정 '등록' → 교육관리 등록 창, 수정 버튼(화면 없음)은 제거", () => {
    expect(read("client/src/pages/system/MobileQuickCheck.tsx")).not.toContain('"/dashboard/ccp-inspection"');
    const t = read("client/src/pages/system/TrainingCourseList.tsx");
    expect(t).toContain('"/dashboard/haccp/training?new=course"');
    expect(t).not.toContain("`/training/courses/${course.id}`");
    expect(read("client/src/pages/system/TrainingManagement.tsx")).toContain('newParam === "course"');
  });
});

describe("3-c 탭 URL 유지", () => {
  it("CCP 모니터링 탭", () => {
    expect(read("client/src/pages/haccp/CCPMonitoring.tsx")).toContain('useTabWithUrl("tab", "records")');
  });
});
