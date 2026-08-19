/**
 * Drizzle 테이블명 unique 검증
 *
 * 목적: drizzle/schema/**\/*.ts 모든 파일을 스캔해 mysqlTable 첫 인자(테이블명)가
 *       전 프로젝트에서 unique 한지 검증. 신규 중복만 차단 (baseline 9건은 화이트리스트).
 *
 * 배경 (2026-05-01 PR #200 hotfix 사고):
 *   - drizzle/schema/part2_quality.ts 에 legacy hCorrectiveActions (table="h_corrective_actions")
 *   - drizzle/schema/coreMes/quality/correctiveAction.ts 에 신규 hCorrectiveActions (같은 table 이름)
 *   - 두 파일이 동일 테이블명을 export → ambiguous resolution + esbuild syntax error
 *
 * Baseline 화이트리스트 (2026-05-01 도입 시점 pre-existing 중복 13건):
 *   - h_rbac_roles, h_rbac_permissions, h_rbac_role_permissions, h_organization (auth ↔ main_core)
 *   - h_employees, h_user_roles (auth ↔ main_core)
 *   - h_ccp_records (production_ext ↔ main_ccp)
 *   - tenants (control_plane ↔ main_core)
 *   - support_tickets, accounting_transactions, accounting_accounts, audit_logs, h_upload_history
 *   이들은 향후 정리 대상이지만 현재 시점에서는 신규 회귀 검출에 집중.
 *
 * 사용:
 *   npx tsx scripts/_lint/verify-drizzle-unique-tables.ts
 *
 * 종료 코드:
 *   0 — baseline 외 신규 중복 0건
 *   1 — baseline 외 신규 중복 발견 (CI 차단)
 */

/**
 * 2026-05-01 baseline — 도입 시점에 이미 존재했던 pre-existing 중복 (점진적 정리 대상)
 *
 * ★ 2026-08-18: stripComments() 도입으로 주석 오탐이 사라지면서 13건 → 12건.
 *   "h_ccp_records" 는 실제 중복이 아니라 주석 오탐이었으므로 제거했다.
 *   (화이트리스트에 남겨두면 향후 진짜 중복이 생겨도 CI 가 놓친다)
 */
const BASELINE_DUPLICATES: ReadonlySet<string> = new Set([
  // auth ↔ schema_main_core RBAC/조직 분리 정의 (6건)
  "h_rbac_roles",
  "h_rbac_permissions",
  "h_rbac_role_permissions",
  "h_organization",
  "h_employees",
  "h_user_roles",
  // 도메인별 분리 정의 (6건)
  "tenants",
  "support_tickets",
  "accounting_transactions",
  "accounting_accounts",
  "audit_logs",
  "h_upload_history",
]);

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SCHEMA_ROOT = "drizzle/schema";

/**
 * mysqlTable("table_name", ...) 패턴 추출 (multi-line 지원).
 *
 * 매칭 예:
 *   - mysqlTable("h_users", { ... })
 *   - mysqlTable('h_users', { ... })
 *   - mysqlTable(\n  "h_users",\n  { ... }\n)   ← 신규 schema 파일의 줄바꿈 포함 패턴
 *
 * \s* 가 줄바꿈을 포함하므로 [\s\S]* 형태 대신 \s* 로도 multi-line 매칭 가능
 * (단, 줄 단위 split 후 처리하던 기존 로직은 전체 content 단위로 변경 필요).
 */
const TABLE_REGEX = /mysqlTable\s*\(\s*["'`]([a-zA-Z_][a-zA-Z0-9_]*)["'`]/g;

interface TableOccurrence {
  tableName: string;
  filePath: string;
  line: number;
}

function* walkTsFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      yield* walkTsFiles(full);
    } else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
      yield full;
    }
  }
}

/**
 * 주석(`//`, `/* *\/`)을 같은 길이의 공백으로 치환한다.
 *
 * ★ 2026-08-18: 주석을 걸러내지 않아 오탐이 발생하던 문제 수정.
 *   예) schema_main_accounting.ts 의
 *       `// export const partnerContacts = mysqlTable("partner_contacts", ...) — REMOVED`
 *       주석 줄이 실제 정의로 잡혀 "partner_contacts 중복" 이 보고됐다.
 *
 * 길이와 개행을 그대로 보존하므로 매칭 offset → 줄 번호 계산이 어긋나지 않는다.
 * 문자열/템플릿 리터럴 안의 `//` (예: "https://...") 는 주석으로 오인하지 않는다.
 */
