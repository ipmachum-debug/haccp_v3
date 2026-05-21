-- ════════════════════════════════════════════════════════════════════════════
-- 제품 재고 부족 진단 스크립트 — PR-U (2026-05-20)
-- ════════════════════════════════════════════════════════════════════════════
--
-- 사용 사례:
--   매출 승인 시 "[SALE-XXXX] 제품 #N 재고 부족: 요청 X, 가용 0.000" 에러가
--   발생할 때, h_inventory_lots 가 비어 있는 진짜 원인을 진단합니다.
--
-- 사용법:
--   다음 두 변수를 실행 환경에서 치환한 뒤 mysql 클라이언트에서 실행하세요.
--     @target_product_id = 문제 발생 제품 ID (예: 295)
--     @target_tenant_id  = 운영 tenant ID (예: 1)
--
-- 예시:
--   mysql -u root -p haccp_tenant_db < \
--     <(sed -e 's/{{PRODUCT_ID}}/295/' -e 's/{{TENANT_ID}}/1/' \
--         scripts/diagnose-product-stock-shortage.sql)
--
-- 결과 해석:
--   섹션 [1] 제품 정보 — 제품명/단위/활성 여부 확인 (혼합/완제품 구분)
--   섹션 [2] LOT 현황   — h_inventory_lots 의 상태별 합계 (available > 0.001 여부)
--   섹션 [3] LOT 상세   — 최근 LOT 10건 (sku_id / material_id / status 분석)
--   섹션 [4] 번들 매핑  — sku_bundles 통한 child SKU 재고 (혼합 SKU 인 경우)
--   섹션 [5] 생산 이력  — 최근 production_batches (입고 이력 추적)
--   섹션 [6] 매출 이력  — accounting_sales 중 같은 제품 최근 5건 (소진 추적)
--   섹션 [7] 종합 진단  — "이게 원인일 가능성이 높음" 자동 판정
--
-- ════════════════════════════════════════════════════════════════════════════

SET @target_product_id = {{PRODUCT_ID}};
SET @target_tenant_id  = {{TENANT_ID}};

-- ─── [1] 제품 기본 정보 ─────────────────────────────────────────────────────
SELECT
  '[1] 제품 기본 정보' AS section,
  p.id              AS product_id,
  p.tenant_id,
  p.product_name,
  p.product_code,
  p.unit,
  p.is_active,
  p.created_at,
  p.updated_at
FROM h_products_v2 p
WHERE p.id = @target_product_id
  AND p.tenant_id = @target_tenant_id;

-- ─── [2] h_inventory_lots 상태별 집계 ───────────────────────────────────────
SELECT
  '[2] LOT 상태별 합계' AS section,
  COALESCE(status, '(null)')          AS status,
  COUNT(*)                            AS lot_count,
  ROUND(SUM(COALESCE(quantity, 0)), 3)            AS sum_quantity,
  ROUND(SUM(COALESCE(current_quantity, 0)), 3)    AS sum_current,
  ROUND(SUM(COALESCE(available_quantity, 0)), 3)  AS sum_available,
  ROUND(
    SUM(CASE WHEN COALESCE(available_quantity, 0) > 0.001
             THEN available_quantity ELSE 0 END), 3
  ) AS fefo_usable_sum
FROM h_inventory_lots
WHERE product_id = @target_product_id
  AND tenant_id  = @target_tenant_id
GROUP BY status
ORDER BY status;

-- ─── [3] h_inventory_lots 최근 10건 상세 ────────────────────────────────────
SELECT
  '[3] LOT 상세 (최근 10건)' AS section,
  l.id                  AS lot_id,
  l.lot_number,
  l.sku_id,
  l.product_id,
  l.material_id,
  l.status,
  ROUND(COALESCE(l.quantity, 0), 3)            AS quantity,
  ROUND(COALESCE(l.current_quantity, 0), 3)    AS current_qty,
  ROUND(COALESCE(l.available_quantity, 0), 3)  AS available_qty,
  l.unit,
  l.unit_price,
  l.receipt_date,
  l.expiry_date,
  l.created_at
FROM h_inventory_lots l
WHERE l.product_id = @target_product_id
  AND l.tenant_id  = @target_tenant_id
ORDER BY l.id DESC
LIMIT 10;

-- ─── [4] sku_bundles 매핑 (혼합 SKU 여부) ───────────────────────────────────
SELECT
  '[4] 번들 부모 SKU 후보' AS section,
  ps.id                AS parent_sku_id,
  ps.sku_code          AS parent_sku_code,
  ps.sku_name          AS parent_sku_name,
  ps.is_default,
  ps.is_active,
  ps.kg_per_sales_unit,
  (SELECT COUNT(*) FROM sku_bundles sb
     WHERE sb.parent_sku_id = ps.id AND sb.tenant_id = ps.tenant_id
  ) AS bundle_child_count
