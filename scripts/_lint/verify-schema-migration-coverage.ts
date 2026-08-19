/**
 * Tool 10: 스키마 ↔ 마이그레이션 커버리지 lint
 * ==============================================================================
 * 목적:
 *   drizzle 스키마(스냅샷)에 정의된 테이블/컬럼이 마이그레이션 SQL 로 실제
 *   생성되는지 검사한다. 커버되지 않은 항목은 "코드는 존재를 가정하지만
 *   저장소만으로는 만들 수 없는" 스키마다.
 *
 * 배경 (Issue #421):
 *   2026-08-19 측정 결과 283개 테이블 중 271개(95%)가 CREATE TABLE 마이그레이션
 *   없이 존재했다. drizzle/0001~0008 은 placeholder(빈 스텁)이고, 실제 DB 는
 *   drizzle-kit push 계열 또는 수작업으로 만들어진 것으로 추정된다.
 *
 *   증상 사례: 배치 파이프라인 STEP 10 이 checklist_templates.frequency 를
 *   요구하는데 그 컬럼을 만드는 SQL 이 저장소 어디에도 없었다. 운영에는
 *   존재했지만(Case 1) 저장소만으로는 확인도 재현도 불가능했다.
 *
 * 정책:
 *   - 기존 미커버 항목은 baseline JSON 에 기록하고 통과시킨다 (점진 정리).
 *   - baseline 에 없는 **신규** 미커버 항목이 생기면 실패시킨다.
 *     → 부채가 더 쌓이는 것을 막는 것이 이 lint 의 목적이다.
 *
 * 사용법:
 *   npx tsx scripts/_lint/verify-schema-migration-coverage.ts
 *   npx tsx scripts/_lint/verify-schema-migration-coverage.ts --update-baseline
 *
 * 종료 코드:
 *   0 = 통과 (신규 미커버 0건)
 *   1 = 신규 미커버 발견
 *   2 = 스크립트 오류 (스냅샷 없음 등)
 * ==============================================================================
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const SNAPSHOT_DIR = "drizzle/meta";
const MIGRATION_DIR = "drizzle";
const BASELINE_PATH = "scripts/_lint/schema-migration-coverage-baseline.json";

interface Baseline {
  /** 생성 시각 (추적용) */
  generatedAt: string;
  /** 기준 스냅샷 파일명 */
  snapshot: string;
  /** CREATE TABLE 마이그레이션이 없는 테이블 */
  uncoveredTables: string[];
  /** "table.column" — CREATE/ADD 어디에도 없는 컬럼 (커버된 테이블 한정) */
  uncoveredColumns: string[];
}

// ─────────────────────────────────────────────────────────────
// 1) 스냅샷 파싱 — 스키마가 주장하는 테이블/컬럼
// ─────────────────────────────────────────────────────────────
function latestSnapshotPath(): string {
  if (!existsSync(SNAPSHOT_DIR)) {
    console.error(`❌ ${SNAPSHOT_DIR} 없음`);
    process.exit(2);
  }
  const snaps = readdirSync(SNAPSHOT_DIR)
    .filter((f) => f.endsWith("_snapshot.json"))
    .sort();
  if (snaps.length === 0) {
    console.error(`❌ ${SNAPSHOT_DIR} 에 스냅샷이 없음`);
    process.exit(2);
  }
  return join(SNAPSHOT_DIR, snaps[snaps.length - 1]);
}

