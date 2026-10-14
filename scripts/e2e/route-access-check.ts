/**
 * 라우트 접근 점검 — 실제 서버·계정으로 411 라우트를 역할별로 열어 본다 (UI/UX 개편 2-b-3, 2026-10-14)
 *
 * 명세 §8: HTTP 200 만으로는 부족하다. 화면마다 아래를 기록한다.
 *   - 표시: 404·오류 화면이 아니고, API 401/403 이 없고, 본문이 비어 있지 않음
 *   - 차단: API 가 401/403 을 돌려줌 (권한 없는 역할에서 기대되는 결과)
 *   - 404 / 오류 화면 / 로그인으로 이동 / 공지보드로 이동(employee) / 빈 화면
 *
 * 읽기 전용: 브라우저에서 나가는 tRPC POST(= mutation) 는 auth.login 외 전부 차단한다. 화면을 여는 것만으로 데이터가 바뀌지 않는다.
 *
 * 실행 (서버, Codex):
 *   BASE_URL=http://localhost:3000 ACCOUNTS_FILE=/root/route-check-accounts.json \
 *   CHROMIUM_PATH=/usr/bin/chromium npx tsx scripts/e2e/route-access-check.ts [--roles admin,worker] [--menu-only] [--concurrency 4]
 *
 * ACCOUNTS_FILE (커밋 금지 — 비밀번호 포함):
 *   [{ "role": "admin", "email": "...", "password": "..." }, { "role": "worker", ... }]
 *   role "anonymous" 는 자동 추가된다 (로그인 없이 — 공개 화면 외에는 /login 으로 가야 정상).
 * PARAMS_FILE (선택): { "/dashboard/batch/:id": "1102", ":id": "1" } — 경로별 또는 파라미터 이름별 예시 값. 없으면 "1".
 * 결과: OUT_DIR (기본 ./route-access-report) 에 report.md (요약) + report.csv (전체).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";
import { readAppRoutes } from "../../server/__helpers__/appRoutes";
import { routeHubOf, PUBLIC_PATHS, MENU_PLACEMENTS } from "../../shared/navigation/menuRegistry";

type Account = { role: string; email?: string; password?: string };
type Result = {
  role: string; path: string; url: string; hub: string; expected: "표시" | "차단" | "-";
  outcome: string; finalPath: string; api401: number; api403: number; api5xx: number; blockedWrites: number; textLength: number; ms: number;
};

const args = process.argv.slice(2);
const argVal = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const BASE_URL = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const OUT_DIR = process.env.OUT_DIR ?? "route-access-report";
const CONCURRENCY = Number(argVal("--concurrency") ?? 4);
const ROLES = argVal("--roles")?.split(",");
const MENU_ONLY = args.includes("--menu-only");
const NAV_TIMEOUT = Number(process.env.NAV_TIMEOUT ?? 20000);

const accountsFile = process.env.ACCOUNTS_FILE;
if (!accountsFile || !existsSync(accountsFile)) {
  console.error("ACCOUNTS_FILE 이 필요합니다 (역할별 로그인 계정 JSON). 파일 머리 주석 참고.");
  process.exit(1);
}
const accounts: Account[] = [{ role: "anonymous" }, ...JSON.parse(readFileSync(accountsFile, "utf-8"))]
  .filter((a: Account) => !ROLES || ROLES.includes(a.role));
const params: Record<string, string> = process.env.PARAMS_FILE ? JSON.parse(readFileSync(process.env.PARAMS_FILE, "utf-8")) : {};

const routes = readAppRoutes().filter((r) => r.path !== "*" && r.kind !== "redirect");
const menuRoles = new Map<string, Set<string>>();
for (const p of MENU_PLACEMENTS) {
  const s = menuRoles.get(p.path) ?? new Set<string>();
  p.roles.forEach((r) => s.add(r));
  menuRoles.set(p.path, s);
}
const targets = (MENU_ONLY ? routes.filter((r) => menuRoles.has(r.path)) : routes).map((r) => ({
  path: r.path,
  url: params[r.path] !== undefined
    ? r.path.replace(/:[^/]+/g, params[r.path])
    : r.path.replace(/:([^/?]+)\??/g, (_m, name) => params[`:${name}`] ?? "1"),
  hub: routeHubOf(r.path)?.hub ?? "??",
}));

// 기능 플래그 메뉴(예: GOGOGOPICK 연동)는 플래그가 꺼져 있으면 라우트도 없다(404 가 정상) — 기대값 없음
const flaggedPaths = new Set(MENU_PLACEMENTS.filter((p) => p.feature).map((p) => p.path));

function expectedFor(role: string, path: string): Result["expected"] {
  if (flaggedPaths.has(path)) return "-";
  if (PUBLIC_PATHS.includes(path)) return "표시";
  if (role === "anonymous") return "차단";
  const roles = menuRoles.get(path);
  if (!roles) return "-"; // 메뉴 밖 화면은 기대값 없음 (기록만)
  return roles.has(role) ? "표시" : "차단";
}

async function login(context: BrowserContext, acc: Account) {
  if (acc.role === "anonymous") return;
  const res = await context.request.post(`${BASE_URL}/api/trpc/auth.login?batch=1`, {
    data: { 0: { json: { email: acc.email, password: acc.password } } },
  });
  if (!res.ok()) throw new Error(`${acc.role} 로그인 실패: HTTP ${res.status()} ${(await res.text()).slice(0, 200)}`);
}

async function visit(page: Page, role: string, t: (typeof targets)[number]): Promise<Result> {
  let api401 = 0, api403 = 0, api5xx = 0, blockedWrites = 0;
  const onResponse = (r: any) => {
    if (!r.url().includes("/api/trpc")) return;
    if (r.status() === 401) api401++;
    else if (r.status() === 403) api403++;
    else if (r.status() >= 500) api5xx++;
  };
  page.on("response", onResponse);
  const started = Date.now();
  await page.route("**/api/trpc/**", (route) => {
    const req = route.request();
    if (req.method() === "POST" && !req.url().includes("auth.login")) { blockedWrites++; return route.abort(); }
    return route.continue();
  });
  try {
    await page.goto(`${BASE_URL}${t.url}`, { waitUntil: "networkidle", timeout: NAV_TIMEOUT });
  } catch { /* networkidle 시간 초과 — 현재 상태로 판정 */ }
  // 화면이 스스로 리다이렉트(window.location)하는 중이면 읽기가 실패한다 — 안정될 때까지 몇 번 재시도
  let text = "";
  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(500);
    try {
      await page.waitForLoadState("domcontentloaded", { timeout: NAV_TIMEOUT });
      text = await page.evaluate(() => document.body?.innerText ?? "");
      break;
    } catch { /* 이동 중 — 다시 */ }
  }
  const finalPath = new URL(page.url()).pathname;
  page.off("response", onResponse);
  await page.unroute("**/api/trpc/**");

  let outcome: string;
  if (text.includes("Page Not Found")) outcome = "404";
  else if (text.includes("An unexpected error occurred")) outcome = "오류 화면";
  else if (finalPath === "/login" && t.path !== "/login") outcome = "로그인으로 이동";
  else if (finalPath === "/board" && t.path !== "/board") outcome = "공지보드로 이동";
  else if (api401 + api403 > 0) outcome = "차단(API 401/403)";
  else if (text.trim().length < 80) outcome = "빈 화면";
  else outcome = "표시";

  return {
    role, path: t.path, url: t.url, hub: t.hub, expected: expectedFor(role, t.path), outcome, finalPath,
    api401, api403, api5xx, blockedWrites, textLength: text.trim().length, ms: Date.now() - started,
  };
}

