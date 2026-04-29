/**
 * 마이그레이션: h_cosmetic_bmr 테이블 추가 — Phase 2 (Cosmetic GMP) 첫 entity
 *
 * 적용:
 *   CREATE TABLE IF NOT EXISTS h_cosmetic_bmr (...)
 *   + UNIQUE INDEX uniq_cosmetic_bmr_code (tenant_id, bmr_code)
 *
 * 안전:
 *   - idempotent (CREATE TABLE IF NOT EXISTS)
 *   - 기존 데이터 영향 0 (새 테이블만 추가)
 *
 * 실행: npx tsx scripts/migrate-cosmetic-bmr-table.ts
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

  console.log("=== 마이그레이션 시작: h_cosmetic_bmr (Phase 2 Cosmetic GMP) ===\n");

  // 1. 테이블 존재 여부 확인 (idempotent 로깅)
  const [tRows]: any = await conn.execute(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h_cosmetic_bmr'`,
  );
  const exists = (tRows as any[]).length > 0;

  if (exists) {
    console.log("✅ h_cosmetic_bmr 테이블 이미 존재 — 스킵");
  } else {
    console.log("→ h_cosmetic_bmr 테이블 생성 중...");
    await conn.execute(`
      CREATE TABLE h_cosmetic_bmr (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        tenant_id INT NOT NULL,

        bmr_code VARCHAR(50) NOT NULL COMMENT 'BMR-YYYYMMDD-NNN 자동채번',
        product_id BIGINT NOT NULL COMMENT 'h_products.id',
        batch_number VARCHAR(100) NULL,

        planned_quantity_kg DECIMAL(12,3) NOT NULL,
        actual_quantity_kg DECIMAL(12,3) NULL,
        manufacturing_date DATE NULL,

        status ENUM('draft','approved','manufacturing','completed','rejected') NOT NULL DEFAULT 'draft',

        approved_by BIGINT NULL,
        approved_at TIMESTAMP NULL,
        manufacturing_started_at TIMESTAMP NULL,
        completed_by BIGINT NULL,
        completed_at TIMESTAMP NULL,
        rejected_by BIGINT NULL,
        rejected_at TIMESTAMP NULL,
        reject_reason TEXT NULL,

        notes TEXT NULL,

        created_by BIGINT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        UNIQUE INDEX uniq_cosmetic_bmr_code (tenant_id, bmr_code),
        INDEX idx_cosmetic_bmr_tenant_status (tenant_id, status),
        CONSTRAINT fk_cosmetic_bmr_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        COMMENT='화장품 GMP — Batch Manufacturing Record (Phase 2)'
    `);
    console.log("✅ h_cosmetic_bmr 테이블 생성 완료");
  }

  // 2. 결과 확인
  const [cols]: any = await conn.execute(
    `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h_cosmetic_bmr'
     ORDER BY ORDINAL_POSITION`,
  );
  console.log("\n=== h_cosmetic_bmr 컬럼 (총 " + (cols as any[]).length + "개) ===");
  console.table(cols);

  await conn.end();
  console.log("\n=== 마이그레이션 완료 ===");
}

migrate().catch((e) => {
  console.error("마이그레이션 실패:", e);
  process.exit(1);
});
