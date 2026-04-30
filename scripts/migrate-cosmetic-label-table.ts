/**
 * 마이그레이션: h_cosmetic_label — Phase 2-5
 *
 * 화장품 라벨 / 전성분 표시 마스터.
 *
 * 실행: npx tsx scripts/migrate-cosmetic-label-table.ts
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

  console.log("=== 마이그레이션: h_cosmetic_label (Phase 2-5) ===\n");

  const [tRows]: any = await conn.execute(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h_cosmetic_label'`,
  );
  if ((tRows as any[]).length > 0) {
    console.log("✅ h_cosmetic_label 이미 존재 — 스킵");
  } else {
    console.log("→ h_cosmetic_label 테이블 생성 중...");
    await conn.execute(`
      CREATE TABLE h_cosmetic_label (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        tenant_id INT NOT NULL,

        label_code VARCHAR(50) NOT NULL COMMENT 'LBL-YYYYMMDD-NNN',
        product_id BIGINT NOT NULL,

        product_name_ko VARCHAR(200) NOT NULL,
        product_name_en VARCHAR(200) NULL,
        capacity VARCHAR(50) NULL,

        inci_list TEXT NULL COMMENT '콤마 구분 INCI 목록',
        allergen_list TEXT NULL COMMENT 'KFDA 22종 알러지 유발물질',

        usage_instructions TEXT NULL,
        cautions TEXT NULL,
        storage_method TEXT NULL,

        manufacturer_name VARCHAR(200) NULL,
        manufacturer_address TEXT NULL,
        responsible_party VARCHAR(200) NULL,

        status ENUM('draft','approved','active','deprecated') NOT NULL DEFAULT 'draft',

        approved_by BIGINT NULL,
        approved_at TIMESTAMP NULL,

        created_by BIGINT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        UNIQUE INDEX uniq_cosmetic_label_code (tenant_id, label_code),
        INDEX idx_cosmetic_label_product (tenant_id, product_id),
        INDEX idx_cosmetic_label_status (tenant_id, status),
        CONSTRAINT fk_cosmetic_label_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        COMMENT='화장품 GMP — 라벨 / 전성분 표시 (Phase 2-5)'
    `);
    console.log("✅ h_cosmetic_label 생성 완료");
  }

  await conn.end();
  console.log("\n=== 마이그레이션 완료 ===");
}

migrate().catch((e) => {
  console.error("마이그레이션 실패:", e);
  process.exit(1);
});
