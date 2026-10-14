/**
 * 라우트 접근 정적 검사 (UI/UX 개편 2-b-3, 2026-10-14)
 *
 * 명세 §8 "411 라우트 직접 접근" 중 코드만으로 확인할 수 있는 부분을 CI 에서 강제한다.
 *  ① 라우트 고유 411 — 중복 0, 앞 라우트에 가려진 경로 0, 화면 파일 존재
 *  ② 메뉴·즐겨찾기·하위 경로·데모 허용·ROUTES 상수가 가리키는 경로는 전부 실제 라우트 (404 0)
 *  ③ 라우트 411 전부 허브 귀속 (미분류 0)
 *  ④ 옛 URL 리다이렉트: 목적지가 실제 화면이고 쿼리 파라미터를 보존
 *  ⑤ 화면 안 하드코딩 링크: 기준선 외 새로 깨진 링크 0 (기준선은 줄기만)
 * 권한 있음 → 실제 표시 / 권한 없음 → 401·403 은 DB·계정이 필요해 서버에서 scripts/e2e/route-access-check.mjs 로 점검한다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  readAppRoutes, firstMatch, samplePath, REPO_ROOT, scanClientLinks, reachableClientFiles,
} from "./__helpers__/appRoutes";
import {
  MENU_PLACEMENTS, CONSOLIDATED_PLACEMENTS, CHILD_ROUTES, DEMO_ALLOWED_PATHS, PLUGIN_COMMON_GROUPS,
  LEGACY_REDIRECTS, buildRedirectTarget, routeHubOf,
} from "../shared/navigation/menuRegistry";
import { ROUTES } from "../client/src/lib/routePaths";

const routes = readAppRoutes();
const real = routes.filter((r) => r.path !== "*");
/** 경로가 실제 화면으로 열리는가 (리다이렉트면 목적지까지 따라간다) */
const opens = (url: string): boolean => {
  const r = firstMatch(routes, url);
  if (!r) return false;
  if (r.kind !== "redirect") return true;
  return firstMatch(routes, r.redirectTo!.split("?")[0]) !== null;
};

