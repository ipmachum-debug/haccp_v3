/**
 * 클라이언트 import 경로 검증
 *
 * 목적: client/src/**\/*.{ts,tsx} 모든 파일을 스캔해 "@/..." alias import 가
 *       실제 파일 시스템에 존재하는지 검증.
 *
 * 배경 (2026-05-01 PR #194, PR #200 hotfix 사고):
 *   - client/src/pages/changeControl/ChangeControlPage.tsx
 *   - client/src/pages/audit/AuditPage.tsx
 *   - client/src/pages/correctiveAction/CorrectiveActionPage.tsx
 *   - client/src/pages/nonconforming/NonconformingPage.tsx
 *
 *   네 파일 모두 import DashboardLayout from "@/pages/DashboardLayout" (오타) 사용.
 *   실제 파일 위치는 "@/components/dashboard/DashboardLayout".
 *   vite ENOENT → 빌드 실패 → hotfix PR 2회 발생.
 *
 *   추가로 client/src/lib/menuTypes.ts 자체가 PR #191 에서 누락 → PR #194 hotfix.
 *
 * 사용:
 *   npx tsx scripts/_lint/verify-client-imports.ts
 *
 * 종료 코드:
 *   0 — 모든 alias import 가 존재 파일을 가리킴
 *   1 — 누락 import 발견 (CI 차단)
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const CLIENT_ROOT = "client/src";
const ALIAS_PREFIX = "@/";
const RESOLVE_BASE = "client/src"; // tsconfig paths: "@/*": ["./client/src/*"]

/** import x from "@/..." | import { x } from "@/..." | import("@/...") | from '@/...' */
const IMPORT_REGEX = /(?:from|import)\s*\(?\s*["'`](@\/[^"'`]+)["'`]/g;

/** 알려진 확장자 (확장자 없이 import 했을 때 시도) */
const EXTENSIONS = ["", ".ts", ".tsx", ".js", ".jsx", ".d.ts"];

/** 디렉터리 import 시 시도할 index 파일 */
const INDEX_FILES = ["index.ts", "index.tsx", "index.js", "index.jsx"];

interface ImportRef {
  importPath: string;
  filePath: string;
  line: number;
}

function* walkSourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      // node_modules/dist 제외 (방어적)
      if (entry === "node_modules" || entry === "dist" || entry === ".vite") continue;
      yield* walkSourceFiles(full);
    } else if (/\.(tsx?|jsx?)$/.test(entry) && !entry.endsWith(".d.ts")) {
      yield full;
    }
  }
}

function extractImports(filePath: string): ImportRef[] {
  const content = readFileSync(filePath, "utf8");
  const lines = content.split("\n");
  const refs: ImportRef[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const matches = line.matchAll(IMPORT_REGEX);
    for (const m of matches) {
      refs.push({
        importPath: m[1],
        filePath: relative(process.cwd(), filePath),
        line: i + 1,
      });
    }
  }
  return refs;
}

/** alias 경로를 실제 파일 시스템 경로로 해석 */
function resolveAlias(importPath: string): string | null {
  if (!importPath.startsWith(ALIAS_PREFIX)) return null;
  const rel = importPath.slice(ALIAS_PREFIX.length);
  const base = resolve(RESOLVE_BASE, rel);

  // 1) 정확 일치 또는 확장자 추가
  for (const ext of EXTENSIONS) {
    const candidate = base + ext;
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate;
    }
  }
  // 2) 디렉터리 → index.* 시도
  if (existsSync(base) && statSync(base).isDirectory()) {
    for (const idx of INDEX_FILES) {
      const candidate = join(base, idx);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function main(): number {
  console.log(`=== 클라이언트 import 경로 검증 시작 ===`);
  console.log(`스캔 디렉터리: ${CLIENT_ROOT}`);
  console.log(`Alias: ${ALIAS_PREFIX} → ${RESOLVE_BASE}/\n`);

  const allImports: ImportRef[] = [];
  let fileCount = 0;
  for (const file of walkSourceFiles(CLIENT_ROOT)) {
    fileCount++;
    allImports.push(...extractImports(file));
  }

  // 중복 import 제거 (같은 파일에서 여러 번 import 한 경우 1개로)
  const uniqueImports = new Map<string, ImportRef>();
  for (const ref of allImports) {
    const key = `${ref.filePath}|${ref.importPath}|${ref.line}`;
    if (!uniqueImports.has(key)) uniqueImports.set(key, ref);
  }
  const refs = Array.from(uniqueImports.values());

  console.log(`스캔 파일: ${fileCount}개`);
  console.log(`@ alias import: ${refs.length}개\n`);

  const missing: ImportRef[] = [];
  for (const ref of refs) {
    if (resolveAlias(ref.importPath) === null) {
      missing.push(ref);
    }
  }

  if (missing.length === 0) {
    console.log(`✅ 통과: 모든 @ alias import 가 존재 파일을 가리킴`);
    return 0;
  }

  console.log(`❌ 실패: ${missing.length}개 import 가 누락 파일을 가리킴\n`);
  for (const m of missing) {
    console.log(`  ${m.filePath}:${m.line}`);
    console.log(`    import: "${m.importPath}"`);
    console.log("");
  }
  console.log(`해결 방법:`);
  console.log(`  - 파일 경로 오타를 수정하거나`);
  console.log(`  - 누락 파일을 생성하세요.`);
  console.log(`  자주 발생하는 오타: @/pages/DashboardLayout → @/components/dashboard/DashboardLayout`);
  return 1;
}

const exitCode = main();
process.exit(exitCode);
