-- ============================================================================
-- 완제품(제품) 재고 정합 진단 (병③, READ-ONLY)
-- ----------------------------------------------------------------------------
-- docs/architecture/10-finished-goods-identity-diagnosis.md 의
--   "네 개의 현재고 정의(A/B/C/D)가 서로 다르다" 를 tenant2 실데이터로 수치화.
-- 성격: 전부 SELECT (읽기 전용). 어떤 행도 변경하지 않음.
-- 실행: Genspark 서버 DB. 결과 캡처 공유 → 정합 방향(SKU LOT 정본) 착수 규모 확정.
--
-- 소스/단위 (문서 10 표):
--   A) 메인화면: Σ완료배치 actual_quantity(kg) − Σ제품출고 quantity   [kg]
--   B) 운영정본: Σ SKU LOT available_quantity                         [판매단위/혼합]
--      B') 환산: Σ(available × kg_per_sales_unit)                     [kg 환산]
--   C) 고아집계: h_inventory(product_id).total_quantity               [kg, 죽은 카운터]
-- ============================================================================
SET @t := 2;

-- ── Q1. 제품별 A / B / B' / C 비교 (핵심) ─────────────────────────────────
--   product 정본 = h_products_v2. SKU 는 item_master.legacy_product_id 로 연결.
SELECT
  p.id                                             AS product_id,
  p.product_name,
  -- A: 완료배치 kg 입고
  ROUND(COALESCE(bt.batch_kg, 0), 3)               AS a_batch_completed_kg,
  ROUND(COALESCE(ob.out_qty, 0), 3)                AS a_outbound_qty_raw,   -- 단위 혼합 주의
  -- B: SKU LOT 원합계(판매단위 혼합) / B': kg 환산
  ROUND(COALESCE(lot.raw_sum, 0), 3)               AS b_lot_raw_sum,
  ROUND(COALESCE(lot.kg_equiv, 0), 3)              AS b_lot_kg_equiv,
  -- C: 고아 집계 kg
  ROUND(COALESCE(inv.agg_kg, 0), 3)                AS c_agg_kg,
  -- 괴리
  ROUND(COALESCE(bt.batch_kg,0) - COALESCE(lot.kg_equiv,0), 3) AS gap_A_vs_B_kg,
  ROUND(COALESCE(inv.agg_kg,0)  - COALESCE(lot.kg_equiv,0), 3) AS gap_C_vs_B_kg
FROM h_products_v2 p
LEFT JOIN (
  SELECT product_id, SUM(actual_quantity) AS batch_kg
  FROM h_batches
  WHERE tenant_id=@t AND status='completed'
  GROUP BY product_id
) bt ON bt.product_id = p.id
LEFT JOIN (
  -- 제품출고: ⚠️ h_product_outbound 에는 sku_id 컬럼이 없다(실측 확인).
  --   실제 컬럼: batch_id, lot_id, product_name(string), quantity, unit, lot_number.
  --   앱 ProductStockView 와 동일하게 product_name 으로 집계(문자열 매칭 — fragile).
  --   (lot_id 도 대부분 NULL 이라 lot 경유 매핑 불가 → product_name 이 유일 경로)
  SELECT product_name, SUM(quantity) AS out_qty
  FROM h_product_outbound
  WHERE tenant_id=@t AND status='confirmed'
  GROUP BY product_name
) ob ON ob.product_name = p.product_name
LEFT JOIN (
  SELECT l.product_id,
         SUM(l.available_quantity) AS raw_sum,
         SUM(l.available_quantity * COALESCE(s.kg_per_sales_unit, 1)) AS kg_equiv
  FROM h_inventory_lots l
  LEFT JOIN product_skus s ON s.id = l.sku_id
  WHERE l.tenant_id=@t AND l.product_id IS NOT NULL AND l.status='available'
  GROUP BY l.product_id
) lot ON lot.product_id = p.id
LEFT JOIN (
  SELECT product_id, SUM(total_quantity) AS agg_kg
  FROM h_inventory
  WHERE tenant_id=@t AND product_id IS NOT NULL
  GROUP BY product_id
) inv ON inv.product_id = p.id
WHERE p.tenant_id = @t
  AND (bt.batch_kg IS NOT NULL OR lot.raw_sum IS NOT NULL OR inv.agg_kg IS NOT NULL)
