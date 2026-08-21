/**
 * 실측 스키마 baseline 덤프 / 대조 (Issue #421 1단계)
 * ==============================================================================
 * 목적:
 *   운영 DB 의 information_schema 를 읽어 "실제 스키마"를 확보하고,
 *   drizzle 스냅샷("코드가 주장하는 스키마")과 대조한다.
 *
 * 배경:
 *   저장소 마이그레이션은 스키마의 source of truth 가 아니다.
 *   drizzle-kit migrate 는 신규 환경에서 테이블을 0개 만든다 (PR #430 에서 실측).
 *   따라서 "실제로 무엇이 있는가" 는 DB 에 물어보는 수밖에 없다.
 *
 * ★ 기준은 "현행 스키마 파일" 이다 (2026-08-21 변경)
 *   이전에는 drizzle 스냅샷을 기준으로 삼았는데, 저널이 idx=1 에서 깨져 있어
 *   (Issue #421) generate 가 오래 돌지 않은 탓에 스냅샷이 스키마 파일보다
 *   뒤처져 있었다. 그래서 "DB 에 없는 컬럼 46건" 이라는 오탐이 나왔고,
 *   전수 확인 결과 **전부 리네임 이전 이름**이었다 (실제 결함 0건, Issue #431).
 *
 *   실측 비교: 스냅샷 283 테이블 / 현행 스키마 357 / 운영 DB 442.
 *
 *   --vs-snapshot 으로 스냅샷 대조도 할 수 있다. 그건 "DB 와의 차이" 가 아니라
 *   **"스냅샷이 얼마나 낡았는가"** 를 재는 용도다.
 *
 * ★ 안전성
 *   information_schema 에 대한 SELECT 만 수행한다.
 *   기본 동작은 **대조 보고서 출력**이며, 파일 기록조차 하지 않는다.
 *   baseline 파일을 남기려면 --write 를 명시해야 한다.
 *
 * 사용법:
 *   # ① 대조만 (읽기 전용, 파일 안 씀)
 *   npx tsx scripts/dump-schema-baseline.ts
 *
 *   # ② baseline 파일 기록
 *   npx tsx scripts/dump-schema-baseline.ts --write
 *
 *   # ③ 특정 테이블만
 *   npx tsx scripts/dump-schema-baseline.ts --table checklist_templates
 *
 *   # ④ 백업 테이블(_backup_*, _bak_*)까지 포함 (기본은 제외)
 *   npx tsx scripts/dump-schema-baseline.ts --include-backups
 *
 *   # ⑤ 스냅샷과 대조 (스냅샷 낡음 정도 측정)
 *   npx tsx scripts/dump-schema-baseline.ts --vs-snapshot
 *
 * 환경변수:
 *   DATABASE_URL  (필수) — 앱과 동일한 접속 문자열
 *
 * 종료 코드:
 *   0 = 정상 (차이가 있어도 0 — 이 스크립트는 판정이 아니라 측정이다)
 *   2 = 실행 오류 (DATABASE_URL 없음, 접속 실패, 스냅샷 없음)
 * ==============================================================================
 */
import { config } from "dotenv";
import mysql from "mysql2/promise";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { latestSnapshotPath, parseSnapshot, normType } from "./_lib/schemaSnapshot";
import { BACKUP_TABLE_RE } from "./_lib/schemaScan";
import { readCurrentSchema } from "./_lib/currentSchema";

config();

// ★ drizzle/meta 는 drizzle-kit 이 관리하는 디렉터리(_journal.json, *_snapshot.json)이므로
//   외부 파일을 섞지 않는다. 스키마 도메인 안이되 meta 밖에 둔다.
const OUT_PATH = "drizzle/baseline/actual-schema.json";

interface ActualColumn {
  type: string;
  nullable: boolean;
  default: string | null;
  position: number;
  /** information_schema 의 EXTRA — auto_increment / DEFAULT_GENERATED / on update ... */
  extra: string;
  /** 문자열 컬럼의 콜레이션 (신규 환경 부트스트랩 시 재현 대상) */
  collation: string | null;
}
type ActualSchema = Record<string, Record<string, ActualColumn>>;

interface ActualIndex {
  unique: boolean;
  columns: string[];
}
type ActualIndexes = Record<string, Record<string, ActualIndex>>;

