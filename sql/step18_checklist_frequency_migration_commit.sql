-- ════════════════════════════════════════════════════════════════
-- Step 18 (COMMIT) — checklist 자동생성 컬럼 보강 (멱등)
--
-- ★ 먼저 step18_checklist_schema_diagnose.sql 로 실측하고,
--   step18_checklist_frequency_migration_dryrun.sql 로 계획을 확인할 것.
--
-- 멱등 + 3단 가드:
--   1) 대상 테이블이 없으면        → skip (에러 아님)
--   2) 컬럼이 이미 있으면          → skip
--   3) 테이블 있고 컬럼 없으면     → ALTER 실행
--
--   ※ 테이블 부재를 가드하지 않으면 ER_NO_SUCH_TABLE 로 스크립트가 중간에
--     죽어 앞 구문만 적용된 부분 적용 상태가 된다. 그래서 컬럼뿐 아니라
--     테이블 존재까지 확인한다.
--
-- 여러 번 실행해도 안전하다.
-- 되돌리기: 추가된 컬럼은 DROP COLUMN 으로 제거 가능
--           (신규 컬럼이라 기존 행은 전부 DEFAULT/NULL — 데이터 무영향).
-- ════════════════════════════════════════════════════════════════

-- ─── 1. checklist_templates.frequency ───
--   배치 파이프라인 STEP 10 의 트리거 조건
SET @s = (SELECT CASE
  WHEN (SELECT COUNT(*) FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'checklist_templates') = 0
    THEN 'SELECT ''skip: checklist_templates 테이블 없음 — CREATE TABLE 필요'' AS msg'
  WHEN (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'checklist_templates' AND COLUMN_NAME = 'frequency') > 0
    THEN 'SELECT ''skip: checklist_templates.frequency 이미 존재'' AS msg'
  ELSE "ALTER TABLE `checklist_templates` ADD COLUMN `frequency` ENUM('daily','weekly','monthly','batch_create','batch_complete') NULL DEFAULT NULL"
END);
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- ─── 2. checklist_templates.generation_mode ───
--   수동/자동 생성 구분
SET @s = (SELECT CASE
  WHEN (SELECT COUNT(*) FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'checklist_templates') = 0
    THEN 'SELECT ''skip: checklist_templates 테이블 없음 — CREATE TABLE 필요'' AS msg'
  WHEN (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'checklist_templates' AND COLUMN_NAME = 'generation_mode') > 0
    THEN 'SELECT ''skip: checklist_templates.generation_mode 이미 존재'' AS msg'
  ELSE "ALTER TABLE `checklist_templates` ADD COLUMN `generation_mode` ENUM('manual','auto') NOT NULL DEFAULT 'manual'"
END);
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- ─── 3. checklist_templates.requires_approval ───
--   승인 필요 여부
SET @s = (SELECT CASE
  WHEN (SELECT COUNT(*) FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'checklist_templates') = 0
    THEN 'SELECT ''skip: checklist_templates 테이블 없음 — CREATE TABLE 필요'' AS msg'
  WHEN (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'checklist_templates' AND COLUMN_NAME = 'requires_approval') > 0
    THEN 'SELECT ''skip: checklist_templates.requires_approval 이미 존재'' AS msg'
  ELSE "ALTER TABLE `checklist_templates` ADD COLUMN `requires_approval` TINYINT NULL DEFAULT 0"
END);
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- ─── 4. checklist_templates.requires_attachment ───
--   첨부 필요 여부
SET @s = (SELECT CASE
  WHEN (SELECT COUNT(*) FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'checklist_templates') = 0
    THEN 'SELECT ''skip: checklist_templates 테이블 없음 — CREATE TABLE 필요'' AS msg'
  WHEN (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'checklist_templates' AND COLUMN_NAME = 'requires_attachment') > 0
    THEN 'SELECT ''skip: checklist_templates.requires_attachment 이미 존재'' AS msg'
  ELSE "ALTER TABLE `checklist_templates` ADD COLUMN `requires_attachment` TINYINT NULL DEFAULT 0"
END);
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- ─── 5. checklist_templates.auto_trigger_rules ───
--   자동 생성 규칙
SET @s = (SELECT CASE
  WHEN (SELECT COUNT(*) FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'checklist_templates') = 0
    THEN 'SELECT ''skip: checklist_templates 테이블 없음 — CREATE TABLE 필요'' AS msg'
  WHEN (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'checklist_templates' AND COLUMN_NAME = 'auto_trigger_rules') > 0
    THEN 'SELECT ''skip: checklist_templates.auto_trigger_rules 이미 존재'' AS msg'
  ELSE "ALTER TABLE `checklist_templates` ADD COLUMN `auto_trigger_rules` JSON NULL DEFAULT NULL"
END);
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- ─── 6. checklist_instances.period_key ───
--   기간 필터 목록 노출 키 (없으면 생성돼도 화면에서 누락)
SET @s = (SELECT CASE
  WHEN (SELECT COUNT(*) FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'checklist_instances') = 0
    THEN 'SELECT ''skip: checklist_instances 테이블 없음 — CREATE TABLE 필요'' AS msg'
  WHEN (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'checklist_instances' AND COLUMN_NAME = 'period_key') > 0
    THEN 'SELECT ''skip: checklist_instances.period_key 이미 존재'' AS msg'
  ELSE "ALTER TABLE `checklist_instances` ADD COLUMN `period_key` VARCHAR(50) NULL DEFAULT NULL"
END);
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ─── 적용 후 검증 ───
SELECT '=== 적용 후 상태 ===' AS section;
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND ((TABLE_NAME = 'checklist_templates'
        AND COLUMN_NAME IN ('frequency','generation_mode','requires_approval','requires_attachment','auto_trigger_rules'))
    OR (TABLE_NAME = 'checklist_instances' AND COLUMN_NAME = 'period_key'))
ORDER BY TABLE_NAME, COLUMN_NAME;

-- 남은 미적용 항목 (테이블 부재로 skip 된 것이 있으면 여기 표시된다)
SELECT '=== 미적용 항목 (있으면 CREATE TABLE 필요) ===' AS section;
SELECT need.tbl AS table_name, need.col AS column_name,
       IF((SELECT COUNT(*) FROM information_schema.TABLES
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = need.tbl) = 0,
          'TABLE MISSING', 'COLUMN STILL MISSING') AS reason
FROM (
  SELECT 'checklist_templates' AS tbl, 'frequency' AS col
  UNION ALL SELECT 'checklist_templates', 'generation_mode'
  UNION ALL SELECT 'checklist_templates', 'requires_approval'
  UNION ALL SELECT 'checklist_templates', 'requires_attachment'
  UNION ALL SELECT 'checklist_templates', 'auto_trigger_rules'
  UNION ALL SELECT 'checklist_instances', 'period_key'
) need
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.COLUMNS c
  WHERE c.TABLE_SCHEMA = DATABASE() AND c.TABLE_NAME = need.tbl AND c.COLUMN_NAME = need.col
);
