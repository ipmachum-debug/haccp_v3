/**
 * 마이그레이션: SKU 번들 child_pieces/piece_weight + sku_aliases — PR #298
 *
 * 1. sku_bundles 에 child_pieces (INT), child_piece_weight_g (DECIMAL) 컬럼 추가
 * 2. sku_aliases 신규 테이블 생성 (Excel 매칭용 alias)
 *
 * 멱등 (INFORMATION_SCHEMA 체크).
 *
 * 실행:
 *   npx tsx scripts/migrate-bundle-pieces-and-alias.ts
 */

import mysql from "mysql2/promise";
import { getDbConfigFromEnv } from "./_lib/db-env.js";

async function migrate() {
  const conn = await mysql.createConnection(getDbConfigFromEnv(process.env));
  console.log("=== 마이그레이션 시작: SKU 번들 piece + alias (PR #298) ===\n");

  // ─────────────────────────────────────────────────────
  // 1. sku_bundles 컬럼 추가
  // ─────────────────────────────────────────────────────
  const checkCol = async (col: string) => {
    const [rows]: any = await conn.execute(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'sku_bundles'
         AND COLUMN_NAME = ?`,
      [col],
    );
    return (rows as any[]).length > 0;
  };

  if (await checkCol("child_pieces")) {
    console.log("✅ sku_bundles.child_pieces 이미 존재 — 스킵");
  } else {
    console.log("→ sku_bundles.child_pieces 컬럼 추가 중...");
    await conn.execute(
      `ALTER TABLE sku_bundles
         ADD COLUMN child_pieces INT NULL AFTER default_ratio,
         ADD COLUMN child_piece_weight_g DECIMAL(10,2) NULL AFTER child_pieces`,
    );
    console.log("✅ sku_bundles.child_pieces + child_piece_weight_g 추가 완료");
  }

  // ─────────────────────────────────────────────────────
  // 2. sku_aliases 테이블 생성
  // ─────────────────────────────────────────────────────
  const [tRows]: any = await conn.execute(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sku_aliases'`,
  );

  if ((tRows as any[]).length > 0) {
    console.log("✅ sku_aliases 테이블 이미 존재 — 스킵");
  } else {
    console.log("→ sku_aliases 테이블 생성 중...");
    await conn.execute(`
      CREATE TABLE sku_aliases (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        tenant_id INT NOT NULL DEFAULT 1,
        sku_id BIGINT NOT NULL,
        alias VARCHAR(200) NOT NULL,
        is_primary TINYINT NOT NULL DEFAULT 0,
        note VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
        UNIQUE KEY uk_alias_tenant_alias (tenant_id, alias),
        INDEX idx_alias_sku (sku_id),
        INDEX idx_alias_tenant (tenant_id),
        CONSTRAINT fk_alias_sku FOREIGN KEY (sku_id) REFERENCES product_skus(id),
        CONSTRAINT fk_alias_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='SKU 별칭 — Excel 일괄 등록 매칭용 (1 SKU : N alias)'
    `);
    console.log("✅ sku_aliases 테이블 생성 완료");
  }

  console.log("\n=== 마이그레이션 완료 ===");
  await conn.end();
}

migrate().catch((err) => {
  console.error("치명 오류:", err);
  process.exit(1);
});
