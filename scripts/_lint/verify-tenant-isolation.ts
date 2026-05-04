/**
 * Tool 9: tenant_id 격리 검증 lint
 *
 * 목적: 멀티테넌트 격리 위반을 사전 차단.
 *       - tenant_id 컬럼이 있는 테이블에 대한 raw SQL 이 tenant_id 필터 없이 실행되면
 *         cross-tenant 데이터 누출 위험.
 *       - PR 단계에서 자동 검출 → reviewer 부하 감소 + 회귀 차단.
 *
 * 알고리즘:
 *   1. drizzle/schema/ 스캔 → tenant_id 컬럼이 있는 테이블 SQL 명 추출 (e.g. "h_batches", "accounting_purchases")
 *   2. server/db/ + server/routers/ + server/services/ 의 모든 .ts 파일 스캔
 *   3. db.execute(sql\`...\`) 블록 추출
 *   4. 각 블록 내 FROM / JOIN 으로 참조된 tenant-bearing 테이블 찾기
 *   5. 같은 SQL 블록 내 `tenant_id` 키워드 부재 → 위반 보고
 *
 * False positive 회피:
 *   - 시스템 테이블 (users / tenants / sessions / settings) 은 의도적으로 cross-tenant
 *   - DDL (CREATE / ALTER / DROP) 은 무시 — 마이그레이션은 별개 리뷰
 *   - 파일/라인에 `// @lint-ignore tenant-isolation` 주석 → 의도적 cross-tenant (사유 반드시 명시)
 *   - `INFORMATION_SCHEMA` / `SHOW TABLES` 등 메타 쿼리 무시
 *   - JOIN 으로 부모 테이블의 tenant_id 가 이미 보장된 경우 (`p.tenant_id = h.tenant_id` 등)
 *
 * 종료 코드:
 *   0 = 통과
 *   1 = 위반 (tenant 격리 누출 위험 발견)
 *
 * 사용:
 *   npx tsx scripts/_lint/verify-tenant-isolation.ts
 */

import * as fs from "fs";
import * as path from "path";

const REPO_ROOT = process.cwd();

// ─── 설정 ───
const SCHEMA_DIRS = ["drizzle/schema"];
const SCAN_DIRS = [
  "server/db",
  "server/routers",
  "server/services",
  "server/lib",
  "server/core-erp",
  "server/core-mes",
  "server/domain",
  "server/industry",
  "server/addon",
  "server/platform",
  "server/schedulers",
  "server/reports",
];

// 시스템/공용 테이블 — 의도적으로 cross-tenant 또는 tenant 별 격리 무관
const SYSTEM_TABLES = new Set([
  "users",
  "tenants",
  "sessions",
  "settings",
  "platform_settings",
  "system_settings",
  "tenants_public",
  "support_inquiries",
  "audit_logs",
  "schema_migrations",
  "drizzle_migrations",
  "industries",
  "subscription_plans",
  "subscription_packages",
  "industry_profiles",
  "system_admin_emails",
]);

