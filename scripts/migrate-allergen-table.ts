/**
 * 마이그레이션: h_allergen_assessments 테이블 — 알레르겐 관리 (Phase Y-11)
 *
 * 식약처 알레르기 유발물질 표시기준 / FSSC 22000 / Codex CXC 80-2020.
 * 실행: npx tsx scripts/migrate-allergen-table.ts
 * 안전: 테이블/인덱스 존재 확인 후에만 생성 (재실행 안전).
 */
import mysql from "mysql2/promise";
import { getDbConfigFromEnv } from "./_lib/db-env.js";

async function migrate() {
  const conn = await mysql.createConnection(getDbConfigFromEnv(process.env));
  console.log("=== 마이그레이션 시작: h_allergen_assessments (알레르겐 관리 / Phase Y-11) ===\n");

  const [tRows]: any = await conn.execute(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h_allergen_assessments'`,
  );
  const exists = (tRows as any[]).length > 0;

  if (exists) {
    console.log("✅ h_allergen_assessments 테이블 이미 존재 — 스킵");
  } else {
    console.log("→ h_allergen_assessments 테이블 생성 중...");
    await conn.execute(`
      CREATE TABLE h_allergen_assessments (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        tenant_id INT NOT NULL,

        industry ENUM(
          'food','cosmetic','pharmaceutical',
          'health-functional','medical-device','general-manufacturing'
        ) NOT NULL COMMENT 'Industry view filter (ADR-003 IndustryKey)',

        code VARCHAR(50) NOT NULL COMMENT 'AL-YYYY-NNNN 자동채번',

        title VARCHAR(255) NOT NULL,
        subject_type ENUM('product','material') NOT NULL COMMENT '평가 대상 유형',
        subject_name VARCHAR(255) NOT NULL COMMENT '평가 대상명 (품목/원료)',

        present_allergens JSON NOT NULL COMMENT '의도적 함유 알레르겐 코드 배열',
        cross_contact_allergens JSON NOT NULL COMMENT '교차오염 가능 알레르겐 코드 배열 (may contain)',

        control_measures JSON NOT NULL COMMENT 'ControlMeasure[]',

        labeling_statement TEXT NULL COMMENT '표시(라벨) 문구',

        assessed_by INT NULL,
        approved_by INT NULL,
        approved_at TIMESTAMP NULL,
        closed_at TIMESTAMP NULL,

        status ENUM('draft','under_review','approved','archived') NOT NULL DEFAULT 'draft',

        industry_metadata JSON NULL,

        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='Allergen Management (알레르겐 관리 식약처/FSSC/Codex) — Phase Y-11'
    `);
    console.log("✅ h_allergen_assessments 테이블 생성 완료");
  }

  const indexes: Array<{ name: string; columns: string; unique?: boolean }> = [
    { name: "uniq_allergen_tenant_code", columns: "tenant_id, code", unique: true },
    { name: "idx_allergen_tenant_industry_status", columns: "tenant_id, industry, status" },
    { name: "idx_allergen_tenant_subject_type", columns: "tenant_id, subject_type" },
  ];

  for (const idx of indexes) {
    const [existsRows]: any = await conn.execute(
      `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h_allergen_assessments' AND INDEX_NAME = ?`,
      [idx.name],
    );
    if ((existsRows as any[]).length > 0) {
      console.log(`✅ 인덱스 ${idx.name} 이미 존재 — 스킵`);
      continue;
    }
    const uniqueKw = idx.unique ? "UNIQUE " : "";
    console.log(`→ 인덱스 생성: ${idx.name}`);
    await conn.execute(
      `CREATE ${uniqueKw}INDEX ${idx.name} ON h_allergen_assessments (${idx.columns})`,
    );
    console.log(`✅ 인덱스 ${idx.name} 생성 완료`);
  }

  console.log("\n=== 마이그레이션 완료 ===");
  await conn.end();
}

migrate().catch((err) => {
  console.error("치명 오류:", err);
  process.exit(1);
});
