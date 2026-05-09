-- ============================================================
-- Step 6 COMMIT: 마카다미아왕찹쌀떡 3종 BOM 마이그레이션 (v1+v2 동기화)
-- ============================================================
-- 처리:
--   - report 344 (백): v1(348) + v2(471) 모두 동일 데이터로 갱신
--   - report 345 (호박): v1(349) 갱신
--   - report 346 (복분자): v1(350) 갱신
-- 패턴: 마카다미아쑥왕찹쌀떡(347 v1) 마이그레이션과 동일
-- ============================================================

START TRANSACTION;

-- =================== (1) 백 — report 344 v1 (id=348) ===================
UPDATE h_mf_report_versions
SET batch_target_kg = 105.00,
    change_reason   = '마이그레이션: 마카다미아왕찹쌀떡(백)'
WHERE id = 348 AND mf_report_id = 344 AND version_no = 1;

DELETE FROM h_mf_ingredients WHERE mf_report_version_id = 348;
INSERT INTO h_mf_ingredients
  (mf_report_version_id, line_no, material_id, quantity, unit, is_deductible, material_type)
VALUES
  (348,  1, 293, '33.4', '%', 1, 'RAW'),
  (348,  2, 198, '24.4', '%', 1, 'RAW'),
  (348,  3, 258, '12.2', '%', 1, 'RAW'),
  (348,  4, 168,  '9.7', '%', 1, 'RAW'),
  (348,  5, 191,  '6.1', '%', 0, 'RAW'),
  (348,  6, 170,  '3.5', '%', 1, 'RAW'),
  (348,  7, 177,  '3.5', '%', 1, 'RAW'),
  (348,  8, 186,  '2.8', '%', 1, 'RAW'),
  (348,  9, 167,  '1.8', '%', 1, 'RAW'),
  (348, 10, 199,  '0.8', '%', 1, 'RAW'),
  (348, 11, 206,  '0.6', '%', 1, 'RAW'),
  (348, 12, 171,  '0.6', '%', 1, 'RAW'),
  (348, 13, 209,  '0.4', '%', 1, 'RAW'),
  (348, 14, 196,  '0.2', '%', 1, 'RAW');

-- =================== (1-b) 백 — report 344 v2 (id=471, latest, 사용자가 보는 버전) ===================
UPDATE h_mf_report_versions
SET batch_target_kg = 105.00,
    change_reason   = '마이그레이션: 마카다미아왕찹쌀떡(백)'
WHERE id = 471 AND mf_report_id = 344 AND version_no = 2;

DELETE FROM h_mf_ingredients WHERE mf_report_version_id = 471;
INSERT INTO h_mf_ingredients
  (mf_report_version_id, line_no, material_id, quantity, unit, is_deductible, material_type)
VALUES
  (471,  1, 293, '33.4', '%', 1, 'RAW'),
  (471,  2, 198, '24.4', '%', 1, 'RAW'),
  (471,  3, 258, '12.2', '%', 1, 'RAW'),
  (471,  4, 168,  '9.7', '%', 1, 'RAW'),
  (471,  5, 191,  '6.1', '%', 0, 'RAW'),
  (471,  6, 170,  '3.5', '%', 1, 'RAW'),
  (471,  7, 177,  '3.5', '%', 1, 'RAW'),
  (471,  8, 186,  '2.8', '%', 1, 'RAW'),
  (471,  9, 167,  '1.8', '%', 1, 'RAW'),
  (471, 10, 199,  '0.8', '%', 1, 'RAW'),
  (471, 11, 206,  '0.6', '%', 1, 'RAW'),
  (471, 12, 171,  '0.6', '%', 1, 'RAW'),
  (471, 13, 209,  '0.4', '%', 1, 'RAW'),
  (471, 14, 196,  '0.2', '%', 1, 'RAW');

-- =================== (2) 호박 — report 345 v1 (id=349, latest) ===================
UPDATE h_mf_report_versions
SET batch_target_kg = 108.02,
    change_reason   = '마이그레이션: 마카다미아단호박왕찹쌀떡'
