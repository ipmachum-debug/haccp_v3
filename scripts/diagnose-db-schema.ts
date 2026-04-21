// DB 스키마 드리프트 진단 스크립트
//
// Drizzle 스키마에 정의된 테이블들과 실제 MySQL DB 를 비교하여
// 누락된 테이블 / 존재하지만 스키마에 없는 테이블 / 컬럼 불일치를 리포트.
//
// 실행: npx tsx scripts/diagnose-db-schema.ts
//
// 용도:
//   - DB 복구 후 스키마 드리프트 감지 (오늘 새벽 같은 상황 재발 방지)
//   - 배포 전 체크리스트로 사용
//   - startupMigrations ensure 누락 감지

import mysql from "mysql2/promise";
import * as fs from "fs";
import * as path from "path";

// .env 파일 직접 파싱 (dotenv v17 빈값 상속 우회)
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m && m[2].trim().length > 0) {
      const key = m[1];
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

interface SchemaDef {
  name: string;      // 파일 기준 JS 변수명 (예: hBatches)
  tableName: string; // 실제 DB 테이블명 (예: h_batches)
  filePath: string;
}

/** Drizzle 스키마 파일들을 스캔하여 mysqlTable 정의 목록 추출 */
function scanDrizzleSchemas(): SchemaDef[] {
  const defs: SchemaDef[] = [];
  const drizzleRoot = path.resolve(process.cwd(), "drizzle/schema");

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
        const content = fs.readFileSync(full, "utf-8");
        const rel = path.relative(process.cwd(), full);
        // export const xxx = mysqlTable("table_name", { ... })
        // 정규식: 변수명과 실제 테이블명을 함께 캡처
        const regex = /export\s+const\s+(\w+)\s*=\s*mysqlTable\s*\(\s*["'`]([^"'`]+)["'`]/g;
        let match;
        while ((match = regex.exec(content)) !== null) {
          defs.push({ name: match[1], tableName: match[2], filePath: rel });
        }
      }
    }
  }

  walk(drizzleRoot);
  // 프로젝트 루트의 schema_*.ts 도 스캔
  const rootDrizzle = path.resolve(process.cwd(), "drizzle");
  for (const entry of fs.readdirSync(rootDrizzle, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".ts")) {
      const full = path.join(rootDrizzle, entry.name);
      const content = fs.readFileSync(full, "utf-8");
      const rel = path.relative(process.cwd(), full);
      const regex = /export\s+const\s+(\w+)\s*=\s*mysqlTable\s*\(\s*["'`]([^"'`]+)["'`]/g;
      let match;
      while ((match = regex.exec(content)) !== null) {
        defs.push({ name: match[1], tableName: match[2], filePath: rel });
      }
    }
  }

  return defs;
}

/** 서버 코드에서 raw SQL 로 참조되는 테이블명 추출 (간단 버전) */
function scanSqlReferences(): Set<string> {
  const refs = new Set<string>();
  const serverRoot = path.resolve(process.cwd(), "server");
  // FROM / INTO / UPDATE / JOIN 패턴으로 테이블명 추출
  const regex = /\b(?:FROM|INTO|UPDATE|JOIN)\s+([a-z_][a-z0-9_]*)/gi;

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "__tests__" || entry.name.startsWith(".")) continue;
        walk(full);
      } else if (entry.name.endsWith(".ts")) {
        const content = fs.readFileSync(full, "utf-8");
        let match;
        while ((match = regex.exec(content)) !== null) {
          const table = match[1].toLowerCase();
          // SQL 예약어 필터
          if (!["select", "where", "and", "or", "dual", "values", "set"].includes(table)) {
            refs.add(table);
          }
        }
      }
    }
  }

  walk(serverRoot);
  return refs;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("❌ DATABASE_URL 환경변수가 없습니다.");
    process.exit(1);
  }

  console.log("🔍 DB 스키마 드리프트 진단\n");

  // 1. Drizzle 스키마 스캔
  console.log("1. Drizzle 스키마 파일 스캔...");
  const drizzleDefs = scanDrizzleSchemas();
  const drizzleTables = new Set(drizzleDefs.map((d) => d.tableName));
  console.log(`   → ${drizzleDefs.length}개 테이블 정의 발견 (${drizzleTables.size}개 고유)\n`);

  // 2. 실제 DB 연결 + SHOW TABLES
  const url = new URL(dbUrl);
  const conn = await mysql.createConnection({
    host: url.hostname,
    port: parseInt(url.port) || 3306,
    user: url.username,
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    charset: "utf8mb4",
  });

  console.log(`2. 실제 DB 테이블 조회 (${url.pathname.slice(1)})...`);
  const [rows]: any = await conn.query(`SHOW TABLES`);
  const dbTables = new Set<string>();
  for (const row of rows as any[]) {
    dbTables.add(Object.values(row)[0] as string);
  }
  console.log(`   → ${dbTables.size}개 테이블 발견\n`);

  // 3. SQL 참조 스캔
  console.log("3. 서버 코드 raw SQL 참조 스캔...");
  const sqlRefs = scanSqlReferences();
  console.log(`   → ${sqlRefs.size}개 고유 테이블명 참조\n`);

  // ─── 분석 ───────────────────────────────────────

  // A. Drizzle 정의 있지만 DB 에 없는 테이블
  const missingInDb = drizzleDefs.filter((d) => !dbTables.has(d.tableName));
  const uniqueMissing = new Map<string, SchemaDef>();
  for (const d of missingInDb) {
    if (!uniqueMissing.has(d.tableName)) uniqueMissing.set(d.tableName, d);
  }

  console.log("═══════════════════════════════════════════════════════");
  console.log("📋 결과 분석");
  console.log("═══════════════════════════════════════════════════════\n");

  console.log(`🚨 Drizzle 정의 있지만 DB 에 없는 테이블: ${uniqueMissing.size}개`);
  if (uniqueMissing.size > 0) {
    console.log("   (startupMigrations ensure 대상)\n");
    let i = 0;
    for (const [name, def] of uniqueMissing) {
      if (i++ >= 30) break;
      console.log(`   - ${name.padEnd(40)} (${def.filePath})`);
    }
    if (uniqueMissing.size > 30) console.log(`   ... 외 ${uniqueMissing.size - 30}개\n`);
  }

  // B. DB 에 있지만 Drizzle 에 정의 없는 테이블
  const missingInDrizzle = [...dbTables].filter((t) => !drizzleTables.has(t));
  console.log(`\n⚠️ DB 에 있지만 Drizzle 스키마에 정의 없는 테이블: ${missingInDrizzle.length}개`);
  if (missingInDrizzle.length > 0) {
    console.log("   (raw SQL 로만 접근 중 → 타입 안전성 부재)\n");
    missingInDrizzle.slice(0, 30).forEach((t) => console.log(`   - ${t}`));
    if (missingInDrizzle.length > 30) console.log(`   ... 외 ${missingInDrizzle.length - 30}개`);
  }

  // C. SQL 에서 참조하지만 DB 에도 Drizzle 에도 없는 테이블 (유령 참조)
  const ghostRefs: string[] = [];
  for (const ref of sqlRefs) {
    // drizzle 정의 있거나 DB 에 존재하면 OK
    if (drizzleTables.has(ref) || dbTables.has(ref)) continue;
    // 명백히 SQL 예약어/임시 alias 는 제외
    if (["dummy", "d", "c", "b", "t", "x", "row", "col"].includes(ref)) continue;
    ghostRefs.push(ref);
  }
  console.log(`\n🔴 유령 참조 (DB 에도 Drizzle 에도 없는 SQL 참조): ${ghostRefs.length}개`);
  if (ghostRefs.length > 0) {
    console.log("   (즉시 수정 대상 — 런타임 에러 가능성)\n");
    ghostRefs.slice(0, 30).forEach((t) => console.log(`   - ${t}`));
    if (ghostRefs.length > 30) console.log(`   ... 외 ${ghostRefs.length - 30}개`);
  }

  // D. 요약
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("📊 요약");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Drizzle 정의 테이블:     ${drizzleTables.size}개`);
  console.log(`  실제 DB 테이블:          ${dbTables.size}개`);
  console.log(`  SQL 참조 테이블:         ${sqlRefs.size}개`);
  console.log(`  🚨 DB 누락:              ${uniqueMissing.size}개`);
  console.log(`  ⚠️ Drizzle 미정의:       ${missingInDrizzle.length}개`);
  console.log(`  🔴 유령 참조:            ${ghostRefs.length}개`);

  await conn.end();
}

main().catch((err) => {
  console.error("❌ 진단 실패:", err);
  process.exit(1);
});
