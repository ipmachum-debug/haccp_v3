/**
 * 마이그레이션: 계정 구조 페이지 로딩 성능 개선을 위한 인덱스 추가
 *
 * 문제: 계정구조 탭 초기 로딩이 약 10초 소요
 *   - account_categories 에 복합 인덱스 부재 → is_active+tenant_id+code 조건에서 풀스캔
 *   - accounting_accounts ORDER BY code 에서 filesort
 *
 * 해결: 두 테이블에 (tenant_id, is_active, code) / (tenant_id, code) 인덱스 추가
 *   - account_categories: (tenant_id, is_active, code) composite
 *   - accounting_accounts: (tenant_id, code) composite (ORDER BY 최적화)
 *
 * 실행: npx tsx scripts/migrate-accounting-performance-indexes.ts
 */
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

async function migrate() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("❌ DATABASE_URL 환경변수가 없습니다.");
    process.exit(1);
  }

  const url = new URL(dbUrl);
  const conn = await mysql.createConnection({
    host: url.hostname,
    port: parseInt(url.port) || 3306,
    user: url.username,
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    charset: "utf8mb4",
  });

  console.log("=== 마이그레이션 시작: 계정 관리 성능 인덱스 추가 ===\n");

  try {
    // ─── 1. account_categories 복합 인덱스 ───
    console.log("1. account_categories 인덱스 확인...");
    const [acIdx]: any = await conn.execute(
      `SHOW INDEX FROM account_categories WHERE Key_name = 'idx_ac_tenant_active_code'`
    );
    if ((acIdx as any[]).length === 0) {
      console.log("   → 인덱스 추가: (tenant_id, is_active, code)");
      await conn.execute(
        `ALTER TABLE account_categories
         ADD INDEX idx_ac_tenant_active_code (tenant_id, is_active, code)`
      );
      console.log("   ✅ 추가 완료\n");
    } else {
      console.log("   ✓ 이미 존재 (건너뜀)\n");
    }

    // ─── 2. accounting_accounts ORDER BY 최적화 인덱스 ───
    console.log("2. accounting_accounts 인덱스 확인...");
    const [aaIdx]: any = await conn.execute(
      `SHOW INDEX FROM accounting_accounts WHERE Key_name = 'idx_aa_tenant_code'`
    );
    if ((aaIdx as any[]).length === 0) {
      console.log("   → 인덱스 추가: (tenant_id, code)");
      await conn.execute(
        `ALTER TABLE accounting_accounts
         ADD INDEX idx_aa_tenant_code (tenant_id, code)`
      );
      console.log("   ✅ 추가 완료\n");
    } else {
      console.log("   ✓ 이미 존재 (건너뜀)\n");
    }

    // ─── 3. 결과 확인 ───
    console.log("3. 최종 인덱스 목록:");
    const [acAll]: any = await conn.execute(`SHOW INDEX FROM account_categories`);
    console.log(`   account_categories: ${(acAll as any[]).map((r: any) => r.Key_name).filter((v: any, i: any, a: any) => a.indexOf(v) === i).join(", ")}`);
    const [aaAll]: any = await conn.execute(`SHOW INDEX FROM accounting_accounts`);
    console.log(`   accounting_accounts: ${(aaAll as any[]).map((r: any) => r.Key_name).filter((v: any, i: any, a: any) => a.indexOf(v) === i).join(", ")}`);

    console.log("\n🎉 마이그레이션 완료!");
    console.log("   예상 효과: 계정구조 탭 10초 → 1초 미만");
  } catch (err: any) {
    console.error("❌ 마이그레이션 실패:", err.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

migrate();
