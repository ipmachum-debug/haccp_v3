/**
 * 마이그레이션: h_food_safety_culture_assessments 테이블 — 식품안전문화 (Phase Y-9)
 *
 * FSSC 22000 v6 §2.5.1 Food Safety and Quality Culture / GFSI.
 * 실행: npx tsx scripts/migrate-food-safety-culture-table.ts
 * 안전: 테이블/인덱스 존재 확인 후에만 생성 (재실행 안전).
 */
import mysql from "mysql2/promise";
import { getDbConfigFromEnv } from "./_lib/db-env.js";

async function migrate() {
  const conn = await mysql.createConnection(getDbConfigFromEnv(process.env));
  console.log("=== 마이그레이션 시작: h_food_safety_culture_assessments (식품안전문화 / Phase Y-9) ===\n");

  const [tRows]: any = await conn.execute(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h_food_safety_culture_assessments'`,
  );
  const exists = (tRows as any[]).length > 0;

  if (exists) {
    console.log("✅ h_food_safety_culture_assessments 테이블 이미 존재 — 스킵");
  } else {
    console.log("→ h_food_safety_culture_assessments 테이블 생성 중...");
    await conn.execute(`
      CREATE TABLE h_food_safety_culture_assessments (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        tenant_id INT NOT NULL,

        industry ENUM(
          'food','cosmetic','pharmaceutical',
          'health-functional','medical-device','general-manufacturing'
        ) NOT NULL COMMENT 'Industry view filter (ADR-003 IndustryKey)',

        code VARCHAR(50) NOT NULL COMMENT 'FSC-YYYY-NNNN 자동채번',

        title VARCHAR(255) NOT NULL,
        assessment_period VARCHAR(100) NOT NULL COMMENT '진단 대상 기간 (예: 2026 상반기)',
        method ENUM('survey','interview','observation','mixed') NOT NULL COMMENT '진단 방법',
        participant_count INT NOT NULL DEFAULT 0 COMMENT '참여 인원',

        dimension_scores JSON NOT NULL COMMENT '6개 차원 점수 {leadership,communication,awareness,accountability,resources,continuousImprovement}',
        overall_score DECIMAL(2,1) NOT NULL COMMENT '종합 점수 (평균 1.0~5.0)',

        improvement_actions JSON NOT NULL COMMENT 'ImprovementAction[]',

        summary TEXT NULL COMMENT '요약/소견',

        assessed_by INT NULL,
        approved_by INT NULL,
        approved_at TIMESTAMP NULL,
        closed_at TIMESTAMP NULL,

        status ENUM('draft','under_review','approved','archived') NOT NULL DEFAULT 'draft',

        industry_metadata JSON NULL,

        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='Food Safety Culture (식품안전문화 FSSC v6 §2.5.1/GFSI) — Phase Y-9'
    `);
    console.log("✅ h_food_safety_culture_assessments 테이블 생성 완료");
  }

  const indexes: Array<{ name: string; columns: string; unique?: boolean }> = [
    { name: "uniq_food_safety_culture_tenant_code", columns: "tenant_id, code", unique: true },
    { name: "idx_food_safety_culture_tenant_industry_status", columns: "tenant_id, industry, status" },
    { name: "idx_food_safety_culture_tenant_overall_score", columns: "tenant_id, overall_score" },
  ];

  for (const idx of indexes) {
    const [existsRows]: any = await conn.execute(
      `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h_food_safety_culture_assessments' AND INDEX_NAME = ?`,
      [idx.name],
    );
    if ((existsRows as any[]).length > 0) {
      console.log(`✅ 인덱스 ${idx.name} 이미 존재 — 스킵`);
      continue;
    }
    const uniqueKw = idx.unique ? "UNIQUE " : "";
    console.log(`→ 인덱스 생성: ${idx.name}`);
    await conn.execute(
      `CREATE ${uniqueKw}INDEX ${idx.name} ON h_food_safety_culture_assessments (${idx.columns})`,
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