FROM item_master im
JOIN product_skus ps ON ps.item_id = im.id
  AND ps.tenant_id = im.tenant_id
  AND ps.is_active = 1
WHERE im.legacy_product_id = @target_product_id
  AND im.tenant_id = @target_tenant_id
ORDER BY ps.is_default DESC, ps.id ASC;

-- ─── [4-b] 번들 child SKU 별 재고 (혼합 SKU 인 경우만 결과 행이 있음) ───────
SELECT
  '[4-b] 번들 child 재고' AS section,
  sb.parent_sku_id,
  sb.child_sku_id,
  cps.sku_code              AS child_sku_code,
  cps.sku_name              AS child_sku_name,
  sb.default_ratio,
  sb.child_pieces,
  sb.child_piece_weight_g,
  ROUND(
    COALESCE(
      (SELECT SUM(available_quantity)
         FROM h_inventory_lots
         WHERE sku_id = sb.child_sku_id
           AND tenant_id = sb.tenant_id
           AND available_quantity > 0.001),
      0
    ), 3
  ) AS child_available_kg
FROM sku_bundles sb
JOIN product_skus cps ON cps.id = sb.child_sku_id
WHERE sb.parent_sku_id IN (
  SELECT ps.id
  FROM item_master im
  JOIN product_skus ps ON ps.item_id = im.id
    AND ps.tenant_id = im.tenant_id
    AND ps.is_active = 1
  WHERE im.legacy_product_id = @target_product_id
    AND im.tenant_id = @target_tenant_id
)
ORDER BY sb.parent_sku_id, sb.sort_order, sb.id;

-- ─── [5] 최근 production_batches (있다면) ───────────────────────────────────
-- 주의: 일부 운영에서는 production_batches.product_id 가 0/NULL 일 수 있음.
-- 그 때는 product_name 기반 검색이 필요. 여기서는 product_id 기반만 시도.
SELECT
  '[5] 최근 생산 배치 (최근 5건)' AS section,
  b.id                AS batch_id,
  b.batch_number,
  b.product_id,
  b.product_name,
  b.status,
  b.planned_quantity,
  b.actual_quantity,
  b.production_date,
  b.completed_at
FROM production_batches b
WHERE b.product_id = @target_product_id
  AND b.tenant_id  = @target_tenant_id
ORDER BY b.id DESC
LIMIT 5;

-- ─── [6] accounting_sales 매출 이력 (소진 추적용) ────────────────────────────
SELECT
  '[6] 최근 매출 (최근 5건)' AS section,
  s.id              AS sale_id,
  s.sale_date,
  s.product_id,
  s.item_name,
  s.quantity,
  s.status,
  s.amount,
  s.created_at
FROM accounting_sales s
WHERE s.product_id = @target_product_id
  AND s.tenant_id  = @target_tenant_id
ORDER BY s.id DESC
LIMIT 5;

-- ─── [7] 종합 자동 진단 ─────────────────────────────────────────────────────
SELECT
  '[7] 종합 진단' AS section,
  CASE
    WHEN (SELECT COUNT(*) FROM h_products_v2
            WHERE id = @target_product_id AND tenant_id = @target_tenant_id) = 0
      THEN 'ERROR: 제품 자체가 존재하지 않음 (잘못된 product_id)'

    WHEN EXISTS (
      SELECT 1 FROM sku_bundles sb
       WHERE sb.parent_sku_id IN (
         SELECT ps.id FROM item_master im
           JOIN product_skus ps ON ps.item_id = im.id
             AND ps.tenant_id = im.tenant_id
             AND ps.is_active = 1
         WHERE im.legacy_product_id = @target_product_id
           AND im.tenant_id = @target_tenant_id
       )
    )
      THEN 'BUNDLE PATH: 혼합 SKU — decomposeBundleOutbound 가 사용됨. [4-b] child_available_kg 가 0 이면 child SKU 재고 등록 필요'

    WHEN (SELECT COUNT(*) FROM h_inventory_lots
            WHERE product_id = @target_product_id
              AND tenant_id = @target_tenant_id) = 0
      THEN 'NO LOTS: h_inventory_lots 에 행 자체가 없음 → 생산 입고가 한 번도 안 됨 (생산관리에서 batch 완료 필요)'

    WHEN (SELECT COALESCE(SUM(available_quantity), 0) FROM h_inventory_lots
            WHERE product_id = @target_product_id
              AND tenant_id = @target_tenant_id
              AND status = "available"
              AND available_quantity > 0.001) < 0.001
      THEN 'EXHAUSTED: LOT 행은 있으나 available_quantity 가 모두 0 (이전 매출에서 다 소진됨 — 추가 생산 입고 필요)'

    ELSE 'UNKNOWN: 위 케이스에 해당하지 않음 — 코드 레벨 조사 필요'
  END AS diagnosis;
