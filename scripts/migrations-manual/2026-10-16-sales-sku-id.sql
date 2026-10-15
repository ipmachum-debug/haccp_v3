-- ============================================================================
-- 2026-10-16: accounting_sales.sku_id 추가 (판매 SKU)
-- ============================================================================
-- 적용 경로 (최종, 2026-10-16 #527 배포 리뷰 반영)
--   1) 서버가 listen 하기 전에 ensureRequiredSchema 가 이 컬럼·인덱스를 만들고 확인한다
--      (server/_core/index.ts → server/db/startupMigrations.ts). 컬럼이 끝내 없으면 요청을 받지 않고 종료한다.
--      인덱스가 없는 것은 경고만 (성능 영향).
--   2) 이 SQL 은 같은 일을 하는 수동 경로 — 서버 계정에 DDL 권한이 없을 때, 또는 배포 전에 미리 적용할 때 쓴다.
--   운영 단지: 2026-10-16 08:21:33 부팅 때 이미 적용됨 (v0.8.396). 다시 실행해도 "already exists".
--   ※ 서버는 PM2 fork 단일 인스턴스 — 컬럼을 끝내 못 만들면 그동안 사이트가 응답하지 않는다 (이 SQL 실행 후 pm2 restart).
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
