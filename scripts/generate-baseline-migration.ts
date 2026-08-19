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
 * 사용법:
 *   npx tsx scripts/generate-baseline-migration.ts
 *   npx tsx scripts/generate-baseline-migration.ts --snapshot drizzle/meta/0043_snapshot.json
 *
 * 종료 코드:
 *   0 = 생성 완료 / 2 = 오류
 * ==============================================================================
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { latestSnapshotPath } from "./_lib/schemaSnapshot";

const OUT_DIR = "drizzle/baseline";

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

function main() {
  const i = process.argv.indexOf("--snapshot");
  const snapPath = i >= 0 ? process.argv[i + 1] : latestSnapshotPath();
  if (!snapPath) fail("스냅샷을 찾을 수 없습니다.");

  let snap: any;
  try {
    snap = JSON.parse(readFileSync(snapPath, "utf8"));
  } catch (e: any) {
    fail(`스냅샷 파싱 실패 (${snapPath}): ${e?.message ?? e}`);
  }

  const tables = Object.values<any>(snap.tables ?? {});
  if (!tables.length) fail(`${snapPath} 에 테이블이 없습니다.`);

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
      `-- 출처 스냅샷: ${snapPath}`,
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
  console.log(`출처 스냅샷 : ${snapPath}`);
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
