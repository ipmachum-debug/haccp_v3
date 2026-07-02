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
 *   5. 탭 중복 메뉴   — 페이지 안에 탭(embedded)으로 편입된 페이지가 사이드바 메뉴에도
 *                       독립 존재 (같은 기능이 탭 + 메뉴 2중 노출 → 중복 메뉴 사고 원인)
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
  pagesDir: "client/src/pages",
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

type PathHit = { path: string; file: string; line: number; viaRoutesConst: boolean; rolesSig?: string };

/** 메뉴 항목이 있는 줄에서 roles 배열을 정규화한 서명 추출 (역할별 변형 구분용).
 *  같은 path 라도 roles 가 다르면 서로 다른 역할 대상 메뉴 → 중복 아님. */
function rolesSignatureAt(content: string, index: number): string {
  const lineStart = content.lastIndexOf("\n", index) + 1;
  let lineEnd = content.indexOf("\n", index);
  if (lineEnd === -1) lineEnd = content.length;
  const line = content.slice(lineStart, lineEnd);
  const rm = line.match(/roles:\s*\[([^\]]*)\]/);
  if (!rm) return "";
  return rm[1]
    .split(",")
    .map((s) => s.trim().replace(/["']/g, ""))
    .filter(Boolean)
    .sort()
    .join("|");
}

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
    hits.push({ path: m[1], file: rel, line: lineOf(content, m.index), viaRoutesConst: false, rolesSig: rolesSignatureAt(content, m.index) });
  const reConst = /path:\s*ROUTES\.([A-Z0-9_]+)/g;
  while ((m = reConst.exec(content)) !== null) {
    const p = routesConst[m[1]];
    if (p) hits.push({ path: p, file: rel, line: lineOf(content, m.index), viaRoutesConst: true, rolesSig: rolesSignatureAt(content, m.index) });
  }
  return hits;
}

/** App.tsx: 컴포넌트명 → 라우트 path 매핑
 *  - 직접:   <Route path="..." component={X} />
 *  - lazy:   <Route path="..." component={lazy(() => import("@/pages/.../X"))} />
 *  두 경우 모두 컴포넌트 식별자(X = 직접 이름 또는 import 모듈 basename)로 매핑한다. */
function extractRouteComponentMap(routesConst: Record<string, string>): Record<string, string> {
  const content = read(FILES.app);
  const map: Record<string, string> = {};
  const resolvePath = (str?: string, key?: string): string | undefined =>
    str ?? (key ? routesConst[key] : undefined);

  // 1) 직접 컴포넌트: <Route path=(...) component={X} />  (한 줄, => 미포함)
  const reDirect = /<Route\s+path=(?:"([^"]+)"|\{ROUTES\.([A-Z0-9_]+)\})\s+component=\{([A-Za-z0-9_]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = reDirect.exec(content)) !== null) {
    const p = resolvePath(m[1], m[2]);
    if (p) map[m[3]] = p;
  }
  // 2) lazy import: component={lazy(() => import("....../Name"))} — Name(basename)로 매핑
  const reLazy = /<Route\s+path=(?:"([^"]+)"|\{ROUTES\.([A-Z0-9_]+)\})\s+component=\{lazy\(\(\)\s*=>\s*import\(\s*["']([^"']+)["']\s*\)\)\}/g;
  while ((m = reLazy.exec(content)) !== null) {
    const p = resolvePath(m[1], m[2]);
    const base = m[3].split("/").pop(); // 모듈 경로 basename = 컴포넌트명
    if (p && base) map[base] = p;
  }
  return map;
}

/** client/src/pages 전체를 순회하며 <Component embedded ...> 사용처 수집 */
function walkPages(dir: string, acc: string[]) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkPages(full, acc);
    else if (entry.name.endsWith(".tsx")) acc.push(full);
  }
}