function judge(r: Result): "OK" | "확인 필요" | "-" {
  if (flaggedPaths.has(r.path)) return "-";
  if (r.outcome === "404" || r.outcome === "오류 화면" || r.api5xx > 0) return "확인 필요";
  if (r.expected === "표시") return r.outcome === "표시" ? "OK" : "확인 필요";
  if (r.expected === "차단") return r.outcome === "표시" || r.outcome === "빈 화면" ? "확인 필요" : "OK";
  return "-";
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const results: Result[] = [];
  for (const acc of accounts) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await login(context, acc);
    const pages = await Promise.all(Array.from({ length: CONCURRENCY }, () => context.newPage()));
    let next = 0;
    await Promise.all(pages.map(async (page) => {
      while (next < targets.length) {
        const t = targets[next++];
        const r = await visit(page, acc.role, t);
        results.push(r);
        if (judge(r) === "확인 필요") console.log(`[${acc.role}] ${t.url} → ${r.outcome} (기대 ${r.expected})`);
      }
    }));
    await context.close();
    console.log(`${acc.role}: ${targets.length}개 완료`);
  }
  await browser.close();

  const cols: (keyof Result)[] = ["role", "path", "url", "hub", "expected", "outcome", "finalPath", "api401", "api403", "api5xx", "blockedWrites", "textLength", "ms"];
  const csv = [cols.join(",") + ",judge", ...results.map((r) => cols.map((c) => JSON.stringify(r[c])).join(",") + "," + judge(r))].join("\n");
  writeFileSync(join(OUT_DIR, "report.csv"), csv);

  const roles = [...new Set(results.map((r) => r.role))];
  const outcomes = [...new Set(results.map((r) => r.outcome))].sort();
  const lines = [
    `# 라우트 접근 점검 — ${new Date().toISOString()}`,
    "",
    `대상 ${targets.length}개 경로 × 역할 ${roles.length}개. 쓰기 요청은 전부 차단한 읽기 전용 점검.`,
    "",
    `| 역할 | ${outcomes.join(" | ")} | 확인 필요 |`,
    `|---|${outcomes.map(() => "---").join("|")}|---|`,
    ...roles.map((role) => {
      const rs = results.filter((r) => r.role === role);
      return `| ${role} | ${outcomes.map((o) => rs.filter((r) => r.outcome === o).length).join(" | ")} | ${rs.filter((r) => judge(r) === "확인 필요").length} |`;
    }),
    "",
    "## 확인 필요",
    "",
    "| 역할 | 경로 | 기대 | 결과 | 최종 경로 | API 401/403/5xx |",
    "|---|---|---|---|---|---|",
    ...results.filter((r) => judge(r) === "확인 필요").sort((a, b) => a.path.localeCompare(b.path) || a.role.localeCompare(b.role))
      .map((r) => `| ${r.role} | ${r.url} | ${r.expected} | ${r.outcome} | ${r.finalPath} | ${r.api401}/${r.api403}/${r.api5xx} |`),
  ];
  writeFileSync(join(OUT_DIR, "report.md"), lines.join("\n"));
  console.log(`결과: ${join(OUT_DIR, "report.md")} / report.csv`);
}

main().catch((e) => { console.error(e); process.exit(1); });
