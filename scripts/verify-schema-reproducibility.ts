/**
 * 신규 환경 재현성 검증 (Issue #421 3단계 — DB 검사)
 * ==============================================================================
 * 질문:
 *   "빈 DB 에 저장소의 마이그레이션만 돌리면 운영과 같은 스키마가 되는가?"
 *
 * 이 스크립트는 **이미 마이그레이션이 끝난 DB** 에 접속해
 * drizzle 스냅샷(코드가 주장하는 스키마) 과 대조하고 그 차이를 수치로 남긴다.
 * 마이그레이션 실행 자체는 호출부(CI 워크플로) 가 담당한다.
 *
 * ★ 안전성
 *   information_schema 에 대한 SELECT 만 수행한다. DDL/DML 을 실행하지 않는다.
 *   그럼에도 --allow-remote 없이는 localhost/127.0.0.1 이외 호스트 접속을 거부한다.
 *   (운영 DB 를 CI 용 빈 DB 로 착각해 지표를 오염시키는 일을 막기 위함)
 *
 * 기준(무엇과 대조할 것인가):
 *   기본            drizzle 스냅샷 — "코드가 주장하는 스키마"
 *   --against-actual <path>
 *                   운영 실측 덤프 — "운영이 실제로 가진 스키마".
 *                   신규 환경을 운영과 같게 세웠는지 보려면 이쪽이다.
 *
 * 사용법:
 *   DATABASE_URL=mysql://root:pw@127.0.0.1:3306/haccp_ci \
 *     npx tsx scripts/verify-schema-reproducibility.ts --json out/repro.json
 *
 *   # 기준선 갱신 (개선됐을 때만)
 *   ... --update-baseline
 *
 * 종료 코드:
 *   0 = 통과 (baseline 대비 악화 없음)
 *   1 = 악화 (재현되지 않는 테이블/컬럼이 늘어남)
 *   2 = 실행 오류 (DATABASE_URL 없음, 접속 실패, 스냅샷 없음)
 * ==============================================================================
 */
import { config } from "dotenv";
import mysql from "mysql2/promise";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { latestSnapshotPath, parseSnapshot, normType } from "./_lib/schemaSnapshot";

config();

const BASELINE_PATH = "scripts/_lint/schema-reproducibility-baseline.json";

interface Report {
  generatedAt: string;
  snapshot: string;
  /** 마이그레이션 후 DB 에 실제로 만들어진 테이블 수 */
  createdTables: number;
  /** 스냅샷이 요구하는 테이블 수 */
  expectedTables: number;
  /** 스냅샷에 있으나 재현되지 않은 테이블 */
  missingTables: string[];
  /** 테이블은 있으나 재현되지 않은 컬럼 ("table.column") */
  missingColumns: string[];
  /** 재현됐으나 타입이 다른 컬럼 (정보성 — 판정에 쓰지 않음) */
  typeMismatches: string[];
}

