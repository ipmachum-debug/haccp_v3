/**
 * 메뉴 ↔ 라우트 정합성 전수 감사 스크립트 (READ-ONLY)
 * ═══════════════════════════════════════════════════════════════
 * 목적: 사이드바 메뉴가 여러 소스(플러그인 6 + 공통 + 하드코딩)에 분산돼
 *       라우트와 계속 어긋나는(drift) 문제를 자동 검출한다.
 *
 * 검출 항목:
 *   1. DEAD 메뉴      — 메뉴 path 인데 App.tsx 에 매칭 <Route> 없음 (클릭 시 404)
 *   2. 중복 메뉴 path — 같은 path 를 여러 메뉴가 가리킴 (같은 소스 내)
 *   3. ROUTES 채택률  — routePaths.ts 의 ROUTES 상수 사용 비율 (drift 방지 지표)
 *   4. Orphan 라우트  — <Route> 는 있는데 어느 메뉴에도 없음 (정보용, 대부분 정상)
 *
 * 실행:
 *   npx tsx scripts/audit-menu-routes.ts          # 요약 리포트
 *   npx tsx scripts/audit-menu-routes.ts --json    # JSON 출력
 *   npx tsx scripts/audit-menu-routes.ts --strict  # DEAD/중복 있으면 exit 1 (CI 게이트)
 *
 * DB 접근 없음. 소스 파일 정적 파싱만 수행.
 * ═══════════════════════════════════════════════════════════════
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirnameEsm = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirnameEsm, "..");
const JSON_MODE = process.argv.includes("--json");
const STRICT = process.argv.includes("--strict");

const FILES = {
  routePaths: "client/src/lib/routePaths.ts",
  app: "client/src/App.tsx",
  dashboard: "client/src/components/dashboard/DashboardLayout.tsx",
  common: "client/src/domain/engines/clientMenuEngine.ts",
  pluginsDir: "server/domain/plugins",
};

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}
function lineOf(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

/** routePaths.ts 의 ROUTES 상수 { KEY: "path" } 파싱 */
function parseRoutesConst(): Record<string, string> {
  const content = read(FILES.routePaths);
  const block = content.match(/export const ROUTES\s*=\s*\{([\s\S]*?)\}\s*as const/);
  const map: Record<string, string> = {};
  if (!block) return map;
  const re = /([A-Z0-9_]+)\s*:\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block[1])) !== null) map[m[1]] = m[2];
  return map;
}

type PathHit = { path: string; file: string; line: number; viaRoutesConst: boolean };

/** App.tsx 라우트 추출: path="..." + path={ROUTES.KEY} */
function extractRoutes(routesConst: Record<string, string>): PathHit[] {
  const content = read(FILES.app);
  const hits: PathHit[] = [];
  const reStr = /<Route\s+path="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = reStr.exec(content)) !== null)
    hits.push({ path: m[1], file: FILES.app, line: lineOf(content, m.index), viaRoutesConst: false });
  const reConst = /<Route\s+path=\{ROUTES\.([A-Z0-9_]+)\}/g;
  while ((m = reConst.exec(content)) !== null) {
    const p = routesConst[m[1]];
    if (p) hits.push({ path: p, file: FILES.app, line: lineOf(content, m.index), viaRoutesConst: true });
  }
  return hits;
}

/** 메뉴 소스에서 path 추출: path: "..." + path: ROUTES.KEY */
function extractMenuPaths(rel: string, routesConst: Record<string, string>): PathHit[] {
  const content = read(rel);
  const hits: PathHit[] = [];
  const reStr = /path:\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = reStr.exec(content)) !== null)
    hits.push({ path: m[1], file: rel, line: lineOf(content, m.index), viaRoutesConst: false });
  const reConst = /path:\s*ROUTES\.([A-Z0-9_]+)/g;
  while ((m = reConst.exec(content)) !== null) {
    const p = routesConst[m[1]];
    if (p) hits.push({ path: p, file: rel, line: lineOf(content, m.index), viaRoutesConst: true });
  }
  return hits;
}

/** 라우트 매칭: 정적 path + :param 세그먼트 지원 */
function routeMatches(menuPath: string, routePaths: Set<string>, routePatterns: string[]): boolean {
  if (routePaths.has(menuPath)) return true;
  // :param 을 가진 라우트와 세그먼트 단위 매칭
  const mp = menuPath.split("/");
  return routePatterns.some((rp) => {
    const rs = rp.split("/");
    if (rs.length !== mp.length) return false;
    return rs.every((seg, i) => seg.startsWith(":") || seg === mp[i]);
  });
}

