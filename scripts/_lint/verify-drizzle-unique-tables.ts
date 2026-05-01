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

/** 2026-05-01 baseline — 도입 시점에 이미 존재했던 pre-existing 중복 13건 (점진적 정리 대상) */
const BASELINE_DUPLICATES: ReadonlySet<string> = new Set([
  // auth ↔ schema_main_core RBAC/조직 분리 정의 (6건)
  "h_rbac_roles",
  "h_rbac_permissions",
  "h_rbac_role_permissions",
  "h_organization",
  "h_employees",
  "h_user_roles",
  // 도메인별 분리 정의 (7건)
  "h_ccp_records",
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

function extractTables(filePath: string): TableOccurrence[] {
  const content = readFileSync(filePath, "utf8");
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