function fail(msg: string): never {
  console.error(`❌ ${msg}`);
  process.exit(2);
}

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const updateBaseline = process.argv.includes("--update-baseline");
  const allowRemote = process.argv.includes("--allow-remote");
  const jsonOut = argValue("--json");

  const url = process.env.DATABASE_URL;
  if (!url) fail("DATABASE_URL 환경변수가 없습니다.");

  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    fail("DATABASE_URL 형식이 올바르지 않습니다.");
  }
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "mysql";
  if (!isLocal && !allowRemote) {
    fail(
      `로컬이 아닌 DB(${host}) 입니다. 이 검사는 빈 CI DB 를 전제로 합니다.\n` +
      `   의도한 것이라면 --allow-remote 를 붙이십시오 (읽기 전용이지만 지표가 오염됩니다).`,
    );
  }

  const againstActual = argValue("--against-actual");

  let snapPath: string;
  let snap: { tables: Map<string, Map<string, { type: string }>> };

  if (againstActual) {
    // 실측 덤프를 스냅샷과 같은 형태로 읽는다 (타입 문자열만 필요하다)
    let raw: any;
    try {
      raw = JSON.parse(readFileSync(againstActual, "utf8"));
    } catch (e: any) {
      fail(`실측 덤프 파싱 실패 (${againstActual}): ${e?.message ?? e}`);
    }
    if (!raw?.tables) fail(`${againstActual} 에 tables 가 없습니다.`);
    const tables = new Map<string, Map<string, { type: string }>>();
    for (const [t, cols] of Object.entries<any>(raw.tables)) {
      const m = new Map<string, { type: string }>();
      for (const [c, def] of Object.entries<any>(cols)) m.set(c, { type: String(def.type ?? "") });
      tables.set(t, m);
    }
    snapPath = againstActual;
    snap = { tables };
  } else {
    const p = latestSnapshotPath();
    if (!p) fail("drizzle/meta 에 스냅샷이 없습니다.");
    snapPath = p;
    snap = parseSnapshot(p);
  }

  console.log("=== 신규 환경 재현성 검증 (Issue #421 3단계) ===\n");
  console.log(`기준        : ${againstActual ? "운영 실측 덤프" : "drizzle 스냅샷"} — ${snapPath}`);
  console.log(`대상 DB     : ${host}\n`);

  let conn: mysql.Connection;
  try {
    conn = await mysql.createConnection(url);
  } catch (e: any) {
    fail(`DB 접속 실패: ${e?.message ?? e}`);
  }

  let report: Report;
  try {
    const [rows] = await conn.execute<any[]>(
      `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
        ORDER BY TABLE_NAME, ORDINAL_POSITION`,
    );
    const actual = new Map<string, Map<string, string>>();
    for (const r of rows as any[]) {
      if (!actual.has(r.TABLE_NAME)) actual.set(r.TABLE_NAME, new Map());
      actual.get(r.TABLE_NAME)!.set(r.COLUMN_NAME, String(r.COLUMN_TYPE));
    }

    const missingTables: string[] = [];
    const missingColumns: string[] = [];
    const typeMismatches: string[] = [];

    for (const [t, cols] of snap.tables) {
      const a = actual.get(t);
      if (!a) { missingTables.push(t); continue; }
      for (const [c, def] of cols) {
        const at = a.get(c);
        if (at === undefined) { missingColumns.push(`${t}.${c}`); continue; }
        if (normType(def.type) !== normType(at)) {
          typeMismatches.push(`${t}.${c} 스냅샷=${def.type} 실제=${at}`);
        }
      }
    }
    missingTables.sort();
    missingColumns.sort();
    typeMismatches.sort();

    report = {
      generatedAt: new Date().toISOString().slice(0, 10),
      snapshot: snapPath,
      createdTables: actual.size,
      expectedTables: snap.tables.size,
      missingTables,
      missingColumns,
      typeMismatches,
    };
  } finally {
    await conn.end();
  }

  const reproduced = report.expectedTables - report.missingTables.length;
  const pct = Math.round((reproduced / Math.max(report.expectedTables, 1)) * 100);

  console.log(`마이그레이션 후 생성된 테이블 : ${report.createdTables}`);
  console.log(`스냅샷이 요구하는 테이블      : ${report.expectedTables}`);
  console.log(`재현된 테이블                 : ${reproduced} (${pct}%)`);
  console.log(`미재현 테이블                 : ${report.missingTables.length}`);
  console.log(`미재현 컬럼 (테이블은 존재)   : ${report.missingColumns.length}`);
  console.log(`타입 불일치 (정보성)          : ${report.typeMismatches.length}\n`);

  if (report.missingTables.length) {
    console.log(`미재현 테이블 예시 (최대 20):`);
    for (const t of report.missingTables.slice(0, 20)) console.log(`  - ${t}`);
    if (report.missingTables.length > 20) console.log(`  ... 외 ${report.missingTables.length - 20}건`);
    console.log();
  }

  if (jsonOut) {
    mkdirSync(dirname(jsonOut), { recursive: true });
    writeFileSync(jsonOut, JSON.stringify(report, null, 2) + "\n");
    console.log(`ℹ️  결과 기록: ${jsonOut}\n`);
  }

  if (updateBaseline) {
    writeFileSync(BASELINE_PATH, JSON.stringify(report, null, 2) + "\n");
    console.log(`✅ baseline 갱신: ${BASELINE_PATH}`);
    return;
  }

  if (!existsSync(BASELINE_PATH)) {
    console.log(`ℹ️  baseline 파일이 없습니다: ${BASELINE_PATH}`);
    console.log(`   최초 1회: --update-baseline 로 현재 수치를 기준선으로 등록하십시오.`);
    console.log(`   (기준선이 없으므로 이번 실행은 측정만 하고 통과시킵니다.)`);
    return;
  }

  const base: Report = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
  const baseTables = new Set(base.missingTables ?? []);
  const baseColumns = new Set(base.missingColumns ?? []);
  const newTables = report.missingTables.filter((t) => !baseTables.has(t));
  const newColumns = report.missingColumns.filter((c) => !baseColumns.has(c));
  const fixedTables = (base.missingTables ?? []).filter((t) => !report.missingTables.includes(t));

  console.log(`baseline (${base.generatedAt}): 미재현 테이블 ${baseTables.size} / 컬럼 ${baseColumns.size}`);
  if (fixedTables.length) {
    console.log(`🎉 개선: 테이블 ${fixedTables.length}건이 이제 재현됩니다 (baseline 갱신 권장)`);
  }
  console.log();

  if (newTables.length === 0 && newColumns.length === 0) {
    console.log("✅ 통과: 재현성이 baseline 대비 악화되지 않았습니다.");
    return;
  }

  console.error("❌ 실패: 신규 환경에서 재현되지 않는 스키마가 늘었습니다.\n");
  if (newTables.length) {
    console.error(`신규 미재현 테이블 (${newTables.length}건):`);
    for (const t of newTables.slice(0, 40)) console.error(`  - ${t}`);
    console.error();
  }
  if (newColumns.length) {
    console.error(`신규 미재현 컬럼 (${newColumns.length}건):`);
    for (const c of newColumns.slice(0, 40)) console.error(`  - ${c}`);
    console.error();
  }
  console.error("스키마를 추가했다면 그것을 만드는 마이그레이션도 함께 커밋해야 합니다.");
  process.exit(1);
}

main().catch((e) => {
  console.error("❌ 실패:", e?.message ?? e);
  process.exit(2);
});
