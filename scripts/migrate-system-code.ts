/**
 * 마이그레이션: accounting_accounts 테이블에 system_code 컬럼 추가
 * + 기존 계정에 system_code 자동 매핑
 * + materialLedger에서 사용하는 accounting_categories 참조 정리
 * 
 * 실행: npx tsx scripts/migrate-system-code.ts
 */
import mysql from "mysql2/promise";

async function migrate() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "haccp_user",
    password: process.env.DB_PASSWORD || "haccp_password",
    database: process.env.DB_NAME || "haccp_v3",
  });

  console.log("=== 마이그레이션 시작: system_code 컬럼 추가 ===\n");

  // 1. system_code 컬럼 추가 (이미 있으면 건너뜀)
  try {
    const [cols] = await conn.execute(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'accounting_accounts' AND COLUMN_NAME = 'system_code'`
    );
    if ((cols as any[]).length === 0) {
      await conn.execute(
        `ALTER TABLE accounting_accounts 
         ADD COLUMN system_code VARCHAR(50) NULL AFTER code,
         ADD INDEX idx_system_code (tenant_id, system_code)`
      );
      console.log("✅ system_code 컬럼 추가 완료");
    } else {
      console.log("⏭️  system_code 컬럼 이미 존재");
    }
  } catch (e: any) {
    if (e.code === "ER_DUP_FIELDNAME") {
      console.log("⏭️  system_code 컬럼 이미 존재");
    } else {
      throw e;
    }
  }

  // 2. code 컬럼의 UNIQUE 제약조건을 (tenant_id, code) 복합으로 변경
  try {
    const [indexes] = await conn.execute(
      `SHOW INDEX FROM accounting_accounts WHERE Column_name = 'code' AND Non_unique = 0`
    );
    if ((indexes as any[]).length > 0) {
      const indexName = (indexes as any[])[0].Key_name;
      if (indexName !== "PRIMARY") {
        await conn.execute(`ALTER TABLE accounting_accounts DROP INDEX \`${indexName}\``);
        console.log(`✅ 기존 code UNIQUE 인덱스 (${indexName}) 제거`);
      }
    }
    // tenant_id + code 복합 유니크 추가
    try {
      await conn.execute(
        `ALTER TABLE accounting_accounts ADD UNIQUE INDEX idx_tenant_code (tenant_id, code)`
      );
      console.log("✅ (tenant_id, code) 복합 유니크 인덱스 추가");
    } catch (e: any) {
      if (e.code === "ER_DUP_KEYNAME") {
        console.log("⏭️  (tenant_id, code) 인덱스 이미 존재");
      } else {
        throw e;
      }
    }
  } catch (e: any) {
    console.log("⚠️  인덱스 변경 건너뜀:", e.message);
  }

  // 3. 기존 계정에 system_code 자동 매핑 (모든 tenant)
  const codeMapping: Record<string, string> = {
    "1010": "CASH",
    "1020": "BANK_DEPOSIT",
    "1030": "ACCOUNTS_RECEIVABLE",
    "1350": "VAT_INPUT",
    "1410": "INVENTORY_RAW",
    "1420": "INVENTORY_GOODS",
    "2010": "ACCOUNTS_PAYABLE",
    "2020": "ACCOUNTS_PAYABLE_CARD",
    "2350": "VAT_OUTPUT",
    "3010": "CAPITAL",
    "3020": "RETAINED_EARNINGS",
    "4010": "SALES_REVENUE",
    "4020": "SERVICE_REVENUE",
    "5010": "COST_OF_GOODS",
  };

  // name 기반 폴백 매핑
  const nameMapping: Record<string, string> = {
    "현금": "CASH",
    "보통예금": "BANK_DEPOSIT",
    "외상매출금": "ACCOUNTS_RECEIVABLE",
    "부가세대급금": "VAT_INPUT",
    "원재료": "INVENTORY_RAW",
    "상품": "INVENTORY_GOODS",
    "외상매입금": "ACCOUNTS_PAYABLE",
    "미지급금": "ACCOUNTS_PAYABLE",
    "미지급금-카드": "ACCOUNTS_PAYABLE_CARD",
    "부가세예수금": "VAT_OUTPUT",
    "자본금": "CAPITAL",
    "이익잉여금": "RETAINED_EARNINGS",
    "상품매출": "SALES_REVENUE",
    "매출": "SALES_REVENUE",
    "서비스매출": "SERVICE_REVENUE",
    "매출원가": "COST_OF_GOODS",
  };

  let updatedCount = 0;

  // code 기반 매핑
  for (const [code, systemCode] of Object.entries(codeMapping)) {
    const [result] = await conn.execute(
      `UPDATE accounting_accounts SET system_code = ? WHERE code = ? AND (system_code IS NULL OR system_code = '')`,
      [systemCode, code],
    );
    updatedCount += (result as any).affectedRows || 0;
  }

  // name 기반 매핑 (system_code가 아직 null인 것만)
  for (const [name, systemCode] of Object.entries(nameMapping)) {
    const [result] = await conn.execute(
      `UPDATE accounting_accounts SET system_code = ? WHERE name = ? AND (system_code IS NULL OR system_code = '')`,
      [systemCode, name],
    );
    updatedCount += (result as any).affectedRows || 0;
  }

  console.log(`✅ 기존 계정 system_code 매핑 완료: ${updatedCount}건 업데이트`);

  // 4. 결과 확인
  const [accounts] = await conn.execute(
    `SELECT id, tenant_id, code, system_code, name, category 
     FROM accounting_accounts 
     WHERE system_code IS NOT NULL 
     ORDER BY tenant_id, code`
  );
  console.log("\n=== system_code 매핑 결과 ===");
  console.table(accounts);

  await conn.end();
  console.log("\n=== 마이그레이션 완료 ===");
}

migrate().catch((e) => {
  console.error("마이그레이션 실패:", e);
  process.exit(1);
});
