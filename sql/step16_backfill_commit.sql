-- ═══════════════════════════════════════════════════════════════════════════
-- step16 BACKFILL COMMIT
-- 4월/5월 h_batch_inputs ID/price/deduction 정합성 복구
--
-- 실행 환경: production haccp_tenant_db (tenant_id=2)
-- 선행 조건: step16_backfill_dryrun.sql 실행 결과 검토 완료
--
-- 이 스크립트는 다음 4개 작업을 START TRANSACTION 안에서 idempotent 하게 수행:
--   STEP 0. _backup_h_batch_inputs_step16 백업 테이블 생성
--   STEP 1. 5월 material_id 표준화 (item_master.id → h_materials.id by name)
--   STEP 2. 5월 단가/총가 백필 (3-tier: h_materials → 최신 lot → item_master)
--   STEP 3. 4월 단가/총가 백필 (zero_price 행만, 같은 3-tier)
--   STEP 4. 5월 inventory_deducted=1 → 0 정정 (lot_id 차감 없는 fake usage 행)
--
-- 사후 검증:
--   - V1: 5월/4월 zero_price 행 수 → 0 또는 단가 부재 행만 남아야 함
--   - V2: 5월 id_only_in_item_master → 0
--   - V3: 5월 inventory_deducted=1 → 진짜 lot 차감 있는 행만 남아야 함
--
-- 롤백:
--   - 백업 테이블 _backup_h_batch_inputs_step16 으로 UPDATE 복원
--   - 또는 START TRANSACTION 안에서 ROLLBACK
-- ═══════════════════════════════════════════════════════════════════════════

USE haccp_tenant_db;

START TRANSACTION;

