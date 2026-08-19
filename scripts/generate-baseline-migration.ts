/**
 * 스냅샷 → baseline 마이그레이션 생성기 (Issue #421 2단계 준비)
 * ==============================================================================
 * 문제:
 *   drizzle/0001~0026 의 원본 SQL 이 유실됐다 (전부 31바이트 placeholder 로 대체됨).
 *   그 안에 있었을 CREATE TABLE 들이 사라져, 283개 중 271개 테이블을
 *   저장소만으로는 만들 수 없다 (Issue #421).
 *
 * 관찰:
 *   유실된 것은 .sql 뿐이고 **drizzle/meta/*_snapshot.json 44개는 온전하다.**
 *   스냅샷에는 컬럼 타입·NOT NULL·default·PK·UNIQUE·INDEX·FK 가 전부 들어 있다.
 *   즉 히스토리를 복원할 필요 없이 **최종 상태를 한 번에 만드는 baseline** 을
 *   스냅샷으로부터 결정론적으로 생성할 수 있다.
 *
 * 산출물 (drizzle/baseline/ — drizzle 러너가 집어가지 않는 위치):
 *   baseline_tables.sql  CREATE TABLE IF NOT EXISTS × N   (멱등)
 *   baseline_fks.sql     ALTER TABLE ADD CONSTRAINT × M   (멱등 아님 — 빈 DB 전용)
 *
 * ★ 이 스크립트는 SQL 을 만들 뿐 실행하지 않는다.
 *   생성물을 drizzle/ 로 옮기거나 _journal.json 에 등록하는 것은 별도 판단이며,
 *   운영 DB 의 실측 스키마(1단계, PR #429)를 확인한 뒤에 결정한다.
 *   MySQL 의 ADD CONSTRAINT 에는 IF NOT EXISTS 가 없어 FK 파일은 재실행이 안 된다.
 *
 * ★ 소스 선택 — 이게 중요하다
 *   --snapshot (기본): drizzle 스냅샷 기준. 283 테이블.
 *                      운영과 어긋나 있다 (2026-08-19 실측: 운영 442 테이블,
 *                      스냅샷에 없는 컬럼 423건, enum 값 차이 30건).
 *   --from-actual    : 운영 실측 덤프(actual-schema.json) 기준.
 *                      **신규 환경을 운영과 같은 상태로 세우려면 이쪽이다.**
 *
 *   어느 쪽이든 기존 운영 DB 에 적용하지 않는다. 운영에는 실측이 곧 truth 다.
 *
 * 사용법:
 *   npx tsx scripts/generate-baseline-migration.ts
 *   npx tsx scripts/generate-baseline-migration.ts --snapshot drizzle/meta/0043_snapshot.json
 *   npx tsx scripts/generate-baseline-migration.ts --from-actual drizzle/baseline/actual-schema.json
 *   npx tsx scripts/generate-baseline-migration.ts --out-dir /tmp/x     (기본: drizzle/baseline)
 *
 * 종료 코드:
 *   0 = 생성 완료 / 2 = 오류
 * ==============================================================================
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { latestSnapshotPath } from "./_lib/schemaSnapshot";

const DEFAULT_OUT_DIR = "drizzle/baseline";
const DEFAULT_ACTUAL_PATH = "drizzle/baseline/actual-schema.json";

interface SnapColumn {
  name: string;
  type: string;
  notNull?: boolean;
  autoincrement?: boolean;
  default?: string | number | boolean;
  onUpdate?: boolean;
}

function fail(msg: string): never {
  console.error(`❌ ${msg}`);
  process.exit(2);
}

const ident = (s: string) => "`" + String(s).replace(/`/g, "``") + "`";

/** 스냅샷의 default 는 이미 SQL 리터럴 형태다: (now()) / 'draft' / 0 */
function defaultLiteral(v: string | number | boolean): string {
  if (typeof v === "boolean") return v ? "1" : "0";
  if (typeof v === "number") return String(v);
  return v;
}

function columnSql(c: SnapColumn): string {
  const parts = [ident(c.name), c.type];
  if (c.notNull) parts.push("NOT NULL");
  if (c.autoincrement) parts.push("AUTO_INCREMENT");
  if (c.default !== undefined) parts.push(`DEFAULT ${defaultLiteral(c.default)}`);
  // 스냅샷의 onUpdate 는 timestamp 자동 갱신을 뜻한다.
  // fsp(소수 자릿수)가 컬럼 타입과 일치하지 않으면 MySQL 이 거부하므로 타입에서 뽑아 맞춘다.
  if (c.onUpdate) {
    const fsp = /^(?:timestamp|datetime)\((\d+)\)/i.exec(c.type)?.[1];
    parts.push(`ON UPDATE CURRENT_TIMESTAMP${fsp ? `(${fsp})` : ""}`);
  }
  return "  " + parts.join(" ");
}

