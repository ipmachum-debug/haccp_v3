-- ═══════════════════════════════════════════════════════════════════════════
-- step17 L4 모니터링 view: v_zero_priced_recent_inputs
--
-- 목적: 최근 30일 동안 unit_price=0 (혹은 NULL) 으로 INSERT 된
--       h_batch_inputs 행을 모니터링. PR #298 의 F5-5 + L3 가
--       미래 발생을 차단하지만, 마스터 단가 미입력 신규 원재료 등
--       엣지 케이스가 있을 수 있음 → 운영자 대시보드/알림용.
--
-- 컬럼:
--   - tenant_id          : 멀티테넌트 격리
--   - batch_id           : 배치 ID
--   - batch_code         : 배치 코드 (가독성)
--   - planned_date       : 계획일
--   - bi_id              : h_batch_inputs.id
--   - material_id        : 원재료 ID (h_batch_inputs 그대로; 표준화 후 h_materials.id)
--   - material_name      : 듀얼 lookup (h_materials → item_master 폴백)
--   - planned_quantity   : 계획 수량
--   - actual_quantity    : 실제 수량
--   - unit               : 단위
--   - unit_price         : 단가 (0 또는 NULL 인 행만 노출)
--   - inventory_deducted : 차감 플래그
--   - hm_unit_price      : h_materials 마스터 단가 (참조용)
--   - im_default_price   : item_master 기본단가 (참조용)
--   - last_lot_price     : 최신 입고 lot 단가 (참조용)
--   - resolution_hint    : 어떤 마스터에 단가를 입력하면 해결될지 힌트
--
-- 정제수 제외 (비용 계산 대상 아님).
-- ═══════════════════════════════════════════════════════════════════════════

USE haccp_tenant_db;

DROP VIEW IF EXISTS v_zero_priced_recent_inputs;

CREATE VIEW v_zero_priced_recent_inputs AS
SELECT
  bi.tenant_id,
  bi.batch_id,
  b.batch_code,
  b.planned_date,
  bi.id AS bi_id,
  bi.material_id,
  COALESCE(hm.material_name, im.item_name) AS material_name,
  bi.planned_quantity,
  bi.actual_quantity,
  bi.unit,
  bi.unit_price,
  bi.inventory_deducted,
  hm.unit_price AS hm_unit_price,
  im.default_unit_price AS im_default_price,
  (
    SELECT l.unit_price
    FROM h_inventory_lots l
    WHERE l.tenant_id = bi.tenant_id
      AND l.material_id = bi.material_id
      AND l.unit_price > 0
    ORDER BY l.receipt_date DESC, l.id DESC
    LIMIT 1
  ) AS last_lot_price,
  CASE
    WHEN COALESCE(hm.unit_price, 0) > 0 THEN 'h_materials.unit_price 있음 — 재차감으로 해결'
    WHEN (SELECT l.unit_price FROM h_inventory_lots l
          WHERE l.tenant_id = bi.tenant_id AND l.material_id = bi.material_id
            AND l.unit_price > 0
          ORDER BY l.receipt_date DESC, l.id DESC LIMIT 1) > 0
      THEN '최신 lot 단가 있음 — 재차감으로 해결'
    WHEN COALESCE(im.default_unit_price, 0) > 0
      THEN 'item_master.default_unit_price 있음 — 재차감으로 해결'
    ELSE '단가 정보 없음 — 마스터에 단가 입력 필요'
  END AS resolution_hint
FROM h_batch_inputs bi
JOIN h_batches b ON b.id = bi.batch_id
LEFT JOIN h_materials hm ON hm.id = bi.material_id AND hm.tenant_id = bi.tenant_id
LEFT JOIN item_master im
  ON im.tenant_id = bi.tenant_id
 AND im.item_type = 'raw_material'
 AND (
   im.id = bi.material_id
   OR TRIM(im.item_name) = TRIM(hm.material_name)
 )
WHERE
  -- 단가 0 또는 NULL
  (bi.unit_price IS NULL OR bi.unit_price = 0)
  -- 최근 30일
  AND b.planned_date >= DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY)
  -- 정제수 제외
  AND (
    COALESCE(hm.material_name, im.item_name) IS NULL
    OR (
      COALESCE(hm.material_name, im.item_name) NOT LIKE '%정제수%'
      AND LOWER(COALESCE(hm.material_name, im.item_name)) NOT LIKE '%purified water%'
    )
  );

-- 동작 확인: tenant=2 의 zero-price 행 카운트
SELECT '── L4 view 동작 확인 ──' AS info;
SELECT COUNT(*) AS zero_priced_recent_count
FROM v_zero_priced_recent_inputs
WHERE tenant_id = 2;

-- 샘플 미리보기 (resolution_hint 별)
SELECT '── L4 view 샘플 (tenant=2) ──' AS info;
SELECT batch_code, material_name, unit_price, hm_unit_price, im_default_price, last_lot_price, resolution_hint
FROM v_zero_priced_recent_inputs
WHERE tenant_id = 2
ORDER BY planned_date DESC, batch_id DESC, bi_id ASC
LIMIT 30;
