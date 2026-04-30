/**
 * 마이그레이션: 화장품 안정성시험 2 테이블 — Phase 2-8
 *
 * 실행: npx tsx scripts/migrate-cosmetic-stability-tables.ts
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

  console.log("=== 마이그레이션: 화장품 안정성시험 2 테이블 (Phase 2-8) ===\n");

  // 1. h_cosmetic_stability_test
  const [t1Rows]: any = await conn.execute(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h_cosmetic_stability_test'`,
  );
  if ((t1Rows as any[]).length > 0) {
    console.log("✅ h_cosmetic_stability_test 이미 존재 — 스킵");
  } else {
    console.log("→ h_cosmetic_stability_test 테이블 생성 중...");
    await conn.execute(`
      CREATE TABLE h_cosmetic_stability_test (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        tenant_id INT NOT NULL,

        test_code VARCHAR(50) NOT NULL COMMENT 'STB-YYYYMMDD-NNN',
        product_id BIGINT NOT NULL,
        bmr_id BIGINT NULL,

        test_type ENUM('long_term','accelerated','stress') NOT NULL,
        storage_temp_c DECIMAL(5,2) NULL,
        storage_humidity DECIMAL(5,2) NULL,
        storage_light ENUM('dark','ambient','direct_sunlight') DEFAULT 'dark',

        planned_duration_months INT NOT NULL DEFAULT 12,
        started_at DATE NULL,
        completed_at DATE NULL,

        status ENUM('planned','in_progress','completed','failed') NOT NULL DEFAULT 'planned',
        conclusion TEXT NULL,

        approved_by BIGINT NULL,
        approved_at TIMESTAMP NULL,

        created_by BIGINT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        UNIQUE INDEX uniq_cosmetic_stability_code (tenant_id, test_code),
        INDEX idx_cosmetic_stability_product (tenant_id, product_id),
        INDEX idx_cosmetic_stability_status (tenant_id, status),
        CONSTRAINT fk_cosmetic_stability_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        COMMENT='화장품 GMP — 안정성시험 헤더 (Phase 2-8)'
    `);
    console.log("✅ h_cosmetic_stability_test 생성 완료");
  }

  // 2. h_cosmetic_stability_observation
  const [t2Rows]: any = await conn.execute(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h_cosmetic_stability_observation'`,
  );
  if ((t2Rows as any[]).length > 0) {
    console.log("✅ h_cosmetic_stability_observation 이미 존재 — 스킵");
  } else {
    console.log("→ h_cosmetic_stability_observation 테이블 생성 중...");
    await conn.execute(`
      CREATE TABLE h_cosmetic_stability_observation (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        tenant_id INT NOT NULL,
        test_id BIGINT NOT NULL,

        observation_month INT NOT NULL,
        observation_date DATE NOT NULL,

        appearance TEXT NULL,
        color VARCHAR(100) NULL,
        odor VARCHAR(100) NULL,
        ph DECIMAL(5,2) NULL,
        viscosity DECIMAL(12,4) NULL,
        microbial_count INT NULL,

        pass_fail ENUM('pass','acceptable','fail') NOT NULL DEFAULT 'pass',

        notes TEXT NULL,
        measured_by BIGINT NULL,
        measured_at TIMESTAMP NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

        INDEX idx_cosmetic_stability_obs_test (tenant_id, test_id),
        CONSTRAINT fk_cosmetic_stability_obs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        COMMENT='화장품 GMP — 안정성시험 관측치 (Phase 2-8)'
    `);
    console.log("✅ h_cosmetic_stability_observation 생성 완료");
  }

  await conn.end();
  console.log("\n=== 마이그레이션 완료 ===");
}

migrate().catch((e) => {
  console.error("마이그레이션 실패:", e);
  process.exit(1);
});
