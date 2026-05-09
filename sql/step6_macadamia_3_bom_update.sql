-- ============================================================
-- Step 6: 마카다미아왕찹쌀떡 3종 (백/호박/복분자) BOM v1 UPDATE in-place
-- ============================================================
-- 패턴: 마카다미아쑥왕찹쌀떡(report 347) v1 마이그레이션과 동일
--   - h_mf_report_versions: batch_target_kg, change_reason 갱신 (version_no=1 유지)
--   - h_mf_ingredients: 기존 삭제 + 신규 INSERT (line_no = 비율 내림차순)
--   - 정제수만 is_deductible=0, 나머지 1
-- 대상:
--   - report 344 (백, version_id=348, 14라인, target 105.0 kg)
--   - report 345 (호박, version_id=349, 16라인, target 108.02 kg)
--   - report 346 (복분자, version_id=350, 15라인, target 105.91 kg)
-- ============================================================

START TRANSACTION;

-- =================== (1) 마카다미아왕찹쌀떡(백) report 344 v1 ===================
UPDATE h_mf_report_versions
SET batch_target_kg = 105.00,
    change_reason   = '마이그레이션: 마카다미아왕찹쌀떡(백)'
WHERE id = 348 AND mf_report_id = 344 AND version_no = 1;

DELETE FROM h_mf_ingredients WHERE mf_report_version_id = 348;

INSERT INTO h_mf_ingredients
  (mf_report_version_id, line_no, material_id, quantity, unit, is_deductible, material_type)
VALUES
  (348,  1, 293, '33.4', '%', 1, 'RAW'),  -- 통팥앙금ML
  (348,  2, 198, '24.4', '%', 1, 'RAW'),  -- 찹쌀(국내산)
  (348,  3, 258, '12.2', '%', 1, 'RAW'),  -- 찰옥수수전분
  (348,  4, 168,  '9.7', '%', 1, 'RAW'),  -- 멥쌀(국내산)
  (348,  5, 191,  '6.1', '%', 0, 'RAW'),  -- 정제수 (차감제외)
  (348,  6, 170,  '3.5', '%', 1, 'RAW'),  -- 물엿(저당물엿)
  (348,  7, 177,  '3.5', '%', 1, 'RAW'),  -- 설탕
  (348,  8, 186,  '2.8', '%', 1, 'RAW'),  -- 옥수수전분
  (348,  9, 167,  '1.8', '%', 1, 'RAW'),  -- 마카다미아분태(호주산)
  (348, 10, 199,  '0.8', '%', 1, 'RAW'),  -- 천일염
  (348, 11, 206,  '0.6', '%', 1, 'RAW'),  -- 호두분태(미국산)
  (348, 12, 171,  '0.6', '%', 1, 'RAW'),  -- 밤다이스
  (348, 13, 209,  '0.4', '%', 1, 'RAW'),  -- 혼합제제(떡용에스텔)
  (348, 14, 196,  '0.2', '%', 1, 'RAW'); -- 중력분

-- =================== (2) 마카다미아왕찹쌀떡(호박) report 345 v1 ===================
UPDATE h_mf_report_versions
SET batch_target_kg = 108.02,
    change_reason   = '마이그레이션: 마카다미아단호박왕찹쌀떡'
WHERE id = 349 AND mf_report_id = 345 AND version_no = 1;

DELETE FROM h_mf_ingredients WHERE mf_report_version_id = 349;

INSERT INTO h_mf_ingredients
  (mf_report_version_id, line_no, material_id, quantity, unit, is_deductible, material_type)
