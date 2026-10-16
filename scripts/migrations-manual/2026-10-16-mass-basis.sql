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

-- 회사별 기능 선택 (PR C 후속, 2026-10-16) — 수율 보정 방식은 회사가 선택, 기본 꺼짐
CREATE TABLE IF NOT EXISTS `tenant_feature_settings` (
  `tenant_id` int NOT NULL,
  `feature_code` varchar(60) NOT NULL,
  `enabled` tinyint NOT NULL DEFAULT 0,
  `updated_by` bigint NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`tenant_id`, `feature_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- 이미 레시피에서 기준 사용을 켠 회사는 켜진 상태로 이어받음
INSERT IGNORE INTO `tenant_feature_settings` (`tenant_id`, `feature_code`, `enabled`)
  SELECT DISTINCT `tenant_id`, 'PRODUCTION_MASS_BASIS', 1 FROM `h_mf_report_versions` WHERE `mass_basis_enabled` = 1;