// ─────────────────────────────────────────────────────────────
// 실측 (DB)
// ─────────────────────────────────────────────────────────────
async function readActual(conn: mysql.Connection, only?: string): Promise<ActualSchema> {
  const [rows] = await conn.execute<any[]>(
    `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, ORDINAL_POSITION,
            EXTRA, COLLATION_NAME
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        ${only ? "AND TABLE_NAME = ?" : ""}
      ORDER BY TABLE_NAME, ORDINAL_POSITION`,
    only ? [only] : [],
  );
  const out: ActualSchema = {};
  for (const r of rows as any[]) {
    (out[r.TABLE_NAME] ??= {})[r.COLUMN_NAME] = {
      type: String(r.COLUMN_TYPE),
      nullable: r.IS_NULLABLE === "YES",
      default: r.COLUMN_DEFAULT ?? null,
      position: Number(r.ORDINAL_POSITION),
      extra: String(r.EXTRA ?? ""),
      collation: r.COLLATION_NAME ?? null,
    };
  }
  return out;
}

/**
 * 인덱스/UNIQUE 실측.
 * 컬럼만 봐서는 알 수 없는 드리프트가 여기 있다 —
 * 예: accounting_accounts 의 UNIQUE 가 (code) 인지 (tenant_id, code) 인지.
 */
