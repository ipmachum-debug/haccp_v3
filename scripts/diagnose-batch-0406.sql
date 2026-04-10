-- ═══ 4/6 배치 진단 쿼리 ═══
-- 프로덕션 DB에서 실행하여 결과를 공유해주세요

-- 1. 배치 기본 정보 (4품목 확인)
SELECT b.id, b.batch_code, b.product_id,
       p.product_name as v2_name,
       b.planned_quantity, b.actual_quantity, b.status,
       b.planned_date, b.day_batch_group
FROM h_batches b
LEFT JOIN h_products_v2 p ON p.id = b.product_id AND p.tenant_id = b.tenant_id
WHERE b.tenant_id = 2 AND b.planned_date = '2026-04-06'
ORDER BY b.batch_order, b.id;

-- 2. CCP 인스턴스 (4P가 몇 개인지, 제품명이 뭔지)
SELECT i.id, i.batch_id, i.ccp_type, i.product_id, i.product_name,
       i.work_date, i.status, i.process_group_id
FROM h_ccp_instances i
WHERE i.tenant_id = 2 AND i.work_date = '2026-04-06'
ORDER BY i.ccp_type, i.id;

-- 3. CCP-4P form records (일일 통합이 제대로 생성됐는지)
SELECT fr.id, fr.batch_id, fr.ccp_type, fr.work_date,
       fr.product_id, fr.product_name,
       fr.planned_qty_kg, fr.batch_count, fr.bom_batch_kg,
       fr.status, fr.approval_request_id
FROM h_ccp_form_records fr
WHERE fr.tenant_id = 2 AND fr.work_date = '2026-04-06'
ORDER BY fr.ccp_type, fr.id;

-- 4. CCP-4P form rows (다이스인절미만 나오는 원인 확인)
SELECT fr.id as form_record_id, fr.ccp_type, fr.product_name,
       row.id as row_id, row.batch_seq,
       row.equipment_name, row.equipment_type,
       row.measurement_time, row.product_name as row_product_name
FROM h_ccp_form_records fr
JOIN h_ccp_form_rows row ON row.form_record_id = fr.id
WHERE fr.tenant_id = 2 AND fr.work_date = '2026-04-06' AND fr.ccp_type = 'CCP-4P'
ORDER BY row.batch_seq, row.id;

-- 5. 일일일지 (실제수량=0인 원인)
SELECT id, form_type, form_date, title, status,
       JSON_EXTRACT(form_data, '$.batches') as batch_list
FROM h_generic_checklist_records
WHERE tenant_id = 2 AND form_date = '2026-04-06' AND form_type = 'daily_log'
ORDER BY id DESC LIMIT 1;

-- 6. 승인요청 (어떤 타입이 생성됐는지)
SELECT ar.id, ar.request_type, ar.reference_type, ar.reference_id,
       ar.title, ar.status, ar.created_at
FROM h_approval_requests ar
WHERE ar.tenant_id = 2
  AND ar.created_at >= '2026-04-06 00:00:00'
  AND ar.created_at < '2026-04-07 00:00:00'
ORDER BY ar.id;
