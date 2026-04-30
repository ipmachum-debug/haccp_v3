/**
 * 마이그레이션: h_cosmetic_bmr_ipc 테이블 추가 — Phase 2-3 IPC 측정값
 *
 * 적용:
 *   CREATE TABLE IF NOT EXISTS h_cosmetic_bmr_ipc (...)
 *   + INDEX (tenant_id, bmr_id) — BMR 별 조회 최적화
 *
 * 안전:
 *   - idempotent (CREATE TABLE IF NOT EXISTS)
 *   - 기존 데이터 영향 0
 *   - h_cosmetic_bmr 테이블 존재 가정 (Phase 2-1 마이그레이션 선행 필요)
 *
 * 실행: npx tsx scripts/migrate-cosmetic-bmr-ipc-table.ts
 */
import mysql from "mysql2/promise";
import { getDbConfigFromEnv } from "./_lib/db-env.js";

async function migrate() {
  const conn = await mysql.createConnection(getDbConfigFromEnv(process.env));

  console.log("=== 마이그레이션 시작: h_cosmetic_bmr_ipc (Phase 2-3) ===\n");

  // 1. h_cosmetic_bmr 존재 확인 (선행 마이그레이션 검증)
  const [bmrRows]: any = await conn.execute(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h_cosmetic_bmr'`,
  );
  if ((bmrRows as any[]).length === 0) {
    console.error("❌ h_cosmetic_bmr 테이블이 없습니다 — Phase 2-1 마이그레이션 먼저 실행:");
    console.error("   npx tsx scripts/migrate-cosmetic-bmr-table.ts");
    await conn.end();
    process.exit(2);
  }

  // 2. 테이블 존재 여부 (idempotent)
  const [tRows]: any = await conn.execute(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h_cosmetic_bmr_ipc'`,
  );
  if ((tRows as any[]).length > 0) {
    console.log("✅ h_cosmetic_bmr_ipc 이미 존재 — 스킵");
  } else {
    console.log("→ h_cosmetic_bmr_ipc 테이블 생성 중...");
    await conn.execute(`
      CREATE TABLE h_cosmetic_bmr_ipc (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        tenant_id INT NOT NULL,
        bmr_id BIGINT NOT NULL COMMENT 'h_cosmetic_bmr.id',

        measurement_type VARCHAR(50) NOT NULL COMMENT '예: viscosity / ph / microbial / color',
        measurement_label VARCHAR(100) NULL COMMENT '한국어 표시명',

        expected_min DECIMAL(12,4) NULL,
        expected_max DECIMAL(12,4) NULL,

        measured_value DECIMAL(12,4) NULL,
        unit VARCHAR(20) NULL COMMENT 'cP / pH / cfu/g 등',

        pass_fail ENUM('pass','fail','pending') NOT NULL DEFAULT 'pending',

        measured_by BIGINT NULL,
        measured_at TIMESTAMP NULL,
        notes TEXT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

        INDEX idx_cosmetic_bmr_ipc_bmr (tenant_id, bmr_id),
        CONSTRAINT fk_cosmetic_bmr_ipc_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        COMMENT='화장품 GMP — In-Process Control 측정값 (Phase 2-3)'
    `);
    console.log("✅ h_cosmetic_bmr_ipc 테이블 생성 완료");
  }

  // 3. 결과 확인
  const [cols]: any = await conn.execute(
    `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h_cosmetic_bmr_ipc'
     ORDER BY ORDINAL_POSITION`,
  );
  console.log("\n=== h_cosmetic_bmr_ipc 컬럼 ===");
  console.table(cols);

  await conn.end();
  console.log("\n=== 마이그레이션 완료 ===");
}

migrate().catch((e) => {
  console.error("마이그레이션 실패:", e);
  process.exit(1);
});