-- ───────────────────────────────────────────────────────────────────────────
-- STEP 0. 백업 테이블 (idempotent: 이미 있으면 그대로 둠 — 첫 실행 결과 유지)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS _backup_h_batch_inputs_step16 (
  bi_id              BIGINT PRIMARY KEY,
  batch_id           BIGINT,
  material_id        BIGINT,
  unit_price         DECIMAL(10,2),
  total_price        DECIMAL(15,2),
  inventory_deducted TINYINT,
  tenant_id          INT,
  backup_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='step16 백필 전 원본 스냅샷';

-- 4월/5월 영향 가능 행 모두 백업 (이미 백업된 bi_id 는 IGNORE)
INSERT IGNORE INTO _backup_h_batch_inputs_step16
  (bi_id, batch_id, material_id, unit_price, total_price, inventory_deducted, tenant_id)
SELECT bi.id, bi.batch_id, bi.material_id, bi.unit_price, bi.total_price, bi.inventory_deducted, bi.tenant_id
FROM h_batch_inputs bi
JOIN h_batches b ON b.id = bi.batch_id
WHERE bi.tenant_id = 2
  AND b.planned_date >= '2026-04-01' AND b.planned_date < '2026-06-01';

SELECT '── STEP 0 done: backup row count ──' AS info,
       COUNT(*) AS backup_rows
FROM _backup_h_batch_inputs_step16;

-- ───────────────────────────────────────────────────────────────────────────
-- STEP 1. 5월 material_id 표준화 (item_master.id → h_materials.id)
-- ───────────────────────────────────────────────────────────────────────────
UPDATE h_batch_inputs bi
JOIN h_batches b ON b.id = bi.batch_id
JOIN item_master im
  ON im.id = bi.material_id AND im.tenant_id = bi.tenant_id
JOIN h_materials hm_byname
  ON hm_byname.tenant_id = bi.tenant_id
 AND TRIM(hm_byname.material_name) = TRIM(im.item_name)
LEFT JOIN h_materials hm_direct
  ON hm_direct.id = bi.material_id AND hm_direct.tenant_id = bi.tenant_id
SET bi.material_id = hm_byname.id
WHERE bi.tenant_id = 2
  AND b.planned_date >= '2026-05-01' AND b.planned_date < '2026-06-01'
  AND hm_direct.id IS NULL;  -- 이미 h_materials.id namespace 인 행은 건드리지 않음

SELECT '── STEP 1 done: 5월 material_id 표준화 ──' AS info,
       ROW_COUNT() AS updated_rows;

-- ───────────────────────────────────────────────────────────────────────────
-- STEP 2. 5월 단가/총가 백필 (3-tier: h_materials → 최신 lot → item_master)
--          STEP 1 이후이므로 bi.material_id 는 이미 canonical h_materials.id
-- ───────────────────────────────────────────────────────────────────────────
UPDATE h_batch_inputs bi
JOIN h_batches b ON b.id = bi.batch_id
LEFT JOIN h_materials hm
  ON hm.id = bi.material_id AND hm.tenant_id = bi.tenant_id
LEFT JOIN (
  SELECT material_id, unit_price
  FROM (
    SELECT material_id, unit_price,
           ROW_NUMBER() OVER (PARTITION BY material_id ORDER BY receipt_date DESC, id DESC) AS rn
    FROM h_inventory_lots
    WHERE tenant_id = 2 AND unit_price > 0
  ) t WHERE rn = 1
) ll ON ll.material_id = bi.material_id
LEFT JOIN item_master im
  ON im.tenant_id = bi.tenant_id
 AND TRIM(im.item_name) = TRIM(hm.material_name)
 AND im.item_type = 'raw_material'
SET
  bi.unit_price = COALESCE(
    NULLIF(hm.unit_price, 0),
    NULLIF(ll.unit_price, 0),
    NULLIF(im.default_unit_price, 0),
    bi.unit_price
  ),
  bi.total_price = COALESCE(bi.actual_quantity, bi.planned_quantity, 0)
    * COALESCE(
        NULLIF(hm.unit_price, 0),
        NULLIF(ll.unit_price, 0),
        NULLIF(im.default_unit_price, 0),
        bi.unit_price,
        0
      )
WHERE bi.tenant_id = 2
  AND b.planned_date >= '2026-05-01' AND b.planned_date < '2026-06-01'
  AND (bi.unit_price IS NULL OR bi.unit_price = 0)
  AND (
    COALESCE(hm.unit_price, 0) > 0
    OR COALESCE(ll.unit_price, 0) > 0
    OR COALESCE(im.default_unit_price, 0) > 0
  );

SELECT '── STEP 2 done: 5월 unit_price/total_price 백필 ──' AS info,
       ROW_COUNT() AS updated_rows;

-- ───────────────────────────────────────────────────────────────────────────
-- STEP 3. 4월 단가/총가 백필 (같은 3-tier; ID 는 이미 정상)
-- ───────────────────────────────────────────────────────────────────────────
UPDATE h_batch_inputs bi
JOIN h_batches b ON b.id = bi.batch_id
LEFT JOIN h_materials hm
  ON hm.id = bi.material_id AND hm.tenant_id = bi.tenant_id
LEFT JOIN (
  SELECT material_id, unit_price
  FROM (
    SELECT material_id, unit_price,
           ROW_NUMBER() OVER (PARTITION BY material_id ORDER BY receipt_date DESC, id DESC) AS rn
    FROM h_inventory_lots
    WHERE tenant_id = 2 AND unit_price > 0
  ) t WHERE rn = 1
) ll ON ll.material_id = bi.material_id
LEFT JOIN item_master im
  ON im.tenant_id = bi.tenant_id
 AND TRIM(im.item_name) = TRIM(hm.material_name)
 AND im.item_type = 'raw_material'
SET
  bi.unit_price = COALESCE(
    NULLIF(hm.unit_price, 0),
    NULLIF(ll.unit_price, 0),
    NULLIF(im.default_unit_price, 0),
    bi.unit_price
  ),
  bi.total_price = COALESCE(bi.actual_quantity, bi.planned_quantity, 0)
    * COALESCE(
        NULLIF(hm.unit_price, 0),
        NULLIF(ll.unit_price, 0),
        NULLIF(im.default_unit_price, 0),
        bi.unit_price,
        0
      )
WHERE bi.tenant_id = 2
  AND b.planned_date >= '2026-04-01' AND b.planned_date < '2026-05-01'
  AND (bi.unit_price IS NULL OR bi.unit_price = 0)
  AND (
    COALESCE(hm.unit_price, 0) > 0
    OR COALESCE(ll.unit_price, 0) > 0
    OR COALESCE(im.default_unit_price, 0) > 0
  );

SELECT '── STEP 3 done: 4월 unit_price/total_price 백필 ──' AS info,
       ROW_COUNT() AS updated_rows;

-- ───────────────────────────────────────────────────────────────────────────
-- STEP 4. 5월 inventory_deducted=1 → 0 정정 (lot_id 차감 없는 fake usage)
--   재차감(재고 감소)은 별도 작업으로 미루고, 일단 플래그만 정정해
--   향후 재차감 가능 상태로 만든다.
-- ───────────────────────────────────────────────────────────────────────────
UPDATE h_batch_inputs bi
JOIN h_batches b ON b.id = bi.batch_id
SET bi.inventory_deducted = 0
WHERE bi.tenant_id = 2
  AND b.planned_date >= '2026-05-01' AND b.planned_date < '2026-06-01'
  AND bi.inventory_deducted = 1
  AND NOT EXISTS (
    SELECT 1 FROM h_inventory_transactions tx
    WHERE tx.tenant_id = bi.tenant_id
      AND tx.reference_type = 'batch'
      AND tx.reference_id = bi.batch_id
      AND tx.transaction_type IN ('usage', 'outbound')
      AND tx.lot_id IS NOT NULL
  );

SELECT '── STEP 4 done: 5월 inventory_deducted=1 → 0 정정 ──' AS info,
       ROW_COUNT() AS updated_rows;

-- ───────────────────────────────────────────────────────────────────────────
-- COMMIT
-- ───────────────────────────────────────────────────────────────────────────
COMMIT;

-- ───────────────────────────────────────────────────────────────────────────
-- V. 사후 검증
-- ───────────────────────────────────────────────────────────────────────────
SELECT '── V1. 5월/4월 ID/price/deducted 잔여 분포 ──' AS section;

SELECT
  '5월 (사후)' AS period,
  COUNT(*) AS total_rows,
  SUM(CASE WHEN bi.unit_price > 0 THEN 1 ELSE 0 END) AS rows_with_price,
  SUM(CASE WHEN bi.unit_price = 0 OR bi.unit_price IS NULL THEN 1 ELSE 0 END) AS rows_zero_price,
  SUM(CASE WHEN hm.id IS NOT NULL THEN 1 ELSE 0 END) AS id_in_h_materials,
  SUM(CASE WHEN hm.id IS NULL AND im.id IS NOT NULL THEN 1 ELSE 0 END) AS id_only_in_item_master,
  SUM(CASE WHEN bi.inventory_deducted = 1 THEN 1 ELSE 0 END) AS marked_deducted,
  SUM(CASE WHEN bi.inventory_deducted = 0 THEN 1 ELSE 0 END) AS not_deducted
FROM h_batch_inputs bi
JOIN h_batches b ON b.id = bi.batch_id
LEFT JOIN h_materials hm ON hm.id = bi.material_id AND hm.tenant_id = bi.tenant_id
LEFT JOIN item_master im ON im.id = bi.material_id AND im.tenant_id = bi.tenant_id
WHERE bi.tenant_id = 2
  AND b.planned_date >= '2026-05-01' AND b.planned_date < '2026-06-01'
UNION ALL
SELECT
  '4월 (사후)' AS period,
  COUNT(*),
  SUM(CASE WHEN bi.unit_price > 0 THEN 1 ELSE 0 END),
  SUM(CASE WHEN bi.unit_price = 0 OR bi.unit_price IS NULL THEN 1 ELSE 0 END),
  SUM(CASE WHEN hm.id IS NOT NULL THEN 1 ELSE 0 END),
  SUM(CASE WHEN hm.id IS NULL AND im.id IS NOT NULL THEN 1 ELSE 0 END),
  SUM(CASE WHEN bi.inventory_deducted = 1 THEN 1 ELSE 0 END),
  SUM(CASE WHEN bi.inventory_deducted = 0 THEN 1 ELSE 0 END)
FROM h_batch_inputs bi
JOIN h_batches b ON b.id = bi.batch_id
LEFT JOIN h_materials hm ON hm.id = bi.material_id AND hm.tenant_id = bi.tenant_id
LEFT JOIN item_master im ON im.id = bi.material_id AND im.tenant_id = bi.tenant_id
WHERE bi.tenant_id = 2
  AND b.planned_date >= '2026-04-01' AND b.planned_date < '2026-05-01';

-- V2: 5월 단가가 여전히 0 인 행 (단가 정보 자체가 없는 원재료)
SELECT '── V2. 5월 잔여 zero_price 행 (단가 부재 마스터) ──' AS section;
SELECT bi.id AS bi_id, bi.batch_id, bi.material_id, hm.material_name, bi.unit_price
FROM h_batch_inputs bi
JOIN h_batches b ON b.id = bi.batch_id
LEFT JOIN h_materials hm ON hm.id = bi.material_id AND hm.tenant_id = bi.tenant_id
WHERE bi.tenant_id = 2
  AND b.planned_date >= '2026-05-01' AND b.planned_date < '2026-06-01'
  AND (bi.unit_price IS NULL OR bi.unit_price = 0)
ORDER BY hm.material_name, bi.batch_id
LIMIT 50;
