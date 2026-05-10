-- =====================================================================
-- step15: item_master.default_unit_price 백필 (DRY-RUN)
-- =====================================================================
-- 목적: 5월 배치들이 참조하는 item_master 자재의 default_unit_price=0 문제 해결
-- 전략: 자재명 매칭으로 h_materials.unit_price 값을 item_master.default_unit_price로 복사
-- 영향 범위: tenant_id=2, item_type='raw_material', default_unit_price=0 OR NULL
-- =====================================================================

-- 섹션 A: 백필 대상 item_master 행 카운트
SELECT
  '(A) 백필 대상 item_master 행 수' AS section,
  COUNT(*) AS total_rows
FROM item_master im
WHERE im.tenant_id = 2
  AND im.item_type = 'raw_material'
  AND (im.default_unit_price IS NULL OR im.default_unit_price = 0)
  AND (im.item_name IS NULL OR im.item_name NOT LIKE '%정제수%');

-- 섹션 B: 자재명 매칭으로 h_materials.unit_price 가져올 수 있는 행 수
SELECT
  '(B) 자재명 매칭 + h_materials 가격 보유 행 수' AS section,
  COUNT(*) AS resolvable_rows
FROM item_master im
INNER JOIN h_materials hm
  ON hm.tenant_id = im.tenant_id
 AND TRIM(hm.material_name) = TRIM(im.item_name)
 AND hm.unit_price IS NOT NULL
 AND hm.unit_price > 0
WHERE im.tenant_id = 2
  AND im.item_type = 'raw_material'
  AND (im.default_unit_price IS NULL OR im.default_unit_price = 0)
  AND (im.item_name IS NULL OR im.item_name NOT LIKE '%정제수%');

-- 섹션 C: 미해결 (자재명 매칭 실패 또는 h_materials도 0/NULL)
SELECT
  '(C) 미해결 행 수 (수동 처리 필요)' AS section,
  COUNT(*) AS unresolvable_rows
FROM item_master im
LEFT JOIN h_materials hm
  ON hm.tenant_id = im.tenant_id
 AND TRIM(hm.material_name) = TRIM(im.item_name)
 AND hm.unit_price IS NOT NULL
 AND hm.unit_price > 0
WHERE im.tenant_id = 2
  AND im.item_type = 'raw_material'
  AND (im.default_unit_price IS NULL OR im.default_unit_price = 0)
  AND (im.item_name IS NULL OR im.item_name NOT LIKE '%정제수%')
  AND hm.id IS NULL;

-- 섹션 D: 5월 배치에서 사용 중인 자재 ID에 대한 미리보기 (해결 가능 여부)
SELECT
  '(D) 5월 배치 자재 매칭 미리보기' AS section,
  im.id AS item_master_id,
  im.item_name,
  im.default_unit_price AS current_im_price,
  hm.id AS hm_id,
  hm.unit_price AS hm_price_to_copy,
  COUNT(DISTINCT bi.batch_id) AS used_in_batches
FROM item_master im
LEFT JOIN h_materials hm
  ON hm.tenant_id = im.tenant_id
 AND TRIM(hm.material_name) = TRIM(im.item_name)
 AND hm.unit_price IS NOT NULL
 AND hm.unit_price > 0
LEFT JOIN h_batch_inputs bi
  ON bi.material_id = im.id
LEFT JOIN h_batches b
  ON b.id = bi.batch_id
 AND b.tenant_id = im.tenant_id
 AND b.planned_date >= '2025-05-01'
 AND b.planned_date <= '2025-05-31'
WHERE im.tenant_id = 2
  AND im.item_type = 'raw_material'
  AND (im.default_unit_price IS NULL OR im.default_unit_price = 0)
  AND (im.item_name IS NULL OR im.item_name NOT LIKE '%정제수%')
GROUP BY im.id, im.item_name, im.default_unit_price, hm.id, hm.unit_price
HAVING used_in_batches > 0
ORDER BY used_in_batches DESC, im.item_name;

-- 섹션 E: 자재명 매칭 실패 목록 (수동 확인 필요)
SELECT
  '(E) 자재명 매칭 실패 - 수동 확인 필요' AS section,
  im.id AS item_master_id,
  im.item_name,
  im.default_unit_price
FROM item_master im
LEFT JOIN h_materials hm
  ON hm.tenant_id = im.tenant_id
 AND TRIM(hm.material_name) = TRIM(im.item_name)
WHERE im.tenant_id = 2
  AND im.item_type = 'raw_material'
  AND (im.default_unit_price IS NULL OR im.default_unit_price = 0)
  AND (im.item_name IS NULL OR im.item_name NOT LIKE '%정제수%')
  AND hm.id IS NULL
ORDER BY im.item_name;