function main() {
  const routesConst = parseRoutesConst();
  const routeHits = extractRoutes(routesConst);
  const routePaths = new Set(routeHits.map((r) => r.path));
  const routePatterns = routeHits.map((r) => r.path);

  const menuSources: { name: string; rel: string }[] = [
    { name: "DashboardLayout(하드코딩 폴백)", rel: FILES.dashboard },
    { name: "COMMON_MENU_GROUPS(공통)", rel: FILES.common },
    ...fs
      .readdirSync(path.join(ROOT, FILES.pluginsDir))
      .filter((f) => f.endsWith(".ts") && f !== "index.ts")
      .map((f) => ({ name: `plugin:${f.replace(".ts", "")}`, rel: `${FILES.pluginsDir}/${f}` })),
  ];

  const allMenuHits: (PathHit & { source: string })[] = [];
  for (const s of menuSources)
    for (const h of extractMenuPaths(s.rel, routesConst)) allMenuHits.push({ ...h, source: s.name });

  // 1. DEAD 메뉴 — 라우트에 없는 메뉴 path
  const deadMenus = allMenuHits.filter((h) => !routeMatches(h.path, routePaths, routePatterns));

  // 2. 중복 메뉴 path — 같은 소스 내에서 같은 path 2회 이상
  const dupByPath: Record<string, (PathHit & { source: string })[]> = {};
  for (const h of allMenuHits) {
    const key = `${h.source}::${h.path}`;
    (dupByPath[key] ||= []).push(h);
  }
  const duplicates = Object.values(dupByPath).filter((g) => g.length > 1);

  // 3. ROUTES 채택률
  const routesAdoption = {
    routesConstDefined: Object.keys(routesConst).length,
    appTotal: routeHits.length,
    appViaConst: routeHits.filter((r) => r.viaRoutesConst).length,
    menuTotal: allMenuHits.length,
    menuViaConst: allMenuHits.filter((h) => h.viaRoutesConst).length,
  };

  // 4. Orphan 라우트 (정보용)
  const menuPathSet = new Set(allMenuHits.map((h) => h.path));
  const orphanRoutes = routeHits.filter((r) => !menuPathSet.has(r.path));

  const report = {
    summary: {
      routes: routeHits.length,
      menuItems: allMenuHits.length,
      menuSources: menuSources.length,
      deadMenus: deadMenus.length,
      duplicateMenuPaths: duplicates.length,
      orphanRoutes: orphanRoutes.length,
      routesConstAdoptionPct: routesAdoption.appTotal
        ? Math.round((routesAdoption.appViaConst / routesAdoption.appTotal) * 1000) / 10
        : 0,
    },
    deadMenus: deadMenus.map((h) => ({ path: h.path, label_source: h.source, file: h.file, line: h.line })),
    duplicates: duplicates.map((g) => ({ path: g[0].path, source: g[0].source, count: g.length, lines: g.map((x) => x.line) })),
    routesAdoption,
  };

  if (JSON_MODE) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const s = report.summary;
    console.log("═".repeat(64));
    console.log("  메뉴 ↔ 라우트 정합성 전수 감사");
    console.log("═".repeat(64));
    console.log(`  라우트(<Route>) 총:        ${s.routes}`);
    console.log(`  메뉴 항목 총:              ${s.menuItems}  (소스 ${s.menuSources}곳)`);
    console.log(`  ROUTES 상수 채택률(App):   ${s.routesConstAdoptionPct}%  (${routesAdoption.appViaConst}/${routesAdoption.appTotal})`);
    console.log("─".repeat(64));
    console.log(`  🔴 DEAD 메뉴 (라우트 없음): ${s.deadMenus}`);
    for (const d of report.deadMenus) console.log(`      - ${d.path}  [${d.label_source} ${path.basename(d.file)}:${d.line}]`);
    console.log(`  🟠 중복 메뉴 path:          ${s.duplicateMenuPaths}`);
    for (const d of report.duplicates) console.log(`      - ${d.path}  ×${d.count}  [${d.source} L${d.lines.join(",")}]`);
    console.log(`  🟡 Orphan 라우트(정보용):   ${s.orphanRoutes}  (직접 URL/내부탭 접근 — 대부분 정상)`);
    console.log("═".repeat(64));
    if (s.deadMenus > 0) console.log("  ⚠️  DEAD 메뉴는 클릭 시 404/빈화면 — 즉시 수정 필요");
    console.log(`  상세: npx tsx scripts/audit-menu-routes.ts --json`);
    console.log("═".repeat(64));
  }

  if (STRICT && (deadMenus.length > 0 || duplicates.length > 0)) process.exit(1);
}

main();
