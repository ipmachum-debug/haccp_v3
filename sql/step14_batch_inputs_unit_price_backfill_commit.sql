-- ═══════════════════════════════════════════════════════════════════════════
-- step14: h_batch_inputs.unit_price / total_price 백필 + h_batches 원가 재계산 (COMMIT)
-- ═══════════════════════════════════════════════════════════════════════════
-- 본 스크립트는 실제 UPDATE 를 실행. 트랜잭션 단일 BEGIN/COMMIT 로 묶음.
-- 실행 전 step14_*_dryrun.sql 의 (A)~(D) 결과 확인 필수.
-- 안전 장치: WHERE 조건으로 unit_price IS NULL OR = 0 인 행만, tenant_id=2 격리.
-- ═══════════════════════════════════════════════════════════════════════════

START TRANSACTION;

-- ───────────────────────────────────────────────────────────────────────────
-- (1) h_batch_inputs.unit_price 백필 — h_materials.unit_price 우선
--     정제수는 0 그대로 유지 (NOT LIKE 필터)
-- ───────────────────────────────────────────────────────────────────────────
UPDATE h_batch_inputs bi
JOIN h_materials m
  ON m.id = bi.material_id AND m.tenant_id = bi.tenant_id
SET
  bi.unit_price = m.unit_price,
  bi.total_price = COALESCE(bi.actual_quantity, bi.planned_quantity, 0) * m.unit_price
WHERE bi.tenant_id = 2
  AND (bi.unit_price IS NULL OR bi.unit_price = 0)
  AND m.unit_price IS NOT NULL AND m.unit_price > 0
  AND (m.material_name IS NULL OR m.material_name NOT LIKE '%정제수%');

SELECT
  'STEP1: h_batch_inputs h_materials 폴백 적용' AS log,
  ROW_COUNT() AS rows_affected;

-- ───────────────────────────────────────────────────────────────────────────
-- (2) h_batch_inputs.unit_price 백필 — item_master.default_unit_price 폴백
--     (1) 단계에서 못 채운 행만 (h_materials 미등록 또는 unit_price=0)
-- ───────────────────────────────────────────────────────────────────────────
UPDATE h_batch_inputs bi
JOIN item_master im
  ON im.id = bi.material_id AND im.tenant_id = bi.tenant_id
   AND im.item_type = 'raw_material'
LEFT JOIN h_materials m
  ON m.id = bi.material_id AND m.tenant_id = bi.tenant_id
SET
  bi.unit_price = im.default_unit_price,
  bi.total_price = COALESCE(bi.actual_quantity, bi.planned_quantity, 0) * im.default_unit_price
WHERE bi.tenant_id = 2
  AND (bi.unit_price IS NULL OR bi.unit_price = 0)
  AND im.default_unit_price IS NOT NULL AND im.default_unit_price > 0
  AND (im.item_name IS NULL OR im.item_name NOT LIKE '%정제수%')
  AND (m.material_name IS NULL OR m.material_name NOT LIKE '%정제수%');

SELECT
  'STEP2: h_batch_inputs item_master 폴백 적용' AS log,
  ROW_COUNT() AS rows_affected;

-- ───────────────────────────────────────────────────────────────────────────
-- (3) h_batches.material_cost / actual_cost 재계산
--     백필된 h_batch_inputs.total_price 의 SUM 으로 갱신 (정제수 제외)
-- ───────────────────────────────────────────────────────────────────────────
UPDATE h_batches b
JOIN (
  SELECT
    bi.batch_id,
    SUM(
      CASE
        WHEN COALESCE(m.material_name, im.item_name) LIKE '%정제수%' THEN 0
        ELSE COALESCE(bi.total_price, 0)
      END
    ) AS total_cost
  FROM h_batch_inputs bi
  LEFT JOIN h_materials m
    ON m.id = bi.material_id AND m.tenant_id = bi.tenant_id
  LEFT JOIN item_master im
    ON im.id = bi.material_id AND im.tenant_id = bi.tenant_id AND im.item_type = 'raw_material'
  WHERE bi.tenant_id = 2
  GROUP BY bi.batch_id
) AS s ON s.batch_id = b.id
SET
  b.material_cost = s.total_cost,
  b.actual_cost = s.total_cost,
  b.unit_cost = CASE
    WHEN COALESCE(b.actual_quantity, b.planned_quantity, 0) > 0
    THEN s.total_cost / COALESCE(b.actual_quantity, b.planned_quantity)
    ELSE 0
  END
WHERE b.tenant_id = 2
  AND s.total_cost > 0
  AND (
    b.material_cost IS NULL OR b.material_cost = 0
    OR b.actual_cost IS NULL OR b.actual_cost = 0
  );

SELECT
  'STEP3: h_batches material_cost / actual_cost / unit_cost 재계산' AS log,
  ROW_COUNT() AS rows_affected;

-- ───────────────────────────────────────────────────────────────────────────
-- (4) 검증 — 4/13 ~ 5/8 배치 원가 상태
-- ───────────────────────────────────────────────────────────────────────────
SELECT
  DATE(b.planned_date) AS pdate,
  COUNT(*) AS batch_cnt,
  SUM(CASE WHEN b.material_cost IS NULL OR b.material_cost = 0 THEN 1 ELSE 0 END) AS still_zero_mcost,
  SUM(CASE WHEN b.actual_cost IS NULL OR b.actual_cost = 0 THEN 1 ELSE 0 END) AS still_zero_acost,
  ROUND(SUM(b.material_cost), 0) AS total_material_cost,
  ROUND(AVG(b.unit_cost), 0) AS avg_unit_cost
FROM h_batches b
WHERE b.tenant_id = 2
  AND b.planned_date >= '2026-04-08'
  AND b.planned_date <= '2026-05-10'
GROUP BY DATE(b.planned_date)
ORDER BY pdate;

COMMIT;

SELECT '✅ step14 백필 완료' AS done;
