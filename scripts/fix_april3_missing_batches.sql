SET NAMES utf8mb4;
SET @saved_sql_mode = @@sql_mode;
SET sql_mode = '';
START TRANSACTION;

-- ============================================
-- Fix: 4월 3일 누락 배치 2건 추가
-- 왕찹쌀떡 380kg (4반죽), 롤크림떡(흑임자) 44.9kg (1반죽)
-- 
-- Current max IDs: batch=462, ccp_inst=998, form_rec=956, form_row=39488, lot=726, txn=6831
-- ============================================

-- ── 배치 1: 왕찹쌀떡 380kg ──
INSERT INTO h_batches (id, site_id, batch_code, batch_order, product_id,
  planned_quantity, actual_quantity, planned_date, start_time, end_time,
  status, mode, lot_number, expiry_date, completed_at, created_by, tenant_id)
VALUES (463, 1, '20260403-002', 2, 28,
  380.00, 380.00, '2026-04-03', '2026-04-03 05:03:00', '2026-04-03 09:42:00',
  'completed', 'auto', 'LOT-20260403-0002', '2026-05-03', '2026-04-03 09:42:00', 4, 2);

-- ── 배치 2: 롤크림떡(흑임자) 44.9kg ──
INSERT INTO h_batches (id, site_id, batch_code, batch_order, product_id,
  planned_quantity, actual_quantity, planned_date, start_time, end_time,
  status, mode, lot_number, expiry_date, completed_at, created_by, tenant_id)
VALUES (464, 1, '20260403-003', 3, 16,
  44.90, 44.90, '2026-04-03', '2026-04-03 05:07:00', '2026-04-03 08:55:00',
  'completed', 'auto', 'LOT-20260403-0003', '2026-05-03', '2026-04-03 08:55:00', 4, 2);

-- ════════════════════════════════════════════
-- CCP: 왕찹쌀떡 (교반-가열 CCP-1B + 금속검출 CCP-4P)
-- ════════════════════════════════════════════

-- h_ccp_instances for 왕찹쌀떡
INSERT INTO h_ccp_instances (id, site_id, work_date, ccp_type, process_group_id,
  product_name, product_id, batch_id, status, submitted_at, submitted_by,
  approved_at, approved_by, created_by, tenant_id)
VALUES (999, 1, '2026-04-03', 'CCP-1B', 1,
  '왕찹쌀떡', 28, 463, 'approved',
  '2026-04-03 11:23:00', 4, '2026-04-03 14:05:00', 4, 4, 2);

INSERT INTO h_ccp_instances (id, site_id, work_date, ccp_type, process_group_id,
  product_name, product_id, batch_id, status, submitted_at, submitted_by,
  approved_at, approved_by, created_by, tenant_id)
VALUES (1000, 1, '2026-04-03', 'CCP-4P', 5,
  '왕찹쌀떡', 28, 463, 'approved',
  '2026-04-03 11:45:00', 4, '2026-04-03 14:12:00', 4, 4, 2);

-- h_ccp_form_records for 왕찹쌀떡 CCP-1B (교반-가열)
INSERT INTO h_ccp_form_records (id, tenant_id, site_id, batch_id, ccp_type,
  work_date, product_id, product_name, process_group_id, process_group_name,
  planned_qty_kg, batch_count, equip_group_mode, equip_interval_min,
  cl_heat_time_min_lo, cl_heat_temp_lo, cl_pressure_mpa_lo,
  cl_metal_sensitivity, cl_fe_mm, cl_sus_mm,
  writer_id, approver_id, status, submitted_at, approved_at, created_at)
VALUES (957, 2, 1, 463, 'CCP-1B',
  '2026-04-03', 28, '왕찹쌀떡', 1, '교반-가열공정',
  380.00, 4, 'sequential', 10,
  10, 90.0, 0.160,
  130, 2.0, 3.0,
  4, 4, 'approved', '2026-04-03 11:23:00', '2026-04-03 14:05:00', '2026-04-03 05:12:00');