// ─── tenant-bearing 테이블 추출 ───
function extractTenantTables(): Set<string> {
  const tables = new Set<string>();

  function scanSchema(dir: string): void {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanSchema(full);
      } else if (entry.isFile() && entry.name.endsWith(".ts")) {
        const content = fs.readFileSync(full, "utf-8");

        // mysqlTable("table_name", { ... tenantId: ... ... })
        // 단순 정규식: mysqlTable("X", { ... tenantId: int("tenant_id") ... })
        const tableRegex = /mysqlTable\(\s*["'`]([a-z_][a-z0-9_]*)["'`]\s*,\s*\{([\s\S]*?)\n\s*\}\s*(?:,|\))/gi;
        let m;
        while ((m = tableRegex.exec(content)) !== null) {
          const tableName = m[1];
          const body = m[2];
          if (/\btenantId\s*:\s*int\(['"`]tenant_id['"`]\)/.test(body)) {
            tables.add(tableName);
          }
        }
      }
    }
  }

  for (const d of SCHEMA_DIRS) {
    scanSchema(path.join(REPO_ROOT, d));
  }

  // 시스템 테이블 제거
  for (const sys of SYSTEM_TABLES) tables.delete(sys);
  return tables;
}

// ─── 위반 정보 ───
interface Violation {
  file: string;
  line: number;
  table: string;
  reason: string;
  snippet: string;
}

const violations: Violation[] = [];

// ─── SQL 블록 추출 ───
/**
 * 각 db.execute(sql\`...\`) 블록을 라인 위치와 함께 반환.
 * 백틱 내부 escape 처리 단순화 — 백틱 ${...} 안에 또 다른 sql 백틱은 드물어서 nested 무시.
 */
function extractSqlBlocks(content: string): Array<{ sql: string; startLine: number }> {
  const blocks: Array<{ sql: string; startLine: number }> = [];
  // db.execute(sql`...`) 형태
  const re = /\bdb\.execute\s*\(\s*sql\s*`/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const startIdx = m.index + m[0].length;
    // 다음 매칭되지 않은 ` 까지 (내부 ${...} 는 그냥 통과)
    let depth = 0;
    let end = -1;
    for (let i = startIdx; i < content.length; i++) {
      const ch = content[i];
      if (ch === "$" && content[i + 1] === "{") {
        depth++;
        i++;
        continue;
      }
      if (depth > 0) {
        if (ch === "}") depth--;
        continue;
      }
      if (ch === "`") {
        end = i;
        break;
      }
    }
    if (end < 0) continue;
    const sqlText = content.slice(startIdx, end);
    const startLine = content.slice(0, m.index).split("\n").length;
    blocks.push({ sql: sqlText, startLine });
  }
  return blocks;
}

// ─── 라인별 lint-ignore 마커 ───
function isIgnored(content: string, lineNo: number): boolean {
  const lines = content.split("\n");
  // 직전 5라인 또는 같은 라인 안에 마커 존재?
  const start = Math.max(0, lineNo - 6);
  const end = Math.min(lines.length, lineNo + 1);
  for (let i = start; i < end; i++) {
    if (/@lint-ignore\s+tenant-isolation/i.test(lines[i] ?? "")) return true;
  }
  return false;
}

// ─── DDL / 메타 쿼리 ───
function isDdlOrMeta(sql: string): boolean {
  const trimmed = sql.trim().toUpperCase();
  if (/^(CREATE|ALTER|DROP|TRUNCATE|RENAME)\b/.test(trimmed)) return true;
  if (/INFORMATION_SCHEMA/.test(trimmed)) return true;
  if (/^SHOW\s+/.test(trimmed)) return true;
  if (/^DESCRIBE\s+/.test(trimmed) || /^DESC\s+/.test(trimmed)) return true;
  if (/^SET\s+/.test(trimmed)) return true;
  return false;
}

// ─── SQL 블록 내 참조 테이블 ───
/**
 * FROM / JOIN / UPDATE / INSERT INTO / DELETE FROM 후의 테이블 명 + alias 추출.
 */
function extractTableRefs(
  sql: string,
): Array<{ table: string; alias: string | null }> {
  const refs: Array<{ table: string; alias: string | null }> = [];
  const re =
    /\b(?:FROM|JOIN|UPDATE|INTO|DELETE\s+FROM)\s+([a-z_][a-z0-9_]*)(?:\s+(?:AS\s+)?([a-z_][a-z0-9_]*))?/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const table = m[1];
    let alias: string | null = m[2] ?? null;
    // alias 가 SQL 키워드면 alias 아님
    if (alias && /^(ON|WHERE|LEFT|RIGHT|INNER|OUTER|CROSS|FULL|JOIN|GROUP|ORDER|LIMIT|HAVING|USING|SET|VALUES|AS)$/i.test(alias)) {
      alias = null;
    }
    refs.push({ table: table.toLowerCase(), alias });
  }
  return refs;
}

// ─── tenant_id 필터 존재 확인 ───
/**
 * 같은 SQL 블록에 다음 중 하나라도 있으면 안전:
 *   - `<alias>.tenant_id = ?` (parameterized)
 *   - `<alias>.tenant_id = ${...}` (template literal)
 *   - `<alias>.tenant_id IN (...)`
 *   - `tenant_id` 키워드 + 같은 블록의 alias (느슨한 검사)
 *   - JOIN 조건에 `<alias>.tenant_id = <other_alias>.tenant_id` (cascade)
 */
function hasTenantFilter(sql: string, alias: string | null, tableName: string): boolean {
  if (!sql) return false;
  // 단순화: SQL 블록 안에 `tenant_id` 가 한 번이라도 나오면 통과 (느슨)
  // — 더 엄밀히 하려면 alias 별 매칭, JOIN cascade 추적 필요. 1차 PoC.
  if (!/tenant_id/i.test(sql)) return false;

  // 있으면 일단 OK. 단, alias 가 명시된 경우 alias 매칭이 더 정확.
  if (alias) {
    const aliasRe = new RegExp(`\\b${alias}\\.tenant_id\\b`, "i");
    if (aliasRe.test(sql)) return true;
    // alias 없이 tenant_id 가 나오는 다른 alias 의 것일 수도 있음 (JOIN cascade)
    // 보수적으로 "tenant_id 키워드 존재" 만 보고 통과.
    return true;
  }
  return true;
}

// ─── 파일 스캔 ───
function scanFile(filePath: string, tenantTables: Set<string>): void {
  const content = fs.readFileSync(filePath, "utf-8");
  const blocks = extractSqlBlocks(content);

  for (const { sql, startLine } of blocks) {
    if (isDdlOrMeta(sql)) continue;
    if (isIgnored(content, startLine)) continue;

    const refs = extractTableRefs(sql);
    if (refs.length === 0) continue;

    // 한 블록 내에 tenant-bearing 테이블이 하나라도 있고, 동시에 tenant_id 필터가 없으면 위반
    const tenantRefs = refs.filter((r) => tenantTables.has(r.table));
    if (tenantRefs.length === 0) continue;

    // 안전 조건 (다음 중 하나라도 만족하면 위반 아님):
    //   1. SQL 본문에 'tenant_id' 키워드 존재
    //   2. ${...} 템플릿 보간 변수가 'tenant' 를 포함 (tenantFilter / tenantClause / tenantWhere / tenantId 등)
    //      — 사전 빌드된 sql 조각이 주입된 패턴 (notificationFunctions / codeGenerator 등 다수)
    const hasLiteralTenantId = /tenant_id/i.test(sql);
    const interpolations = sql.match(/\$\{[^}]*\}/g) ?? [];
    const hasTenantInterpolation = interpolations.some((s) => /tenant/i.test(s));

    if (hasLiteralTenantId || hasTenantInterpolation) continue;

    // 위반: tenant 격리 단서 0건
    const first = tenantRefs[0];
    violations.push({
      file: path.relative(REPO_ROOT, filePath),
      line: startLine,
      table: first.table,
      reason: "tenant_id 필터 없음 (literal / 보간 양쪽 모두 부재)",
      snippet: sql.replace(/\s+/g, " ").trim().slice(0, 120),
    });
  }
}

