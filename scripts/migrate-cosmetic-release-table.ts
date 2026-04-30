/**
 * 마이그레이션: h_cosmetic_release — Phase 2-6
 *
 * 화장품 QA 출고 lifecycle.
 *
 * 실행: npx tsx scripts/migrate-cosmetic-release-table.ts
 */
import mysql from "mysql2/promise";
import { getDbConfigFromEnv } from "./_lib/db-env.js";

async function migrate() {
  const conn = await mysql.createConnection(getDbConfigFromEnv(process.env));

  console.log("=== 마이그레이션: h_cosmetic_release (Phase 2-6) ===\n");

  // h_cosmetic_bmr 선행 검증
  const [bmrRows]: any = await conn.execute(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h_cosmetic_bmr'`,
  );
  if ((bmrRows as any[]).length === 0) {
    console.error("❌ h_cosmetic_bmr 없음 — Phase 2-1 마이그레이션 먼저");
    await conn.end();
    process.exit(2);
  }

  const [tRows]: any = await conn.execute(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h_cosmetic_release'`,
  );
  if ((tRows as any[]).length > 0) {
    console.log("✅ h_cosmetic_release 이미 존재 — 스킵");
  } else {
    console.log("→ h_cosmetic_release 테이블 생성 중...");
    await conn.execute(`
      CREATE TABLE h_cosmetic_release (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        tenant_id INT NOT NULL,

        release_code VARCHAR(50) NOT NULL COMMENT 'REL-YYYYMMDD-NNN',
        bmr_id BIGINT NOT NULL,
        product_id BIGINT NOT NULL,
        label_id BIGINT NULL COMMENT 'h_cosmetic_label (선택)',

        release_quantity DECIMAL(12,4) NOT NULL,
        release_unit VARCHAR(20) NOT NULL DEFAULT 'kg',
        target_market VARCHAR(100) NULL,
        product_batch_number VARCHAR(100) NULL COMMENT '제품 배치 번호 (라벨 인쇄용)',
        expiry_date DATE NULL,

        status ENUM('pending','approved','released','recalled') NOT NULL DEFAULT 'pending',

        bmr_completed_check INT DEFAULT 0,
        ipc_all_pass_check INT DEFAULT 0,
        qa_check_message TEXT NULL,

        approved_by BIGINT NULL,
        approved_at TIMESTAMP NULL,
        released_by BIGINT NULL,
        released_at TIMESTAMP NULL,
        recalled_by BIGINT NULL,
        recalled_at TIMESTAMP NULL,
        recall_reason TEXT NULL,

        notes TEXT NULL,
        created_by BIGINT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        UNIQUE INDEX uniq_cosmetic_release_code (tenant_id, release_code),
        INDEX idx_cosmetic_release_bmr (tenant_id, bmr_id),
        INDEX idx_cosmetic_release_status (tenant_id, status),
        CONSTRAINT fk_cosmetic_release_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        COMMENT='화장품 GMP — QA 출고 (Phase 2-6)'
    `);
    console.log("✅ h_cosmetic_release 생성 완료");
  }

  await conn.end();
  console.log("\n=== 마이그레이션 완료 ===");
}

migrate().catch((e) => {
  console.error("마이그레이션 실패:", e);
  process.exit(1);
});