describe("① 라우트 목록", () => {
  it("고유 경로 411, 중복 0, 최종 폴백은 마지막 한 개", () => {
    const paths = real.map((r) => r.path);
    const dups = paths.filter((p, i) => paths.indexOf(p) !== i);
    expect(dups).toEqual([]);
    expect(paths.length).toBe(411);
    expect(routes[routes.length - 1].path).toBe("*");
    expect(routes.filter((r) => r.path === "*").length).toBe(1);
  });

  it("앞 라우트에 가려져 열리지 않는 경로 0 (wouter Switch 는 처음 맞는 것 하나만 그린다)", () => {
    const shadowed = real
      .map((r) => ({ r, hit: firstMatch(routes, samplePath(r.path)) }))
      .filter(({ r, hit }) => hit && hit.order !== r.order)
      .map(({ r, hit }) => `${r.path} (App.tsx:${r.line}) ← ${hit!.path} (App.tsx:${hit!.line})`);
    expect(shadowed).toEqual([]);
  });

  it("모든 lazy 화면 파일이 존재", () => {
    const missing = real.filter((r) => r.importPath).filter((r) => {
      const base = join(REPO_ROOT, "client/src", r.importPath!.replace(/^@\//, "").replace(/^\.\//, ""));
      return ![".tsx", ".ts", "/index.tsx", "/index.ts"].some((e) => existsSync(base + e));
    }).map((r) => `${r.path} → ${r.importPath}`);
    expect(missing).toEqual([]);
  });
});

describe("② 메뉴·즐겨찾기가 가리키는 경로는 전부 열린다 (404 0)", () => {
  const pluginPaths = ["food", "cosmetic", "general-manufacturing", "health-functional", "medical-device", "pharmaceutical"]
    .flatMap((p) => [...readFileSync(join(REPO_ROOT, `server/domain/plugins/${p}.ts`), "utf-8").matchAll(/path:\s*"([^"]+)"/g)].map((m) => m[1]));

  const sources: Record<string, string[]> = {
    "사이드바 메뉴": MENU_PLACEMENTS.map((p) => p.path),
    "통합된 메뉴(즐겨찾기 유지)": CONSOLIDATED_PLACEMENTS.map((p) => p.path),
    "플러그인 공통 메뉴": PLUGIN_COMMON_GROUPS.flatMap((g) => g.items.map((i) => i.path)),
    "업종 플러그인 메뉴": pluginPaths,
    "데모 허용 경로": [...DEMO_ALLOWED_PATHS],
    "ROUTES 상수": Object.values(ROUTES).map((p) => samplePath(p)),
  };
  for (const [name, paths] of Object.entries(sources)) {
    it(name, () => {
      expect(paths.length).toBeGreaterThan(0);
      expect(paths.filter((p) => !opens(p))).toEqual([]);
    });
  }

  it("2-b-2 로 통합된 항목은 업종 플러그인 메뉴에도 없다 (#492 배포 검증에서 식품 플러그인 누락 발견)", () => {
    const consolidated = CONSOLIDATED_PLACEMENTS.map((p) => p.path);
    expect(pluginPaths.filter((p) => consolidated.includes(p))).toEqual([]);
  });

  it("하위 경로 매핑(CHILD_ROUTES)의 접두사마다 실제 라우트가 하나 이상", () => {
    const dead = Object.values(CHILD_ROUTES).flat().filter((c) => !real.some((r) => r.path === c || r.path.startsWith(c + "/")));
    expect(dead).toEqual([]);
  });
});

describe("③ 라우트 411 전부 허브 귀속", () => {
  it("미분류 0", () => {
    expect(real.filter((r) => !routeHubOf(r.path)).map((r) => r.path)).toEqual([]);
  });

  it("대표 사례 — 상세·하위·기록 양식·공개 화면", () => {
    expect(routeHubOf("/dashboard/accounting/purchases/:id")?.hub).toBe("purchase");
    expect(routeHubOf("/dashboard/accounting/sales/:id")?.hub).toBe("sales");
    expect(routeHubOf("/dashboard/batch/:id")?.hub).toBe("production");
    expect(routeHubOf("/dashboard/haccp")?.hub).toBe("production");
    expect(routeHubOf("/dashboard/haccp/training")?.hub).toBe("quality");
    expect(routeHubOf("/capa-record/:id")?.hub).toBe("quality");
    expect(routeHubOf("/quality/notification-settings")?.hub).toBe("settings");
    expect(routeHubOf("/dashboard/tenant-management")?.hub).toBe("platform");
    expect(routeHubOf("/login")?.hub).toBe("public");
  });

  it("부록 14a §B 의 귀속 허브 열이 레지스트리와 같다", () => {
    const doc = readFileSync(join(REPO_ROOT, "docs/architecture/14a-menu-route-inventory.md"), "utf-8");
    const sectionB = doc.slice(doc.indexOf("## B."), doc.indexOf("## C.") > 0 ? doc.indexOf("## C.") : undefined);
    const rows = [...sectionB.matchAll(/^\| (\/[^ |]*) \| [^|]* \| ([a-z]+) \|/gm)];
    expect(rows.length).toBeGreaterThan(100);
    const wrong = rows.filter(([, p, hub]) => routeHubOf(p)?.hub !== hub).map(([, p, hub]) => `${p}: 문서 ${hub} / 레지스트리 ${routeHubOf(p)?.hub}`);
    expect(wrong).toEqual([]);
  });
});

describe("④ 옛 URL 리다이렉트", () => {
  it("목적지는 실제 화면(리다이렉트 아님)이고, 출발지는 다른 라우트에 가려지지 않는다", () => {
    for (const r of LEGACY_REDIRECTS) {
      expect(firstMatch(routes, r.from)?.kind, r.from).toBe("redirect");
      const dest = firstMatch(routes, r.to.split("?")[0]);
      expect(dest && dest.kind !== "redirect", r.to).toBe(true);
    }
  });

  it("쿼리 파라미터 보존 — 같은 키는 목적지 값 우선", () => {
    expect(buildRedirectTarget("/dashboard/data-import", "?type=material&step=2")).toBe("/dashboard/data-import?type=material&step=2");
    expect(buildRedirectTarget("/dashboard/batch-management?tab=create", "?tab=list&date=2026-10-14")).toBe("/dashboard/batch-management?tab=create&date=2026-10-14");
    expect(buildRedirectTarget("/dashboard/data-import", "")).toBe("/dashboard/data-import");
  });

  it("App.tsx 에 window.location 리다이렉트 라우트가 남아 있지 않다 (쿼리 유실·전체 새로고침)", () => {
    const src = readFileSync(join(REPO_ROOT, "client/src/App.tsx"), "utf-8");
    expect(src).not.toMatch(/<Route[^>]*>\s*\{\(\)\s*=>\s*\{\s*window\.location/);
  });
});

describe("⑤ 화면 안 하드코딩 링크", () => {
  const baseline = JSON.parse(readFileSync(join(__dirname, "__fixtures__", "broken-links-baseline-2026-10-14.json"), "utf-8")) as { reachable: string[]; unreachableFiles: string[] };
  const reach = reachableClientFiles();
  const broken = scanClientLinks().filter((l) => !firstMatch(routes, l.url));
  const key = (l: { file: string; raw: string }) => `${l.file} → ${l.raw}`;

  it("새로 깨진 링크 0 — 사용 중인 화면", () => {
    const now = [...new Set(broken.filter((l) => reach.has(l.file)).map(key))];
    expect(now.filter((k) => !baseline.reachable.includes(k))).toEqual([]);
  });

  it("새로 깨진 링크 0 — 어디서도 import 되지 않는 파일", () => {
    const now = [...new Set(broken.filter((l) => !reach.has(l.file)).map(key))];
    expect(now.filter((k) => !baseline.unreachableFiles.includes(k))).toEqual([]);
  });

  it("기준선은 줄기만 한다 — 고친 링크는 기준선에서도 지운다", () => {
    const now = new Set(broken.map(key));
    expect([...baseline.reachable, ...baseline.unreachableFiles].filter((k) => !now.has(k))).toEqual([]);
  });
});
