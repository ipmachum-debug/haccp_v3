SET NAMES utf8mb4;
SET @saved_sql_mode = @@sql_mode;
SET sql_mode = '';

-- ============================================================
-- CCP 데이터 전면 수정: 제품명 + 작업일자
-- 문제 1: product_name이 h_products_v2에서 가져와 잘못 저장됨
-- 문제 2: work_date가 batch planned_date 대비 -1/-2일 오프셋
-- ============================================================

START TRANSACTION;

-- ════════════════════════════════════════════════════════════
-- Step 1: h_ccp_instances - 제품명 수정
-- product_name을 COALESCE(v1, v2) 기준으로 업데이트
-- ════════════════════════════════════════════════════════════
UPDATE h_ccp_instances ci
JOIN h_batches b ON b.id = ci.batch_id AND b.tenant_id = ci.tenant_id
LEFT JOIN h_products p1 ON p1.id = b.product_id AND p1.tenant_id = b.tenant_id
LEFT JOIN h_products_v2 p2 ON p2.id = b.product_id AND p2.tenant_id = b.tenant_id
SET ci.product_name = COALESCE(p1.product_name, p2.product_name)
WHERE ci.tenant_id = 2
  AND ci.product_name != COALESCE(p1.product_name, p2.product_name);

-- ════════════════════════════════════════════════════════════
-- Step 2: h_ccp_instances - 작업일자를 배치 planned_date로 수정
-- ════════════════════════════════════════════════════════════
UPDATE h_ccp_instances ci
JOIN h_batches b ON b.id = ci.batch_id AND b.tenant_id = ci.tenant_id
SET ci.work_date = b.planned_date
WHERE ci.tenant_id = 2
  AND ci.work_date != b.planned_date;

-- ════════════════════════════════════════════════════════════
-- Step 3: h_ccp_form_records - 제품명 수정
-- ════════════════════════════════════════════════════════════
UPDATE h_ccp_form_records fr
JOIN h_batches b ON b.id = fr.batch_id AND b.tenant_id = fr.tenant_id
LEFT JOIN h_products p1 ON p1.id = b.product_id AND p1.tenant_id = b.tenant_id
LEFT JOIN h_products_v2 p2 ON p2.id = b.product_id AND p2.tenant_id = b.tenant_id
SET fr.product_name = COALESCE(p1.product_name, p2.product_name)
WHERE fr.tenant_id = 2
  AND fr.product_name != COALESCE(p1.product_name, p2.product_name);

-- ════════════════════════════════════════════════════════════
-- Step 4: h_ccp_form_records - 작업일자를 배치 planned_date로 수정
-- ════════════════════════════════════════════════════════════
UPDATE h_ccp_form_records fr
JOIN h_batches b ON b.id = fr.batch_id AND b.tenant_id = fr.tenant_id
SET fr.work_date = b.planned_date
WHERE fr.tenant_id = 2
  AND fr.work_date != b.planned_date;

-- ════════════════════════════════════════════════════════════
-- Step 5: h_ccp_form_rows - 제품명 수정
-- form_record → batch → product 경로로 올바른 이름 가져옴
-- ════════════════════════════════════════════════════════════
UPDATE h_ccp_form_rows frw
JOIN h_ccp_form_records fr ON fr.id = frw.form_record_id AND fr.tenant_id = frw.tenant_id
JOIN h_batches b ON b.id = fr.batch_id AND b.tenant_id = fr.tenant_id
LEFT JOIN h_products p1 ON p1.id = b.product_id AND p1.tenant_id = b.tenant_id
LEFT JOIN h_products_v2 p2 ON p2.id = b.product_id AND p2.tenant_id = b.tenant_id
SET frw.product_name = COALESCE(p1.product_name, p2.product_name)
WHERE frw.tenant_id = 2
  AND frw.product_name IS NOT NULL
  AND frw.product_name != COALESCE(p1.product_name, p2.product_name);

