-- =====================================================================
-- step12_macadamia_product_name_normalize_dryrun.sql
-- Purpose: 마카다미아 (혼합) 4종 — product_name 표기 통일 (마스터만)
-- Mode: DRYRUN (조회만 수행, 변경 없음)
--
-- 비즈니스 배경:
--   - 마카다미아왕찹쌀떡 = 1종 (흰 단독, 보고서 20210212055512)
--   - 마카다미아왕찹쌀떡(혼합) = 4종 (흰/복분자/쑥/단호박, 보고서 20210212055310)
--     → 4개 product 가 동일 품목제조보고번호 공유, 출고는 "혼합"으로 통합
--   - 표기 불일치: (혼합)-흰만 통일 형식, 나머지 3개는 구 이름
--   - 통일 형식 = "마카다미아왕찹쌀떡(혼합)-{flavor}"
--
-- 정책 (HACCP audit trail 보존):
--   - 마스터 테이블 (h_products_v2, h_products) 만 UPDATE
--   - 이력성 테이블 (h_ccp_form_records, h_ccp_metal_sku_slots,
--     h_finished_product_inspection_items, h_visual_inspection_items 등)
--     은 작성 당시 이름 그대로 유지 (audit trail).
-- =====================================================================

-- ----------------------------------------------------------------------
-- 1. h_products_v2 현재 상태 (변경 대상 5종 + 비교용 흰 1종)
-- ----------------------------------------------------------------------
SELECT
  id, product_code, product_name,
  CASE id
    WHEN 34  THEN '마카다미아왕찹쌀떡(혼합)-복분자'
    WHEN 36  THEN '마카다미아왕찹쌀떡(혼합)-쑥'
    WHEN 37  THEN '마카다미아왕찹쌀떡(혼합)-단호박'
    ELSE '(no change)'
  END AS new_name
FROM h_products_v2
WHERE tenant_id = 2 AND id IN (34, 35, 36, 37, 301)
ORDER BY id;

-- ----------------------------------------------------------------------
-- 2. h_products (legacy) 현재 상태
-- ----------------------------------------------------------------------
SELECT
  id, product_code, product_name,
  CASE id
    WHEN 18 THEN '마카다미아왕찹쌀떡(혼합)-단호박'
    WHEN 19 THEN '마카다미아왕찹쌀떡(혼합)-복분자'
    WHEN 20 THEN '마카다미아왕찹쌀떡(혼합)-쑥'
    ELSE '(no change)'
  END AS new_name
FROM h_products
WHERE tenant_id = 2 AND id IN (17, 18, 19, 20, 54)
ORDER BY id;

-- ----------------------------------------------------------------------
-- 3. 영향도 — 변경 대상 product_id 가 참조된 운영 테이블 (h_batches/h_recipe_headers)
--    참고: 이 테이블들은 product_id 만 저장 (product_name snapshot 없음 → 자동 반영)
-- ----------------------------------------------------------------------
SELECT 'h_batches' AS tbl, product_id, COUNT(*) AS cnt
FROM h_batches
WHERE tenant_id = 2 AND product_id IN (34, 36, 37)
GROUP BY product_id
UNION ALL
SELECT 'h_recipe_headers', product_id, COUNT(*)
FROM h_recipe_headers
WHERE tenant_id = 2 AND product_id IN (34, 36, 37)
GROUP BY product_id
ORDER BY tbl, product_id;

-- ----------------------------------------------------------------------
-- 4. snapshot 보존 정책 검증 — 이력성 테이블의 영향 받지 않을 행 수 (정보용)
-- ----------------------------------------------------------------------
SELECT 'h_ccp_form_records (preserved)' AS tbl, COUNT(*) AS preserved_rows
FROM h_ccp_form_records WHERE tenant_id = 2 AND product_name LIKE '%마카다미아%'
UNION ALL SELECT 'h_ccp_form_rows (preserved)', COUNT(*)
FROM h_ccp_form_rows WHERE tenant_id = 2 AND product_name LIKE '%마카다미아%'
UNION ALL SELECT 'h_ccp_instances (preserved)', COUNT(*)
FROM h_ccp_instances WHERE tenant_id = 2 AND product_name LIKE '%마카다미아%'
UNION ALL SELECT 'h_ccp_metal_sku_slots (preserved)', COUNT(*)
FROM h_ccp_metal_sku_slots WHERE tenant_id = 2 AND product_name LIKE '%마카다미아%'
UNION ALL SELECT 'h_finished_product_inspection_items (preserved)', COUNT(*)
FROM h_finished_product_inspection_items WHERE tenant_id = 2 AND product_name LIKE '%마카다미아%'
UNION ALL SELECT 'h_visual_inspection_items (preserved)', COUNT(*)
FROM h_visual_inspection_items WHERE tenant_id = 2 AND product_name LIKE '%마카다미아%';
