-- ============================================================================
-- 품목 정체성 / 재고 / 고아 / 테넌트 격리 진단 — 전부 SELECT (쓰기 없음)
-- docs/architecture/11-identity-policy-v3.md §1 의 숫자를 재생산한다.
-- 사용: mysql -u ... haccp_tenant_db < scripts/diag/identity-namespace-diag.sql
-- 2026-10-12 덤프 기준값은 11 문서 참조. 숫자가 바뀌면 문서를 갱신한다.
-- ============================================================================

-- A. 정체성 테이블 행수
SELECT 'h_products' t, COUNT(*) n FROM h_products
UNION ALL SELECT 'h_products_v2', COUNT(*) FROM h_products_v2
UNION ALL SELECT 'item_master', COUNT(*) FROM item_master
UNION ALL SELECT 'h_materials', COUNT(*) FROM h_materials
UNION ALL SELECT 'h_mf_reports', COUNT(*) FROM h_mf_reports
UNION ALL SELECT 'h_mf_ingredients', COUNT(*) FROM h_mf_ingredients
UNION ALL SELECT 'product_skus', COUNT(*) FROM product_skus
UNION ALL SELECT 'h_batches', COUNT(*) FROM h_batches
UNION ALL SELECT 'h_batch_inputs', COUNT(*) FROM h_batch_inputs
UNION ALL SELECT 'h_inventory', COUNT(*) FROM h_inventory
UNION ALL SELECT 'h_inventory_lots', COUNT(*) FROM h_inventory_lots
UNION ALL SELECT 'h_inventory_transactions', COUNT(*) FROM h_inventory_transactions;

-- A1. id 공간 겹침 (h_materials vs item_master) — 0 이어야 안전
SELECT 'id_overlap_materials_itemmaster' k, COUNT(*) n FROM h_materials m JOIN item_master im ON im.id = m.id;

-- A2. 수량 세계 → 상세 테이블 id (기대: 전부 일치)
SELECT 'batches.product_id in v2' k, COUNT(*) n, (SELECT COUNT(*) FROM h_batches) total FROM h_batches b JOIN h_products_v2 p ON p.id = b.product_id
UNION ALL SELECT 'batch_inputs.material_id in h_materials', COUNT(*), (SELECT COUNT(*) FROM h_batch_inputs) FROM h_batch_inputs bi JOIN h_materials m ON m.id = bi.material_id
UNION ALL SELECT 'lots.material_id in h_materials', COUNT(*), (SELECT COUNT(*) FROM h_inventory_lots WHERE material_id IS NOT NULL) FROM h_inventory_lots l JOIN h_materials m ON m.id = l.material_id
UNION ALL SELECT 'inventory.material_id in h_materials', COUNT(*), (SELECT COUNT(*) FROM h_inventory) FROM h_inventory i JOIN h_materials m ON m.id = i.material_id
UNION ALL SELECT 'inv_tx.material_id in h_materials', COUNT(*), (SELECT COUNT(*) FROM h_inventory_transactions WHERE material_id IS NOT NULL) FROM h_inventory_transactions t JOIN h_materials m ON m.id = t.material_id;

-- A3. 원장 material_id 혼용 (item_master 공간) — 3단계 변환 대상
SELECT t.material_id, im.item_name, im.legacy_material_id, t.transaction_type, t.action_type,
       MIN(t.transaction_date) first_dt, MAX(t.transaction_date) last_dt, COUNT(*) n
FROM h_inventory_transactions t
JOIN item_master im ON im.id = t.material_id
WHERE t.material_id NOT IN (SELECT id FROM h_materials)
GROUP BY t.material_id, im.item_name, im.legacy_material_id, t.transaction_type, t.action_type
ORDER BY n DESC;

