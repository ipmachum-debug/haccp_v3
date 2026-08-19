-- ════════════════════════════════════════════════════════════════
-- Step 18 (DRY-RUN) — checklist 자동생성 컬럼 보강 계획 출력
--
-- 이 파일은 SELECT 만 수행한다. ALTER 를 실행하지 않는다.
-- commit 파일과 **동일한 3단 판정**을 사용하므로, 여기 나온 action 이
-- 그대로 commit 에서 수행된다 (계획과 실행이 어긋나지 않는다).
--
--   TABLE MISSING → skip   (에러 아님. CREATE TABLE 이 선행돼야 함)
--   COLUMN EXISTS → skip
--   그 외          → WILL ADD
-- ════════════════════════════════════════════════════════════════

SELECT '=== [1] 선행 조건: 대상 테이블 존재 여부 ===' AS section;
SELECT t.name AS required_table,
       IF(EXISTS(SELECT 1 FROM information_schema.TABLES
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = t.name),
          'EXISTS', '*** MISSING ***') AS status,
       IF(EXISTS(SELECT 1 FROM information_schema.TABLES
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = t.name),
          '', 'commit 은 이 테이블 관련 구문을 skip 합니다 (중단되지 않음)') AS note
FROM (SELECT 'checklist_templates' AS name
      UNION ALL SELECT 'checklist_template_items'
      UNION ALL SELECT 'checklist_instances'
      UNION ALL SELECT 'checklist_instance_items') t
ORDER BY t.name;

SELECT '=== [2] 적용 계획 (commit 과 동일 판정) ===' AS section;
SELECT
  need.tbl AS table_name,
  need.col AS column_name,
  CASE
    WHEN (SELECT COUNT(*) FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = need.tbl) = 0
      THEN 'SKIP (테이블 없음)'
    WHEN c.COLUMN_NAME IS NOT NULL
      THEN 'SKIP (컬럼 이미 존재)'
    ELSE 'WILL ADD'
  END AS action,
  CASE
    WHEN (SELECT COUNT(*) FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = need.tbl) = 0
      THEN CONCAT('-- CREATE TABLE `', need.tbl, '` 선행 필요')
    WHEN c.COLUMN_NAME IS NOT NULL
      THEN CONCAT('-- 현재 타입: ', c.COLUMN_TYPE)
    ELSE CONCAT('ALTER TABLE `', need.tbl, '` ADD COLUMN `', need.col, '` ', need.ddl)
  END AS statement
FROM (
  SELECT 'checklist_templates' AS tbl, 'frequency' AS col,
         "ENUM('daily','weekly','monthly','batch_create','batch_complete') NULL DEFAULT NULL" AS ddl
  UNION ALL SELECT 'checklist_templates', 'generation_mode',
         "ENUM('manual','auto') NOT NULL DEFAULT 'manual'"
  UNION ALL SELECT 'checklist_templates', 'requires_approval',   'TINYINT NULL DEFAULT 0'
  UNION ALL SELECT 'checklist_templates', 'requires_attachment', 'TINYINT NULL DEFAULT 0'
  UNION ALL SELECT 'checklist_templates', 'auto_trigger_rules',  'JSON NULL DEFAULT NULL'
  UNION ALL SELECT 'checklist_instances', 'period_key',          'VARCHAR(50) NULL DEFAULT NULL'
) need
LEFT JOIN information_schema.COLUMNS c
  ON c.TABLE_SCHEMA = DATABASE()
 AND c.TABLE_NAME   = need.tbl
 AND c.COLUMN_NAME  = need.col
ORDER BY need.tbl, need.col;

SELECT '=== [3] 판정 요약 ===' AS section;
SELECT
  SUM(action = 'WILL ADD')            AS will_add,
  SUM(action = 'SKIP (컬럼 이미 존재)') AS skip_exists,
  SUM(action = 'SKIP (테이블 없음)')    AS skip_no_table,
  IF(SUM(action = 'SKIP (테이블 없음)') > 0,
     '테이블 부재 항목 있음 → TODO #2 설계 재검토 필요',
     'commit 실행 가능') AS verdict
FROM (
  SELECT CASE
    WHEN (SELECT COUNT(*) FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = need.tbl) = 0 THEN 'SKIP (테이블 없음)'
    WHEN c.COLUMN_NAME IS NOT NULL THEN 'SKIP (컬럼 이미 존재)'
    ELSE 'WILL ADD' END AS action
  FROM (
    SELECT 'checklist_templates' AS tbl, 'frequency' AS col
    UNION ALL SELECT 'checklist_templates', 'generation_mode'
    UNION ALL SELECT 'checklist_templates', 'requires_approval'
    UNION ALL SELECT 'checklist_templates', 'requires_attachment'
    UNION ALL SELECT 'checklist_templates', 'auto_trigger_rules'
    UNION ALL SELECT 'checklist_instances', 'period_key'
  ) need
  LEFT JOIN information_schema.COLUMNS c
    ON c.TABLE_SCHEMA = DATABASE() AND c.TABLE_NAME = need.tbl AND c.COLUMN_NAME = need.col
) x;
