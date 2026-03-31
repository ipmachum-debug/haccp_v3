-- ============================================================
-- 제품 통합 마이그레이션: PRD-003 + 30081 → 30080 찹쌀떡(떡마루)
-- 실행일: 2026-03-28
-- 대상 테넌트: tenant_id = 2 (단지)
-- ============================================================
-- 문제:
--   찹쌀떡이 3개의 코드로 분산되어 재고 관리 페이지에 중복 표시됨
--   - item_master id=256, code=PRD-003, name=찹쌀떡(떡마루) → legacyProductId=82
--   - item_master id=262, code=30081, name=찹쌀떡 → legacyProductId=83
--   - h_products_v2 id=82, code=30080 (target)
--   - h_products_v2 id=83, code=30081 (deprecated)
--
-- 해결:
--   모든 데이터를 product_id=82 (30080, 찹쌀떡(떡마루))로 통합
-- ============================================================

START TRANSACTION;

-- 1. h_batches: product_id 83 → 82 (1건 배치, 1000kg)
UPDATE h_batches SET product_id = 82 WHERE tenant_id = 2 AND product_id = 83;

-- 2. h_product_outbound: product_name '찹쌀떡' → '찹쌀떡(떡마루)' (6건, 14937.6kg)
UPDATE h_product_outbound SET product_name = '찹쌀떡(떡마루)' WHERE tenant_id = 2 AND product_name = '찹쌀떡';

-- 3. ccp_process_group_products: product_id 83 삭제 (82와 동일 그룹이므로 중복)
DELETE FROM ccp_process_group_products WHERE product_id = 83 AND tenant_id = 2;

-- 4. item_master: PRD-003 → 30080으로 코드 변경
UPDATE item_master SET item_code = '30080' WHERE id = 256 AND tenant_id = 2;

-- 5. product_skus: SKU 코드 업데이트 (PRD-003-pack → 30080-pack)
UPDATE product_skus SET sku_code = '30080-pack' WHERE id = 175 AND item_id = 256;

-- 6. item_master id=262 (30081, 찹쌀떡) 삭제 (이미 is_active=0)
DELETE FROM item_master WHERE id = 262 AND tenant_id = 2;

COMMIT;

-- ============================================================
-- 검증 쿼리
-- ============================================================
-- 통합 후 결과:
--   item_master: 30080 찹쌀떡(떡마루) → legacyProductId=82 (1건만 존재)
--   h_batches: product_id=82 → 35 batches, 31,900 kg (30900 + 1000)
--   h_product_outbound: 찹쌀떡(떡마루) → 6건, 14,937.6 kg
--   재고: 31,900 - 14,937.6 = 16,962.4 kg
