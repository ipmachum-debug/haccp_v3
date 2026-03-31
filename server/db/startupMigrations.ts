/**
 * 서버 시작 시 실행되는 자동 마이그레이션
 * Drizzle 스키마와 실제 DB 테이블 간 누락된 컬럼을 자동으로 추가
 */

import { getRawConnection } from "./connection";

/**
 * partners 테이블에 누락된 컬럼 추가
 * schema_main.ts에 정의되어 있지만 실제 DB에 없는 컬럼들
 */
async function migratePartnersTable(conn: any) {
  const missingColumns = [
    { name: "contact_person", sql: "ALTER TABLE partners ADD COLUMN contact_person VARCHAR(100) NULL" },
    { name: "biz_type", sql: "ALTER TABLE partners ADD COLUMN biz_type VARCHAR(255) NULL" },
    { name: "biz_item", sql: "ALTER TABLE partners ADD COLUMN biz_item VARCHAR(255) NULL" },
    { name: "fax", sql: "ALTER TABLE partners ADD COLUMN fax VARCHAR(50) NULL" },
    { name: "bank_name", sql: "ALTER TABLE partners ADD COLUMN bank_name VARCHAR(50) NULL" },
    { name: "bank_account", sql: "ALTER TABLE partners ADD COLUMN bank_account VARCHAR(50) NULL" },
  ];

  // biz_no varchar(20) → varchar(50) 확장 (스키마와 일치)
  const columnFixes = [
    { name: "biz_no_expand", sql: "ALTER TABLE partners MODIFY COLUMN biz_no VARCHAR(50) NULL" },
  ];

  for (const col of missingColumns) {
    try {
      await conn.query(col.sql);
      console.log(`[Migration] partners: added column '${col.name}'`);
    } catch (err: any) {
      if (err.code === "ER_DUP_FIELDNAME" || err.message?.includes("Duplicate column")) {
        // 이미 존재하는 컬럼 - 정상
      } else {
        console.warn(`[Migration] partners: failed to add '${col.name}':`, err.message);
      }
    }
  }

  for (const fix of columnFixes) {
    try {
      await conn.query(fix.sql);
      console.log(`[Migration] partners: applied fix '${fix.name}'`);
    } catch (err: any) {
      console.warn(`[Migration] partners: failed to apply '${fix.name}':`, err.message);
    }
  }
}

/**
 * 서버 시작 시 모든 자동 마이그레이션 실행
 */
export async function runStartupMigrations() {
  try {
    const conn = await getRawConnection();
    console.log("[Migration] Running startup migrations...");
    
    await migratePartnersTable(conn);
    
    console.log("[Migration] Startup migrations completed");
  } catch (err) {
    console.error("[Migration] Startup migrations failed:", err);
    // 마이그레이션 실패해도 서버는 계속 실행
  }
}