-- ════════════════════════════════════════════════════════════
-- Step 6: h_ccp_instances - product_id도 배치 기준으로 동기화
-- ════════════════════════════════════════════════════════════
UPDATE h_ccp_instances ci
JOIN h_batches b ON b.id = ci.batch_id AND b.tenant_id = ci.tenant_id
SET ci.product_id = b.product_id
WHERE ci.tenant_id = 2
  AND ci.product_id != b.product_id;

-- ════════════════════════════════════════════════════════════
-- Step 7: h_ccp_form_records - product_id도 배치 기준으로 동기화
-- ════════════════════════════════════════════════════════════
UPDATE h_ccp_form_records fr
JOIN h_batches b ON b.id = fr.batch_id AND b.tenant_id = fr.tenant_id
SET fr.product_id = b.product_id
WHERE fr.tenant_id = 2
  AND fr.product_id != b.product_id;

COMMIT;

-- ════════════════════════════════════════════════════════════
-- Verification
-- ════════════════════════════════════════════════════════════
SELECT '=== h_ccp_instances 검증 ===' as label;
SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN ci.product_name != COALESCE(p1.product_name, p2.product_name) THEN 1 ELSE 0 END) as name_mismatch,
  SUM(CASE WHEN ci.work_date != b.planned_date THEN 1 ELSE 0 END) as date_mismatch
FROM h_ccp_instances ci
JOIN h_batches b ON b.id = ci.batch_id AND b.tenant_id = ci.tenant_id
LEFT JOIN h_products p1 ON p1.id = b.product_id AND p1.tenant_id = b.tenant_id
LEFT JOIN h_products_v2 p2 ON p2.id = b.product_id AND p2.tenant_id = b.tenant_id
WHERE ci.tenant_id = 2;

SELECT '=== h_ccp_form_records 검증 ===' as label;
SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN fr.product_name != COALESCE(p1.product_name, p2.product_name) THEN 1 ELSE 0 END) as name_mismatch,
  SUM(CASE WHEN fr.work_date != b.planned_date THEN 1 ELSE 0 END) as date_mismatch
FROM h_ccp_form_records fr
JOIN h_batches b ON b.id = fr.batch_id AND b.tenant_id = fr.tenant_id
LEFT JOIN h_products p1 ON p1.id = b.product_id AND p1.tenant_id = b.tenant_id
LEFT JOIN h_products_v2 p2 ON p2.id = b.product_id AND p2.tenant_id = b.tenant_id
WHERE fr.tenant_id = 2;

SELECT '=== h_ccp_form_rows 검증 ===' as label;
SELECT 
  COUNT(*) as total_rows,
  SUM(CASE WHEN frw.product_name IS NOT NULL AND frw.product_name != COALESCE(p1.product_name, p2.product_name) THEN 1 ELSE 0 END) as name_mismatch
FROM h_ccp_form_rows frw
JOIN h_ccp_form_records fr ON fr.id = frw.form_record_id AND fr.tenant_id = frw.tenant_id
JOIN h_batches b ON b.id = fr.batch_id AND b.tenant_id = fr.tenant_id
LEFT JOIN h_products p1 ON p1.id = b.product_id AND p1.tenant_id = b.tenant_id
LEFT JOIN h_products_v2 p2 ON p2.id = b.product_id AND p2.tenant_id = b.tenant_id
WHERE fr.tenant_id = 2;

SELECT '=== 3월 14일 샘플 확인 ===' as label;
SELECT ci.id, ci.work_date, ci.ccp_type, ci.product_name, ci.product_id, ci.batch_id, b.planned_date
FROM h_ccp_instances ci
JOIN h_batches b ON b.id = ci.batch_id
WHERE ci.tenant_id = 2 AND (ci.work_date = '2026-03-14' OR b.planned_date = '2026-03-14')
ORDER BY ci.id;

SET sql_mode = @saved_sql_mode;
