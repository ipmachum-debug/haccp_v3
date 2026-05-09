-- ============================================================
-- Step 5: MAT-063 (deactivated id=194) → MAT-103/104 BOM 재매핑
-- ============================================================
-- 결정 사항:
--   - report_id=422 (찹쌀떡(떡마루)) line_no=3 (kg unit)  → MAT-104 (id=294, 통팥앙금M)
--   - 나머지 17건 (line_no=2, % unit)                    → MAT-103 (id=293, 통팥앙금ML)
-- 영향 범위: h_mf_ingredients 18행 (material_id 컬럼만)
-- 기존 quantity / unit / line_no / version_id 변경 없음
-- ============================================================

START TRANSACTION;

-- (A) report 422 (찹쌀떡(떡마루)) — MAT-104 (id=294)
UPDATE h_mf_ingredients
SET material_id = 294
WHERE id = 5383
  AND mf_report_version_id = 426
  AND material_id = 194;

-- (B) 나머지 17건 — MAT-103 (id=293)
UPDATE h_mf_ingredients
SET material_id = 293
WHERE id IN (
  5315,  -- report 330 (3종호두찹쌀떡)
  4668,  -- report 344 (마카다미아 왕찹쌀떡)
  4657,  -- report 345 (마카다미아단호박왕찹쌀떡)
  4646,  -- report 346 (마카다미아복분자왕찹쌀떡)
  4635,  -- report 347 (마카다미아쑥왕찹쌀떡)
  4421,  -- report 372 (왕찹쌀떡)
  4915,  -- report 385 (카스테라왕찹쌀떡(백))
  4301,  -- report 386 (카스테라왕찹쌀떡(쑥))
  4903,  -- report 387 (카스테라왕찹쌀떡(호박))
  4575,  -- report 392 (콩고물쑥떡)
  4535,  -- report 397 (호두찹쌀떡)
  4355,  -- report 398 (호두찹쌀떡(쑥))
  4435,  -- report 399 (호두찹쌀떡(호박))
  4882,  -- report 418 (오메기(팥))
  4869,  -- report 419 (오메기(녹차))
  4856,  -- report 420 (오메기(콩고물))
  4841   -- report 421 (오메기(씨앗))
)
  AND material_id = 194;

-- 검증 1: MAT-063 (id=194) 잔존 라인 0건이어야 함
SELECT COUNT(*) AS remaining_mat063 FROM h_mf_ingredients WHERE material_id = 194;

-- 검증 2: 변경된 라인 18건 재조회
SELECT 
  r.id AS report_id,
  COALESCE(p.product_name, im_p.item_name) AS product_name,
  i.id AS ing_id,
  i.line_no,
  i.material_id,
  im.item_code,
  im.item_name,
  i.quantity,
  i.unit
FROM h_mf_ingredients i
JOIN h_mf_report_versions v ON v.id = i.mf_report_version_id
JOIN h_mf_reports r ON r.id = v.mf_report_id
LEFT JOIN h_products_v2 p ON p.id = r.product_id
LEFT JOIN item_master im_p ON im_p.id = r.product_id
LEFT JOIN item_master im ON im.id = i.material_id
WHERE i.id IN (5383,5315,4668,4657,4646,4635,4421,4915,4301,4903,4575,4535,4355,4435,4882,4869,4856,4841)
ORDER BY r.id, i.line_no;

-- 검증 3: MAT-103/104 분포
SELECT i.material_id, im.item_code, im.item_name, COUNT(*) AS line_count
FROM h_mf_ingredients i
JOIN item_master im ON im.id = i.material_id
WHERE i.material_id IN (293,294)
GROUP BY i.material_id, im.item_code, im.item_name
ORDER BY i.material_id;

ROLLBACK;  -- dry-run; 실제 적용 시 COMMIT 으로 교체
