-- ============================================================================
-- 2026-04-27: h_inventory_transactions.material_id 직접 컬럼 추가
-- ============================================================================
--
-- 배경 (docs/architecture/06-material-pipeline-fixes-summary.md §5.2):
--   PR-W5/W6/W7 으로 4단 fallback (m1→m2→m3→im) 으로 원재료명을 매칭하지만
--   notes 문자열 파싱에 의존하는 fragile 한 구조.
--   material_id 컬럼을 직접 추가하여 SELECT 단순화 + 데이터 무결성 향상.
--
-- 이 마이그레이션은 schema 정의만 추가. 실제 운영 DB 적용 + 백필은
-- scripts/migrations-manual/2026-04-27-tx-material-id-backfill.sql 참조 (Genspark 수동 실행).
--
-- 후속:
--   - 모든 INSERT 사이트에 material_id 작성 (별도 PR)
--   - getConsumptionSummary SQL 단순화 (별도 PR)
-- ============================================================================

ALTER TABLE `h_inventory_transactions`
  ADD COLUMN `material_id` bigint NULL AFTER `inventory_id`;

-- 조회 성능 (월별 + 자재별 집계 쿼리용)
CREATE INDEX `idx_tx_tenant_material_date`
  ON `h_inventory_transactions` (`tenant_id`, `material_id`, `transaction_date`);
