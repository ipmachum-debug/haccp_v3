-- ═══ 고아 CCP 레코드 정리 ═══
-- batch_id가 h_batches에 존재하지 않는 form_records/instances 삭제

-- 1. 먼저 확인 (삭제 전)
SELECT 'orphan_form_records' as type, fr.id, fr.batch_id, fr.ccp_type, fr.product_name, fr.work_date
FROM h_ccp_form_records fr
LEFT JOIN h_batches b ON b.id = fr.batch_id AND b.tenant_id = fr.tenant_id
WHERE fr.tenant_id = 2 AND b.id IS NULL AND fr.batch_id IS NOT NULL
ORDER BY fr.id;

SELECT 'orphan_instances' as type, i.id, i.batch_id, i.ccp_type, i.product_name, i.work_date
FROM h_ccp_instances i
LEFT JOIN h_batches b ON b.id = i.batch_id AND b.tenant_id = i.tenant_id
WHERE i.tenant_id = 2 AND b.id IS NULL AND i.batch_id IS NOT NULL
ORDER BY i.id;

-- 2. 고아 form_rows 삭제 (form_records 삭제 전에)
DELETE row FROM h_ccp_form_rows row
JOIN h_ccp_form_records fr ON fr.id = row.form_record_id
LEFT JOIN h_batches b ON b.id = fr.batch_id AND b.tenant_id = fr.tenant_id
WHERE fr.tenant_id = 2 AND b.id IS NULL AND fr.batch_id IS NOT NULL;

-- 3. 고아 ccp_rows 삭제 (instances 삭제 전에)
DELETE cr FROM h_ccp_rows cr
JOIN h_ccp_instances i ON i.id = cr.instance_id
LEFT JOIN h_batches b ON b.id = i.batch_id AND b.tenant_id = i.tenant_id
WHERE i.tenant_id = 2 AND b.id IS NULL AND i.batch_id IS NOT NULL;

-- 4. 고아 form_records 삭제
DELETE fr FROM h_ccp_form_records fr
LEFT JOIN h_batches b ON b.id = fr.batch_id AND b.tenant_id = fr.tenant_id
WHERE fr.tenant_id = 2 AND b.id IS NULL AND fr.batch_id IS NOT NULL;

-- 5. 고아 instances 삭제
DELETE i FROM h_ccp_instances i
LEFT JOIN h_batches b ON b.id = i.batch_id AND b.tenant_id = i.tenant_id
WHERE i.tenant_id = 2 AND b.id IS NULL AND i.batch_id IS NOT NULL;

-- 6. 확인: 4/6 배치의 CCP 상태
SELECT b.id, b.batch_code, b.product_id,
       p.product_name,
       (SELECT COUNT(*) FROM h_ccp_instances i WHERE i.batch_id = b.id) as ccp_instances,
       (SELECT COUNT(*) FROM h_ccp_form_records fr WHERE fr.batch_id = b.id) as ccp_forms
FROM h_batches b
LEFT JOIN h_products_v2 p ON p.id = b.product_id AND p.tenant_id = b.tenant_id
WHERE b.tenant_id = 2 AND b.planned_date = '2026-04-06'
ORDER BY b.id;
