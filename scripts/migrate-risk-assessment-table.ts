/**
 * 마이그레이션: h_quality_risk_assessments 테이블 — Risk Assessment (Phase Y-6)
 *
 * ICH Q9 (Pharma) / ISO 14971 (의료기기) / Codex (HACCP) / KGMP §3.5 (화장품).
 */
import mysql from "mysql2/promise";
import { getDbConfigFromEnv } from "./_lib/db-env.js";

async function migrate() {
  const conn = await mysql.createConnection(getDbConfigFromEnv(process.env));
  console.log("=== 마이그레이션 시작: h_quality_risk_assessments (Risk / Phase Y-6) ===\n");

  const [tRows]: any = await conn.execute(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h_quality_risk_assessments'`,
  );
  const exists = (tRows as any[]).length > 0;

  if (exists) {
    console.log("✅ h_quality_risk_assessments 테이블 이미 존재 — 스킵");
  } else {
    console.log("→ h_quality_risk_assessments 테이블 생성 중...");
    await conn.execute(`
      CREATE TABLE h_quality_risk_assessments (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        tenant_id INT NOT NULL,

        industry ENUM(
          'food','cosmetic','pharmaceutical',
          'health-functional','medical-device','general-manufacturing'
        ) NOT NULL COMMENT 'Industry view filter (ADR-003 IndustryKey)',

        code VARCHAR(50) NOT NULL COMMENT 'RA-YYYY-NNNN 자동채번',

        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        category ENUM(
          'biological','chemical','physical',
          'operational','regulatory','supplier','other'
        ) NOT NULL,
        scope VARCHAR(255) NOT NULL COMMENT '영향 대상 (제품/공정/설비/공급망)',

        probability INT NOT NULL COMMENT '발생확률 1~5',
        severity INT NOT NULL COMMENT '심각도 1~5',

        mitigations JSON NOT NULL COMMENT 'MitigationAction[]',

        residual_score INT NULL COMMENT '잔여위험점수 (max 잔여 prob×sev)',

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
        COMMENT='Risk Assessment (위험평가 ICH Q9/ISO 14971/HACCP) — Phase Y-6'
    `);
    console.log("✅ h_quality_risk_assessments 테이블 생성 완료");
  }

  const indexes: Array<{ name: string; columns: string; unique?: boolean }> = [
    { name: "uniq_quality_risk_assessment_tenant_code", columns: "tenant_id, code", unique: true },
    { name: "idx_quality_risk_assessment_tenant_industry_status", columns: "tenant_id, industry, status" },
    { name: "idx_quality_risk_assessment_tenant_category_status", columns: "tenant_id, category, status" },
    { name: "idx_quality_risk_assessment_tenant_residual_score", columns: "tenant_id, residual_score" },
  ];

  for (const idx of indexes) {
    const [existsRows]: any = await conn.execute(
      `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h_quality_risk_assessments' AND INDEX_NAME = ?`,
      [idx.name],
    );
    if ((existsRows as any[]).length > 0) {
      console.log(`✅ 인덱스 ${idx.name} 이미 존재 — 스킵`);
      continue;
    }
    const uniqueKw = idx.unique ? "UNIQUE " : "";
    console.log(`→ 인덱스 생성: ${idx.name}`);
    await conn.execute(
      `CREATE ${uniqueKw}INDEX ${idx.name} ON h_quality_risk_assessments (${idx.columns})`,
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