VALUES
  (349,  1, 293, '33.6', '%', 1, 'RAW'),  -- 통팥앙금ML
  (349,  2, 198, '23.4', '%', 1, 'RAW'),  -- 찹쌀(국내산)
  (349,  3, 258, '11.7', '%', 1, 'RAW'),  -- 찰옥수수전분
  (349,  4, 168,  '9.4', '%', 1, 'RAW'),  -- 멥쌀(국내산)
  (349,  5, 191,  '5.8', '%', 0, 'RAW'),  -- 정제수 (차감제외)
  (349,  6, 170,  '3.5', '%', 1, 'RAW'),  -- 물엿(저당물엿)
  (349,  7, 177,  '3.5', '%', 1, 'RAW'),  -- 설탕
  (349,  8, 186,  '2.8', '%', 1, 'RAW'),  -- 옥수수전분
  (349,  9, 167,  '1.8', '%', 1, 'RAW'),  -- 마카다미아분태(호주산)
  (349, 10, 153,  '1.4', '%', 1, 'RAW'),  -- 단호박분말(중국산)
  (349, 11, 199,  '0.8', '%', 1, 'RAW'),  -- 천일염
  (349, 12, 206,  '0.6', '%', 1, 'RAW'),  -- 호두분태(미국산)
  (349, 13, 171,  '0.6', '%', 1, 'RAW'),  -- 밤다이스
  (349, 14, 154,  '0.5', '%', 1, 'RAW'),  -- 당류가공품(단호박농축액)
  (349, 15, 209,  '0.4', '%', 1, 'RAW'),  -- 혼합제제(떡용에스텔)
  (349, 16, 196,  '0.2', '%', 1, 'RAW'); -- 중력분

-- =================== (3) 마카다미아왕찹쌀떡(복분자) report 346 v1 ===================
UPDATE h_mf_report_versions
SET batch_target_kg = 105.91,
    change_reason   = '마이그레이션: 마카다미아복분자왕찹쌀떡'
WHERE id = 350 AND mf_report_id = 346 AND version_no = 1;

DELETE FROM h_mf_ingredients WHERE mf_report_version_id = 350;

INSERT INTO h_mf_ingredients
  (mf_report_version_id, line_no, material_id, quantity, unit, is_deductible, material_type)
VALUES
  (350,  1, 293, '33.4', '%', 1, 'RAW'),  -- 통팥앙금ML
  (350,  2, 198, '24.1', '%', 1, 'RAW'),  -- 찹쌀(국내산)
  (350,  3, 258, '12.1', '%', 1, 'RAW'),  -- 찰옥수수전분
  (350,  4, 168,  '9.6', '%', 1, 'RAW'),  -- 멥쌀(국내산)
  (350,  5, 191,  '6.0', '%', 0, 'RAW'),  -- 정제수 (차감제외)
  (350,  6, 170,  '3.5', '%', 1, 'RAW'),  -- 물엿(저당물엿)
  (350,  7, 177,  '3.5', '%', 1, 'RAW'),  -- 설탕
  (350,  8, 186,  '2.8', '%', 1, 'RAW'),  -- 옥수수전분
  (350,  9, 167,  '1.8', '%', 1, 'RAW'),  -- 마카다미아분태(호주산)
  (350, 10, 199,  '0.8', '%', 1, 'RAW'),  -- 천일염
  (350, 11, 206,  '0.6', '%', 1, 'RAW'),  -- 호두분태(미국산)
  (350, 12, 171,  '0.6', '%', 1, 'RAW'),  -- 밤다이스
  (350, 13, 143,  '0.6', '%', 1, 'RAW'),  -- 기타가공품(복분자가루)
  (350, 14, 209,  '0.4', '%', 1, 'RAW'),  -- 혼합제제(떡용에스텔)
  (350, 15, 196,  '0.2', '%', 1, 'RAW'); -- 중력분

-- =================== 검증 ===================
-- 검증 1: 라인 합계 100% (정제수 포함 법적 합계)
SELECT 
  v.mf_report_id AS report_id,
  v.id AS version_id,
  v.batch_target_kg,
  v.change_reason,
  COUNT(i.id) AS line_count,
  ROUND(SUM(CAST(i.quantity AS DECIMAL(10,2))), 2) AS pct_total
FROM h_mf_report_versions v
LEFT JOIN h_mf_ingredients i ON i.mf_report_version_id = v.id
WHERE v.id IN (348, 349, 350)
GROUP BY v.mf_report_id, v.id, v.batch_target_kg, v.change_reason
ORDER BY v.mf_report_id;

-- 검증 2: 각 BOM 상세 (비율 내림차순 정렬 확인)
SELECT
  v.mf_report_id AS report_id,
  i.line_no,
  im.item_code,
  im.item_name,
  i.quantity,
  i.unit,
  i.is_deductible
FROM h_mf_ingredients i
JOIN h_mf_report_versions v ON v.id = i.mf_report_version_id
LEFT JOIN item_master im ON im.id = i.material_id
WHERE v.id IN (348, 349, 350)
ORDER BY v.mf_report_id, i.line_no;

ROLLBACK;  -- dry-run; 실제 적용 시 COMMIT 으로 교체
