/**
 * App.tsx 라우트 목록 읽기 (UI/UX 개편 2-b-3, 2026-10-14) — 테스트·점검 스크립트 전용
 *
 * App.tsx 의 <Switch> 안 <Route> 를 선언 순서대로 읽는다. wouter 는 Switch 안에서 **처음 맞는 라우트 하나**만 그리므로
 * 순서가 곧 의미다. 지원 형태:
 *   path="/literal"  |  path={ROUTES.KEY}
 *   component={Name} |  component={lazy(() => import("@/pages/..."))}  |  children (리다이렉트 등)
 *   <Route component={NotFound} />  (경로 없는 최종 폴백)
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "regexparam";
import { ROUTES } from "../../client/src/lib/routePaths";
import { LEGACY_REDIRECTS } from "../../shared/navigation/menuRegistry";

// vitest(CJS 흉내)·tsx(ESM) 양쪽에서 동작하도록 import.meta.url 기준
export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export interface AppRoute {
  /** Switch 안 선언 순서 (0부터) */
  order: number;
  /** App.tsx 줄 번호 */
  line: number;
  path: string;
  /** 컴포넌트 이름, 인라인 lazy 는 import 경로, children 은 "(children)" */
  component: string;
  /** 인라인 lazy 또는 상단 lazy 선언의 import 경로 (없으면 null — 정적 import 컴포넌트) */
  importPath: string | null;
  kind: "component" | "inline-lazy" | "children" | "redirect";
  /** kind=redirect 일 때 목적지 */
  redirectTo?: string;
}

export function readAppSource(): string {
  return readFileSync(join(REPO_ROOT, "client/src/App.tsx"), "utf-8");
}

/** const X = lazy(() => import("...")) 선언 → { X: "..." } */
export function readLazyDeclarations(src = readAppSource()): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of src.matchAll(/const (\w+) = lazy\(\(\) => import\("([^"]+)"\)/g)) out[m[1]] = m[2];
  return out;
}

export function readAppRoutes(src = readAppSource()): AppRoute[] {
  const lazies = readLazyDeclarations(src);
  const routes: AppRoute[] = [];
  // 태그 속성 안에 `=>` 의 '>' 가 있으므로 줄 단위로 Route 시작을 찾고, 같은 줄에서 속성을 읽는다
  const lines = src.split("\n");
  lines.forEach((text, idx) => {
    const start = text.indexOf("<Route");
    if (start < 0 || text.trimStart().startsWith("{/*") || text.trimStart().startsWith("//")) return;
    const tag = text.slice(start);
    // LEGACY_REDIRECTS.map(...) 으로 만든 리다이렉트 라우트 — 그 자리에 목록 전부를 넣는다
    if (tag.includes("path={r.from}")) {
      for (const r of LEGACY_REDIRECTS) routes.push({ order: routes.length, line: idx + 1, path: r.from, component: "(redirect)", importPath: null, kind: "redirect", redirectTo: r.to });
      return;
    }
    let path: string | null = null;
    const lit = tag.match(/path="([^"]+)"/);
    const con = tag.match(/path=\{ROUTES\.(\w+)\}/);
    if (lit) path = lit[1];
    else if (con) {
      const v = (ROUTES as Record<string, string>)[con[1]];
      if (!v) throw new Error(`App.tsx:${idx + 1} ROUTES.${con[1]} 가 routePaths.ts 에 없음`);
      path = v;
    }
    const inline = tag.match(/component=\{lazy\(\(\) => import\("([^"]+)"\)\)\}/);
    const named = tag.match(/component=\{(\w+)\}/);
    if (path === null) {
      // 경로 없는 Route 는 최종 폴백만 허용
      if (named) routes.push({ order: routes.length, line: idx + 1, path: "*", component: named[1], importPath: lazies[named[1]] ?? null, kind: "component" });
      return;
    }
    if (inline) routes.push({ order: routes.length, line: idx + 1, path, component: inline[1], importPath: inline[1], kind: "inline-lazy" });
    else if (named) routes.push({ order: routes.length, line: idx + 1, path, component: named[1], importPath: lazies[named[1]] ?? null, kind: "component" });
    else routes.push({ order: routes.length, line: idx + 1, path, component: "(children)", importPath: null, kind: "children" });
  });
  return routes;
}

/** wouter 기본 매처와 같은 규칙 (regexparam, loose=false) */
export function routeRegex(path: string): RegExp {
  return parse(path).pattern;
}

/** 패턴의 :param 을 예시 값으로 채운 실제 URL */
export function samplePath(path: string, sample = "1"): string {
  return path.replace(/:[^/]+\?/g, "").replace(/:[^/]+/g, sample);
}

/** Switch 순서대로 처음 맞는 라우트 (폴백 제외). 없으면 null → NotFound */
export function firstMatch(routes: AppRoute[], url: string): AppRoute | null {
  const pathname = url.split("?")[0].split("#")[0];
  for (const r of routes) {
    if (r.path === "*") continue;
    if (routeRegex(r.path).test(pathname)) return r;
  }
  return null;
}

// ─── 화면 안 링크 점검 ────────────────────────────────────────────────────────
import { readdirSync, statSync, existsSync } from "node:fs";
import { resolve, relative } from "node:path";

const CLIENT_SRC = join(REPO_ROOT, "client", "src");

function listSourceFiles(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) listSourceFiles(p, out);
    else if (/\.(tsx?|jsx?)$/.test(f) && !/\.test\./.test(f)) out.push(p);
  }
  return out;
}

