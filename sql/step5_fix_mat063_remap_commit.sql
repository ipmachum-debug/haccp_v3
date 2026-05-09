-- ============================================================
-- Step 5 COMMIT: MAT-063 → MAT-103/104 BOM 재매핑 (실 적용)
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
WHERE id IN (5315,4668,4657,4646,4635,4421,4915,4301,4903,4575,4535,4355,4435,4882,4869,4856,4841)
  AND material_id = 194;

-- 검증: MAT-063 (id=194) 잔존 라인 0건 확인
SELECT COUNT(*) AS remaining_mat063 FROM h_mf_ingredients WHERE material_id = 194;

-- 검증: MAT-103/104 분포
SELECT i.material_id, im.item_code, im.item_name, COUNT(*) AS line_count
FROM h_mf_ingredients i
JOIN item_master im ON im.id = i.material_id
WHERE i.material_id IN (293,294)
GROUP BY i.material_id, im.item_code, im.item_name
ORDER BY i.material_id;

COMMIT;

-- 최종 검증 (commit 후)
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