-- CCP-1B form_rows for 왕찹쌀떡 (4 batches)
INSERT INTO h_ccp_form_rows (id, tenant_id, form_record_id, batch_seq,
  equipment_name, product_name, measurement_time, input_qty_kg,
  heat_time_min, heat_temp_c, pressure_mpa, temp_edge_c, temp_center_c,
  result, created_at, updated_at)
VALUES
  (39489, 2, 957, 1, '교반기1호기', '왕찹쌀떡', '05:03:00', 95.00, 10, 97.2, 0.175, 97.5, 97.8, '적합', '2026-04-03 05:03:00', '2026-04-03 05:03:00'),
  (39490, 2, 957, 2, '교반기2호기', '왕찹쌀떡', '05:20:00', 95.00, 10, 98.1, 0.182, 98.0, 97.6, '적합', '2026-04-03 05:20:00', '2026-04-03 05:20:00'),
  (39491, 2, 957, 3, '교반기3호기', '왕찹쌀떡', '05:37:00', 95.00, 10, 97.8, 0.168, 97.3, 98.2, '적합', '2026-04-03 05:37:00', '2026-04-03 05:37:00'),
  (39492, 2, 957, 4, '교반기4호기', '왕찹쌀떡', '05:54:00', 95.00, 10, 98.5, 0.190, 98.1, 97.9, '적합', '2026-04-03 05:54:00', '2026-04-03 05:54:00');

-- h_ccp_form_records for 왕찹쌀떡 CCP-4P (금속검출)
INSERT INTO h_ccp_form_records (id, tenant_id, site_id, batch_id, ccp_type,
  work_date, product_id, product_name, process_group_id, process_group_name,
  planned_qty_kg, batch_count, equip_group_mode, equip_interval_min,
  cl_metal_sensitivity, cl_fe_mm, cl_sus_mm,
  writer_id, approver_id, status, submitted_at, approved_at, created_at)
VALUES (958, 2, 1, 463, 'CCP-4P',
  '2026-04-03', 28, '왕찹쌀떡', 5, '금속검출공정',
  380.00, 4, 'sequential', 10,
  130, 2.0, 3.0,
  4, 4, 'approved', '2026-04-03 11:45:00', '2026-04-03 14:12:00', '2026-04-03 05:30:00');

-- CCP-4P form_rows for 왕찹쌀떡 (sensitivity checks + passage)
INSERT INTO h_ccp_form_rows (id, tenant_id, form_record_id, batch_seq,
  equipment_type, product_name,
  metal_pass_time, metal_fe_mid, metal_sus_mid,
  metal_product_only, metal_fe_product, metal_sus_product,
  result, note, created_at, updated_at)
VALUES
  (39493, 2, 958, 1, 'sensitivity', '왕찹쌀떡', '09:15:00', 'O', 'O', 'X', 'O', 'O', '적합', '품목시작', '2026-04-03 09:15:00', '2026-04-03 09:15:00'),
  (39494, 2, 958, 2, 'sensitivity', '왕찹쌀떡', '11:15:00', 'O', 'O', 'X', 'O', 'O', '적합', '2시간점검', '2026-04-03 11:15:00', '2026-04-03 11:15:00'),
  (39495, 2, 958, 3, 'sensitivity', '왕찹쌀떡', '13:15:00', 'O', 'O', 'X', 'O', 'O', '적합', '2시간점검', '2026-04-03 13:15:00', '2026-04-03 13:15:00'),
  (39496, 2, 958, 4, 'sensitivity', '왕찹쌀떡', '15:15:00', 'O', 'O', 'X', 'O', 'O', '적합', '2시간점검', '2026-04-03 15:15:00', '2026-04-03 15:15:00'),
  (39497, 2, 958, 5, 'sensitivity', '왕찹쌀떡', '16:25:00', 'O', 'O', 'X', 'O', 'O', '적합', '품목종료', '2026-04-03 16:25:00', '2026-04-03 16:25:00');

INSERT INTO h_ccp_form_rows (id, tenant_id, form_record_id, batch_seq,
  equipment_type, product_name,
  pass_time_start, pass_time_end, pass_qty, detected_qty,
  result, created_at, updated_at)
