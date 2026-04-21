/**
 * domain_events 테이블 생성
 * 배경: docs/architecture/03-event-catalog.md
 *
 * 실행: npx tsx scripts/migrate-domain-events-table.ts
 */

import { getRawConnection } from "../server/db/connection";

async function migrate() {
  console.log("[Migration] domain_events 테이블 생성 시작...");
  const conn = await getRawConnection();

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS domain_events (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT NOT NULL,
      event_type VARCHAR(100) NOT NULL,
      aggregate_type VARCHAR(50) NOT NULL,
      aggregate_id BIGINT NOT NULL,
      payload JSON NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_by BIGINT NULL,
      processed_at TIMESTAMP NULL,
      processing_attempts INT NOT NULL DEFAULT 0,
      last_error TEXT NULL,

      INDEX idx_unprocessed (processed_at, event_type),
      INDEX idx_tenant_aggregate (tenant_id, aggregate_type, aggregate_id),
      INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  console.log("[Migration] domain_events 테이블 생성 완료");
  process.exit(0);
}

migrate().catch((err) => {
  console.error("[Migration] 실패:", err);
  process.exit(1);
});