-- A4. BOM → item_master id (기대: 전부 일치)
SELECT 'mf_reports.product_id in item_master' k, COUNT(*) n, (SELECT COUNT(*) FROM h_mf_reports) total FROM h_mf_reports r JOIN item_master im ON im.id = r.product_id
UNION ALL SELECT 'mf_reports → legacy → v2', COUNT(*), (SELECT COUNT(*) FROM h_mf_reports) FROM h_mf_reports r JOIN item_master im ON im.id = r.product_id JOIN h_products_v2 p ON p.id = im.legacy_product_id
UNION ALL SELECT 'mf_ingredients.material_id in item_master', COUNT(*), (SELECT COUNT(*) FROM h_mf_ingredients WHERE material_id IS NOT NULL) FROM h_mf_ingredients i JOIN item_master im ON im.id = i.material_id
UNION ALL SELECT 'mf_ingredients → legacy → h_materials', COUNT(*), (SELECT COUNT(*) FROM h_mf_ingredients WHERE material_id IS NOT NULL) FROM h_mf_ingredients i JOIN item_master im ON im.id = i.material_id JOIN h_materials m ON m.id = im.legacy_material_id
UNION ALL SELECT 'product_skus.item_id in item_master', COUNT(*), (SELECT COUNT(*) FROM product_skus) FROM product_skus s JOIN item_master im ON im.id = s.item_id;

-- A5. 다리 커버리지 / dangling
SELECT 'v2 covered by legacy_product_id' k, COUNT(DISTINCT p.id) n, (SELECT COUNT(*) FROM h_products_v2) total FROM h_products_v2 p JOIN item_master im ON im.legacy_product_id = p.id
UNION ALL SELECT 'h_materials covered by legacy_material_id', COUNT(DISTINCT m.id), (SELECT COUNT(*) FROM h_materials) FROM h_materials m JOIN item_master im ON im.legacy_material_id = m.id
UNION ALL SELECT 'dangling legacy_product_id', COUNT(*), NULL FROM item_master WHERE legacy_product_id IS NOT NULL AND legacy_product_id NOT IN (SELECT id FROM h_products_v2)
UNION ALL SELECT 'dangling legacy_material_id', COUNT(*), NULL FROM item_master WHERE legacy_material_id IS NOT NULL AND legacy_material_id NOT IN (SELECT id FROM h_materials);

-- A6. 미연결 품목 (수동 연결 대상)
SELECT 'v2_not_in_item_master' k, p.id, p.product_name name, p.tenant_id FROM h_products_v2 p
 WHERE p.id NOT IN (SELECT legacy_product_id FROM item_master WHERE legacy_product_id IS NOT NULL)
UNION ALL
SELECT 'material_not_in_item_master_but_used', m.id, m.material_name, m.tenant_id FROM h_materials m
 WHERE m.id NOT IN (SELECT legacy_material_id FROM item_master WHERE legacy_material_id IS NOT NULL)
   AND (EXISTS (SELECT 1 FROM h_batch_inputs bi WHERE bi.material_id = m.id) OR EXISTS (SELECT 1 FROM h_inventory i WHERE i.material_id = m.id));

-- B. 재고 3원장 불일치 — 분류 (자동 보정 금지)
SELECT i.material_id, m.material_name, i.available_quantity master_avail,
       COALESCE(la.lot_avail, 0) lot_avail, COALESCE(la.lot_cnt, 0) lot_cnt,
       ROUND(i.available_quantity - COALESCE(la.lot_avail, 0), 3) diff,
       CASE WHEN COALESCE(la.lot_cnt, 0) = 0 THEN 'NO_LOT'
            WHEN i.available_quantity > COALESCE(la.lot_avail, 0) THEN 'MASTER_GT_LOT'
            ELSE 'MASTER_LT_LOT' END kind
FROM h_inventory i
LEFT JOIN h_materials m ON m.id = i.material_id AND m.tenant_id = i.tenant_id
LEFT JOIN (SELECT tenant_id, material_id, SUM(available_quantity) lot_avail, COUNT(*) lot_cnt
             FROM h_inventory_lots WHERE COALESCE(status, 'available') = 'available'
            GROUP BY tenant_id, material_id) la ON la.tenant_id = i.tenant_id AND la.material_id = i.material_id
