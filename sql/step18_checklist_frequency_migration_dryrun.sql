-- ════════════════════════════════════════════════════════════════
-- Step 18 (DRY-RUN) — checklist_templates 자동생성 컬럼 보강
--
-- 목적: 배치 파이프라인 STEP 10 이 요구하는 컬럼을 실제 DB 에 맞춘다.
--       저장소 마이그레이션에 CREATE/ADD 가 없어 drift 가능성이 있으므로
--       information_schema 를 확인해 **없을 때만** 추가하는 멱등 스크립트.
--
-- 이 파일은 실행 계획만 출력한다. ALTER 를 수행하지 않는다.
-- 실제 적용은 step18_checklist_frequency_migration_commit.sql 을 사용할 것.
-- ════════════════════════════════════════════════════════════════

SELECT '=== DRY-RUN: 적용될 ALTER 문 목록 ===' AS section;

SELECT
  need.tbl                                    AS table_name,
  need.col                                    AS column_name,
  IF(c.COLUMN_NAME IS NULL, 'WILL ADD', 'SKIP (이미 존재)') AS action,
  IF(c.COLUMN_NAME IS NULL,
     CONCAT('ALTER TABLE `', need.tbl, '` ADD COLUMN `', need.col, '` ', need.ddl),
     CONCAT('-- 현재 타입: ', c.COLUMN_TYPE))  AS statement
FROM (
  SELECT 'checklist_templates' AS tbl, 'frequency' AS col,
         "ENUM('daily','weekly','monthly','batch_create','batch_complete') NULL DEFAULT NULL" AS ddl
  UNION ALL SELECT 'checklist_templates', 'generation_mode',
         "ENUM('manual','auto') NOT NULL DEFAULT 'manual'"
  UNION ALL SELECT 'checklist_templates', 'requires_approval',
         "TINYINT NULL DEFAULT 0"
  UNION ALL SELECT 'checklist_templates', 'requires_attachment',
         "TINYINT NULL DEFAULT 0"
  UNION ALL SELECT 'checklist_templates', 'auto_trigger_rules',
         "JSON NULL DEFAULT NULL"
  UNION ALL SELECT 'checklist_instances', 'period_key',
         "VARCHAR(50) NULL DEFAULT NULL"
) need
LEFT JOIN information_schema.COLUMNS c
  ON c.TABLE_SCHEMA = DATABASE()
 AND c.TABLE_NAME   = need.tbl
 AND c.COLUMN_NAME  = need.col
ORDER BY need.tbl, need.col;

-- 선행 조건 확인: 대상 테이블이 존재하는가?
-- (하나라도 MISSING 이면 commit 을 실행하지 말 것 — CREATE TABLE 부터 필요)
SELECT '=== 선행 조건: 테이블 존재 여부 ===' AS section;
SELECT t.name AS required_table,
       IF(EXISTS(SELECT 1 FROM information_schema.TABLES
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = t.name),
          'EXISTS', '*** MISSING — commit 중단 ***') AS status
FROM (SELECT 'checklist_templates' AS name
      UNION ALL SELECT 'checklist_template_items'
      UNION ALL SELECT 'checklist_instances'
      UNION ALL SELECT 'checklist_instance_items') t;
