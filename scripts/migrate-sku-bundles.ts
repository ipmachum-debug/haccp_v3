/**
 * 마이그레이션: SKU 번들 (혼합 제품) — PR #280
 *
 * 1. sku_bundles 테이블 생성 (parent_sku_id, child_sku_id, default_ratio)
 * 2. production_sku_output 에 bundle_sku_id 컬럼 추가 (NULL 허용)
 *
 * 멱등 (INFORMATION_SCHEMA 체크 후 ALTER).
 *
 * 실행:
 *   npx tsx scripts/migrate-sku-bundles.ts
 */

import mysql from "mysql2/promise";
import { getDbConfigFromEnv } from "./_lib/db-env.js";

async function migrate() {
  const conn = await mysql.createConnection(getDbConfigFromEnv(process.env));
  console.log("=== 마이그레이션 시작: SKU 번들 (PR #280) ===\n");

  // ─────────────────────────────────────────────────────
  // 1. sku_bundles 테이블 생성
  // ─────────────────────────────────────────────────────
  const [tRows]: any = await conn.execute(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sku_bundles'`,
  );

  if ((tRows as any[]).length > 0) {
    console.log("✅ sku_bundles 테이블 이미 존재 — 스킵");
  } else {
    console.log("→ sku_bundles 테이블 생성 중...");
    await conn.execute(`
      CREATE TABLE sku_bundles (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        tenant_id INT NOT NULL DEFAULT 1,
        parent_sku_id BIGINT NOT NULL,
        child_sku_id BIGINT NOT NULL,
        default_ratio DECIMAL(5,2) NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
        UNIQUE KEY uk_bundle_pair (tenant_id, parent_sku_id, child_sku_id),
        INDEX idx_bundle_parent (parent_sku_id),
        INDEX idx_bundle_child (child_sku_id),
        CONSTRAINT fk_bundle_parent FOREIGN KEY (parent_sku_id) REFERENCES product_skus(id),
        CONSTRAINT fk_bundle_child FOREIGN KEY (child_sku_id) REFERENCES product_skus(id),
        CONSTRAINT fk_bundle_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='SKU 번들 정의 (혼합 제품 — 다중 생산 SKU 를 1개 출고 SKU 로 묶음)'
    `);
    console.log("✅ sku_bundles 테이블 생성 완료");
  }

  // ─────────────────────────────────────────────────────
  // 2. production_sku_output 에 bundle_sku_id 컬럼 추가
  // ─────────────────────────────────────────────────────
  const [colRows]: any = await conn.execute(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'production_sku_output'
       AND COLUMN_NAME = 'bundle_sku_id'`,
  );

  if ((colRows as any[]).length > 0) {
    console.log("✅ production_sku_output.bundle_sku_id 이미 존재 — 스킵");
  } else {
    console.log("→ production_sku_output.bundle_sku_id 컬럼 추가 중...");
    await conn.execute(
      `ALTER TABLE production_sku_output
         ADD COLUMN bundle_sku_id BIGINT NULL AFTER sku_id,
         ADD INDEX idx_pso_bundle (bundle_sku_id)`,
    );
    console.log("✅ production_sku_output.bundle_sku_id 컬럼 추가 완료");
  }

  console.log("\n=== 마이그레이션 완료 ===");
  await conn.end();
}

migrate().catch((err) => {
  console.error("치명 오류:", err);
  process.exit(1);
});