WHERE id = 349 AND mf_report_id = 345 AND version_no = 1;

DELETE FROM h_mf_ingredients WHERE mf_report_version_id = 349;
INSERT INTO h_mf_ingredients
  (mf_report_version_id, line_no, material_id, quantity, unit, is_deductible, material_type)
VALUES
  (349,  1, 293, '33.6', '%', 1, 'RAW'),
  (349,  2, 198, '23.4', '%', 1, 'RAW'),
  (349,  3, 258, '11.7', '%', 1, 'RAW'),
  (349,  4, 168,  '9.4', '%', 1, 'RAW'),
  (349,  5, 191,  '5.8', '%', 0, 'RAW'),
  (349,  6, 170,  '3.5', '%', 1, 'RAW'),
  (349,  7, 177,  '3.5', '%', 1, 'RAW'),
  (349,  8, 186,  '2.8', '%', 1, 'RAW'),
  (349,  9, 167,  '1.8', '%', 1, 'RAW'),
  (349, 10, 153,  '1.4', '%', 1, 'RAW'),
  (349, 11, 199,  '0.8', '%', 1, 'RAW'),
  (349, 12, 206,  '0.6', '%', 1, 'RAW'),
  (349, 13, 171,  '0.6', '%', 1, 'RAW'),
  (349, 14, 154,  '0.5', '%', 1, 'RAW'),
  (349, 15, 209,  '0.4', '%', 1, 'RAW'),
  (349, 16, 196,  '0.2', '%', 1, 'RAW');

-- =================== (3) 복분자 — report 346 v1 (id=350, latest) ===================
UPDATE h_mf_report_versions
SET batch_target_kg = 105.91,
    change_reason   = '마이그레이션: 마카다미아복분자왕찹쌀떡'
WHERE id = 350 AND mf_report_id = 346 AND version_no = 1;

DELETE FROM h_mf_ingredients WHERE mf_report_version_id = 350;
INSERT INTO h_mf_ingredients
  (mf_report_version_id, line_no, material_id, quantity, unit, is_deductible, material_type)
VALUES
  (350,  1, 293, '33.4', '%', 1, 'RAW'),
  (350,  2, 198, '24.1', '%', 1, 'RAW'),
  (350,  3, 258, '12.1', '%', 1, 'RAW'),
  (350,  4, 168,  '9.6', '%', 1, 'RAW'),
  (350,  5, 191,  '6.0', '%', 0, 'RAW'),
  (350,  6, 170,  '3.5', '%', 1, 'RAW'),
  (350,  7, 177,  '3.5', '%', 1, 'RAW'),
  (350,  8, 186,  '2.8', '%', 1, 'RAW'),
  (350,  9, 167,  '1.8', '%', 1, 'RAW'),
  (350, 10, 199,  '0.8', '%', 1, 'RAW'),
  (350, 11, 206,  '0.6', '%', 1, 'RAW'),
  (350, 12, 171,  '0.6', '%', 1, 'RAW'),
  (350, 13, 143,  '0.6', '%', 1, 'RAW'),
  (350, 14, 209,  '0.4', '%', 1, 'RAW'),
  (350, 15, 196,  '0.2', '%', 1, 'RAW');

COMMIT;

-- =================== 최종 검증 (commit 후) ===================
SELECT 
  v.mf_report_id AS report_id,
  v.id AS version_id,
  v.version_no,
  v.batch_target_kg,
  v.change_reason,
  COUNT(i.id) AS line_count,
  ROUND(SUM(CAST(i.quantity AS DECIMAL(10,2))), 2) AS pct_total
FROM h_mf_report_versions v
LEFT JOIN h_mf_ingredients i ON i.mf_report_version_id = v.id
WHERE v.id IN (348, 471, 349, 350)
GROUP BY v.mf_report_id, v.id, v.version_no, v.batch_target_kg, v.change_reason
ORDER BY v.mf_report_id, v.version_no;
