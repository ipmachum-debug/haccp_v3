-- ═══ 4/6 배치 심층 진단 v2 ═══

-- 1. 4품목의 h_products_v2.id 확인
SELECT id, product_name, product_code
FROM h_products_v2
WHERE tenant_id = 2 AND id IN (
  SELECT product_id FROM h_batches WHERE tenant_id = 2 AND planned_date = '2026-04-06'
);

-- 2. h_mf_reports의 product_id가 v1인지 v2인지 확인 (핵심!)
SELECT r.id, r.product_id,
       p1.product_name as v1_name,
       p2.product_name as v2_name,
       v.batch_target_kg, v.approval_status
FROM h_mf_reports r
LEFT JOIN h_products p1 ON p1.id = r.product_id AND p1.tenant_id = r.tenant_id
LEFT JOIN h_products_v2 p2 ON p2.id = r.product_id AND p2.tenant_id = r.tenant_id
LEFT JOIN h_mf_report_versions v ON v.mf_report_id = r.id AND v.approval_status = 'APPROVED'
WHERE r.tenant_id = 2
ORDER BY r.id;

-- 3. 배치 477-480의 product_id로 BOM 조회 시도 (코드가 하는 것과 동일)
-- 배치 477: product_id=?
SELECT b.id as batch_id, b.product_id,
       r.id as mf_report_id,
       v.id as version_id,
       v.batch_target_kg,
       COUNT(i.id) as ingredient_count
FROM h_batches b
LEFT JOIN h_mf_reports r ON r.product_id = b.product_id AND r.tenant_id = b.tenant_id
LEFT JOIN h_mf_report_versions v ON v.mf_report_id = r.id AND v.approval_status = 'APPROVED'
LEFT JOIN h_mf_ingredients i ON i.mf_report_version_id = v.id AND i.process_group_id IS NOT NULL
WHERE b.tenant_id = 2 AND b.planned_date = '2026-04-06'
GROUP BY b.id, b.product_id, r.id, v.id, v.batch_target_kg;

-- 4. ccp_process_groups 확인 (활성 상태)
SELECT id, name, ccp_type, status, equip_batch_size, equip_group_mode
FROM ccp_process_groups
WHERE tenant_id = 2 AND status = 'active'
ORDER BY ccp_type, sort_order;
