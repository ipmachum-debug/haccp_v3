-- ============================================================================
-- 2026-10-16: h_product_outbound.sku_id / sku_name (Codex 운영 DB 점검 P1)
-- ============================================================================
-- 직접 제품출고 INSERT 가 이 두 칸을 쓰는데 운영 테이블에 없었다.
-- 서버도 첫 출고 때 ensureProductOutboundTable 로 만든다 (멱등) — 이 SQL 은 미리 적용하거나 DDL 권한이 없을 때 쓰는 수동 경로.
-- 멱등: 이미 있으면 건너뛴다. 백필 없음.
-- ============================================================================
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h_product_outbound' AND COLUMN_NAME = 'sku_id');
SET @ddl := IF(@c = 0, 'ALTER TABLE h_product_outbound ADD COLUMN sku_id BIGINT NULL AFTER lot_id', 'SELECT ''sku_id already exists'' AS info');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h_product_outbound' AND COLUMN_NAME = 'sku_name');
SET @ddl := IF(@c = 0, 'ALTER TABLE h_product_outbound ADD COLUMN sku_name VARCHAR(200) NULL AFTER sku_id', 'SELECT ''sku_name already exists'' AS info');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h_product_outbound' AND COLUMN_NAME IN ('sku_id','sku_name');
