-- ════════════════════════════════════════════════════════════════
-- Step 18 (COMMIT) — checklist_templates 자동생성 컬럼 보강 (멱등)
--
-- ★ 먼저 step18_checklist_frequency_migration_dryrun.sql 을 실행해
--   "선행 조건: 테이블 존재 여부" 가 전부 EXISTS 인지 확인할 것.
--   하나라도 MISSING 이면 이 파일을 실행하지 말 것 (CREATE TABLE 부터 필요).
--
-- 멱등: 컬럼이 이미 있으면 'SELECT 1' 로 치환되어 아무 것도 하지 않는다.
--       여러 번 실행해도 안전하다.
-- 되돌리기: 추가된 컬럼은 DROP COLUMN 으로 제거 가능 (기존 데이터 무영향 —
--           신규 컬럼이라 기존 행은 전부 DEFAULT/NULL 이다).
-- ════════════════════════════════════════════════════════════════

-- ─── 1. checklist_templates.frequency ───
SET @s = (SELECT IF(COUNT(*) = 0,
  "ALTER TABLE `checklist_templates` ADD COLUMN `frequency` ENUM('daily','weekly','monthly','batch_create','batch_complete') NULL DEFAULT NULL",
  'SELECT ''skip: checklist_templates.frequency 이미 존재'' AS msg')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'checklist_templates' AND COLUMN_NAME = 'frequency');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ─── 2. checklist_templates.generation_mode ───
SET @s = (SELECT IF(COUNT(*) = 0,
  "ALTER TABLE `checklist_templates` ADD COLUMN `generation_mode` ENUM('manual','auto') NOT NULL DEFAULT 'manual'",
  'SELECT ''skip: generation_mode 이미 존재'' AS msg')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'checklist_templates' AND COLUMN_NAME = 'generation_mode');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ─── 3. checklist_templates.requires_approval ───
SET @s = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `checklist_templates` ADD COLUMN `requires_approval` TINYINT NULL DEFAULT 0',
  'SELECT ''skip: requires_approval 이미 존재'' AS msg')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'checklist_templates' AND COLUMN_NAME = 'requires_approval');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ─── 4. checklist_templates.requires_attachment ───
SET @s = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `checklist_templates` ADD COLUMN `requires_attachment` TINYINT NULL DEFAULT 0',
  'SELECT ''skip: requires_attachment 이미 존재'' AS msg')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'checklist_templates' AND COLUMN_NAME = 'requires_attachment');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ─── 5. checklist_templates.auto_trigger_rules ───
SET @s = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `checklist_templates` ADD COLUMN `auto_trigger_rules` JSON NULL DEFAULT NULL',
  'SELECT ''skip: auto_trigger_rules 이미 존재'' AS msg')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'checklist_templates' AND COLUMN_NAME = 'auto_trigger_rules');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ─── 6. checklist_instances.period_key ───
--   STEP 10 이 만든 인스턴스가 기간 필터 목록에서 누락되지 않게 하는 컬럼
SET @s = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `checklist_instances` ADD COLUMN `period_key` VARCHAR(50) NULL DEFAULT NULL',
  'SELECT ''skip: period_key 이미 존재'' AS msg')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'checklist_instances' AND COLUMN_NAME = 'period_key');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ─── 검증 ───
SELECT '=== 적용 후 상태 ===' AS section;
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND ((TABLE_NAME = 'checklist_templates'
        AND COLUMN_NAME IN ('frequency','generation_mode','requires_approval','requires_attachment','auto_trigger_rules'))
    OR (TABLE_NAME = 'checklist_instances' AND COLUMN_NAME = 'period_key'))
ORDER BY TABLE_NAME, COLUMN_NAME;
