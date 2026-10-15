-- ============================================================================
-- 2026-10-16: accounting_sales.sku_id 추가 (판매 SKU)
-- ============================================================================
-- ⚠️ 순서: 이 SQL 을 먼저 실행한 뒤 PR 을 배포한다.
--   새 코드의 drizzle select(accountingSales) 가 sku_id 를 읽으므로, 컬럼이 없으면 매출 화면·확정이 실패한다.
--   반대로 컬럼만 먼저 추가돼도 기존 코드는 영향 없음 (NULL 허용, 기본값 NULL).
-- 부팅 마이그레이션(server/db/startupMigrations.ts ensureSalesSkuColumn)도 같은 일을 한다 — 이 SQL 이 빠져도
--   서버가 켜질 때 만든다. 다만 배포 직후 요청이 부팅 마이그레이션보다 먼저 올 수 있으니 이 SQL 을 먼저 실행한다.
-- 멱등: 이미 있으면 건너뛴다. 백필 없음 — 과거 매출은 NULL 로 둔다 (기존 동작 유지).
-- 잠금 최소화: ALGORITHM=INSTANT (MySQL 8.0.12+).
-- ============================================================================

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'accounting_sales' AND COLUMN_NAME = 'sku_id'
);
SET @ddl := IF(@col_exists = 0,
  'ALTER TABLE `accounting_sales` ADD COLUMN `sku_id` bigint NULL AFTER `material_id`, ALGORITHM=INSTANT',
  'SELECT ''sku_id already exists'' AS info');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'accounting_sales' AND INDEX_NAME = 'idx_sales_tenant_sku'
);
SET @ddl := IF(@idx_exists = 0,
  'CREATE INDEX `idx_sales_tenant_sku` ON `accounting_sales` (`tenant_id`, `sku_id`)',
  'SELECT ''idx_sales_tenant_sku already exists'' AS info');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 확인
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'accounting_sales' AND COLUMN_NAME = 'sku_id';