type EmbeddedUsage = { container: string; component: string; line: number };
function extractEmbeddedUsages(): EmbeddedUsage[] {
  const files: string[] = [];
  walkPages(path.join(ROOT, FILES.pagesDir), files);
  const usages: EmbeddedUsage[] = [];
  const re = /<([A-Z][A-Za-z0-9_]*)\s+embedded\b/g;
  for (const full of files) {
    const content = fs.readFileSync(full, "utf8");
    const rel = path.relative(ROOT, full);
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null)
      usages.push({ container: rel, component: m[1], line: lineOf(content, m.index) });
  }
  return usages;
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

  // 2. 중복 메뉴 path — 같은 소스 + 같은 path + 같은 roles 서명이 2회 이상.
  //    (roles 가 다르면 역할별 변형 메뉴이므로 중복으로 보지 않음 — 오탐 방지)
  const dupByPath: Record<string, (PathHit & { source: string })[]> = {};
  for (const h of allMenuHits) {
    const key = `${h.source}::${h.path}::${h.rolesSig ?? ""}`;
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

  // 5. 탭 중복 메뉴 — 탭(embedded)으로 편입된 페이지가 사이드바 메뉴에도 독립 존재
  const routeCompMap = extractRouteComponentMap(routesConst);
  const embeddedUsages = extractEmbeddedUsages();
  const menuHitByPath: Record<string, (PathHit & { source: string })[]> = {};
  for (const h of allMenuHits) (menuHitByPath[h.path] ||= []).push(h);
  const tabDuplicates = embeddedUsages
    .map((u) => {
      const routePath = routeCompMap[u.component]; // 이 컴포넌트가 매핑된 라우트 path
      const menuHits = routePath ? menuHitByPath[routePath] || [] : [];
      return { ...u, routePath: routePath || null, menuSources: menuHits.map((h) => h.source) };
    })
    // 탭으로 편입됐는데 그 라우트가 사이드바 메뉴에도 존재하는 경우만 (2중 노출)
    .filter((u) => u.routePath && u.menuSources.length > 0);

  const report = {
    summary: {
      routes: routeHits.length,
      menuItems: allMenuHits.length,
      menuSources: menuSources.length,
      deadMenus: deadMenus.length,
      duplicateMenuPaths: duplicates.length,
      tabDuplicateMenus: tabDuplicates.length,
      embeddedTabPages: embeddedUsages.length,
      orphanRoutes: orphanRoutes.length,
      routesConstAdoptionPct: routesAdoption.appTotal
        ? Math.round((routesAdoption.appViaConst / routesAdoption.appTotal) * 1000) / 10
        : 0,
    },
    deadMenus: deadMenus.map((h) => ({ path: h.path, label_source: h.source, file: h.file, line: h.line })),
    duplicates: duplicates.map((g) => ({ path: g[0].path, source: g[0].source, count: g.length, lines: g.map((x) => x.line) })),
    tabDuplicates: tabDuplicates.map((u) => ({
      component: u.component,
      routePath: u.routePath,
      container: u.container,
      line: u.line,
      menuSources: u.menuSources,
    })),
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
    console.log(`  🟣 탭 중복 메뉴:            ${s.tabDuplicateMenus}  (탭 편입 페이지 ${s.embeddedTabPages}개 중)`);
    for (const d of report.tabDuplicates)
      console.log(`      - ${d.component} (탭: ${path.basename(d.container)}:${d.line}) ↔ 사이드바 메뉴 ${d.routePath} [${d.menuSources.join(", ")}]`);
    console.log(`  🟡 Orphan 라우트(정보용):   ${s.orphanRoutes}  (직접 URL/내부탭 접근 — 대부분 정상)`);
    console.log("═".repeat(64));
    if (s.deadMenus > 0) console.log("  ⚠️  DEAD 메뉴는 클릭 시 404/빈화면 — 즉시 수정 필요");
    if (s.tabDuplicateMenus > 0) console.log("  ⚠️  탭 중복: 탭으로 통합된 페이지가 사이드바에도 남아있음 — 메뉴 제거 검토");
    console.log(`  상세: npx tsx scripts/audit-menu-routes.ts --json`);
    console.log("═".repeat(64));
  }

  if (STRICT && (deadMenus.length > 0 || duplicates.length > 0 || tabDuplicates.length > 0)) process.exit(1);
}

main();
