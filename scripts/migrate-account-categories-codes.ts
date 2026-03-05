/**
 * 마이그레이션: account_categories 테이블의 비숫자 코드를 숫자 코드로 변환
 * 
 * 문제: account_categories에 "ACC-001", "ACC-002" 등 비숫자 코드가 있으면
 *       accounting_accounts의 숫자 코드 (1010, 2010 등)와 접두사 매칭이 불가능
 * 
 * 해결: 대분류(major_category)에 따라 숫자 코드 체계로 변환
 *   자산 → 100, 110, 120...
 *   부채 → 200, 210, 220...
 *   자본 → 300, 310, 320...
 *   수익 → 400, 410, 420...
 *   비용 → 500, 510, 520...
 * 
 * 실행: npx tsx scripts/migrate-account-categories-codes.ts
 */
import mysql from "mysql2/promise";

const CATEGORY_PREFIX_MAP: Record<string, number> = {
  "자산": 100,
  "부채": 200,
  "자본": 300,
  "수익": 400,
  "비용": 500,
};

async function migrate() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "haccp_user",
    password: process.env.DB_PASSWORD || "haccp_password",
    database: process.env.DB_NAME || "haccp_v3",
  });

  console.log("=== 마이그레이션 시작: account_categories 코드 정규화 ===\n");

  try {
    // 1. 현재 상태 확인
    const [rows] = await conn.execute(
      `SELECT id, code, name, major_category, tenant_id 
       FROM account_categories 
       WHERE is_active = 1
       ORDER BY major_category, code`
    );
    const categories = rows as any[];

    console.log(`총 ${categories.length}개 카테고리 발견\n`);

    // 2. 비숫자 코드 필터링
    const nonNumeric = categories.filter(c => !/^\d+$/.test(c.code || ""));
    const numeric = categories.filter(c => /^\d+$/.test(c.code || ""));

    console.log(`- 숫자 코드: ${numeric.length}개 (변환 불필요)`);
    console.log(`- 비숫자 코드: ${nonNumeric.length}개 (변환 대상)\n`);

    if (nonNumeric.length === 0) {
      console.log("✅ 변환 대상이 없습니다. 모든 코드가 이미 숫자입니다.");
      await conn.end();
      return;
    }

    // 3. 대분류별 기존 숫자 코드 최대값 추적
    const maxCodeByCategory: Record<string, number> = {};
    for (const cat of numeric) {
      const major = cat.major_category || "";
      const code = parseInt(cat.code, 10);
      if (!isNaN(code)) {
        if (!maxCodeByCategory[major] || code > maxCodeByCategory[major]) {
          maxCodeByCategory[major] = code;
        }
      }
    }

    // 4. 비숫자 코드를 숫자 코드로 변환
    const updates: { id: number; oldCode: string; newCode: string; name: string }[] = [];

    for (const cat of nonNumeric) {
      const major = cat.major_category || "기타";
      const basePrefix = CATEGORY_PREFIX_MAP[major] || 900;

      // 현재 최대값 기반으로 다음 코드 생성
      const currentMax = maxCodeByCategory[major] || (basePrefix - 10);
      const newCode = currentMax + 10;
      maxCodeByCategory[major] = newCode;

      updates.push({
        id: cat.id,
        oldCode: cat.code,
        newCode: String(newCode),
        name: cat.name,
      });
    }

    // 5. 코드 중복 방지 체크
    const allNewCodes = updates.map(u => u.newCode);
    const existingCodes = numeric.map((c: any) => c.code);
    const duplicates = allNewCodes.filter(c => existingCodes.includes(c));
    
    if (duplicates.length > 0) {
      console.error(`❌ 코드 충돌 발견: ${duplicates.join(", ")}`);
      console.error("마이그레이션을 중단합니다. 수동 해결이 필요합니다.");
      await conn.end();
      return;
    }

    // 6. 변환 실행
    console.log("변환 내역:");
    for (const update of updates) {
      console.log(`  [${update.id}] "${update.oldCode}" → "${update.newCode}" (${update.name})`);
      
      await conn.execute(
        `UPDATE account_categories SET code = ? WHERE id = ?`,
        [update.newCode, update.id]
      );
    }

    console.log(`\n✅ ${updates.length}개 카테고리 코드 변환 완료!`);

    // 7. 최종 상태 확인
    const [finalRows] = await conn.execute(
      `SELECT id, code, name, major_category 
       FROM account_categories 
       WHERE is_active = 1
       ORDER BY code`
    );
    console.log("\n최종 상태:");
    for (const row of finalRows as any[]) {
      console.log(`  [${row.code}] ${row.name} (${row.major_category})`);
    }

  } catch (error) {
    console.error("마이그레이션 실패:", error);
  } finally {
    await conn.end();
    console.log("\n=== 마이그레이션 종료 ===");
  }
}

migrate();