/**
 * 실측 덤프(actual-schema.json) → 스냅샷과 같은 형태로 변환.
 *
 * information_schema 의 표기를 DDL 로 되돌리는 규칙:
 *   · EXTRA 에 auto_increment 가 있으면 AUTO_INCREMENT
 *   · EXTRA 에 DEFAULT_GENERATED 가 있으면 COLUMN_DEFAULT 는 **식**이므로 그대로 쓴다
 *     (없으면 리터럴이므로 숫자가 아닌 한 따옴표를 씌운다)
 *   · EXTRA 의 "on update CURRENT_TIMESTAMP(n)" 은 그대로 옮긴다
 *   · PRIMARY / UNIQUE / 일반 인덱스는 indexes 섹션에서 복원한다
 *   · FK 는 information_schema.COLUMNS 에 없으므로 복원 대상이 아니다
 *     (신규 환경 부트스트랩에는 테이블·컬럼·키가 우선이다)
 */
function fromActual(path: string): { tables: any[]; note: string } {
  let raw: any;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (e: any) {
    fail(`실측 덤프 파싱 실패 (${path}): ${e?.message ?? e}`);
  }
  const tablesObj = raw?.tables;
  if (!tablesObj || typeof tablesObj !== "object") {
    fail(`${path} 에 tables 가 없습니다. npm run schema:baseline -- --write 로 생성하십시오.`);
  }
  const indexesObj = raw?.indexes ?? {};

  const NUMERIC = /^(tinyint|smallint|mediumint|int|integer|bigint|decimal|numeric|float|double|bit)/i;

  const tables = Object.entries<any>(tablesObj).map(([tableName, cols]) => {
    const columns: Record<string, any> = {};
    for (const [colName, c] of Object.entries<any>(cols)) {
      const extra = String(c.extra ?? "").toLowerCase();
      let def: string | number | undefined;
      if (c.default !== null && c.default !== undefined) {
        if (extra.includes("default_generated")) {
          def = String(c.default);                    // 식 — 그대로
        } else if (NUMERIC.test(String(c.type))) {
          def = String(c.default);                    // 숫자 리터럴
        } else {
          def = `'${String(c.default).replace(/'/g, "''")}'`;
        }
      }
      const onUpdateMatch = /on update current_timestamp(\((\d+)\))?/.exec(extra);
      columns[colName] = {
        name: colName,
        type: c.type,
        notNull: c.nullable === false,
        autoincrement: extra.includes("auto_increment"),
        ...(def !== undefined ? { default: def } : {}),
        ...(onUpdateMatch ? { onUpdate: true } : {}),
      };
    }

    // 인덱스 복원 — PRIMARY 는 compositePrimaryKeys, 나머지는 unique/일반으로 나눈다
    const compositePrimaryKeys: Record<string, any> = {};
    const uniqueConstraints: Record<string, any> = {};
    const indexes: Record<string, any> = {};
    for (const [ixName, ix] of Object.entries<any>(indexesObj[tableName] ?? {})) {
      if (ixName === "PRIMARY") {
        compositePrimaryKeys[`${tableName}_pk`] = { name: `${tableName}_pk`, columns: ix.columns };
      } else if (ix.unique) {
        uniqueConstraints[ixName] = { name: ixName, columns: ix.columns };
      } else {
        indexes[ixName] = { name: ixName, columns: ix.columns, isUnique: false };
      }
    }

    return { name: tableName, columns, compositePrimaryKeys, uniqueConstraints, indexes, foreignKeys: {} };
  });

  const note = `실측 덤프 ${path}` + (raw.database ? ` (DB: ${raw.database}, ${raw.generatedAt ?? "시각 미상"})` : "");
  return { tables, note };
}