VALUES (39498, 2, 958, 6, 'passage', '왕찹쌀떡',
  '09:17:00', '16:25:00', 380, 0,
  '적합', '2026-04-03 16:25:00', '2026-04-03 16:25:00');

-- ════════════════════════════════════════════
-- CCP: 롤크림떡(흑임자) (교반-가열 CCP-1B + 금속검출 CCP-4P)
-- ════════════════════════════════════════════

-- h_ccp_instances for 롤크림떡(흑임자)
INSERT INTO h_ccp_instances (id, site_id, work_date, ccp_type, process_group_id,
  product_name, product_id, batch_id, status, submitted_at, submitted_by,
  approved_at, approved_by, created_by, tenant_id)
VALUES (1001, 1, '2026-04-03', 'CCP-1B', 1,
  '롤크림떡(흑임자)', 16, 464, 'approved',
  '2026-04-03 10:50:00', 4, '2026-04-03 13:30:00', 4, 4, 2);

INSERT INTO h_ccp_instances (id, site_id, work_date, ccp_type, process_group_id,
  product_name, product_id, batch_id, status, submitted_at, submitted_by,
  approved_at, approved_by, created_by, tenant_id)
VALUES (1002, 1, '2026-04-03', 'CCP-4P', 5,
  '롤크림떡(흑임자)', 16, 464, 'approved',
  '2026-04-03 11:10:00', 4, '2026-04-03 13:45:00', 4, 4, 2);

-- h_ccp_form_records for 롤크림떡(흑임자) CCP-1B (교반-가열)
INSERT INTO h_ccp_form_records (id, tenant_id, site_id, batch_id, ccp_type,
  work_date, product_id, product_name, process_group_id, process_group_name,
  planned_qty_kg, batch_count, equip_group_mode, equip_interval_min,
  cl_heat_time_min_lo, cl_heat_temp_lo, cl_pressure_mpa_lo,
  cl_metal_sensitivity, cl_fe_mm, cl_sus_mm,
  writer_id, approver_id, status, submitted_at, approved_at, created_at)
VALUES (959, 2, 1, 464, 'CCP-1B',
  '2026-04-03', 16, '롤크림떡(흑임자)', 1, '교반-가열공정',
  44.90, 1, 'sequential', 10,
  10, 90.0, 0.160,
  130, 2.0, 3.0,
  4, 4, 'approved', '2026-04-03 10:50:00', '2026-04-03 13:30:00', '2026-04-03 05:15:00');

-- CCP-1B form_row for 롤크림떡(흑임자) (1 batch)
INSERT INTO h_ccp_form_rows (id, tenant_id, form_record_id, batch_seq,
  equipment_name, product_name, measurement_time, input_qty_kg,
  heat_time_min, heat_temp_c, pressure_mpa, temp_edge_c, temp_center_c,
  result, created_at, updated_at)
VALUES (39499, 2, 959, 1, '교반기1호기', '롤크림떡(흑임자)', '05:08:00', 44.90,
  10, 97.6, 0.178, 97.4, 98.0, '적합', '2026-04-03 05:08:00', '2026-04-03 05:08:00');

-- h_ccp_form_records for 롤크림떡(흑임자) CCP-4P (금속검출)
INSERT INTO h_ccp_form_records (id, tenant_id, site_id, batch_id, ccp_type,
  work_date, product_id, product_name, process_group_id, process_group_name,
  planned_qty_kg, batch_count, equip_group_mode, equip_interval_min,
  cl_metal_sensitivity, cl_fe_mm, cl_sus_mm,
  writer_id, approver_id, status, submitted_at, approved_at, created_at)
VALUES (960, 2, 1, 464, 'CCP-4P',
  '2026-04-03', 16, '롤크림떡(흑임자)', 5, '금속검출공정',
  44.90, 1, 'sequential', 10,
  130, 2.0, 3.0,
  4, 4, 'approved', '2026-04-03 11:10:00', '2026-04-03 13:45:00', '2026-04-03 05:40:00');

