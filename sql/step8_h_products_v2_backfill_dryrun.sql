-- ============================================================
-- Step 8 DRY-RUN: h_products_v2 canonical sync backfill (4건)
-- ============================================================
-- 배경:
--   Step 2에서 item_master에만 INSERT, h_products_v2 canonical sync 누락
--   → product.list API (h_products_v2 only) 에서 검색 안됨
--   → 생산배치 "하루 복수품목 일괄 배치 생성" 화면에서 검색 안됨
--
-- 해결:
--   item_master.id = h_products_v2.id (canonical sync) 유지하며
--   누락된 4건을 h_products_v2에 INSERT
--
-- 대상 4건:
--   id=295  30089  카스테라앙금인절미(혼합) 냉동  찹쌀떡
--   id=296  30090  카스테라앙금인절미(혼합) 실온  찹쌀떡
--   id=297  30091  쑥인절미(쑥향)               인절미
--   id=298  30092  순인절미                     인절미
--
-- 참고:
--   id=301 (30093 마카다미아왕찹쌀떡(혼합)-흰) 은 Step 7에서 이미 sync됨
--   h_products_v2 컬럼: id, tenant_id, product_code, product_name, version,
--                       category, unit, shelf_life_days, description, is_active, created_at
-- ============================================================

START TRANSACTION;

-- =================== 누락 4건 INSERT (id 강제 지정) ===================
INSERT INTO h_products_v2 (id, tenant_id, product_code, product_name, category, unit, is_active, created_at)
VALUES
  (295, 2, '30089', '카스테라앙금인절미(혼합) 냉동', '찹쌀떡', 'kg', 1, NOW()),
  (296, 2, '30090', '카스테라앙금인절미(혼합) 실온', '찹쌀떡', 'kg', 1, NOW()),
  (297, 2, '30091', '쑥인절미(쑥향)',               '인절미', 'kg', 1, NOW()),
  (298, 2, '30092', '순인절미',                     '인절미', 'kg', 1, NOW());

-- =================== 검증 쿼리 ===================
-- 1) 5건 모두 존재 (4건 신규 + 1건 기존)
SELECT 
  im.id AS im_id,
  im.item_code,
  im.item_name,
  im.item_type,
  pv.id AS pv_id,
  pv.product_code AS pv_code,
  pv.product_name AS pv_name,
  pv.category AS pv_category,
  pv.is_active AS pv_active,
  CASE 
    WHEN pv.id IS NULL THEN '❌ 누락'
    WHEN im.id = pv.id THEN '✅ canonical sync'
    ELSE '⚠️ id 불일치'
  END AS sync_status
FROM item_master im
LEFT JOIN h_products_v2 pv ON im.id = pv.id AND pv.tenant_id = 2
WHERE im.tenant_id = 2 AND im.item_code IN ('30089','30090','30091','30092','30093')
ORDER BY im.item_code;

-- 2) h_mf_reports 연결 확인 (5건 모두 BOM 보유)
SELECT
  im.item_code,
  im.item_name,
  mr.id AS report_id,
  mr.report_no,
  v.id AS latest_version_id,
  v.version_no
FROM item_master im
LEFT JOIN h_mf_reports mr ON mr.product_id = im.id AND mr.tenant_id = 2
LEFT JOIN h_mf_report_versions v ON v.mf_report_id = mr.id 
  AND v.id = (SELECT MAX(id) FROM h_mf_report_versions WHERE mf_report_id = mr.id)
WHERE im.tenant_id = 2 AND im.item_code IN ('30089','30090','30091','30092','30093')
ORDER BY im.item_code;

-- 3) product.list API가 반환할 활성 제품 수 (검증)
SELECT COUNT(*) AS active_v2_count
FROM h_products_v2
WHERE tenant_id = 2 AND is_active = 1;

-- DRY-RUN: 모든 변경 롤백
ROLLBACK;

SELECT 'DRY-RUN COMPLETED — ROLLBACK 됨. 결과 확인 후 commit 버전 실행하세요.' AS status;
