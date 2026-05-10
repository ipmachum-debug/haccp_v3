/**
 * 마이그레이션: bundle_lots 테이블 — PR #283 (Phase 4)
 *
 * parent SKU LOT ↔ child SKU LOT 매핑 (N:1, 회수 시뮬레이션 연결).
 *
 * 멱등 (INFORMATION_SCHEMA 체크).
 *
 * 실행:
 *   npx tsx scripts/migrate-bundle-lots.ts
 */

import mysql from "mysql2/promise";
import { getDbConfigFromEnv } from "./_lib/db-env.js";

async function migrate() {
  const conn = await mysql.createConnection(getDbConfigFromEnv(process.env));
  console.log("=== 마이그레이션 시작: bundle_lots (PR #283) ===\n");

  const [tRows]: any = await conn.execute(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bundle_lots'`,
  );

  if ((tRows as any[]).length > 0) {
    console.log("✅ bundle_lots 테이블 이미 존재 — 스킵");
  } else {
    console.log("→ bundle_lots 테이블 생성 중...");
    await conn.execute(`
      CREATE TABLE bundle_lots (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        tenant_id INT NOT NULL DEFAULT 1,
        parent_lot_id BIGINT NOT NULL,
        child_lot_id BIGINT NOT NULL,
        deducted_qty_kg DECIMAL(12,3) NOT NULL,
        mapped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        notes TEXT,
        INDEX idx_bundle_lots_parent (parent_lot_id),
        INDEX idx_bundle_lots_child (child_lot_id),
        INDEX idx_bundle_lots_tenant (tenant_id),
        CONSTRAINT fk_bl_parent FOREIGN KEY (parent_lot_id) REFERENCES h_inventory_lots(id),
        CONSTRAINT fk_bl_child FOREIGN KEY (child_lot_id) REFERENCES h_inventory_lots(id),
        CONSTRAINT fk_bl_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='SKU 번들 LOT 매핑 (parent LOT ↔ child LOT N:1, 회수 시뮬레이션)'
    `);
    console.log("✅ bundle_lots 테이블 생성 완료");
  }

  console.log("\n=== 마이그레이션 완료 ===");
  await conn.end();
}

migrate().catch((err) => {
  console.error("치명 오류:", err);
  process.exit(1);
});
