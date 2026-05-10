-- ═══════════════════════════════════════════════════════════════════════════
-- step16 BACKFILL DRYRUN
-- 4월/5월 h_batch_inputs ID/price/deduction 정합성 복구 미리보기
--
-- 배경 (PR #298):
--   - 5월 180행: bi.material_id 가 item_master.id namespace → h_materials lot
--                lookup 100% 실패 → unit_price=0, FEFO/master 폴백 모두 미작동.
--                inventory_deducted=1 로 잘못 marked 되어 재고 차감/원가 모두 깨짐.
--   - 4월 272행: ID 는 정상(h_materials.id) 이나 unit_price=0 으로 저장됨
--                (PR #297 이전 INSERT 경로의 단가 미설정 버그).
--
-- DRYRUN 단계:
--   A. 5월 ID 표준화 미리보기 (item_master.id → h_materials.id by name)
--   B. 5월 단가 폴백 미리보기 (h_materials → 최신 lot → item_master)
--   C. 4월 단가 폴백 미리보기 (zero_price 행만)
--   D. 5월 inventory_deducted 플래그 정정 미리보기
--   E. 종합 영향 카운트
--
-- 실행 방법:
--   MYSQL_PWD='...' mysql -uroot haccp_tenant_db < step16_backfill_dryrun.sql
-- ═══════════════════════════════════════════════════════════════════════════

USE haccp_tenant_db;

-- ───────────────────────────────────────────────────────────────────────────
-- A. 5월 ID 표준화 미리보기
-- ───────────────────────────────────────────────────────────────────────────
SELECT
  '── A. 5월 ID 표준화 미리보기 ──' AS section;

SELECT
  bi.id AS bi_id,
  bi.batch_id,
  bi.material_id AS old_material_id,  -- item_master.id
  im.item_name AS material_name,
  hm_byname.id AS new_material_id,    -- h_materials.id (canonical)
  bi.unit_price AS old_unit_price,
  bi.inventory_deducted AS old_deducted_flag
FROM h_batch_inputs bi
JOIN h_batches b ON b.id = bi.batch_id
LEFT JOIN h_materials hm ON hm.id = bi.material_id AND hm.tenant_id = bi.tenant_id
LEFT JOIN item_master im ON im.id = bi.material_id AND im.tenant_id = bi.tenant_id
LEFT JOIN h_materials hm_byname
  ON hm.id IS NULL AND hm_byname.tenant_id = bi.tenant_id
 AND TRIM(hm_byname.material_name) = TRIM(im.item_name)
WHERE bi.tenant_id = 2
  AND b.planned_date >= '2026-05-01' AND b.planned_date < '2026-06-01'
  AND hm.id IS NULL AND im.id IS NOT NULL
ORDER BY bi.batch_id, bi.id
LIMIT 20;

SELECT
  '5월 표준화 대상 총 행수' AS info,
  COUNT(*) AS rows_to_standardize,
  SUM(CASE WHEN hm_byname.id IS NOT NULL THEN 1 ELSE 0 END) AS resolvable,
  SUM(CASE WHEN hm_byname.id IS NULL THEN 1 ELSE 0 END) AS unresolvable
FROM h_batch_inputs bi
JOIN h_batches b ON b.id = bi.batch_id
LEFT JOIN h_materials hm ON hm.id = bi.material_id AND hm.tenant_id = bi.tenant_id
LEFT JOIN item_master im ON im.id = bi.material_id AND im.tenant_id = bi.tenant_id
LEFT JOIN h_materials hm_byname
  ON hm.id IS NULL AND hm_byname.tenant_id = bi.tenant_id
 AND TRIM(hm_byname.material_name) = TRIM(im.item_name)
WHERE bi.tenant_id = 2
  AND b.planned_date >= '2026-05-01' AND b.planned_date < '2026-06-01'
  AND hm.id IS NULL AND im.id IS NOT NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- B. 5월 단가 폴백 미리보기 (3-tier: h_materials → 최신 lot → item_master)
-- ───────────────────────────────────────────────────────────────────────────
SELECT
  '── B. 5월 단가 폴백 미리보기 ──' AS section;

WITH last_lot AS (
  SELECT material_id, unit_price,
         ROW_NUMBER() OVER (PARTITION BY material_id ORDER BY receipt_date DESC, id DESC) AS rn
  FROM h_inventory_lots
  WHERE tenant_id = 2 AND unit_price > 0
)
SELECT
  bi.id AS bi_id,
  bi.batch_id,
  hm_byname.id AS canonical_id,
  hm_byname.material_name,
  hm_byname.unit_price       AS tier1_h_materials_price,
  ll.unit_price              AS tier2_last_lot_price,
  im.default_unit_price      AS tier3_item_master_price,
  COALESCE(
    NULLIF(hm_byname.unit_price, 0),
    NULLIF(ll.unit_price, 0),
    NULLIF(im.default_unit_price, 0)
  ) AS chosen_price,
  COALESCE(bi.actual_quantity, bi.planned_quantity, 0) AS qty_for_total,
  COALESCE(bi.actual_quantity, bi.planned_quantity, 0)
    * COALESCE(
        NULLIF(hm_byname.unit_price, 0),
        NULLIF(ll.unit_price, 0),
        NULLIF(im.default_unit_price, 0),
        0
      ) AS computed_total_price
FROM h_batch_inputs bi
JOIN h_batches b ON b.id = bi.batch_id
LEFT JOIN h_materials hm ON hm.id = bi.material_id AND hm.tenant_id = bi.tenant_id
LEFT JOIN item_master im ON im.id = bi.material_id AND im.tenant_id = bi.tenant_id
LEFT JOIN h_materials hm_byname
  ON hm.id IS NULL AND hm_byname.tenant_id = bi.tenant_id
 AND TRIM(hm_byname.material_name) = TRIM(im.item_name)
LEFT JOIN last_lot ll ON ll.material_id = hm_byname.id AND ll.rn = 1
WHERE bi.tenant_id = 2
  AND b.planned_date >= '2026-05-01' AND b.planned_date < '2026-06-01'
  AND hm.id IS NULL AND im.id IS NOT NULL
ORDER BY bi.batch_id, bi.id
LIMIT 30;

-- B-요약: 5월 단가 폴백 단계별 적중 분포
WITH last_lot AS (
  SELECT material_id, unit_price,
         ROW_NUMBER() OVER (PARTITION BY material_id ORDER BY receipt_date DESC, id DESC) AS rn
  FROM h_inventory_lots
  WHERE tenant_id = 2 AND unit_price > 0
)
SELECT
  '5월 단가 폴백 적중 단계별 분포' AS info,
  SUM(CASE WHEN COALESCE(hm_byname.unit_price, 0) > 0 THEN 1 ELSE 0 END) AS hit_tier1_h_materials,
  SUM(CASE WHEN COALESCE(hm_byname.unit_price, 0) = 0 AND COALESCE(ll.unit_price, 0) > 0 THEN 1 ELSE 0 END) AS hit_tier2_last_lot,
  SUM(CASE WHEN COALESCE(hm_byname.unit_price, 0) = 0 AND COALESCE(ll.unit_price, 0) = 0 AND COALESCE(im.default_unit_price, 0) > 0 THEN 1 ELSE 0 END) AS hit_tier3_item_master,
  SUM(CASE WHEN COALESCE(hm_byname.unit_price, 0) = 0 AND COALESCE(ll.unit_price, 0) = 0 AND COALESCE(im.default_unit_price, 0) = 0 THEN 1 ELSE 0 END) AS no_price_available
FROM h_batch_inputs bi
JOIN h_batches b ON b.id = bi.batch_id
LEFT JOIN h_materials hm ON hm.id = bi.material_id AND hm.tenant_id = bi.tenant_id
LEFT JOIN item_master im ON im.id = bi.material_id AND im.tenant_id = bi.tenant_id
LEFT JOIN h_materials hm_byname
  ON hm.id IS NULL AND hm_byname.tenant_id = bi.tenant_id
 AND TRIM(hm_byname.material_name) = TRIM(im.item_name)
LEFT JOIN last_lot ll ON ll.material_id = hm_byname.id AND ll.rn = 1
WHERE bi.tenant_id = 2
  AND b.planned_date >= '2026-05-01' AND b.planned_date < '2026-06-01'
  AND hm.id IS NULL AND im.id IS NOT NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- C. 4월 단가 폴백 미리보기 (272 zero_price 행만; ID 는 이미 h_materials.id 정상)
-- ───────────────────────────────────────────────────────────────────────────
SELECT
  '── C. 4월 단가 폴백 미리보기 (zero_price 272건) ──' AS section;

WITH last_lot AS (
  SELECT material_id, unit_price,
         ROW_NUMBER() OVER (PARTITION BY material_id ORDER BY receipt_date DESC, id DESC) AS rn
  FROM h_inventory_lots
  WHERE tenant_id = 2 AND unit_price > 0
)
SELECT
  bi.id AS bi_id,
  bi.batch_id,
  bi.material_id,
  hm.material_name,
  hm.unit_price          AS tier1_h_materials_price,
  ll.unit_price          AS tier2_last_lot_price,
  im.default_unit_price  AS tier3_item_master_price,
  COALESCE(
    NULLIF(hm.unit_price, 0),
    NULLIF(ll.unit_price, 0),
    NULLIF(im.default_unit_price, 0)
  ) AS chosen_price
FROM h_batch_inputs bi
JOIN h_batches b ON b.id = bi.batch_id
LEFT JOIN h_materials hm ON hm.id = bi.material_id AND hm.tenant_id = bi.tenant_id
LEFT JOIN item_master im
  ON im.tenant_id = bi.tenant_id
 AND TRIM(im.item_name) = TRIM(hm.material_name)
 AND im.item_type = 'raw_material'
LEFT JOIN last_lot ll ON ll.material_id = hm.id AND ll.rn = 1
WHERE bi.tenant_id = 2
  AND b.planned_date >= '2026-04-01' AND b.planned_date < '2026-05-01'
  AND (bi.unit_price IS NULL OR bi.unit_price = 0)
ORDER BY bi.batch_id, bi.id
LIMIT 30;

-- C-요약: 4월 단가 폴백 단계별 적중 분포
WITH last_lot AS (
  SELECT material_id, unit_price,
         ROW_NUMBER() OVER (PARTITION BY material_id ORDER BY receipt_date DESC, id DESC) AS rn
  FROM h_inventory_lots
  WHERE tenant_id = 2 AND unit_price > 0
)
SELECT
  '4월 단가 폴백 적중 단계별 분포' AS info,
  SUM(CASE WHEN COALESCE(hm.unit_price, 0) > 0 THEN 1 ELSE 0 END) AS hit_tier1_h_materials,
  SUM(CASE WHEN COALESCE(hm.unit_price, 0) = 0 AND COALESCE(ll.unit_price, 0) > 0 THEN 1 ELSE 0 END) AS hit_tier2_last_lot,
  SUM(CASE WHEN COALESCE(hm.unit_price, 0) = 0 AND COALESCE(ll.unit_price, 0) = 0 AND COALESCE(im.default_unit_price, 0) > 0 THEN 1 ELSE 0 END) AS hit_tier3_item_master,
  SUM(CASE WHEN COALESCE(hm.unit_price, 0) = 0 AND COALESCE(ll.unit_price, 0) = 0 AND COALESCE(im.default_unit_price, 0) = 0 THEN 1 ELSE 0 END) AS no_price_available
FROM h_batch_inputs bi
JOIN h_batches b ON b.id = bi.batch_id
LEFT JOIN h_materials hm ON hm.id = bi.material_id AND hm.tenant_id = bi.tenant_id
LEFT JOIN item_master im
  ON im.tenant_id = bi.tenant_id
 AND TRIM(im.item_name) = TRIM(hm.material_name)
 AND im.item_type = 'raw_material'
LEFT JOIN last_lot ll ON ll.material_id = hm.id AND ll.rn = 1
WHERE bi.tenant_id = 2
  AND b.planned_date >= '2026-04-01' AND b.planned_date < '2026-05-01'
  AND (bi.unit_price IS NULL OR bi.unit_price = 0);

-- ───────────────────────────────────────────────────────────────────────────
-- D. 5월 inventory_deducted 플래그 정정 미리보기
--    Schema 정정 (2026-05-10):
--      - h_inventory_transactions.batch_id 컬럼은 없음 (reference_type='batch' + reference_id=batch_id)
--      - transaction_type enum: 'usage' | 'outbound' | 'receipt' | 'inbound'
--      - 실제 lot 차감은 lot_id IS NOT NULL 인 usage/outbound 행
--    실측 (5월 sample 8060-8069): reference_type='batch' 인데 lot_id=NULL
--      → "fake usage" 트랜잭션 생성됐지만 lot 미차감 → inventory_deducted=1 인데 실제 미차감
-- ───────────────────────────────────────────────────────────────────────────
SELECT
  '── D. 5월 inventory_deducted 플래그 정정 미리보기 ──' AS section;

-- D-1: lot_id IS NULL 인 fake usage 만 있고 진짜 lot 차감 없는 행 수
SELECT
  '5월 inventory_deducted=1 인데 실제 lot_id 차감 없는 행 (fake usage만 존재)' AS info,
  COUNT(*) AS rows_to_reset_flag
FROM h_batch_inputs bi
JOIN h_batches b ON b.id = bi.batch_id
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
      AND (
        tx.material_id = bi.material_id
        OR tx.material_id IN (
          SELECT hm.id FROM h_materials hm
          LEFT JOIN item_master im
            ON im.tenant_id = hm.tenant_id
           AND TRIM(im.item_name) = TRIM(hm.material_name)
          WHERE hm.tenant_id = bi.tenant_id
            AND (hm.id = bi.material_id OR im.id = bi.material_id)
        )
      )
  );

-- D-2: 5월 usage 트랜잭션의 lot_id 분포
SELECT
  '5월 usage 트랜잭션 lot_id 분포 (reference_type=batch)' AS info,
  COUNT(*) AS total_usage_tx,
  SUM(CASE WHEN tx.lot_id IS NOT NULL THEN 1 ELSE 0 END) AS with_lot,
  SUM(CASE WHEN tx.lot_id IS NULL THEN 1 ELSE 0 END) AS without_lot
FROM h_inventory_transactions tx
WHERE tx.tenant_id = 2
  AND tx.reference_type = 'batch'
  AND tx.transaction_type IN ('usage', 'outbound')
  AND tx.transaction_date >= '2026-05-01'
  AND tx.transaction_date < '2026-06-01';

-- D-3: 4월 usage 트랜잭션의 lot_id 분포 (대조군)
SELECT
  '4월 usage 트랜잭션 lot_id 분포 (대조군)' AS info,
  COUNT(*) AS total_usage_tx,
  SUM(CASE WHEN tx.lot_id IS NOT NULL THEN 1 ELSE 0 END) AS with_lot,
  SUM(CASE WHEN tx.lot_id IS NULL THEN 1 ELSE 0 END) AS without_lot
FROM h_inventory_transactions tx
WHERE tx.tenant_id = 2
  AND tx.reference_type = 'batch'
  AND tx.transaction_type IN ('usage', 'outbound')
  AND tx.transaction_date >= '2026-04-01'
  AND tx.transaction_date < '2026-05-01';

-- ───────────────────────────────────────────────────────────────────────────
-- E. 종합 영향 카운트
-- ───────────────────────────────────────────────────────────────────────────
SELECT
  '── E. 종합 영향 카운트 ──' AS section;

SELECT
  '5월 material_id 표준화 (item_master.id → h_materials.id)' AS action,
  (SELECT COUNT(*)
     FROM h_batch_inputs bi
     JOIN h_batches b ON b.id = bi.batch_id
     LEFT JOIN h_materials hm ON hm.id = bi.material_id AND hm.tenant_id = bi.tenant_id
     LEFT JOIN item_master im ON im.id = bi.material_id AND im.tenant_id = bi.tenant_id
     LEFT JOIN h_materials hm_byname
       ON hm.id IS NULL AND hm_byname.tenant_id = bi.tenant_id
      AND TRIM(hm_byname.material_name) = TRIM(im.item_name)
     WHERE bi.tenant_id = 2
       AND b.planned_date >= '2026-05-01' AND b.planned_date < '2026-06-01'
       AND hm.id IS NULL AND hm_byname.id IS NOT NULL
  ) AS affected_rows
UNION ALL
SELECT
  '5월 unit_price/total_price 백필' AS action,
  (SELECT COUNT(*)
     FROM h_batch_inputs bi
     JOIN h_batches b ON b.id = bi.batch_id
     WHERE bi.tenant_id = 2
       AND b.planned_date >= '2026-05-01' AND b.planned_date < '2026-06-01'
       AND (bi.unit_price IS NULL OR bi.unit_price = 0)
  ) AS affected_rows
UNION ALL
SELECT
  '4월 unit_price/total_price 백필' AS action,
  (SELECT COUNT(*)
     FROM h_batch_inputs bi
     JOIN h_batches b ON b.id = bi.batch_id
     WHERE bi.tenant_id = 2
       AND b.planned_date >= '2026-04-01' AND b.planned_date < '2026-05-01'
       AND (bi.unit_price IS NULL OR bi.unit_price = 0)
  ) AS affected_rows
UNION ALL
SELECT
  '5월 inventory_deducted=1 → 0 정정 (lot_id 차감 없는 fake usage)' AS action,
  (SELECT COUNT(*)
     FROM h_batch_inputs bi
     JOIN h_batches b ON b.id = bi.batch_id
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
       )
  ) AS affected_rows;