async function readIndexes(conn: mysql.Connection, only?: string): Promise<ActualIndexes> {
  const [rows] = await conn.execute<any[]>(
    `SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        ${only ? "AND TABLE_NAME = ?" : ""}
      ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`,
    only ? [only] : [],
  );
  const out: ActualIndexes = {};
  for (const r of rows as any[]) {
    const t = (out[r.TABLE_NAME] ??= {});
    const ix = (t[r.INDEX_NAME] ??= { unique: Number(r.NON_UNIQUE) === 0, columns: [] });
    ix.columns.push(String(r.COLUMN_NAME));
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const includeBackups = args.includes("--include-backups");
  const vsSnapshot = args.includes("--vs-snapshot");
  const tableIdx = args.indexOf("--table");
  const only = tableIdx >= 0 ? args[tableIdx + 1] : undefined;

  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL 환경변수가 없습니다.");
    console.error("   서버에서 실행하거나 .env 를 로드한 뒤 다시 시도하십시오.");
    process.exit(2);
  }

  // ── 기준 스키마 결정 ──
  // 기본은 현행 스키마 파일. 스냅샷은 낡을 수 있으므로 명시할 때만 쓴다.
  let refLabel: string;
  let ref: Map<string, Map<string, { type: string }>>;
  let duplicateTables: Array<{ table: string; exports: string[] }> = [];

  if (vsSnapshot) {
    const snapPath = latestSnapshotPath();
    if (!snapPath) {
      console.error("❌ drizzle/meta 에 스냅샷이 없습니다.");
      process.exit(2);
    }
    const snap = parseSnapshot(snapPath);
    refLabel = `drizzle 스냅샷 ${snapPath}`;
    ref = new Map([...snap.tables].map(([t, cols]) => [t, new Map([...cols].map(([c, d]) => [c, { type: d.type }]))]));
  } else {
    const cur = readCurrentSchema();
    duplicateTables = cur.duplicates;
    refLabel = "현행 스키마 파일 (drizzle/schema)";
    ref = new Map([...cur.tables].map(([t, cols]) => [t, new Map([...cols].map(([c, d]) => [c, { type: d.sqlType }]))]));
  }

  console.log("=== 실측 스키마 대조 (Issue #421 / #431) ===\n");
  console.log(`모드        : ${write ? "덤프 + 대조 (--write)" : "대조만 (읽기 전용)"}`);
  console.log(`기준        : ${refLabel}`);
  console.log(`백업 테이블 : ${includeBackups ? "포함" : "제외 (--include-backups 로 포함)"}`);
  if (only) console.log(`대상 테이블 : ${only}`);
  console.log();

  let conn: mysql.Connection;
  try {
    conn = await mysql.createConnection(process.env.DATABASE_URL);
  } catch (e: any) {
    console.error(`❌ DB 접속 실패: ${e?.message ?? e}`);
    process.exit(2);
  }

  try {
    const [dbRow] = await conn.execute<any[]>("SELECT DATABASE() AS db");
    const dbName = (dbRow as any[])[0]?.db ?? null;
    console.log(`접속 DB     : ${dbName}\n`);

    const actualAll = await readActual(conn, only);
    const indexesAll = await readIndexes(conn, only);

    const backupTables = Object.keys(actualAll).filter((t) => BACKUP_TABLE_RE.test(t)).sort();
    const actual: ActualSchema = {};
    for (const [t, cols] of Object.entries(actualAll)) {
      if (!includeBackups && BACKUP_TABLE_RE.test(t)) continue;
      actual[t] = cols;
    }
    const indexes: ActualIndexes = {};
    for (const [t, ix] of Object.entries(indexesAll)) {
      if (!includeBackups && BACKUP_TABLE_RE.test(t)) continue;
      indexes[t] = ix;
    }
    const actualTables = Object.keys(actual);

    // ── 대조 (전부 컬럼명 축. 속성명과 섞지 않는다) ──
    const missingInDb: string[] = [];  // 기준에 있고 DB 에 없음 — 런타임 에러 후보
    const missingInRef: string[] = []; // DB 에 있고 기준에 없음 — 정의가 실제를 못 따라감
    const typeMismatch: string[] = [];

    for (const [t, cols] of ref) {
      if (only && t !== only) continue;
      const a = actual[t];
      if (!a) { missingInDb.push(`${t} (테이블 전체)`); continue; }
      for (const [c, def] of cols) {
        const ac = a[c];
        if (!ac) { missingInDb.push(`${t}.${c}`); continue; }
        if (normType(def.type) !== normType(ac.type)) {
          typeMismatch.push(`${t}.${c}  기준=${def.type}  실제=${ac.type}`);
        }
      }
    }
    for (const t of actualTables) {
      const r = ref.get(t);
      if (!r) { missingInRef.push(`${t} (테이블 전체)`); continue; }
      for (const c of Object.keys(actual[t])) {
        if (!r.has(c)) missingInRef.push(`${t}.${c}`);
      }
    }

    console.log(`실측 테이블 : ${actualTables.length}${backupTables.length && !includeBackups ? `  (백업 ${backupTables.length}개 제외)` : ""}`);
    console.log(`기준 테이블 : ${only ? 1 : ref.size}\n`);

    if (duplicateTables.length) {
      console.log(`⚠️ 같은 테이블을 두 번 정의한 export ${duplicateTables.length}건 — 먼저 만난 쪽을 기준으로 삼았습니다:`);
      for (const d of duplicateTables.slice(0, 10)) console.log(`   ${d.table} ← ${d.exports.join(", ")}`);
      console.log();
    }

    const section = (title: string, items: string[], note: string, limit = 40) => {
      console.log(`── ${title}: ${items.length}건 ──`);
      if (note) console.log(`   ${note}`);
      for (const x of items.slice(0, limit)) console.log(`   - ${x}`);
      if (items.length > limit) console.log(`   ... 외 ${items.length - limit}건`);
      console.log();
    };

    section("🔴 기준에 있으나 DB 에 없음", missingInDb,
      "코드가 존재를 가정하지만 실제로 없습니다. 런타임 에러의 직접 원인이 됩니다.\n" +
      "   기준이 현행 스키마이므로 여기 뜨는 항목은 drizzle 접근 시 곧바로 실패합니다.", 60);

    section("🟡 DB 에 있으나 기준에 없음", missingInRef,
      "스키마 정의가 실제를 따라가지 못한 부분입니다. 신규 환경은 이것들 없이 출발합니다.");

    section("🔵 타입 불일치", typeMismatch,
      "표기 차이로 인한 잡음이 섞일 수 있습니다. enum 값 차이는 실제 문제인 경우가 많습니다.");

    if (!vsSnapshot) {
      console.log("ℹ️  기준은 현행 스키마 파일입니다. 스냅샷이 얼마나 낡았는지 보려면 --vs-snapshot 을 쓰십시오.\n");
    }

    if (backupTables.length) {
      section("⚪ 백업 테이블 (baseline 제외)", backupTables,
        "수동 백업 사본으로 판단해 제외했습니다. 잘못 걸러졌다면 --include-backups 로 확인하십시오.", 20);
    }

    const uniqueCount = Object.values(indexes)
      .reduce((n, ix) => n + Object.values(ix).filter((i) => i.unique).length, 0);
    console.log(`── 인덱스 실측 ──`);
    console.log(`   인덱스 보유 테이블: ${Object.keys(indexes).length} / UNIQUE 제약: ${uniqueCount}`);
    console.log(`   (컬럼 대조만으로는 잡히지 않는 드리프트입니다. --write 시 baseline 에 함께 기록됩니다.)\n`);

    if (write) {
      const payload = {
        generatedAt: new Date().toISOString(),
        database: dbName,
        reference: refLabel,
        includeBackups,
        excludedBackupTables: includeBackups ? [] : backupTables,
        tableCount: actualTables.length,
        tables: actual,
        indexes,
      };
      mkdirSync(dirname(OUT_PATH), { recursive: true });
      writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2) + "\n");
      console.log(`✅ baseline 기록: ${OUT_PATH} (테이블 ${actualTables.length})`);
    } else {
      console.log("ℹ️  파일을 쓰지 않았습니다. 기록하려면 --write 를 붙이십시오.");
    }
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error("❌ 실패:", e?.message ?? e);
  process.exit(2);
});
