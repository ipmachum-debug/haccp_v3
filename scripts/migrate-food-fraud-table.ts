/**
 * 마이그레이션: h_food_fraud_assessments 테이블 — Food Fraud / VACCP (Phase Y-8)
 *
 * FSSC 22000 v6 §2.5.4 Food Fraud Mitigation / GFSI VACCP.
 * 실행: npx tsx scripts/migrate-food-fraud-table.ts
 * 안전: 테이블/인덱스 존재 확인 후에만 생성 (재실행 안전).
 */
import mysql from "mysql2/promise";
import { getDbConfigFromEnv } from "./_lib/db-env.js";

async function migrate() {
  const conn = await mysql.createConnection(getDbConfigFromEnv(process.env));
  console.log("=== 마이그레이션 시작: h_food_fraud_assessments (Food Fraud / Phase Y-8) ===\n");

  const [tRows]: any = await conn.execute(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h_food_fraud_assessments'`,
  );
  const exists = (tRows as any[]).length > 0;

  if (exists) {
    console.log("✅ h_food_fraud_assessments 테이블 이미 존재 — 스킵");
  } else {
    console.log("→ h_food_fraud_assessments 테이블 생성 중...");
    await conn.execute(`
      CREATE TABLE h_food_fraud_assessments (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        tenant_id INT NOT NULL,

        industry ENUM(
          'food','cosmetic','pharmaceutical',
          'health-functional','medical-device','general-manufacturing'
        ) NOT NULL COMMENT 'Industry view filter (ADR-003 IndustryKey)',

        code VARCHAR(50) NOT NULL COMMENT 'FF-YYYY-NNNN 자동채번',

        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        category ENUM(
          'dilution','substitution','concealment','mislabeling',
          'counterfeiting','unapproved_enhancement','gray_market','other'
        ) NOT NULL COMMENT 'VACCP 사기 유형',
        material VARCHAR(255) NOT NULL COMMENT '평가 대상 원료/식품',
        supplier VARCHAR(255) NULL COMMENT '공급자',

        likelihood INT NOT NULL COMMENT '발생가능성 1~5 (기회+동기)',
        impact INT NOT NULL COMMENT '영향/심각도 1~5',

        control_measures JSON NOT NULL COMMENT 'ControlMeasure[]',

        residual_score INT NULL COMMENT '잔여취약성점수 (max 잔여 likelihood×impact)',

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
        COMMENT='Food Fraud (식품사기 VACCP FSSC v6/GFSI) — Phase Y-8'
    `);
    console.log("✅ h_food_fraud_assessments 테이블 생성 완료");
  }

  const indexes: Array<{ name: string; columns: string; unique?: boolean }> = [
    { name: "uniq_food_fraud_tenant_code", columns: "tenant_id, code", unique: true },
    { name: "idx_food_fraud_tenant_industry_status", columns: "tenant_id, industry, status" },
    { name: "idx_food_fraud_tenant_category_status", columns: "tenant_id, category, status" },
    { name: "idx_food_fraud_tenant_residual_score", columns: "tenant_id, residual_score" },
  ];

  for (const idx of indexes) {
    const [existsRows]: any = await conn.execute(
      `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h_food_fraud_assessments' AND INDEX_NAME = ?`,
      [idx.name],
    );
    if ((existsRows as any[]).length > 0) {
      console.log(`✅ 인덱스 ${idx.name} 이미 존재 — 스킵`);
      continue;
    }
    const uniqueKw = idx.unique ? "UNIQUE " : "";
    console.log(`→ 인덱스 생성: ${idx.name}`);
    await conn.execute(
      `CREATE ${uniqueKw}INDEX ${idx.name} ON h_food_fraud_assessments (${idx.columns})`,
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