function stripComments(src: string): string {
  const out = src.split("");
  type State = "code" | "sq" | "dq" | "tpl" | "line" | "block";
  let state: State = "code";

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const next = src[i + 1];

    switch (state) {
      case "code":
        if (c === "/" && next === "/") { state = "line"; out[i] = " "; out[i + 1] = " "; i++; }
        else if (c === "/" && next === "*") { state = "block"; out[i] = " "; out[i + 1] = " "; i++; }
        else if (c === "'") state = "sq";
        else if (c === '"') state = "dq";
        else if (c === "`") state = "tpl";
        break;

      case "sq":
      case "dq":
      case "tpl": {
        if (c === "\\") { i++; break; } // 이스케이프 문자 건너뛰기
        const closer = state === "sq" ? "'" : state === "dq" ? '"' : "`";
        if (c === closer) state = "code";
        break;
      }

      case "line":
        if (c === "\n") state = "code";
        else out[i] = " ";
        break;

      case "block":
        if (c === "*" && next === "/") { state = "code"; out[i] = " "; out[i + 1] = " "; i++; }
        else if (c !== "\n") out[i] = " ";
        break;
    }
  }

  return out.join("");
}

function extractTables(filePath: string): TableOccurrence[] {
  const raw = readFileSync(filePath, "utf8");
  // 주석 제거 후 매칭 (줄 번호 보존을 위해 길이/개행은 유지)
  const content = stripComments(raw);
  const occurrences: TableOccurrence[] = [];

  // 전체 content 단위로 매칭 (multi-line 패턴 지원)
  const matches = content.matchAll(TABLE_REGEX);
  for (const m of matches) {
    // m.index 위치에서의 줄 번호 계산 (1-based)
    const offset = m.index ?? 0;
    const line = content.slice(0, offset).split("\n").length;
    occurrences.push({
      tableName: m[1],
      filePath: relative(process.cwd(), filePath),
      line,
    });
  }
  return occurrences;
}

function main(): number {
  console.log(`=== Drizzle 테이블명 unique 검증 시작 ===`);
  console.log(`스캔 디렉터리: ${SCHEMA_ROOT}\n`);

  const allOccurrences: TableOccurrence[] = [];
  let fileCount = 0;

  for (const file of walkTsFiles(SCHEMA_ROOT)) {
    fileCount++;
    allOccurrences.push(...extractTables(file));
  }

  console.log(`스캔 파일: ${fileCount}개`);
  console.log(`테이블 정의: ${allOccurrences.length}개\n`);

  // 테이블명별로 그룹화
  const byName = new Map<string, TableOccurrence[]>();
  for (const occ of allOccurrences) {
    const list = byName.get(occ.tableName) ?? [];
    list.push(occ);
    byName.set(occ.tableName, list);
  }

  // 중복 검출
  const duplicates: Array<[string, TableOccurrence[]]> = [];
  for (const [name, list] of byName) {
    if (list.length > 1) {
      duplicates.push([name, list]);
    }
  }

  // baseline (기존 중복) 과 신규 중복 분리
  const baselineHits: Array<[string, TableOccurrence[]]> = [];
  const newHits: Array<[string, TableOccurrence[]]> = [];
  for (const entry of duplicates) {
    if (BASELINE_DUPLICATES.has(entry[0])) {
      baselineHits.push(entry);
    } else {
      newHits.push(entry);
    }
  }

  if (baselineHits.length > 0) {
    console.log(`ℹ️  baseline 중복 ${baselineHits.length}건 (화이트리스트 — 점진적 정리 대상):`);
    for (const [name, list] of baselineHits) {
      console.log(`  - "${name}" (${list.length}곳)`);
    }
    console.log("");
  }

  if (newHits.length === 0) {
    console.log(`✅ 통과: baseline 외 신규 중복 0건 (테이블 ${byName.size}개)`);
    return 0;
  }

  console.log(`❌ 실패: baseline 외 신규 중복 ${newHits.length}건 발견\n`);
  for (const [name, list] of newHits) {
    console.log(`테이블 "${name}" (중복 ${list.length}회):`);
    for (const occ of list) {
      console.log(`  - ${occ.filePath}:${occ.line}`);
    }
    console.log("");
  }
  console.log(`해결 방법: 한 곳에서만 mysqlTable 정의를 유지하고`);
  console.log(`          나머지는 export 또는 import 로 재사용하세요.`);
  console.log(`          (예: PR #200 — legacy hCorrectiveActions 정의 제거 후`);
  console.log(`               coreMes/quality/correctiveAction.ts 의 hCorrectiveActions 만 유지)`);
  return 1;
}

const exitCode = main();
process.exit(exitCode);
