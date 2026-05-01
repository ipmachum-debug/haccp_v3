/**
 * 마이그레이션: h_quality_suppliers 테이블 — Supplier (AVL) (Phase Y-5)
 */
import mysql from "mysql2/promise";
import { getDbConfigFromEnv } from "./_lib/db-env.js";

async function migrate() {
  const conn = await mysql.createConnection(getDbConfigFromEnv(process.env));
  console.log("=== 마이그레이션 시작: h_quality_suppliers (Supplier AVL / Phase Y-5) ===\n");

  const [tRows]: any = await conn.execute(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h_quality_suppliers'`,
  );
  const exists = (tRows as any[]).length > 0;

  if (exists) {
    console.log("✅ h_quality_suppliers 테이블 이미 존재 — 스킵");
  } else {
    console.log("→ h_quality_suppliers 테이블 생성 중...");
    await conn.execute(`
      CREATE TABLE h_quality_suppliers (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        tenant_id INT NOT NULL,

        industry ENUM(
          'food','cosmetic','pharmaceutical',
          'health-functional','medical-device','general-manufacturing'
        ) NOT NULL COMMENT 'Industry view filter (ADR-003 IndustryKey)',

        code VARCHAR(50) NOT NULL COMMENT 'SUP-YYYY-NNNN 자동채번',

        name VARCHAR(255) NOT NULL,
        category ENUM('raw_material','packaging','equipment','service','other') NOT NULL,

        contact_person VARCHAR(100) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(50) NOT NULL,

        biz_number VARCHAR(50) NULL,
        address VARCHAR(500) NULL,

        approved_date DATE NULL COMMENT 'status=approved 진입 시',
        re_evaluation_interval_months INT NOT NULL DEFAULT 12,
        next_evaluation_date DATE NULL COMMENT 'approved_date + interval 자동 계산',

        evaluation_score INT NULL COMMENT '0~100',
        notes TEXT NULL,

        closed_at TIMESTAMP NULL,

        status ENUM(
          'under_evaluation','approved','suspended','disqualified','archived'
        ) NOT NULL DEFAULT 'under_evaluation',

        industry_metadata JSON NULL,

        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='Supplier (공급업체 AVL) — Phase Y-5'
    `);
    console.log("✅ h_quality_suppliers 테이블 생성 완료");
  }

  const indexes: Array<{ name: string; columns: string; unique?: boolean }> = [
    { name: "uniq_quality_supplier_tenant_code", columns: "tenant_id, code", unique: true },
    { name: "idx_quality_supplier_tenant_industry_status", columns: "tenant_id, industry, status" },
    { name: "idx_quality_supplier_tenant_next_evaluation", columns: "tenant_id, next_evaluation_date" },
    { name: "idx_quality_supplier_tenant_category_status", columns: "tenant_id, category, status" },
  ];

  for (const idx of indexes) {
    const [existsRows]: any = await conn.execute(
      `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h_quality_suppliers' AND INDEX_NAME = ?`,
      [idx.name],
    );
    if ((existsRows as any[]).length > 0) {
      console.log(`✅ 인덱스 ${idx.name} 이미 존재 — 스킵`);
      continue;
    }
    const uniqueKw = idx.unique ? "UNIQUE " : "";
    console.log(`→ 인덱스 생성: ${idx.name}`);
    await conn.execute(
      `CREATE ${uniqueKw}INDEX ${idx.name} ON h_quality_suppliers (${idx.columns})`,
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
