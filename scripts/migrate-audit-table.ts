/**
 * 마이그레이션: h_audits 테이블 — Audit (Phase Y-2-3)
 */
import mysql from "mysql2/promise";
import { getDbConfigFromEnv } from "./_lib/db-env.js";

async function migrate() {
  const conn = await mysql.createConnection(getDbConfigFromEnv(process.env));
  console.log("=== 마이그레이션 시작: h_audits (Audit / Phase Y-2-3) ===\n");

  const [tRows]: any = await conn.execute(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h_audits'`,
  );
  const exists = (tRows as any[]).length > 0;

  if (exists) {
    console.log("✅ h_audits 테이블 이미 존재 — 스킵");
  } else {
    console.log("→ h_audits 테이블 생성 중...");
    await conn.execute(`
      CREATE TABLE h_audits (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        tenant_id INT NOT NULL,

        industry ENUM(
          'food','cosmetic','pharmaceutical',
          'health-functional','medical-device','general-manufacturing'
        ) NOT NULL COMMENT 'Industry view filter (ADR-003 IndustryKey)',

        code VARCHAR(50) NOT NULL COMMENT 'AUD-YYYY-NNNN 자동채번',
        type ENUM('internal','supplier','external') NOT NULL,

        title VARCHAR(255) NOT NULL,
        scope TEXT NOT NULL COMMENT '감사 범위 / 목적',
        criteria VARCHAR(255) NOT NULL COMMENT '감사 기준 (예: ISO 13485:2016)',
        auditee VARCHAR(255) NOT NULL COMMENT '피감사 대상',

        planned_date DATE NOT NULL,
        actual_date DATE NULL,

        lead_auditor INT NOT NULL COMMENT '주관 감사원 user_id',
        auditors JSON NOT NULL COMMENT '보조 감사원 user_id 목록',

        findings JSON NOT NULL COMMENT '발견사항 (AuditFinding[])',

        outcome ENUM('pass','conditional_pass','fail','pending')
          NOT NULL DEFAULT 'pending',

        conclusion TEXT NULL COMMENT '결론 / 권고사항',

        approved_by INT NULL,
        approved_at TIMESTAMP NULL,
        closed_at TIMESTAMP NULL,

        status ENUM(
          'planned','scheduled','in_progress','reporting','closed','cancelled'
        ) NOT NULL DEFAULT 'planned',

        industry_metadata JSON NULL,

        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='Audit (감사) — internal / supplier / external (Phase Y-2-3)'
    `);
    console.log("✅ h_audits 테이블 생성 완료");
  }

  const indexes: Array<{ name: string; columns: string; unique?: boolean }> = [
    { name: "uniq_audit_tenant_code", columns: "tenant_id, code", unique: true },
    { name: "idx_audit_tenant_industry_status", columns: "tenant_id, industry, status" },
    { name: "idx_audit_tenant_planned_date", columns: "tenant_id, planned_date" },
    { name: "idx_audit_tenant_lead_auditor", columns: "tenant_id, lead_auditor, status" },
    { name: "idx_audit_tenant_type_outcome", columns: "tenant_id, type, outcome" },
  ];

  for (const idx of indexes) {
    const [existsRows]: any = await conn.execute(
      `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h_audits' AND INDEX_NAME = ?`,
      [idx.name],
    );
    if ((existsRows as any[]).length > 0) {
      console.log(`✅ 인덱스 ${idx.name} 이미 존재 — 스킵`);
      continue;
    }
    const uniqueKw = idx.unique ? "UNIQUE " : "";
    console.log(`→ 인덱스 생성: ${idx.name}`);
    await conn.execute(
      `CREATE ${uniqueKw}INDEX ${idx.name} ON h_audits (${idx.columns})`,
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
