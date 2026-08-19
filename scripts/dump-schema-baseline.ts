/**
 * 실측 스키마 baseline 덤프 / 대조 (Issue #421 1단계)
 * ==============================================================================
 * 목적:
 *   운영 DB 의 information_schema 를 읽어 "실제 스키마"를 확보하고,
 *   drizzle 스냅샷("코드가 주장하는 스키마")과 대조한다.
 *
 * 배경:
 *   저장소 마이그레이션은 스키마의 source of truth 가 아니다.
 *   283개 테이블 중 271개가 CREATE TABLE 이력 없이 존재한다 (Issue #421).
 *   따라서 "실제로 무엇이 있는가" 는 DB 에 물어보는 수밖에 없다.
 *
 * ★ 안전성
 *   information_schema 에 대한 SELECT 만 수행한다.
 *   기본 동작은 **대조 보고서 출력**이며, 파일 기록조차 하지 않는다.
 *   baseline 파일을 남기려면 --write 를 명시해야 한다.
 *
 * 사용법:
 *   # ① 대조만 (읽기 전용, 파일 안 씀) — 먼저 이걸로 결과를 확인할 것
 *   npx tsx scripts/dump-schema-baseline.ts
 *
 *   # ② baseline 파일 기록
 *   npx tsx scripts/dump-schema-baseline.ts --write
 *
 *   # ③ 특정 테이블만
 *   npx tsx scripts/dump-schema-baseline.ts --table checklist_templates
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
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

config();

const SNAPSHOT_DIR = "drizzle/meta";
// ★ drizzle/meta 는 drizzle-kit 이 관리하는 디렉터리(_journal.json, *_snapshot.json)이므로
//   외부 파일을 섞지 않는다. 스키마 도메인 안이되 meta 밖에 둔다.
const OUT_PATH = "drizzle/baseline/actual-schema.json";

interface ActualColumn {
  type: string;
  nullable: boolean;
  default: string | null;
  position: number;
}
type ActualSchema = Record<string, Record<string, ActualColumn>>;

// ─────────────────────────────────────────────────────────────
// drizzle 스냅샷 (코드가 주장하는 스키마)
// ─────────────────────────────────────────────────────────────
function latestSnapshot(): { path: string; tables: Map<string, Map<string, string>> } {
  if (!existsSync(SNAPSHOT_DIR)) {
    console.error(`❌ ${SNAPSHOT_DIR} 없음`);
    process.exit(2);
  }
  const files = readdirSync(SNAPSHOT_DIR).filter((f) => f.endsWith("_snapshot.json")).sort();
  if (!files.length) {
    console.error(`❌ 스냅샷 없음`);
    process.exit(2);
  }
  const path = join(SNAPSHOT_DIR, files[files.length - 1]);
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const tables = new Map<string, Map<string, string>>();
  for (const [t, def] of Object.entries<any>(raw.tables ?? {})) {
    const cols = new Map<string, string>();
    for (const [c, cdef] of Object.entries<any>(def.columns ?? {})) {
      cols.set(c, String(cdef.type ?? ""));
    }
    tables.set(t, cols);
  }
  return { path, tables };
}

/** 타입 문자열 정규화 — 표기 차이로 인한 잡음 제거 */
function normType(t: string): string {
  return t
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\bint\(\d+\)/g, "int")        // int(11) → int
    .replace(/\bbigint\(\d+\)/g, "bigint")
    .replace(/\btinyint\(\d+\)/g, "tinyint")
    .replace(/'\s*,\s*'/g, "','")            // enum 내부 공백
    .trim();
}

// ─────────────────────────────────────────────────────────────
// 실측 (DB)
// ─────────────────────────────────────────────────────────────
async function readActual(conn: mysql.Connection, only?: string): Promise<ActualSchema> {
  const [rows] = await conn.execute<any[]>(
    `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, ORDINAL_POSITION
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
    };
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const tableIdx = args.indexOf("--table");
  const only = tableIdx >= 0 ? args[tableIdx + 1] : undefined;

  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL 환경변수가 없습니다.");
    console.error("   서버에서 실행하거나 .env 를 로드한 뒤 다시 시도하십시오.");
    process.exit(2);
  }

  const snap = latestSnapshot();
  console.log("=== 실측 스키마 baseline (Issue #421 1단계) ===\n");
  console.log(`모드        : ${write ? "덤프 + 대조 (--write)" : "대조만 (읽기 전용)"}`);
  console.log(`기준 스냅샷 : ${snap.path}`);
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
    console.log(`접속 DB     : ${(dbRow as any[])[0]?.db}\n`);

    const actual = await readActual(conn, only);
    const actualTables = Object.keys(actual);

    // ── 대조 ──
    const missingInDb: string[] = [];      // 스냅샷에 있고 DB 에 없음 (위험)
    const missingInSnapshot: string[] = []; // DB 에 있고 스냅샷에 없음
    const typeMismatch: string[] = [];

    for (const [t, cols] of snap.tables) {
      if (only && t !== only) continue;
      const a = actual[t];
      if (!a) { missingInDb.push(`${t} (테이블 전체)`); continue; }
      for (const [c, snapType] of cols) {
        const ac = a[c];
        if (!ac) { missingInDb.push(`${t}.${c}`); continue; }
        if (normType(snapType) !== normType(ac.type)) {
          typeMismatch.push(`${t}.${c}  스냅샷=${snapType}  실제=${ac.type}`);
        }
      }
    }
    for (const t of actualTables) {
      const s = snap.tables.get(t);
      if (!s) { missingInSnapshot.push(`${t} (테이블 전체)`); continue; }
      for (const c of Object.keys(actual[t])) {
        if (!s.has(c)) missingInSnapshot.push(`${t}.${c}`);
      }
    }

    console.log(`실측 테이블 : ${actualTables.length}`);
    console.log(`스냅샷 테이블: ${only ? 1 : snap.tables.size}\n`);

    const section = (title: string, items: string[], note: string, limit = 40) => {
      console.log(`── ${title}: ${items.length}건 ──`);
      if (note) console.log(`   ${note}`);
      for (const x of items.slice(0, limit)) console.log(`   - ${x}`);
      if (items.length > limit) console.log(`   ... 외 ${items.length - limit}건`);
      console.log();
    };

    section("🔴 스냅샷에 있으나 DB 에 없음", missingInDb,
      "코드가 존재를 가정하지만 실제로 없습니다. 런타임 에러의 직접 원인이 됩니다.");
    section("🟡 DB 에 있으나 스냅샷에 없음", missingInSnapshot,
      "스키마 정의가 실제를 따라가지 못한 부분입니다.");
    section("🔵 타입 불일치", typeMismatch,
      "표기 차이로 인한 잡음이 섞일 수 있습니다. 실제 문제인지 개별 확인 필요.");

    if (write) {
      const payload = {
        generatedAt: new Date().toISOString(),
        database: (dbRow as any[])[0]?.db ?? null,
        snapshot: snap.path,
        tableCount: actualTables.length,
        tables: actual,
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
