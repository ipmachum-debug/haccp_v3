-- ============================================================
-- Step 7 DRY-RUN: 마카다미아왕찹쌀떡(혼합)-흰 신규 등록 + report_no 통일
-- ============================================================
-- 정책:
--   - 마카다미아왕찹쌀떡(혼합) 4종(흰/단호박/복분자/쑥) 1개 보고서 묶음
--   - 흰은 단품용/혼합용 분리 (혼합용은 별도 신규 제품)
--   - 묶음 report_no = '20210212055310'
--
-- 작업:
--   (1) item_master:    item_code=30093, '마카다미아왕찹쌀떡(혼합)-흰' (own_product)
--   (2) h_products_v2:  canonical sync (PR #268 패턴, id=동일)
--   (3) h_products SKU: PROD-048 (찹쌀떡 카테고리)
--   (4) h_mf_reports:   report_no='20210212055310', product_id=신규
--   (5) h_mf_report_versions: v1 (report 344 v2/471 BOM 복사, batch_target_kg=105.00)
--   (6) h_mf_ingredients: 14 lines (report 344 v2와 완전 동일)
--   (7) h_mf_reports UPDATE: 345/346/347 → report_no='20210212055310'
--
-- 원재료(14종, 마카다미아왕찹쌀떡(백) v2/471 동일):
--   293=MAT-103 통팥앙금ML 33.4%
--   198=MAT-067 찹쌀         24.4%
--   258=MAT-086 찰옥수수전분 12.2%
--   168=MAT-037 멥쌀          9.7%
--   191=MAT-060 정제수        6.1% (deduct=0)
--   170=MAT-039 물엿          3.5%
--   177=MAT-046 설탕          3.5%
--   186=MAT-055 옥수수전분    2.8%
--   167=MAT-036 마카다미아분태 1.8%
--   199=MAT-068 천일염        0.8%
--   206=MAT-075 호두분태      0.6%
--   171=MAT-040 밤다이스      0.6%
--   209=MAT-078 떡용에스텔    0.4%
--   196=MAT-065 중력분        0.2%
--   합계: 100.0%
-- ============================================================

START TRANSACTION;

-- =================== (1) item_master: 신규 own_product ===================
INSERT INTO item_master (tenant_id, item_code, item_name, item_type, category, base_unit, is_active, description)
VALUES (2, '30093', '마카다미아왕찹쌀떡(혼합)-흰', 'own_product', '찹쌀떡', 'kg', 1, 'v5 신규 - 혼합세트용 흰 (4종 묶음 reportNo 20210212055310)');

SET @new_item_id = LAST_INSERT_ID();
SELECT @new_item_id AS new_item_id;

-- =================== (2) h_products_v2: canonical sync (PR #268) ===================
-- id를 item_master와 동일하게 강제 (canonical sync)
-- 주의: h_products_v2 컬럼 = id, tenant_id, product_code, product_name, version,
--       category, unit (NOT base_unit), shelf_life_days, description, is_active, created_at
INSERT INTO h_products_v2 (id, tenant_id, product_code, product_name, category, unit, is_active, created_at)
VALUES (@new_item_id, 2, '30093', '마카다미아왕찹쌀떡(혼합)-흰', '찹쌀떡', 'kg', 1, NOW());

-- =================== (3) h_products SKU: PROD-048 ===================
INSERT INTO h_products (tenant_id, product_code, product_name, category, unit, is_active)
VALUES (2, 'PROD-048', '마카다미아왕찹쌀떡(혼합)-흰', '찹쌀떡', 'kg', 1);

-- =================== (4) h_mf_reports: 신규 보고서 ===================
INSERT INTO h_mf_reports (tenant_id, product_id, report_no, report_date, status)
VALUES (2, @new_item_id, '20210212055310', CURDATE(), 'ACTIVE');

SET @new_report_id = LAST_INSERT_ID();
SELECT @new_report_id AS new_report_id;

-- =================== (5) h_mf_report_versions: v1 (report 344 v2/471 BOM 복사) ===================
INSERT INTO h_mf_report_versions
  (mf_report_id, version_no, effective_from, change_reason, approval_status,
   composition_total_rule, yield_basis, batch_target_kg,
   created_by, approved_by, approved_at, tenant_id)
VALUES
  (@new_report_id, 1, CURDATE(),
   '마이그레이션: 마카다미아왕찹쌀떡(혼합)-흰 (3종세트용, 백 BOM 복사)',
   'APPROVED', '100%', 'PER_BATCH_KG', 105.00,
   4, 4, NOW(), 2);

SET @new_ver_id = LAST_INSERT_ID();
SELECT @new_ver_id AS new_version_id;

-- =================== (6) h_mf_ingredients: 14 lines (report 344 v2/471 완전 복사) ===================
INSERT INTO h_mf_ingredients
  (mf_report_version_id, line_no, material_id, quantity, unit, is_deductible, material_type)
VALUES
  (@new_ver_id,  1, 293, '33.4', '%', 1, 'RAW'),
  (@new_ver_id,  2, 198, '24.4', '%', 1, 'RAW'),
  (@new_ver_id,  3, 258, '12.2', '%', 1, 'RAW'),
  (@new_ver_id,  4, 168,  '9.7', '%', 1, 'RAW'),
  (@new_ver_id,  5, 191,  '6.1', '%', 0, 'RAW'),
  (@new_ver_id,  6, 170,  '3.5', '%', 1, 'RAW'),
  (@new_ver_id,  7, 177,  '3.5', '%', 1, 'RAW'),
  (@new_ver_id,  8, 186,  '2.8', '%', 1, 'RAW'),
  (@new_ver_id,  9, 167,  '1.8', '%', 1, 'RAW'),
  (@new_ver_id, 10, 199,  '0.8', '%', 1, 'RAW'),
  (@new_ver_id, 11, 206,  '0.6', '%', 1, 'RAW'),
  (@new_ver_id, 12, 171,  '0.6', '%', 1, 'RAW'),
  (@new_ver_id, 13, 209,  '0.4', '%', 1, 'RAW'),
  (@new_ver_id, 14, 196,  '0.2', '%', 1, 'RAW');

-- =================== (7) report_no 통일 (345/346/347 → 20210212055310) ===================
-- 주의: report 344(흰-단품)는 그대로 두고, 새로 만든 흰(혼합)이 묶음 대표
UPDATE h_mf_reports SET report_no = '20210212055310'
WHERE id = 345 AND tenant_id = 2;  -- 마카다미아왕찹쌀떡(단호박)
UPDATE h_mf_reports SET report_no = '20210212055310'
WHERE id = 346 AND tenant_id = 2;  -- 마카다미아왕찹쌀떡(복분자)
UPDATE h_mf_reports SET report_no = '20210212055310'
WHERE id = 347 AND tenant_id = 2;  -- 마카다미아쑥왕찹쌀떡

-- =================== 검증 쿼리 ===================
-- 1) 신규 아이템 확인
SELECT 'item_master' AS tbl, id, item_code, item_name, item_type, category, is_active
FROM item_master WHERE id = @new_item_id;

-- 2) h_products_v2 canonical sync 확인
SELECT 'h_products_v2' AS tbl, id, product_code, product_name, category, unit, is_active
FROM h_products_v2 WHERE id = @new_item_id;