WHERE ABS(i.available_quantity - COALESCE(la.lot_avail, 0)) > 0.001
ORDER BY ABS(i.available_quantity - COALESCE(la.lot_avail, 0)) DESC;

-- B1. 음수 (PR #447 이후 "입고 대기" 표시 대상)
SELECT 'negative_lots' k, COUNT(*) n FROM h_inventory_lots WHERE available_quantity < 0
UNION ALL SELECT 'negative_master', COUNT(*) FROM h_inventory WHERE available_quantity < 0;

-- C. 고아 (격리 대상 — 삭제 금지)
SELECT 'batch_inputs_without_batch' k, COUNT(*) n FROM h_batch_inputs WHERE batch_id NOT IN (SELECT id FROM h_batches)
UNION ALL SELECT 'production_sku_output_without_batch', COUNT(*) FROM production_sku_output WHERE batch_id NOT IN (SELECT id FROM h_batches)
UNION ALL SELECT 'lots_material_missing', COUNT(*) FROM h_inventory_lots WHERE material_id IS NOT NULL AND material_id NOT IN (SELECT id FROM h_materials)
UNION ALL SELECT 'lots_inventory_id_missing', COUNT(*) FROM h_inventory_lots WHERE inventory_id IS NOT NULL AND inventory_id <> 0 AND inventory_id NOT IN (SELECT id FROM h_inventory)
UNION ALL SELECT 'lots_inventory_id_missing_product', COUNT(*) FROM h_inventory_lots WHERE inventory_id IS NOT NULL AND inventory_id <> 0 AND inventory_id NOT IN (SELECT id FROM h_inventory) AND product_id IS NOT NULL
UNION ALL SELECT 'inv_tx_lot_missing', COUNT(*) FROM h_inventory_transactions WHERE lot_id IS NOT NULL AND lot_id <> 0 AND lot_id NOT IN (SELECT id FROM h_inventory_lots)
UNION ALL SELECT 'inv_tx_lot_null', COUNT(*) FROM h_inventory_transactions WHERE lot_id IS NULL
UNION ALL SELECT 'mf_ingredients_version_missing', COUNT(*) FROM h_mf_ingredients WHERE mf_report_version_id NOT IN (SELECT id FROM h_mf_report_versions);

-- D. 테넌트 격리 (기대: 전부 0)
SELECT 'batch_product_tenant_mismatch' k, COUNT(*) n FROM h_batches b JOIN h_products_v2 p ON p.id = b.product_id WHERE p.tenant_id <> b.tenant_id
UNION ALL SELECT 'batch_inputs_batch_tenant_mismatch', COUNT(*) FROM h_batch_inputs bi JOIN h_batches b ON b.id = bi.batch_id WHERE b.tenant_id <> bi.tenant_id
UNION ALL SELECT 'batch_inputs_material_tenant_mismatch', COUNT(*) FROM h_batch_inputs bi JOIN h_materials m ON m.id = bi.material_id WHERE m.tenant_id <> bi.tenant_id
UNION ALL SELECT 'inv_tx_lot_tenant_mismatch', COUNT(*) FROM h_inventory_transactions t JOIN h_inventory_lots l ON l.id = t.lot_id WHERE l.tenant_id <> t.tenant_id
UNION ALL SELECT 'mf_reports_item_tenant_mismatch', COUNT(*) FROM h_mf_reports r JOIN item_master im ON im.id = r.product_id WHERE im.tenant_id <> r.tenant_id
UNION ALL SELECT 'product_skus_item_tenant_mismatch', COUNT(*) FROM product_skus s JOIN item_master im ON im.id = s.item_id WHERE im.tenant_id <> s.tenant_id;

-- E. 운영 부채 규모
SELECT 'undeducted_inputs_completed_batches' k, COUNT(*) n FROM h_batch_inputs bi JOIN h_batches b ON b.id = bi.batch_id WHERE bi.inventory_deducted = 0 AND b.status = 'completed'
UNION ALL SELECT 'auto_issue_reference_id_null', COUNT(*) FROM h_inventory_transactions WHERE action_type = 'AUTO_ISSUE' AND reference_id IS NULL;