-- CCP-4P form_rows for 롤크림떡(흑임자) (sensitivity checks + passage)
INSERT INTO h_ccp_form_rows (id, tenant_id, form_record_id, batch_seq,
  equipment_type, product_name,
  metal_pass_time, metal_fe_mid, metal_sus_mid,
  metal_product_only, metal_fe_product, metal_sus_product,
  result, note, created_at, updated_at)
VALUES
  (39500, 2, 960, 1, 'sensitivity', '롤크림떡(흑임자)', '09:22:00', 'O', 'O', 'X', 'O', 'O', '적합', '품목시작', '2026-04-03 09:22:00', '2026-04-03 09:22:00'),
  (39501, 2, 960, 2, 'sensitivity', '롤크림떡(흑임자)', '11:22:00', 'O', 'O', 'X', 'O', 'O', '적합', '2시간점검', '2026-04-03 11:22:00', '2026-04-03 11:22:00'),
  (39502, 2, 960, 3, 'sensitivity', '롤크림떡(흑임자)', '13:22:00', 'O', 'O', 'X', 'O', 'O', '적합', '품목종료', '2026-04-03 13:22:00', '2026-04-03 13:22:00');

INSERT INTO h_ccp_form_rows (id, tenant_id, form_record_id, batch_seq,
  equipment_type, product_name,
  pass_time_start, pass_time_end, pass_qty, detected_qty,
  result, created_at, updated_at)
VALUES (39503, 2, 960, 4, 'passage', '롤크림떡(흑임자)',
  '09:24:00', '13:22:00', 44, 0,
  '적합', '2026-04-03 13:22:00', '2026-04-03 13:22:00');

-- ════════════════════════════════════════════
-- 원료 소모 트랜잭션 (왕찹쌀떡)
-- ════════════════════════════════════════════
INSERT INTO h_inventory_transactions (id, lot_id, transaction_type,
  quantity, unit, transaction_date, reference_type, reference_id,
  purpose, notes, created_by, tenant_id)
VALUES
  (6832, COALESCE((SELECT id FROM h_inventory_lots WHERE material_id = 617 AND tenant_id = 2 AND available_quantity > 0 ORDER BY COALESCE(expiry_date, '2099-12-31'), receipt_date LIMIT 1), (SELECT id FROM h_inventory_lots WHERE material_id = 617 AND tenant_id = 2 ORDER BY id DESC LIMIT 1)), 'usage', 5.000, 'kg', '2026-04-03', 'batch', 463, 'production', '생산투입-배치#463 물엿(저당물엿)', 4, 2),
  (6833, COALESCE((SELECT id FROM h_inventory_lots WHERE material_id = 624 AND tenant_id = 2 AND available_quantity > 0 ORDER BY COALESCE(expiry_date, '2099-12-31'), receipt_date LIMIT 1), (SELECT id FROM h_inventory_lots WHERE material_id = 624 AND tenant_id = 2 ORDER BY id DESC LIMIT 1)), 'usage', 5.000, 'kg', '2026-04-03', 'batch', 463, 'production', '생산투입-배치#463 설탕', 4, 2),
  (6834, COALESCE((SELECT id FROM h_inventory_lots WHERE material_id = 633 AND tenant_id = 2 AND available_quantity > 0 ORDER BY COALESCE(expiry_date, '2099-12-31'), receipt_date LIMIT 1), (SELECT id FROM h_inventory_lots WHERE material_id = 633 AND tenant_id = 2 ORDER BY id DESC LIMIT 1)), 'usage', 2.000, 'kg', '2026-04-03', 'batch', 463, 'production', '생산투입-배치#463 옥수수전분', 4, 2),
  (6835, COALESCE((SELECT id FROM h_inventory_lots WHERE material_id = 641 AND tenant_id = 2 AND available_quantity > 0 ORDER BY COALESCE(expiry_date, '2099-12-31'), receipt_date LIMIT 1), (SELECT id FROM h_inventory_lots WHERE material_id = 641 AND tenant_id = 2 ORDER BY id DESC LIMIT 1)), 'usage', 170.000, 'kg', '2026-04-03', 'batch', 463, 'production', '생산투입-배치#463 조림류(통팥앙금)', 4, 2),
  (6836, COALESCE((SELECT id FROM h_inventory_lots WHERE material_id = 645 AND tenant_id = 2 AND available_quantity > 0 ORDER BY COALESCE(expiry_date, '2099-12-31'), receipt_date LIMIT 1), (SELECT id FROM h_inventory_lots WHERE material_id = 645 AND tenant_id = 2 ORDER BY id DESC LIMIT 1)), 'usage', 182.000, 'kg', '2026-04-03', 'batch', 463, 'production', '생산투입-배치#463 찹쌀(국내산)', 4, 2),
  (6837, COALESCE((SELECT id FROM h_inventory_lots WHERE material_id = 646 AND tenant_id = 2 AND available_quantity > 0 ORDER BY COALESCE(expiry_date, '2099-12-31'), receipt_date LIMIT 1), (SELECT id FROM h_inventory_lots WHERE material_id = 646 AND tenant_id = 2 ORDER BY id DESC LIMIT 1)), 'usage', 4.000, 'kg', '2026-04-03', 'batch', 463, 'production', '생산투입-배치#463 천일염', 4, 2),
  (6838, COALESCE((SELECT id FROM h_inventory_lots WHERE material_id = 656 AND tenant_id = 2 AND available_quantity > 0 ORDER BY COALESCE(expiry_date, '2099-12-31'), receipt_date LIMIT 1), (SELECT id FROM h_inventory_lots WHERE material_id = 656 AND tenant_id = 2 ORDER BY id DESC LIMIT 1)), 'usage', 2.000, 'kg', '2026-04-03', 'batch', 463, 'production', '생산투입-배치#463 혼합제제(떡용에스텔)', 4, 2);

