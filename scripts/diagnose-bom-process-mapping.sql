-- ═══ BOM 공정그룹 매핑 진단 ═══

-- 1. 공정그룹 목록 (어떤 공정이 있는지)
SELECT id, name, ccp_type, status, equip_batch_size
FROM ccp_process_groups
WHERE tenant_id = 2 AND status = 'active'
ORDER BY ccp_type, sort_order;

-- 2. 4/6 배치 제품의 BOM → 공정그룹 매핑 (핵심!)
-- 설기(꿀설기)가 어느 공정에 매핑되어 있는지
-- 찹쌀떡(왕찹쌀떡)이 어느 공정에 매핑되어 있는지
SELECT
  p.product_name,
  r.id as mf_report_id,
  v.id as version_id,
  v.approval_status,
  i.id as ingredient_id,
  im.item_name as material_name,
  i.process_group_id,
  pg.name as process_group_name,
  pg.ccp_type,
  i.quantity, i.corrected_quantity
FROM h_mf_reports r
JOIN h_mf_report_versions v ON v.mf_report_id = r.id AND v.approval_status = 'APPROVED'
JOIN h_mf_ingredients i ON i.mf_report_version_id = v.id
LEFT JOIN item_master im ON im.id = i.material_id
LEFT JOIN ccp_process_groups pg ON pg.id = i.process_group_id
LEFT JOIN h_products_v2 p ON p.id = r.product_id AND p.tenant_id = r.tenant_id
WHERE r.tenant_id = 2
  AND r.product_id IN (
    SELECT product_id FROM h_batches WHERE tenant_id = 2 AND planned_date = '2026-04-06'
  )
  AND i.process_group_id IS NOT NULL
ORDER BY p.product_name, pg.ccp_type, i.id;

-- 3. 수동 매핑 테이블 확인
SELECT gp.product_id, p.product_name,
       gp.process_group_id, pg.name as pg_name, pg.ccp_type
FROM ccp_process_group_products gp
JOIN h_products_v2 p ON p.id = gp.product_id
JOIN ccp_process_groups pg ON pg.id = gp.process_group_id
WHERE gp.tenant_id = 2
ORDER BY p.product_name;

-- 4. 오늘 생성된 CCP 인스턴스 — 어떤 공정그룹으로 매핑됐는지
SELECT i.id, i.batch_id, i.ccp_type, i.process_group_id,
       pg.name as pg_name,
       i.product_name,
       b.batch_code
FROM h_ccp_instances i
LEFT JOIN ccp_process_groups pg ON pg.id = i.process_group_id
LEFT JOIN h_batches b ON b.id = i.batch_id
WHERE i.tenant_id = 2 AND i.work_date = '2026-04-06'
ORDER BY b.batch_order, i.ccp_type;

-- 5. CCP-4P form_records — 제품별 통합인지 배치별인지
SELECT fr.id, fr.batch_id, fr.ccp_type, fr.product_name,
       fr.planned_qty_kg, fr.batch_count, fr.status
FROM h_ccp_form_records fr
WHERE fr.tenant_id = 2 AND fr.work_date = '2026-04-06'
ORDER BY fr.ccp_type, fr.id;
