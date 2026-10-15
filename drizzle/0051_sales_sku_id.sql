-- ============================================================================
-- 2026-10-16: accounting_sales.sku_id — 판매 SKU
-- ============================================================================
-- 배경: 매출에 SKU 가 없어 한 제품의 여러 SKU(예: 하늘사랑 1.6kg 박스 SKU208·209, kg LOT) LOT 이
--   섞여 차감될 수 있었다. 매출 등록 화면·일괄 업로드는 SKU 를 고르거나 매칭하지만 저장하지 않았다.
-- 운영 적용: scripts/migrations-manual/2026-10-16-sales-sku-id.sql (배포 전에 먼저 — drizzle select 가 이 컬럼을 읽는다)
-- ============================================================================

ALTER TABLE `accounting_sales`
  ADD COLUMN `sku_id` bigint NULL AFTER `material_id`;

CREATE INDEX `idx_sales_tenant_sku` ON `accounting_sales` (`tenant_id`, `sku_id`);