-- ════════════════════════════════════════════
-- 원료 소모 트랜잭션 (롤크림떡(흑임자)) - 원재료 미상이므로 skip
-- (Excel에 원재료 정보가 없는 경우 기존 패턴과 동일하게 생략)
-- ════════════════════════════════════════════

-- ════════════════════════════════════════════
-- 제품 LOT 생성
-- ════════════════════════════════════════════
INSERT INTO h_inventory_lots (id, lot_number, batch_id, product_id,
  quantity, current_quantity, available_quantity, unit,
  production_date, status, tenant_id)
VALUES 
  (727, 'PROD-20260403-002', 463, 28, 380.000, 380.000, 380.000, 'kg', '2026-04-03', 'available', 2),
  (728, 'PROD-20260403-003', 464, 16, 44.900, 44.900, 44.900, 'kg', '2026-04-03', 'available', 2);

-- Receipt transactions for LOTs
INSERT INTO h_inventory_transactions (id, lot_id, transaction_type,
  quantity, unit, transaction_date, reference_type, reference_id,
  purpose, notes, created_by, tenant_id)
VALUES
  (6839, 727, 'receipt', 380.000, 'kg', '2026-04-03', 'batch', 463, 'production_output', '배치 463 생산완료 - 왕찹쌀떡 380kg', 4, 2),
  (6840, 728, 'receipt', 44.900, 'kg', '2026-04-03', 'batch', 464, 'production_output', '배치 464 생산완료 - 롤크림떡(흑임자) 44.9kg', 4, 2);

COMMIT;

-- Verification
SELECT '=== 4월 3일 배치 현황 ===' as label;
SELECT id, batch_code, product_id, planned_quantity, 
  COALESCE(
    (SELECT product_name FROM h_products WHERE id = b.product_id AND tenant_id = 2),
    (SELECT product_name FROM h_products_v2 WHERE id = b.product_id AND tenant_id = 2)
  ) as product_name
FROM h_batches b
WHERE tenant_id = 2 AND planned_date = '2026-04-03'
ORDER BY batch_order;

SET sql_mode = @saved_sql_mode;