ORDER BY ABS(COALESCE(bt.batch_kg,0) - COALESCE(lot.kg_equiv,0)) DESC;

-- ── Q2. SKU LOT 단위 드리프트: lot.unit ≠ product_skus.sales_unit ──────────
SELECT 'Q2_lot_unit_drift' AS metric, COUNT(*) AS cnt
FROM h_inventory_lots l
JOIN product_skus s ON s.id = l.sku_id
WHERE l.tenant_id=@t AND l.product_id IS NOT NULL
  AND TRIM(COALESCE(l.unit,'')) <> TRIM(COALESCE(s.sales_unit,''));

-- (상세 상위 50)
SELECT l.id AS lot_id, l.lot_number, l.product_id, l.sku_id,
       l.unit AS lot_unit, s.sales_unit AS sku_unit,
       l.available_quantity, s.kg_per_sales_unit
FROM h_inventory_lots l
JOIN product_skus s ON s.id = l.sku_id
WHERE l.tenant_id=@t AND l.product_id IS NOT NULL
  AND TRIM(COALESCE(l.unit,'')) <> TRIM(COALESCE(s.sales_unit,''))
ORDER BY l.id DESC LIMIT 50;

-- ── Q3. 한 제품에 서로 다른 LOT 단위가 2개 이상 (D 실사버그 노출면) ───────
SELECT 'Q3_products_mixed_lot_units' AS metric, COUNT(*) AS cnt
FROM (
  SELECT product_id
  FROM h_inventory_lots
  WHERE tenant_id=@t AND product_id IS NOT NULL AND status='available'
  GROUP BY product_id
  HAVING COUNT(DISTINCT unit) > 1
) d;

-- ── Q4. sku_id 없는 제품 LOT (kg fallback 경로 생성분) ────────────────────
SELECT 'Q4_product_lots_without_sku' AS metric,
       COUNT(*) AS cnt,
       ROUND(SUM(available_quantity), 3) AS qty
FROM h_inventory_lots
WHERE tenant_id=@t AND product_id IS NOT NULL AND sku_id IS NULL AND status='available';

-- ── Q5. 고아 집계 요약: 제품 h_inventory 행 수 vs ΣLOT kg환산 총계 ────────
SELECT 'Q5_orphan_product_agg' AS metric,
       (SELECT COUNT(*) FROM h_inventory WHERE tenant_id=@t AND product_id IS NOT NULL) AS agg_rows,
       (SELECT ROUND(SUM(total_quantity),3) FROM h_inventory WHERE tenant_id=@t AND product_id IS NOT NULL) AS agg_total_kg,
       (SELECT ROUND(SUM(l.available_quantity * COALESCE(s.kg_per_sales_unit,1)),3)
          FROM h_inventory_lots l LEFT JOIN product_skus s ON s.id=l.sku_id
          WHERE l.tenant_id=@t AND l.product_id IS NOT NULL AND l.status='available') AS lot_kg_equiv_total;

-- ════════════════════════════════════════════════════════════════════════
-- 요약: Q1 의 gap_A_vs_B_kg / gap_C_vs_B_kg 가 크면 → SKU LOT 정본 통일 시급.
--   Q2/Q3 가 크면 → 단위 표준화(LOT.unit := sku.sales_unit) 선행.
--   Q4 가 크면 → kg fallback LOT 이 환산을 왜곡 → SKU 매핑 보정 필요.
-- ════════════════════════════════════════════════════════════════════════
