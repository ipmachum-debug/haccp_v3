-- ════════════════════════════════════════════════════════════════
-- Step 18 (진단, READ-ONLY) — 체크리스트 테이블 스키마 실측
--
-- 배경:
--   배치 파이프라인 STEP 10 (autoCreateChecklistsForBatch) 은
--   checklist_templates.frequency = 'batch_create' 인 템플릿만 인스턴스화한다.
--   그런데 저장소의 마이그레이션 어디에도 이 컬럼을 만드는 SQL 이 없다.
--     - checklist_templates 를 CREATE TABLE 하는 마이그레이션: 없음
--     - frequency / generation_mode 를 ADD COLUMN 하는 마이그레이션: 없음
--     - drizzle/0001~0008 은 전부 placeholder (빈 스텁)
--     - 0042 는 ALTER TABLE checklist_templates ADD tenant_id 만 수행
--   → drizzle 스키마/스냅샷은 컬럼을 갖고 있으나 실제 DB 는 따라가지 않은 drift 가능성.
--
--   또한 h_checklist_templates (별개 테이블) 는 template_type / template_name 을 갖는다.
--   "frequency 없고 template_type 만 있다" 는 관찰은 이 h_ 테이블을 본 것일 수 있어
--   두 테이블을 함께 덤프해 구분한다.
--
-- 이 파일은 SELECT 만 수행한다. 데이터/스키마를 변경하지 않는다.
-- ════════════════════════════════════════════════════════════════

-- [1] 대상 테이블 존재 여부
SELECT '[1] 테이블 존재 여부' AS section;
SELECT
  t.name                                        AS expected_table,
  IF(c.TABLE_NAME IS NULL, 'MISSING', 'EXISTS')  AS status,
  COALESCE(c.col_count, 0)                       AS column_count
FROM (
  SELECT 'checklist_templates'      AS name UNION ALL
  SELECT 'checklist_template_items'         UNION ALL
  SELECT 'checklist_instances'              UNION ALL
  SELECT 'checklist_instance_items'         UNION ALL
  SELECT 'h_checklist_templates'
) t
LEFT JOIN (
  SELECT TABLE_NAME, COUNT(*) AS col_count
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
  GROUP BY TABLE_NAME
) c ON c.TABLE_NAME = t.name
ORDER BY t.name;

-- [2] 전체 컬럼 덤프 (판정 근거)
SELECT '[2] 컬럼 전체 덤프' AS section;
SELECT TABLE_NAME, ORDINAL_POSITION, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN (
    'checklist_templates', 'checklist_template_items',
    'checklist_instances', 'checklist_instance_items',
    'h_checklist_templates'
  )
ORDER BY TABLE_NAME, ORDINAL_POSITION;

-- [3] PR #420 이 필요로 하는 컬럼의 존재 여부 (핵심 판정)
SELECT '[3] PR #420 필요 컬럼 판정' AS section;
SELECT
  need.tbl                                       AS table_name,
  need.col                                       AS column_name,
  IF(c.COLUMN_NAME IS NULL, 'MISSING', 'OK')     AS status,
  c.COLUMN_TYPE                                  AS actual_type
FROM (
  SELECT 'checklist_templates'      AS tbl, 'frequency'           AS col UNION ALL
  SELECT 'checklist_templates',           'generation_mode'            UNION ALL
  SELECT 'checklist_templates',           'requires_approval'          UNION ALL
  SELECT 'checklist_templates',           'requires_attachment'        UNION ALL
  SELECT 'checklist_templates',           'auto_trigger_rules'         UNION ALL
  SELECT 'checklist_templates',           'priority'                   UNION ALL
  SELECT 'checklist_templates',           'ccp_type'                   UNION ALL
  SELECT 'checklist_templates',           'tenant_id'                  UNION ALL
  SELECT 'checklist_template_items',      'tenant_id'                  UNION ALL
  SELECT 'checklist_instances',           'tenant_id'                  UNION ALL
  SELECT 'checklist_instances',           'period_key'                 UNION ALL
  SELECT 'checklist_instances',           'target_date'                UNION ALL
  SELECT 'checklist_instance_items',      'tenant_id'
) need
LEFT JOIN information_schema.COLUMNS c
  ON c.TABLE_SCHEMA = DATABASE()
 AND c.TABLE_NAME   = need.tbl
 AND c.COLUMN_NAME  = need.col
ORDER BY need.tbl, need.col;

-- [4] 현재 템플릿 실태 (frequency 가 있을 때만 의미 있음 — 없으면 에러 대신 0건)
SELECT '[4] 테넌트별 템플릿 수' AS section;
SELECT tenant_id, COUNT(*) AS template_count, SUM(is_active = 1) AS active_count
FROM checklist_templates
GROUP BY tenant_id
ORDER BY tenant_id;
