-- =====================================================================
-- step15: item_master.default_unit_price 백필 (COMMIT)
-- =====================================================================
-- 목적: h_materials.unit_price를 자재명 매칭으로 item_master.default_unit_price에 복사
-- 트랜잭션 안에서 수행, STEP1 백업 → STEP2 UPDATE → 검증 → COMMIT
-- =====================================================================

START TRANSACTION;

-- STEP 0: 백업 테이블 생성 (혹시 모를 롤백용)
CREATE TABLE IF NOT EXISTS _backup_item_master_step15 (
  id BIGINT PRIMARY KEY,
  tenant_id INT,
  item_name VARCHAR(255),
  old_default_unit_price DECIMAL(15,2),
  new_default_unit_price DECIMAL(15,2),
  source_hm_id BIGINT,
  backed_up_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- STEP 1: 백업 (이번에 변경될 행만)
INSERT INTO _backup_item_master_step15
  (id, tenant_id, item_name, old_default_unit_price, new_default_unit_price, source_hm_id)
SELECT
  im.id,
  im.tenant_id,
  im.item_name,
  im.default_unit_price,
  hm.unit_price,
  hm.id
FROM item_master im
INNER JOIN h_materials hm
  ON hm.tenant_id = im.tenant_id
 AND TRIM(hm.material_name) = TRIM(im.item_name)
 AND hm.unit_price IS NOT NULL
 AND hm.unit_price > 0
WHERE im.tenant_id = 2
  AND im.item_type = 'raw_material'
  AND (im.default_unit_price IS NULL OR im.default_unit_price = 0)
  AND (im.item_name IS NULL OR im.item_name NOT LIKE '%정제수%')
ON DUPLICATE KEY UPDATE
  new_default_unit_price = VALUES(new_default_unit_price),
  source_hm_id = VALUES(source_hm_id),
  backed_up_at = CURRENT_TIMESTAMP;

-- STEP 2: 실제 UPDATE
UPDATE item_master im
INNER JOIN h_materials hm
  ON hm.tenant_id = im.tenant_id
 AND TRIM(hm.material_name) = TRIM(im.item_name)
 AND hm.unit_price IS NOT NULL
 AND hm.unit_price > 0
SET im.default_unit_price = hm.unit_price,
    im.updated_at = CURRENT_TIMESTAMP
WHERE im.tenant_id = 2
  AND im.item_type = 'raw_material'
  AND (im.default_unit_price IS NULL OR im.default_unit_price = 0)
  AND (im.item_name IS NULL OR im.item_name NOT LIKE '%정제수%');

-- STEP 3: 검증 - 갱신된 행 확인
SELECT
  '(검증1) 백업 테이블 행 수' AS section,
  COUNT(*) AS rows_backed_up
FROM _backup_item_master_step15;

SELECT
  '(검증2) 갱신 후 가격 보유 item_master 행' AS section,
  im.id,
  im.item_name,
  im.default_unit_price,
  bk.old_default_unit_price,
  bk.source_hm_id
FROM item_master im
INNER JOIN _backup_item_master_step15 bk ON bk.id = im.id
WHERE im.tenant_id = 2
ORDER BY im.item_name;

SELECT
  '(검증3) 5월 배치 자재 가격 회복 상태' AS section,
  im.id,
  im.item_name,
  im.default_unit_price,
  COUNT(DISTINCT bi.batch_id) AS batches_using
FROM item_master im
INNER JOIN h_batch_inputs bi ON bi.material_id = im.id
INNER JOIN h_batches b ON b.id = bi.batch_id
WHERE im.tenant_id = 2
  AND b.tenant_id = 2
  AND b.planned_date >= '2025-05-01'
  AND b.planned_date <= '2025-05-31'
GROUP BY im.id, im.item_name, im.default_unit_price
ORDER BY im.default_unit_price = 0 DESC, batches_using DESC;

COMMIT;
