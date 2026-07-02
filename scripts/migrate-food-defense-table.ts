/**
 * 마이그레이션: h_food_defense_assessments 테이블 — Food Defense / TACCP (Phase Y-7)
 *
 * FSSC 22000 v6 §2.5.3 Food Defense / PAS 96 TACCP.
 * 실행: npx tsx scripts/migrate-food-defense-table.ts
 * 안전: 테이블/인덱스 존재 확인 후에만 생성 (재실행 안전).
 */
import mysql from "mysql2/promise";
import { getDbConfigFromEnv } from "./_lib/db-env.js";

async function migrate() {
  const conn = await mysql.createConnection(getDbConfigFromEnv(process.env));
  console.log("=== 마이그레이션 시작: h_food_defense_assessments (Food Defense / Phase Y-7) ===\n");

  const [tRows]: any = await conn.execute(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h_food_defense_assessments'`,
  );
  const exists = (tRows as any[]).length > 0;

  if (exists) {
    console.log("✅ h_food_defense_assessments 테이블 이미 존재 — 스킵");
  } else {
    console.log("→ h_food_defense_assessments 테이블 생성 중...");
    await conn.execute(`
      CREATE TABLE h_food_defense_assessments (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        tenant_id INT NOT NULL,

        industry ENUM(
          'food','cosmetic','pharmaceutical',
          'health-functional','medical-device','general-manufacturing'
        ) NOT NULL COMMENT 'Industry view filter (ADR-003 IndustryKey)',

        code VARCHAR(50) NOT NULL COMMENT 'FD-YYYY-NNNN 자동채번',

        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        category ENUM(
          'tampering','intentional_contamination','sabotage',
          'cyber','insider','supply_chain','other'
        ) NOT NULL COMMENT 'TACCP 위협 유형',
        target_point VARCHAR(255) NOT NULL COMMENT '위협 대상 지점 (원료입고/보관/생산/포장/출하/용수/인력)',

        likelihood INT NOT NULL COMMENT '발생가능성 1~5',
        impact INT NOT NULL COMMENT '영향/심각도 1~5',

        countermeasures JSON NOT NULL COMMENT 'Countermeasure[]',

        residual_score INT NULL COMMENT '잔여위협점수 (max 잔여 likelihood×impact)',

        justification TEXT NULL COMMENT 'accepted 시 정당화',

        assessed_by INT NULL,
        approved_by INT NULL,
        approved_at TIMESTAMP NULL,
        closed_at TIMESTAMP NULL,

        status ENUM(
          'draft','under_review','mitigated','accepted','archived'
        ) NOT NULL DEFAULT 'draft',

        industry_metadata JSON NULL,

        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='Food Defense (식품방어 TACCP FSSC v6/PAS 96) — Phase Y-7'
    `);
    console.log("✅ h_food_defense_assessments 테이블 생성 완료");
  }

  const indexes: Array<{ name: string; columns: string; unique?: boolean }> = [
    { name: "uniq_food_defense_tenant_code", columns: "tenant_id, code", unique: true },
    { name: "idx_food_defense_tenant_industry_status", columns: "tenant_id, industry, status" },
    { name: "idx_food_defense_tenant_category_status", columns: "tenant_id, category, status" },
    { name: "idx_food_defense_tenant_residual_score", columns: "tenant_id, residual_score" },
  ];

  for (const idx of indexes) {
    const [existsRows]: any = await conn.execute(
      `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h_food_defense_assessments' AND INDEX_NAME = ?`,
      [idx.name],
    );
    if ((existsRows as any[]).length > 0) {
      console.log(`✅ 인덱스 ${idx.name} 이미 존재 — 스킵`);
      continue;
    }
    const uniqueKw = idx.unique ? "UNIQUE " : "";
    console.log(`→ 인덱스 생성: ${idx.name}`);
    await conn.execute(
      `CREATE ${uniqueKw}INDEX ${idx.name} ON h_food_defense_assessments (${idx.columns})`,
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
