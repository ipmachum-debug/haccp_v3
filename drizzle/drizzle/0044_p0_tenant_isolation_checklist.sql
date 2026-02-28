-- ============================================================================
-- Migration: 0044_p0_tenant_isolation_checklist
-- 목적: P0 보안 수정 - 체크리스트 테이블에 tenant_id 컬럼 추가
--
-- 변경 내용:
--   1. checklist_templates   - tenant_id 컬럼 추가 (NOT NULL)
--   2. checklist_schedules   - tenant_id 컬럼 추가 (NOT NULL)
--   3. checklist_instances   - tenant_id 컬럼 추가 (NOT NULL)
--   4. 각 테이블에 tenant_id 기반 복합 인덱스 추가
--
-- 주의:
--   - 기존 데이터 마이그레이션이 필요합니다.
--   - 적용 전 tenants 테이블 및 기존 레코드의 소유 테넌트를 확인하세요.
--   - 단일 테넌트 환경에서는 DEFAULT 값을 실제 테넌트 ID로 설정하세요.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 1: checklist_templates 에 tenant_id 추가
-- ─────────────────────────────────────────────────────────────────────────────

-- 컬럼 추가 (기존 행은 NULL 허용, 이후 데이터 마이그레이션 후 NOT NULL로 변경)
ALTER TABLE `checklist_templates`
  ADD COLUMN `tenant_id` BIGINT NULL AFTER `id`;

-- 기존 데이터 마이그레이션: 단일 테넌트라면 해당 ID로 일괄 업데이트
-- ⚠️ 실제 환경에 맞게 수정 필요 (예: UPDATE checklist_templates SET tenant_id = 1)
-- UPDATE `checklist_templates` SET `tenant_id` = <your_tenant_id> WHERE `tenant_id` IS NULL;

-- 마이그레이션 완료 후 NOT NULL 제약 추가
-- (데이터 마이그레이션 후 아래 ALTER 실행)
-- ALTER TABLE `checklist_templates` MODIFY COLUMN `tenant_id` BIGINT NOT NULL;

-- 인덱스 추가
ALTER TABLE `checklist_templates`
  ADD INDEX `idx_checklist_template_tenant` (`tenant_id`),
  ADD INDEX `idx_checklist_template_tenant_active` (`tenant_id`, `is_active`);

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 2: checklist_schedules 에 tenant_id 추가
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE `checklist_schedules`
  ADD COLUMN `tenant_id` BIGINT NULL AFTER `id`;

-- 기존 데이터 마이그레이션 (template 소유 테넌트에서 가져오기)
-- UPDATE `checklist_schedules` cs
--   JOIN `checklist_templates` ct ON cs.template_id = ct.id
--   SET cs.tenant_id = ct.tenant_id
--   WHERE cs.tenant_id IS NULL;

-- 인덱스 추가
ALTER TABLE `checklist_schedules`
  ADD INDEX `idx_schedule_tenant` (`tenant_id`),
  ADD INDEX `idx_schedule_tenant_active` (`tenant_id`, `active`),
  ADD INDEX `idx_schedule_tenant_template` (`tenant_id`, `template_id`);

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 3: checklist_instances 에 tenant_id 추가
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE `checklist_instances`
  ADD COLUMN `tenant_id` BIGINT NULL AFTER `id`;

-- 기존 데이터 마이그레이션 (template 소유 테넌트에서 가져오기)
-- UPDATE `checklist_instances` ci
--   JOIN `checklist_templates` ct ON ci.template_id = ct.id
--   SET ci.tenant_id = ct.tenant_id
--   WHERE ci.tenant_id IS NULL;

-- 인덱스 추가
ALTER TABLE `checklist_instances`
  ADD INDEX `idx_checklist_instance_tenant` (`tenant_id`),
  ADD INDEX `idx_checklist_instance_tenant_status` (`tenant_id`, `status`);

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 4: 검증 쿼리 (적용 후 실행하여 확인)
-- ─────────────────────────────────────────────────────────────────────────────

-- NULL인 레코드 확인
-- SELECT 'checklist_templates' AS tbl, COUNT(*) AS null_tenant FROM checklist_templates WHERE tenant_id IS NULL
-- UNION ALL
-- SELECT 'checklist_schedules', COUNT(*) FROM checklist_schedules WHERE tenant_id IS NULL
-- UNION ALL
-- SELECT 'checklist_instances', COUNT(*) FROM checklist_instances WHERE tenant_id IS NULL;
