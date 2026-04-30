/**
 * 마이그레이션: 화장품 배합표 2 테이블 — Phase 2-4a
 *
 * 적용:
 *   1. h_cosmetic_formula (배합표 헤더)
 *      + UNIQUE (tenant_id, formula_code)
 *      + INDEX (tenant_id, product_id)
 *   2. h_cosmetic_formula_ingredient (배합 항목)
 *      + INDEX (tenant_id, formula_id)
 *
 * 안전:
 *   - idempotent (CREATE TABLE IF NOT EXISTS)
 *   - 기존 데이터 영향 0
 *
 * 실행: npx tsx scripts/migrate-cosmetic-formula-tables.ts
 */
import mysql from "mysql2/promise";
import { getDbConfigFromEnv } from "./_lib/db-env.js";

async function migrate() {
  const conn = await mysql.createConnection(getDbConfigFromEnv(process.env));

  console.log("=== 마이그레이션: 화장품 배합표 2 테이블 (Phase 2-4a) ===\n");

  // 1. h_cosmetic_formula
  const [t1Rows]: any = await conn.execute(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h_cosmetic_formula'`,
  );
  if ((t1Rows as any[]).length > 0) {
    console.log("✅ h_cosmetic_formula 이미 존재 — 스킵");
  } else {
    console.log("→ h_cosmetic_formula 테이블 생성 중...");
    await conn.execute(`
      CREATE TABLE h_cosmetic_formula (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        tenant_id INT NOT NULL,

        formula_code VARCHAR(50) NOT NULL COMMENT 'FOR-YYYYMMDD-NNN',
        product_id BIGINT NOT NULL,
        name VARCHAR(200) NOT NULL,
        version VARCHAR(20) NOT NULL DEFAULT '1.0',
        description TEXT NULL,

        status ENUM('draft','approved','active','deprecated') NOT NULL DEFAULT 'draft',

        approved_by BIGINT NULL,
        approved_at TIMESTAMP NULL,

        created_by BIGINT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        UNIQUE INDEX uniq_cosmetic_formula_code (tenant_id, formula_code),
        INDEX idx_cosmetic_formula_product (tenant_id, product_id),
        INDEX idx_cosmetic_formula_status (tenant_id, status),
        CONSTRAINT fk_cosmetic_formula_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        COMMENT='화장품 GMP — 배합표 마스터 (Phase 2-4a)'
    `);
    console.log("✅ h_cosmetic_formula 생성 완료");
  }

  // 2. h_cosmetic_formula_ingredient
  const [t2Rows]: any = await conn.execute(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h_cosmetic_formula_ingredient'`,
  );
  if ((t2Rows as any[]).length > 0) {
    console.log("✅ h_cosmetic_formula_ingredient 이미 존재 — 스킵");
  } else {
    console.log("→ h_cosmetic_formula_ingredient 테이블 생성 중...");
    await conn.execute(`
      CREATE TABLE h_cosmetic_formula_ingredient (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        tenant_id INT NOT NULL,
        formula_id BIGINT NOT NULL,

        material_name VARCHAR(200) NOT NULL,
        material_code VARCHAR(100) NULL,
        inci_name VARCHAR(200) NULL COMMENT 'KFDA 전성분 표시 명칭',

        percentage DECIMAL(7,4) NOT NULL,

        role VARCHAR(50) NULL COMMENT 'solvent / emulsifier / preservative 등',
        sort_order INT NOT NULL DEFAULT 0,

        notes TEXT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

        INDEX idx_cosmetic_formula_ing_formula (tenant_id, formula_id),
        CONSTRAINT fk_cosmetic_formula_ing_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        COMMENT='화장품 GMP — 배합 항목 (원료 + 배합비 %) (Phase 2-4a)'
    `);
    console.log("✅ h_cosmetic_formula_ingredient 생성 완료");
  }

  await conn.end();
  console.log("\n=== 마이그레이션 완료 ===");
}

migrate().catch((e) => {
  console.error("마이그레이션 실패:", e);
  process.exit(1);
});