function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(CLIENT_SRC, spec.slice(2));
  else if (spec.startsWith("@shared/")) base = join(REPO_ROOT, "shared", spec.slice(8));
  else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
  else return null;
  if (/\.(tsx?|jsx?)$/.test(base) && existsSync(base)) return base;
  for (const e of [".tsx", ".ts", "/index.tsx", "/index.ts"]) if (existsSync(base + e)) return base + e;
  return null;
}

/**
 * 사용자가 실제로 열 수 있는 클라이언트 파일 (저장소 기준 상대 경로).
 * App.tsx 의 lazy 선언은 **라우트에 연결된 것만** 따라간다 — 선언만 있고 라우트가 없는 화면은 열 수 없다 (2026-10-14).
 */
export function reachableClientFiles(): Set<string> {
  const appFile = join(CLIENT_SRC, "App.tsx");
  const appSrc = readFileSync(appFile, "utf-8");
  const lazies = readLazyDeclarations(appSrc);
  const routedLazyPaths = new Set<string>();
  for (const r of readAppRoutes(appSrc)) if (r.importPath) routedLazyPaths.add(r.importPath);
  // 라우트 밖 JSX 에서 직접 쓰는 lazy 컴포넌트 (<HubHome /> 처럼 children 라우트 안 등)
  for (const [name, spec] of Object.entries(lazies)) if (new RegExp(`<${name}[\\s/>]`).test(appSrc)) routedLazyPaths.add(spec);
  const unroutedLazy = new Set(Object.values(lazies).filter((spec) => !routedLazyPaths.has(spec)));

  const seen = new Set<string>();
  const queue = [join(CLIENT_SRC, "main.tsx"), appFile];
  while (queue.length) {
    const f = queue.pop()!;
    if (seen.has(f) || !existsSync(f)) continue;
    seen.add(f);
    const s = readFileSync(f, "utf-8");
    if (f === appFile) {
      for (const m of s.matchAll(/(?:import|export)[^'"]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)) {
        const spec = m[1] ?? m[2];
        if (m[2] && unroutedLazy.has(spec)) continue; // 라우트 없는 lazy 화면
        const r = resolveImport(f, spec);
        if (r && !seen.has(r)) queue.push(r);
      }
      continue;
    }
    for (const m of s.matchAll(/(?:import|export)[^'"]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)) {
      const r = resolveImport(f, m[1] ?? m[2]);
      if (r && !seen.has(r)) queue.push(r);
    }
  }
  return new Set([...seen].map((f) => relative(REPO_ROOT, f)));
}

export interface ClientLink { file: string; line: number; raw: string; url: string }

const LINK_RE = /(?:setLocation|navigate|window\.location\.href\s*=|window\.location\.assign|window\.location\.replace|href=|to=|path:)\s*\(?\s*\{?\s*(["'`])(\/[^"'`]*)\1/g;

/** 화면 코드에 하드코딩된 이동 경로. 템플릿 변수는 "1" 로 채우고 쿼리·해시는 뗀다 */
export function scanClientLinks(): ClientLink[] {
  const out: ClientLink[] = [];
  for (const f of listSourceFiles(CLIENT_SRC)) {
    const src = readFileSync(f, "utf-8");
    for (const m of src.matchAll(LINK_RE)) {
      const raw = m[2];
      if (raw.startsWith("/api") || raw.startsWith("//") || /\.(png|jpe?g|svg|pdf|xlsx|csv|ico|webp)$/.test(raw)) continue;
      let url = raw.replace(/\$\{[^}]*\}/g, "1").split("?")[0].split("#")[0];
      if (url.length > 1 && url.endsWith("/")) url = url.slice(0, -1);
      out.push({ file: relative(REPO_ROOT, f), line: src.slice(0, m.index).split("\n").length, raw, url });
    }
  }
  return out;
}