function readSnapshot(path: string): Map<string, Set<string>> {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const out = new Map<string, Set<string>>();
  for (const [tableName, def] of Object.entries<any>(raw.tables ?? {})) {
    out.set(tableName, new Set(Object.keys(def.columns ?? {})));
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// 2) 마이그레이션 파싱 — SQL 이 실제로 만드는 것
// ─────────────────────────────────────────────────────────────
interface MigrationCoverage {
  createdTables: Set<string>;
  /** table → 생성/추가된 컬럼 */
  columns: Map<string, Set<string>>;
  fileCount: number;
  nonEmptyCount: number;
}

/** 주석을 같은 길이 공백으로 치환 (verify-drizzle-unique-tables 와 동일 사유) */
function stripSqlComments(src: string): string {
  const out = src.split("");
  let state: "code" | "line" | "block" | "sq" | "dq" | "bt" = "code";
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const n = src[i + 1];
    switch (state) {
      case "code":
        if (c === "-" && n === "-") { state = "line"; out[i] = " "; out[i + 1] = " "; i++; }
        else if (c === "#") { state = "line"; out[i] = " "; }
        else if (c === "/" && n === "*") { state = "block"; out[i] = " "; out[i + 1] = " "; i++; }
        else if (c === "'") state = "sq";
        else if (c === '"') state = "dq";
        else if (c === "`") state = "bt";
        break;
      case "sq": if (c === "\\") { i++; } else if (c === "'") state = "code"; break;
      case "dq": if (c === "\\") { i++; } else if (c === '"') state = "code"; break;
      case "bt": if (c === "`") state = "code"; break;
      case "line": if (c === "\n") state = "code"; else out[i] = " "; break;
      case "block":
        if (c === "*" && n === "/") { state = "code"; out[i] = " "; out[i + 1] = " "; i++; }
        else if (c !== "\n") out[i] = " ";
        break;
    }
  }
  return out.join("");
}

const RE_CREATE_TABLE = /CREATE TABLE(?:\s+IF NOT EXISTS)?\s+`?([A-Za-z0-9_]+)`?\s*\(/gi;
// ADD CONSTRAINT / ADD INDEX 등은 컬럼이 아니므로 제외
const RE_ADD_COLUMN =
  /ALTER TABLE\s+`?([A-Za-z0-9_]+)`?\s+ADD\s+(?!CONSTRAINT\b|INDEX\b|KEY\b|UNIQUE\b|PRIMARY\b|FULLTEXT\b|SPATIAL\b)(?:COLUMN\s+)?`?([A-Za-z0-9_]+)`?/gi;

/** CREATE TABLE (...) 본문에서 컬럼명 추출 — 괄호 depth 를 세어 본문 경계를 잡는다 */
function columnsInCreateBody(sql: string, openParenIdx: number): string[] {
  let depth = 0;
  let end = openParenIdx;
  for (let i = openParenIdx; i < sql.length; i++) {
    if (sql[i] === "(") depth++;
    else if (sql[i] === ")") {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  const body = sql.slice(openParenIdx + 1, end);
  const cols: string[] = [];
  // 최상위 depth 에서 백틱으로 시작하는 정의만 컬럼으로 본다
  let d = 0;
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (d === 0) {
      const m = line.match(/^`([A-Za-z0-9_]+)`\s+\S/);
      if (m) cols.push(m[1]);
    }
    for (const ch of line) {
      if (ch === "(") d++;
      else if (ch === ")") d--;
    }
  }
  return cols;
}

function readMigrations(): MigrationCoverage {
  const files = readdirSync(MIGRATION_DIR).filter((f) => f.endsWith(".sql")).sort();
  const createdTables = new Set<string>();
  const columns = new Map<string, Set<string>>();
  let nonEmptyCount = 0;

  const addCol = (t: string, c: string) => {
    if (!columns.has(t)) columns.set(t, new Set());
    columns.get(t)!.add(c);
  };

  for (const f of files) {
    const raw = readFileSync(join(MIGRATION_DIR, f), "utf8");
    if (raw.trim()) nonEmptyCount++;
    const sql = stripSqlComments(raw);

    RE_CREATE_TABLE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = RE_CREATE_TABLE.exec(sql)) !== null) {
      const table = m[1];
      createdTables.add(table);
      const openIdx = sql.indexOf("(", m.index + m[0].length - 1);
      for (const c of columnsInCreateBody(sql, openIdx)) addCol(table, c);
    }

    RE_ADD_COLUMN.lastIndex = 0;
    while ((m = RE_ADD_COLUMN.exec(sql)) !== null) {
      addCol(m[1], m[2]);
    }
  }

  return { createdTables, columns, fileCount: files.length, nonEmptyCount };
}

// ─────────────────────────────────────────────────────────────
// 3) 비교 + baseline 판정
// ─────────────────────────────────────────────────────────────
function main() {
  const updateBaseline = process.argv.includes("--update-baseline");

  const snapPath = latestSnapshotPath();
  const snapshot = readSnapshot(snapPath);
  const mig = readMigrations();

  console.log("=== Tool 10: 스키마 ↔ 마이그레이션 커버리지 ===\n");
  console.log(`기준 스냅샷 : ${snapPath}`);
  console.log(`스냅샷 테이블: ${snapshot.size}`);
  console.log(`마이그레이션 : ${mig.fileCount}개 파일 (내용 있음 ${mig.nonEmptyCount}개)`);
  console.log(`CREATE TABLE : ${mig.createdTables.size}개 테이블\n`);

  const uncoveredTables: string[] = [];
  const uncoveredColumns: string[] = [];

  for (const [table, cols] of snapshot) {
    if (!mig.createdTables.has(table)) {
      uncoveredTables.push(table);
      continue; // 테이블 자체가 없으면 컬럼은 따지지 않는다 (중복 보고 방지)
    }
    const covered = mig.columns.get(table) ?? new Set<string>();
    for (const c of cols) {
      if (!covered.has(c)) uncoveredColumns.push(`${table}.${c}`);
    }
  }
  uncoveredTables.sort();
  uncoveredColumns.sort();

  const pctCovered = Math.round(((snapshot.size - uncoveredTables.length) / Math.max(snapshot.size, 1)) * 100);
  console.log(`미커버 테이블: ${uncoveredTables.length} / ${snapshot.size}  (커버율 ${pctCovered}%)`);
  console.log(`미커버 컬럼  : ${uncoveredColumns.length} (커버된 테이블 내)\n`);

  // baseline 갱신 모드
  if (updateBaseline) {
    const next: Baseline = {
      generatedAt: new Date().toISOString().slice(0, 10),
      snapshot: snapPath,
      uncoveredTables,
      uncoveredColumns,
    };
    writeFileSync(BASELINE_PATH, JSON.stringify(next, null, 2) + "\n");
    console.log(`✅ baseline 갱신: ${BASELINE_PATH}`);
    console.log(`   테이블 ${uncoveredTables.length} / 컬럼 ${uncoveredColumns.length}`);
    return;
  }

  if (!existsSync(BASELINE_PATH)) {
    console.error(`❌ baseline 파일 없음: ${BASELINE_PATH}`);
    console.error(`   최초 1회: npx tsx ${process.argv[1]} --update-baseline`);
    process.exit(2);
  }

  const baseline: Baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
  const baseTables = new Set(baseline.uncoveredTables);
  const baseColumns = new Set(baseline.uncoveredColumns);

  const newTables = uncoveredTables.filter((t) => !baseTables.has(t));
  const newColumns = uncoveredColumns.filter((c) => !baseColumns.has(c));

  // baseline 에 있었는데 이제 커버된 항목 (개선) — 정보성
  const fixedTables = baseline.uncoveredTables.filter((t) => !uncoveredTables.includes(t));
  const fixedColumns = baseline.uncoveredColumns.filter((c) => !uncoveredColumns.includes(c));

  console.log(`baseline (${baseline.generatedAt}): 테이블 ${baseline.uncoveredTables.length} / 컬럼 ${baseline.uncoveredColumns.length}`);
  if (fixedTables.length || fixedColumns.length) {
    console.log(`🎉 개선: 테이블 ${fixedTables.length}건, 컬럼 ${fixedColumns.length}건이 커버됨`);
    console.log(`   (baseline 갱신 권장: --update-baseline)`);
  }
  console.log();

  if (newTables.length === 0 && newColumns.length === 0) {
    console.log("✅ 통과: baseline 외 신규 미커버 0건");
    console.log("\n스캔: drizzle/meta 스냅샷 + drizzle/*.sql");
    return;
  }

  console.error("❌ 실패: 마이그레이션 없이 추가된 스키마 발견\n");
  if (newTables.length) {
    console.error(`신규 미커버 테이블 (${newTables.length}건):`);
    for (const t of newTables) console.error(`  - ${t}`);
    console.error();
  }
  if (newColumns.length) {
    console.error(`신규 미커버 컬럼 (${newColumns.length}건):`);
    for (const c of newColumns.slice(0, 40)) console.error(`  - ${c}`);
    if (newColumns.length > 40) console.error(`  ... 외 ${newColumns.length - 40}건`);
    console.error();
  }
  console.error("해결 방법:");
  console.error("  1. drizzle-kit generate 로 마이그레이션 SQL 을 만들고 커밋하거나,");
  console.error("  2. 수동 ALTER 문을 drizzle/*.sql 에 추가하십시오.");
  console.error("  스키마 정의만 바꾸고 마이그레이션을 빼면 신규 환경에서 재현되지 않습니다.");
  console.error("  (의도된 예외라면 --update-baseline 로 baseline 에 등록)");
  process.exit(1);
}

main();
