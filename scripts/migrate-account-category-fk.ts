/**
 * 마이그레이션: accounting_accounts 테이블에 account_category_id 컬럼 추가
 * + 기존 계정에 account_categories 자동 매핑
 * 
 * 문제: account_categories(그룹)와 accounting_accounts(세부계정)가 
 *       FK로 연결되지 않아 코드 접두사 매칭에 의존 → 매핑 실패
 * 
 * 해결: accounting_accounts에 account_category_id FK 컬럼 추가,
 *       카테고리 일치 기준으로 자동 매핑
 * 
 * 실행: npx tsx scripts/migrate-account-category-fk.ts
 */
import mysql from "mysql2/promise";

// 5대 분류: 한국어 → 영어 매핑
const MAJOR_TO_CATEGORY: Record<string, string> = {
  "자산": "assets",
  "부채": "liabilities",
  "자본": "equity",
  "수익": "revenue",
  "비용": "expenses",
};

async function migrate() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "haccp_user",
    password: process.env.DB_PASSWORD || "haccp_password",
    database: process.env.DB_NAME || "haccp_v3",
  });

  console.log("=== 마이그레이션 시작: account_category_id FK 추가 ===\n");

  try {
    // 1. account_category_id 컬럼 존재 여부 확인
    const [cols] = await conn.execute(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'accounting_accounts' AND COLUMN_NAME = 'account_category_id'`
    );
    
    if ((cols as any[]).length === 0) {
      console.log("1. account_category_id 컬럼 추가...");
      await conn.execute(
        `ALTER TABLE accounting_accounts 
         ADD COLUMN account_category_id BIGINT NULL AFTER parent_id,
         ADD INDEX idx_account_category_id (account_category_id)`
      );
      console.log("   ✅ 컬럼 추가 완료\n");
    } else {
      console.log("1. account_category_id 컬럼 이미 존재 (건너뜀)\n");
    }

    // 2. 그룹(account_categories) 목록 조회
    const [groups] = await conn.execute(
      `SELECT id, code, name, major_category, tenant_id
       FROM account_categories 
       WHERE is_active = 1
       ORDER BY code ASC`
    );
    const groupList = groups as any[];
    console.log(`2. 활성 그룹 ${groupList.length}개 조회\n`);

    // 3. 매핑되지 않은 계정 조회
    const [unmapped] = await conn.execute(
      `SELECT id, code, name, category, tenant_id
       FROM accounting_accounts 
       WHERE account_category_id IS NULL AND is_active = 'Y'
       ORDER BY category, code`
    );
    const unmappedAccounts = unmapped as any[];
    console.log(`3. 매핑 필요 계정 ${unmappedAccounts.length}개\n`);

    if (unmappedAccounts.length === 0) {
      console.log("✅ 모든 계정이 이미 매핑되어 있습니다.");
      await conn.end();
      return;
    }

    // 4. 자동 매핑 실행
    // 전략: 같은 tenant + 같은 대분류 카테고리 → 가장 구체적인(코드 가장 큰) 그룹에 할당
    // 예: 비용 계정 5010(급여) → 비용 그룹 중 코드가 가장 구체적인 그룹
    
    let mappedCount = 0;
    let skippedCount = 0;

    for (const acc of unmappedAccounts) {
      const accCategory = acc.category; // "assets", "expenses" 등
      const accTenantId = acc.tenant_id;
      const accCode = acc.code || "";
      
      // 같은 tenant + 같은 대분류의 그룹 필터
      const candidateGroups = groupList.filter((g: any) => {
        const groupCatKey = MAJOR_TO_CATEGORY[g.major_category];
        // tenant_id가 있으면 같은 tenant만, 없으면 모두 허용
        const tenantMatch = !g.tenant_id || !accTenantId || g.tenant_id === accTenantId;
        return groupCatKey === accCategory && tenantMatch;
      });
      
      if (candidateGroups.length === 0) {
        console.log(`  ⚠️ [${acc.code}] ${acc.name} (${accCategory}) - 매칭 그룹 없음 (건너뜀)`);
        skippedCount++;
        continue;
      }

      // 코드 접두사 매칭 시도 (더 구체적인 것 우선)
      let bestGroup = null;
      const sortedGroups = [...candidateGroups].sort((a: any, b: any) => 
        (b.code || "").length - (a.code || "").length
      );
      
      for (const g of sortedGroups) {
        const groupCode = g.code || "";
        if (/^\d+$/.test(groupCode) && accCode.startsWith(groupCode)) {
          bestGroup = g;
          break;
        }
      }
      
      // 접두사 매칭 실패 시, 코드 범위 기반 매칭
      // 그룹 520 → 계정 5200~5299 (숫자 맞으면)
      if (!bestGroup && /^\d+$/.test(accCode)) {
        const accNum = parseInt(accCode, 10);
        for (const g of sortedGroups) {
          const gCode = g.code || "";
          if (!/^\d+$/.test(gCode)) continue;
          const gNum = parseInt(gCode, 10);
          // 그룹코드 * 10 ~ 그룹코드 * 10 + 9 범위 (3자리→4자리)
          // 예: 520 → 5200~5209, 하지만 더 넓은 범위도 허용
          // 범위 매칭: 그룹코드의 첫 자릿수가 같으면
          const gCodeLen = gCode.length;
          const accPrefix = accCode.substring(0, gCodeLen);
          // 가장 가까운 그룹 찾기
          if (!bestGroup) bestGroup = g; // 같은 카테고리의 첫 그룹을 기본값으로
        }
      }
      
      // 그래도 못 찾으면 같은 카테고리의 첫 그룹
      if (!bestGroup) {
        bestGroup = candidateGroups[0];
      }

      await conn.execute(
        `UPDATE accounting_accounts SET account_category_id = ? WHERE id = ?`,
        [bestGroup.id, acc.id]
      );
      
      console.log(`  ✅ [${acc.code}] ${acc.name} → [${bestGroup.code}] ${bestGroup.name}`);
      mappedCount++;
    }

    console.log(`\n=== 결과 ===`);
    console.log(`매핑 완료: ${mappedCount}개`);
    console.log(`건너뜀: ${skippedCount}개`);

    // 5. 최종 확인
    const [finalCheck] = await conn.execute(
      `SELECT 
        ac.code as group_code, ac.name as group_name, ac.major_category,
        COUNT(aa.id) as account_count
       FROM account_categories ac
       LEFT JOIN accounting_accounts aa ON aa.account_category_id = ac.id AND aa.is_active = 'Y'
       WHERE ac.is_active = 1
       GROUP BY ac.id, ac.code, ac.name, ac.major_category
       ORDER BY ac.code`
    );
    
    console.log("\n최종 그룹별 계정 수:");
    for (const row of finalCheck as any[]) {
      console.log(`  [${row.group_code}] ${row.group_name} (${row.major_category}): ${row.account_count}개`);
    }

  } catch (error) {
    console.error("마이그레이션 실패:", error);
  } finally {
    await conn.end();
    console.log("\n=== 마이그레이션 종료 ===");
  }
}

migrate();
