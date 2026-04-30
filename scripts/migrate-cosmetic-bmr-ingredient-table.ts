/**
 * 마이그레이션: h_cosmetic_bmr_ingredient — Phase 2-4b
 *
 * BMR 별 원료 투입 기록 테이블.
 *
 * 실행: npx tsx scripts/migrate-cosmetic-bmr-ingredient-table.ts
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

  console.log("=== 마이그레이션: h_cosmetic_bmr_ingredient (Phase 2-4b) ===\n");

  // h_cosmetic_bmr 선행 검증
  const [bmrRows]: any = await conn.execute(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h_cosmetic_bmr'`,
  );
  if ((bmrRows as any[]).length === 0) {
    console.error("❌ h_cosmetic_bmr 없음 — Phase 2-1 마이그레이션 먼저 실행:");
    console.error("   npx tsx scripts/migrate-cosmetic-bmr-table.ts");
    await conn.end();
    process.exit(2);
  }

  const [tRows]: any = await conn.execute(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h_cosmetic_bmr_ingredient'`,
  );
  if ((tRows as any[]).length > 0) {
    console.log("✅ h_cosmetic_bmr_ingredient 이미 존재 — 스킵");
  } else {
    console.log("→ h_cosmetic_bmr_ingredient 테이블 생성 중...");
    await conn.execute(`
      CREATE TABLE h_cosmetic_bmr_ingredient (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        tenant_id INT NOT NULL,
        bmr_id BIGINT NOT NULL COMMENT 'h_cosmetic_bmr.id',

        material_name VARCHAR(200) NOT NULL,
        material_code VARCHAR(100) NULL,
        inci_name VARCHAR(200) NULL,
        lot_number VARCHAR(100) NULL COMMENT '원료 LOT (추적용)',

        planned_quantity DECIMAL(12,4) NULL COMMENT '계획량 (배합표 기준)',
        actual_quantity DECIMAL(12,4) NULL COMMENT '실제 투입량',
        unit VARCHAR(20) NOT NULL DEFAULT 'g',

        input_by BIGINT NULL,
        input_at TIMESTAMP NULL,
        notes TEXT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

        INDEX idx_cosmetic_bmr_ing_bmr (tenant_id, bmr_id),
        CONSTRAINT fk_cosmetic_bmr_ing_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        COMMENT='화장품 GMP — BMR 별 원료 투입 기록 (Phase 2-4b)'
    `);
    console.log("✅ h_cosmetic_bmr_ingredient 생성 완료");
  }

  await conn.end();
  console.log("\n=== 마이그레이션 완료 ===");
}

migrate().catch((e) => {
  console.error("마이그레이션 실패:", e);
  process.exit(1);
});
