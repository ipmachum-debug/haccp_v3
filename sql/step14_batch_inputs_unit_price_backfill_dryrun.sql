-- ═══════════════════════════════════════════════════════════════════════════
-- step14: h_batch_inputs.unit_price / total_price 백필 + h_batches 원가 재계산 (DRY-RUN)
-- ═══════════════════════════════════════════════════════════════════════════
-- 배경: PR #297 진단 결과
--   - 4/13 이후 모든 h_batch_inputs 행에 unit_price=0 / total_price=0 박힘
--   - 원인: server/db/production/batch.ts, batchCRUD.ts, services/batchHydrator.ts
--           세 INSERT 사이트 모두 단가 컬럼 미설정 → DB DEFAULT 0
--   - 자동출고가 호출되지 않은 배치는 영원히 0 → 대시보드에 '-' 표시
--
-- 본 스크립트는 DRY-RUN — 백필 대상 건수만 출력하고 UPDATE 는 실행하지 않음.
--
-- 백필 정책:
--   1) h_batch_inputs.unit_price / total_price (NULL 또는 0)
--      → h_materials.unit_price (>0) 폴백 → 없으면 item_master.default_unit_price (>0)
--      → 정제수는 0 그대로 유지
--   2) h_batches.material_cost / actual_cost (NULL 또는 0)
--      → SUM(h_batch_inputs.total_price) (백필 후 값)
--   3) tenant_id 격리 (b.tenant_id = bi.tenant_id 강제)
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- (A) 백필 대상 1: h_batch_inputs (unit_price=0 OR NULL) — 마스터 단가 폴백 후 채울 행
-- ───────────────────────────────────────────────────────────────────────────
SELECT
  '=== (A) h_batch_inputs unit_price 백필 대상 ===' AS step,
  COUNT(*) AS rows_to_backfill,
  SUM(CASE WHEN m.unit_price > 0 THEN 1 ELSE 0 END) AS resolvable_h_materials,
  SUM(CASE WHEN m.unit_price IS NULL AND im.default_unit_price > 0 THEN 1 ELSE 0 END) AS resolvable_item_master,
  SUM(CASE
        WHEN COALESCE(m.unit_price, 0) <= 0
         AND COALESCE(im.default_unit_price, 0) <= 0
        THEN 1 ELSE 0 END) AS unresolvable_no_master_price,
  SUM(CASE
        WHEN COALESCE(m.material_name, im.item_name) LIKE '%정제수%'
        THEN 1 ELSE 0 END) AS water_excluded
FROM h_batch_inputs bi
LEFT JOIN h_materials m
  ON m.id = bi.material_id AND m.tenant_id = bi.tenant_id
LEFT JOIN item_master im
  ON im.id = bi.material_id AND im.tenant_id = bi.tenant_id AND im.item_type = 'raw_material'
WHERE bi.tenant_id = 2
  AND (bi.unit_price IS NULL OR bi.unit_price = 0);

-- ───────────────────────────────────────────────────────────────────────────
-- (B) 일별 분포 — 어느 날짜의 어느 배치가 영향받는지
-- ───────────────────────────────────────────────────────────────────────────
SELECT
  DATE(b.planned_date) AS pdate,
  COUNT(DISTINCT b.id) AS batch_cnt,
  COUNT(*) AS bi_rows,
  SUM(CASE WHEN COALESCE(m.unit_price, im.default_unit_price, 0) > 0 THEN 1 ELSE 0 END) AS resolvable,
  SUM(CASE
        WHEN COALESCE(m.material_name, im.item_name) LIKE '%정제수%'
        THEN 1 ELSE 0 END) AS water_rows
FROM h_batch_inputs bi
JOIN h_batches b ON b.id = bi.batch_id AND b.tenant_id = bi.tenant_id
LEFT JOIN h_materials m
  ON m.id = bi.material_id AND m.tenant_id = bi.tenant_id
LEFT JOIN item_master im
  ON im.id = bi.material_id AND im.tenant_id = bi.tenant_id AND im.item_type = 'raw_material'
WHERE b.tenant_id = 2
  AND (bi.unit_price IS NULL OR bi.unit_price = 0)
  AND b.planned_date >= '2026-04-01'
GROUP BY DATE(b.planned_date)
ORDER BY pdate;

-- ───────────────────────────────────────────────────────────────────────────
-- (C) 백필 대상 2: h_batches (material_cost / actual_cost NULL OR 0) — 백필 후 SUM 으로 채울 행
-- ───────────────────────────────────────────────────────────────────────────
SELECT
  '=== (C) h_batches material_cost / actual_cost 백필 대상 ===' AS step,
  COUNT(*) AS batches_to_recompute
FROM h_batches b
WHERE b.tenant_id = 2
  AND (b.material_cost IS NULL OR b.material_cost = 0
       OR b.actual_cost IS NULL OR b.actual_cost = 0)
  AND EXISTS (
    SELECT 1 FROM h_batch_inputs bi
    WHERE bi.batch_id = b.id AND bi.tenant_id = b.tenant_id
  );

-- ───────────────────────────────────────────────────────────────────────────
-- (D) 샘플 — 백필 후 어떻게 보일지 미리보기 (4/13 의 첫 배치)
-- ───────────────────────────────────────────────────────────────────────────
SELECT
  bi.batch_id,
  bi.id AS bi_id,
  COALESCE(m.material_name, im.item_name) AS material_name,
  bi.actual_quantity,
  bi.unit_price AS old_unit_price,
  COALESCE(NULLIF(bi.unit_price, 0),
           NULLIF(m.unit_price, 0),
           NULLIF(im.default_unit_price, 0),
           0) AS new_unit_price,
  bi.total_price AS old_total_price,
  CASE
    WHEN COALESCE(m.material_name, im.item_name) LIKE '%정제수%' THEN 0
    ELSE COALESCE(bi.actual_quantity, bi.planned_quantity, 0)
         * COALESCE(NULLIF(bi.unit_price, 0),
                    NULLIF(m.unit_price, 0),
                    NULLIF(im.default_unit_price, 0),
                    0)
  END AS new_total_price
FROM h_batch_inputs bi
JOIN h_batches b ON b.id = bi.batch_id AND b.tenant_id = bi.tenant_id
LEFT JOIN h_materials m
  ON m.id = bi.material_id AND m.tenant_id = bi.tenant_id
LEFT JOIN item_master im
  ON im.id = bi.material_id AND im.tenant_id = bi.tenant_id AND im.item_type = 'raw_material'
WHERE b.tenant_id = 2
  AND b.planned_date = '2026-04-13'
ORDER BY bi.batch_id, bi.id
LIMIT 30;
