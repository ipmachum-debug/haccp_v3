-- 원물·공정·완제품 기준 (수율 기준 PR B, 2026-10-16)
-- 서버 시작 시 ensureRequiredSchema 가 자동으로 만든다 (RUN_STARTUP_MIGRATIONS 기본). 수동 선적용이 필요할 때만 사용.
-- 기존 행 값은 바꾸지 않는다. mass_basis_enabled 기본 0 → 기존 배치 계산·출고는 그대로.

ALTER TABLE `h_mf_report_versions` ADD COLUMN `reference_finished_kg` decimal(12,3) NULL, ALGORITHM=INSTANT;
ALTER TABLE `h_mf_report_versions` ADD COLUMN `reference_raw_total_kg` decimal(12,3) NULL, ALGORITHM=INSTANT;
ALTER TABLE `h_mf_report_versions` ADD COLUMN `mass_basis_enabled` tinyint NOT NULL DEFAULT 0, ALGORITHM=INSTANT;
ALTER TABLE `h_mf_ingredients` ADD COLUMN `basis_raw_kg` decimal(12,4) NULL, ALGORITHM=INSTANT;
ALTER TABLE `h_mf_ingredients` ADD COLUMN `pretreatment_factor` decimal(6,4) NULL, ALGORITHM=INSTANT;

CREATE TABLE IF NOT EXISTS `h_batch_mass_basis` (
  `batch_id` bigint NOT NULL PRIMARY KEY,
  `tenant_id` int NOT NULL,
  `mf_report_version_id` bigint NOT NULL,
  `calc_version` varchar(30) NOT NULL,
  `reference_finished_kg` decimal(12,3) NOT NULL,
  `planned_finished_kg` decimal(12,3) NOT NULL,
  `multiplier` decimal(18,8) NOT NULL,
  `total_raw_kg` decimal(14,4) NOT NULL,
  `total_process_kg` decimal(14,4) NOT NULL,
  `rows_json` json NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_bmb_tenant_version` (`tenant_id`, `mf_report_version_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