function walk(dir: string, tenantTables: Set<string>): void {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "_backup" || entry.name === "__tests__") continue;
      walk(full, tenantTables);
    } else if (
      entry.isFile() &&
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".d.ts")
    ) {
      scanFile(full, tenantTables);
    }
  }
}

// ─── 실행 ───
console.log("=== Tool 9: tenant_id 격리 lint ===\n");

const tenantTables = extractTenantTables();
console.log(`tenant-bearing 테이블 ${tenantTables.size} 개 추출:\n`);
console.log("  " + Array.from(tenantTables).sort().slice(0, 8).join(", ") + (tenantTables.size > 8 ? `, ... (+${tenantTables.size - 8})` : ""));
console.log("");

for (const dir of SCAN_DIRS) {
  const full = path.join(REPO_ROOT, dir);
  walk(full, tenantTables);
}

// ─── 결과 출력 ───
if (violations.length === 0) {
  console.log("✅ tenant_id 격리 위반 0건 — 통과\n");
  console.log(`스캔: ${SCAN_DIRS.join(", ")}`);
  process.exit(0);
}

console.error(`❌ ${violations.length} 건 위반 의심 발견:\n`);

const byFile = new Map<string, Violation[]>();
for (const v of violations) {
  const arr = byFile.get(v.file) ?? [];
  arr.push(v);
  byFile.set(v.file, arr);
}

let count = 0;
for (const [file, vs] of byFile) {
  if (count++ > 80) {
    console.error(`\n... (and ${byFile.size - 80} more files)`);
    break;
  }
  console.error(`📄 ${file}`);
  for (const v of vs.slice(0, 5)) {
    console.error(`   L${v.line} [${v.table}] ${v.reason}`);
    console.error(`      ${v.snippet}`);
  }
  if (vs.length > 5) console.error(`   ... (+${vs.length - 5} more in this file)`);
  console.error("");
}

console.error("\n참고:");
console.error("  - tenant 격리 누락 = cross-tenant 데이터 누출 위험");
console.error("  - 의도된 cross-tenant 쿼리 (super-admin 통계 등) 는 // @lint-ignore tenant-isolation 주석 + 사유 명시");
console.error("  - 1차 PoC: 'tenant_id' 키워드 부재만 검사 — alias 정밀 매칭은 후속");

process.exit(1);