-- 3) h_products SKU 확인
SELECT 'h_products' AS tbl, id, product_code, product_name, category, unit, is_active
FROM h_products WHERE tenant_id = 2 AND product_code = 'PROD-048';

-- 4) 신규 보고서 + BOM 합계 확인
SELECT
  mr.id AS report_id,
  mr.report_no,
  mr.product_id,
  im.item_code,
  im.item_name,
  v.id AS version_id,
  v.version_no,
  v.batch_target_kg,
  v.change_reason,
  COUNT(i.id) AS line_count,
  ROUND(SUM(CAST(i.quantity AS DECIMAL(10,2))), 2) AS pct_total
FROM h_mf_reports mr
LEFT JOIN item_master im ON mr.product_id = im.id
LEFT JOIN h_mf_report_versions v ON v.mf_report_id = mr.id
LEFT JOIN h_mf_ingredients i ON i.mf_report_version_id = v.id
WHERE mr.id = @new_report_id
GROUP BY mr.id, mr.report_no, mr.product_id, im.item_code, im.item_name,
         v.id, v.version_no, v.batch_target_kg, v.change_reason;

-- 5) 4종 묶음 확인 (report_no=20210212055310)
SELECT
  mr.id AS report_id,
  mr.report_no,
  im.item_code,
  im.item_name,
  mr.status
FROM h_mf_reports mr
LEFT JOIN item_master im ON mr.product_id = im.id
WHERE mr.tenant_id = 2 AND mr.report_no = '20210212055310'
ORDER BY mr.id;

-- 6) 단품 흰(report 344)이 그대로 유지되는지 확인
SELECT
  mr.id AS report_id,
  mr.report_no,
  im.item_code,
  im.item_name,
  '단품용 (혼합 묶음에 포함되지 않아야 함)' AS note
FROM h_mf_reports mr
LEFT JOIN item_master im ON mr.product_id = im.id
WHERE mr.id = 344;

-- DRY-RUN: 모든 변경 롤백
ROLLBACK;

SELECT 'DRY-RUN COMPLETED — ROLLBACK 됨. 결과 확인 후 commit 버전 실행하세요.' AS status;
