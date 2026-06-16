-- =====================================================================
-- step12_macadamia_product_name_normalize_commit.sql
-- Purpose: 마카다미아 (혼합) 4종 — product_name 표기 통일 (마스터만)
-- Mode: COMMIT (실제 변경 수행)
--
-- 비즈니스 배경:
--   - 마카다미아왕찹쌀떡 = 1종 (흰 단독, 보고서 20210212055512)
--   - 마카다미아왕찹쌀떡(혼합) = 4종 (흰/복분자/쑥/단호박, 보고서 20210212055310)
--     동일 품목제조보고번호, 출고는 "혼합"으로 통합
--
-- 정책 (HACCP audit trail 보존, 옵션 C):
--   - 마스터 (h_products_v2, h_products) 만 UPDATE
--   - 이력성 테이블 (h_ccp_form_*, h_ccp_metal_sku_slots,
--     h_finished_product_inspection_items, h_visual_inspection_items)
--     은 작성 당시 이름 그대로 유지
--
-- 영향 (dryrun 결과):
--   - h_products_v2: 3 rows (id 34/36/37)
--   - h_products:    3 rows (id 18/19/20)
--   - id 35/301 (h_products_v2), id 17/54 (h_products) 는 변경 없음
--
-- 멱등 (재실행 안전):
--   - WHERE 절에 변경 전 product_name 매칭 추가
--     → 이미 변경된 경우 0행 영향
-- =====================================================================

-- ----------------------------------------------------------------------
-- 사전 백업
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS _bak_macadamia_product_name_20260510 (
  source_table VARCHAR(50) NOT NULL,
  product_id BIGINT NOT NULL,
  tenant_id INT NOT NULL,
  product_code VARCHAR(50),
  prev_product_name VARCHAR(100),
  new_product_name VARCHAR(100),
  backed_up_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (source_table, product_id)
);

-- h_products_v2 백업
INSERT IGNORE INTO _bak_macadamia_product_name_20260510
  (source_table, product_id, tenant_id, product_code, prev_product_name, new_product_name)
SELECT 'h_products_v2', id, tenant_id, product_code, product_name,
  CASE id
    WHEN 34 THEN '마카다미아왕찹쌀떡(혼합)-복분자'
    WHEN 36 THEN '마카다미아왕찹쌀떡(혼합)-쑥'
    WHEN 37 THEN '마카다미아왕찹쌀떡(혼합)-단호박'
  END
FROM h_products_v2
WHERE tenant_id = 2 AND id IN (34, 36, 37);

-- h_products 백업
INSERT IGNORE INTO _bak_macadamia_product_name_20260510
  (source_table, product_id, tenant_id, product_code, prev_product_name, new_product_name)
SELECT 'h_products', id, tenant_id, product_code, product_name,
  CASE id
    WHEN 18 THEN '마카다미아왕찹쌀떡(혼합)-단호박'
    WHEN 19 THEN '마카다미아왕찹쌀떡(혼합)-복분자'
    WHEN 20 THEN '마카다미아왕찹쌀떡(혼합)-쑥'
  END
FROM h_products
WHERE tenant_id = 2 AND id IN (18, 19, 20);

SELECT COUNT(*) AS backed_up_rows FROM _bak_macadamia_product_name_20260510;

-- ----------------------------------------------------------------------
-- STEP-1. h_products_v2 product_name 통일
-- ----------------------------------------------------------------------
UPDATE h_products_v2
SET product_name = '마카다미아왕찹쌀떡(혼합)-복분자'
WHERE tenant_id = 2 AND id = 34 AND product_name = '마카다미아복분자왕찹쌀떡';

UPDATE h_products_v2
SET product_name = '마카다미아왕찹쌀떡(혼합)-쑥'
WHERE tenant_id = 2 AND id = 36 AND product_name = '마카다미아쑥왕찹쌀떡';

UPDATE h_products_v2
SET product_name = '마카다미아왕찹쌀떡(혼합)-단호박'
WHERE tenant_id = 2 AND id = 37 AND product_name = '마카다미아단호박왕찹쌀떡';

-- ----------------------------------------------------------------------
-- STEP-2. h_products (legacy) product_name 통일
-- ----------------------------------------------------------------------
UPDATE h_products
SET product_name = '마카다미아왕찹쌀떡(혼합)-단호박', updated_at = NOW()
WHERE tenant_id = 2 AND id = 18 AND product_name = '마카다미아단호박왕찹쌀떡';

UPDATE h_products
SET product_name = '마카다미아왕찹쌀떡(혼합)-복분자', updated_at = NOW()
WHERE tenant_id = 2 AND id = 19 AND product_name = '마카다미아복분자왕찹쌀떡';

UPDATE h_products
SET product_name = '마카다미아왕찹쌀떡(혼합)-쑥', updated_at = NOW()
WHERE tenant_id = 2 AND id = 20 AND product_name = '마카다미아쑥왕찹쌀떡';

-- ----------------------------------------------------------------------
-- STEP-3. 검증
-- ----------------------------------------------------------------------
-- 변경 후 마스터 상태 확인
SELECT 'h_products_v2' AS tbl, id, product_code, product_name
FROM h_products_v2
WHERE tenant_id = 2 AND id IN (34, 35, 36, 37, 301)
UNION ALL
SELECT 'h_products', id, product_code, product_name
FROM h_products
WHERE tenant_id = 2 AND id IN (17, 18, 19, 20, 54)
ORDER BY tbl, id;

-- 잔존 구이름 검증 (마스터에서 0이어야 정상)
SELECT 'h_products_v2 still_old' AS check_name, COUNT(*) AS cnt
FROM h_products_v2
WHERE tenant_id = 2
  AND product_name IN ('마카다미아복분자왕찹쌀떡','마카다미아쑥왕찹쌀떡','마카다미아단호박왕찹쌀떡')
UNION ALL
SELECT 'h_products still_old', COUNT(*)
FROM h_products
WHERE tenant_id = 2
  AND product_name IN ('마카다미아복분자왕찹쌀떡','마카다미아쑥왕찹쌀떡','마카다미아단호박왕찹쌀떡');

-- 신규 통일 이름 정착 검증 (마스터에서 각 1행씩 정상)
SELECT 'h_products_v2 normalized' AS check_name, COUNT(*) AS cnt
FROM h_products_v2
WHERE tenant_id = 2 AND product_name LIKE '마카다미아왕찹쌀떡(혼합)-%'
UNION ALL
SELECT 'h_products normalized', COUNT(*)
FROM h_products
WHERE tenant_id = 2 AND product_name LIKE '마카다미아왕찹쌀떡(혼합)-%';