function main() {
  const i = process.argv.indexOf("--snapshot");
  const snapPath = i >= 0 ? process.argv[i + 1] : latestSnapshotPath();
  const od = process.argv.indexOf("--out-dir");
  const OUT_DIR = od >= 0 ? (process.argv[od + 1] ?? DEFAULT_OUT_DIR) : DEFAULT_OUT_DIR;

  const fa = process.argv.indexOf("--from-actual");
  const actualPath = fa >= 0 ? (process.argv[fa + 1] ?? DEFAULT_ACTUAL_PATH) : undefined;

  let tables: any[];
  let sourceNote: string;

  if (actualPath) {
    const r = fromActual(actualPath);
    tables = r.tables;
    sourceNote = r.note;
  } else {
    if (!snapPath) fail("스냅샷을 찾을 수 없습니다.");
    let snap: any;
    try {
      snap = JSON.parse(readFileSync(snapPath, "utf8"));
    } catch (e: any) {
      fail(`스냅샷 파싱 실패 (${snapPath}): ${e?.message ?? e}`);
    }
    tables = Object.values<any>(snap.tables ?? {});
    sourceNote = `drizzle 스냅샷 ${snapPath}`;
  }
  if (!tables.length) fail(`${sourceNote} 에 테이블이 없습니다.`);

  const tableStmts: string[] = [];
  const fkStmts: string[] = [];
  let idxCount = 0;
  let uniqCount = 0;

  // 이름 순 — diff 안정성을 위해 결정론적으로 정렬한다
  for (const t of tables.sort((a, b) => a.name.localeCompare(b.name))) {
    const lines: string[] = [];

    for (const c of Object.values<SnapColumn>(t.columns ?? {})) lines.push(columnSql(c));

    for (const pk of Object.values<any>(t.compositePrimaryKeys ?? {})) {
      lines.push(`  PRIMARY KEY (${pk.columns.map(ident).join(", ")})`);
    }
    for (const u of Object.values<any>(t.uniqueConstraints ?? {})) {
      uniqCount++;
      lines.push(`  UNIQUE KEY ${ident(u.name)} (${u.columns.map(ident).join(", ")})`);
    }
    for (const ix of Object.values<any>(t.indexes ?? {})) {
      idxCount++;
      const kind = ix.isUnique ? "UNIQUE KEY" : "KEY";
      lines.push(`  ${kind} ${ident(ix.name)} (${ix.columns.map(ident).join(", ")})`);
    }

    tableStmts.push(
      `CREATE TABLE IF NOT EXISTS ${ident(t.name)} (\n${lines.join(",\n")}\n) ` +
        `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
    );

    // FK 는 테이블이 전부 만들어진 뒤에 붙인다 (생성 순서 의존 제거)
    for (const fk of Object.values<any>(t.foreignKeys ?? {})) {
      const onDelete = fk.onDelete && fk.onDelete !== "no action" ? ` ON DELETE ${fk.onDelete.toUpperCase()}` : "";
      const onUpdate = fk.onUpdate && fk.onUpdate !== "no action" ? ` ON UPDATE ${fk.onUpdate.toUpperCase()}` : "";
      fkStmts.push(
        `ALTER TABLE ${ident(fk.tableFrom)} ADD CONSTRAINT ${ident(fk.name)} ` +
          `FOREIGN KEY (${fk.columnsFrom.map(ident).join(", ")}) ` +
          `REFERENCES ${ident(fk.tableTo)} (${fk.columnsTo.map(ident).join(", ")})${onDelete}${onUpdate};`,
      );
    }
  }

  const header = (title: string, note: string) =>
    [
      `-- ${title}`,
      `-- 생성: scripts/generate-baseline-migration.ts (수정하지 마십시오 — 재생성됩니다)`,
      `-- 출처: ${sourceNote}`,
      `-- 배경: Issue #421 — drizzle/0001~0026 의 원본 SQL 이 유실되어`,
      `--       283개 중 271개 테이블에 CREATE TABLE 이력이 없습니다.`,
      `--       이 파일은 히스토리 복원이 아니라 스냅샷의 최종 상태를 재구성한 것입니다.`,
      `--`,
      ...note.split("\n").map((l) => `-- ${l}`),
      "",
      "",
    ].join("\n");

  mkdirSync(OUT_DIR, { recursive: true });

  writeFileSync(
    `${OUT_DIR}/baseline_tables.sql`,
    header(
      "baseline: 전체 테이블 (멱등)",
      "CREATE TABLE IF NOT EXISTS 이므로 기존 DB 에서 재실행해도 안전합니다.\n" +
        "다만 이미 있는 테이블의 컬럼 차이는 메우지 않습니다 (CREATE 는 건너뛰어짐).\n" +
        "기존 DB 의 컬럼 보정은 실측 baseline(PR #429) 대조 결과로 별도 처리합니다.",
    ) + tableStmts.join("\n\n") + "\n",
  );

  writeFileSync(
    `${OUT_DIR}/baseline_fks.sql`,
    header(
      "baseline: 외래키 (멱등 아님 — 빈 DB 전용)",
      "MySQL 의 ADD CONSTRAINT 에는 IF NOT EXISTS 가 없습니다.",
      
    ) +
      "-- 이미 제약이 있는 DB 에서 재실행하면 ER_FK_DUP_NAME 으로 실패합니다.\n" +
      "-- 반드시 baseline_tables.sql 을 먼저 적용한 뒤 실행하십시오.\n\n" +
      fkStmts.join("\n") + "\n",
  );

  console.log("=== baseline 마이그레이션 생성 (Issue #421 2단계 준비) ===\n");
  console.log(`출처        : ${sourceNote}`);
  console.log(`테이블      : ${tableStmts.length}`);
  console.log(`외래키      : ${fkStmts.length}`);
  console.log(`UNIQUE      : ${uniqCount}`);
  console.log(`INDEX       : ${idxCount}\n`);
  console.log(`✅ ${OUT_DIR}/baseline_tables.sql`);
  console.log(`✅ ${OUT_DIR}/baseline_fks.sql\n`);
  console.log("이 파일들은 drizzle 러너가 집어가지 않는 위치에 있습니다.");
  console.log("journal 등록 여부는 운영 실측 스키마(1단계) 확인 후 별도 판단합니다.");
}

main();
