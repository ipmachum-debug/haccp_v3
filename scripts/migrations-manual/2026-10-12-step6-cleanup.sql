-- =====================================================================
-- v3 6단계 (6-a): 백업·죽은 테이블 정리 — 12-schema-baseline-step6.md §2~§4
-- =====================================================================
-- 실행 시점: FK(#458) 일주일 관찰 종료 후. 실행 주체: Genspark.
-- 원칙: 아카이브 → 사전검사 → DROP. 격리 테이블(_orphan_*_20261012)은 대상 아님.
-- =====================================================================

-- §1. 아카이브 (서버 셸) — 데이터 있는 테이블 전부를 한 파일로
--   mysqldump -u <user> -p haccp_tenant_db \
--     _backup_h_batch_inputs_step16 _backup_item_master_step15 _bak_batch_actual_qty_20260510 _bak_batch_inputs_20260509 _bak_ledger_daily_20260509 _bak_ledger_monthly_20260509 _bak_macadamia_product_name_20260510 _bak_orphan_daily_log_ar_20260510 backup_accounting_purchases_154_20260630_100739 backup_accounting_purchases_3_26_add_20260630_101404 backup_accounting_purchases_dongah_correction_20260701 backup_calibration_equipment_20260702 backup_calibration_records_20260702 backup_h_inventory_20260630_095410_v5apply backup_h_inventory_lots_20260630_095410_v5apply backup_purchase_125_delete_20260630_101928 backup_tx_9931_20260630_101404 h_inventory_lots_backup_pid_fix_20260425 k3_mapping_backup_2026_04_26 k5_backfill_backup_2026_04_26 lot_id_nullable_backup_2026_04_28 phase2_lot0_backup_2026_04_28 w2_lot_unit_backup_2026_04_26_il w2_lot_unit_backup_2026_04_26_lots w2_lot_unit_backup_2026_04_26_tx w3_backfill_source_type_backup_2026_04_26 w3_tx_backup_2026_04_26 w4_backup_lot_750_removal_2026_06_25 phase2_lot0_matches_2026_04_28 \
--     > /root/backups/step6_archive_$(date +%Y%m%d).sql
--   gzip 후 보관 경로·크기를 보고에 적는다.

-- §2. 사전검사 — B 그룹은 0 이어야 함
SELECT 'accounting_purchase_items' t, COUNT(*) n FROM `accounting_purchase_items` UNION ALL
SELECT 'accounting_sale_items' t, COUNT(*) n FROM `accounting_sale_items` UNION ALL
SELECT 'checklist_approvals' t, COUNT(*) n FROM `checklist_approvals` UNION ALL
SELECT 'checklist_instance_item_history' t, COUNT(*) n FROM `checklist_instance_item_history` UNION ALL
SELECT 'checklist_schedules' t, COUNT(*) n FROM `checklist_schedules` UNION ALL
SELECT 'checklist_template_versions' t, COUNT(*) n FROM `checklist_template_versions` UNION ALL
SELECT 'communication_log_files' t, COUNT(*) n FROM `communication_log_files` UNION ALL
SELECT 'h_cosmetic_formula_ingredient' t, COUNT(*) n FROM `h_cosmetic_formula_ingredient` UNION ALL
SELECT 'h_quality_risk_assessments' t, COUNT(*) n FROM `h_quality_risk_assessments` UNION ALL
SELECT 'hazard_analysis' t, COUNT(*) n FROM `hazard_analysis` UNION ALL
SELECT 'metal_detection_standards' t, COUNT(*) n FROM `metal_detection_standards` UNION ALL
SELECT 'product_ccp_specs' t, COUNT(*) n FROM `product_ccp_specs` UNION ALL
SELECT 'product_specifications' t, COUNT(*) n FROM `product_specifications` UNION ALL
SELECT 'verification_records' t, COUNT(*) n FROM `verification_records`;

-- §3-A. 백업 테이블 DROP (28)
DROP TABLE IF EXISTS `_backup_h_batch_inputs_step16`;
DROP TABLE IF EXISTS `_backup_item_master_step15`;
DROP TABLE IF EXISTS `_bak_batch_actual_qty_20260510`;
DROP TABLE IF EXISTS `_bak_batch_inputs_20260509`;
DROP TABLE IF EXISTS `_bak_ledger_daily_20260509`;
DROP TABLE IF EXISTS `_bak_ledger_monthly_20260509`;
DROP TABLE IF EXISTS `_bak_macadamia_product_name_20260510`;
DROP TABLE IF EXISTS `_bak_orphan_daily_log_ar_20260510`;
DROP TABLE IF EXISTS `backup_accounting_purchases_154_20260630_100739`;
DROP TABLE IF EXISTS `backup_accounting_purchases_3_26_add_20260630_101404`;
DROP TABLE IF EXISTS `backup_accounting_purchases_dongah_correction_20260701`;
DROP TABLE IF EXISTS `backup_calibration_equipment_20260702`;
DROP TABLE IF EXISTS `backup_calibration_records_20260702`;
DROP TABLE IF EXISTS `backup_h_inventory_20260630_095410_v5apply`;
DROP TABLE IF EXISTS `backup_h_inventory_lots_20260630_095410_v5apply`;
DROP TABLE IF EXISTS `backup_purchase_125_delete_20260630_101928`;
DROP TABLE IF EXISTS `backup_tx_9931_20260630_101404`;
DROP TABLE IF EXISTS `h_inventory_lots_backup_pid_fix_20260425`;
DROP TABLE IF EXISTS `k3_mapping_backup_2026_04_26`;
DROP TABLE IF EXISTS `k5_backfill_backup_2026_04_26`;
DROP TABLE IF EXISTS `lot_id_nullable_backup_2026_04_28`;
DROP TABLE IF EXISTS `phase2_lot0_backup_2026_04_28`;
DROP TABLE IF EXISTS `w2_lot_unit_backup_2026_04_26_il`;
DROP TABLE IF EXISTS `w2_lot_unit_backup_2026_04_26_lots`;
DROP TABLE IF EXISTS `w2_lot_unit_backup_2026_04_26_tx`;
DROP TABLE IF EXISTS `w3_backfill_source_type_backup_2026_04_26`;
DROP TABLE IF EXISTS `w3_tx_backup_2026_04_26`;
DROP TABLE IF EXISTS `w4_backup_lot_750_removal_2026_06_25`;

-- §3-B. 빈 테이블 DROP (14) — §2 전부 0 확인 후
DROP TABLE IF EXISTS `accounting_purchase_items`;
DROP TABLE IF EXISTS `accounting_sale_items`;
DROP TABLE IF EXISTS `checklist_approvals`;
DROP TABLE IF EXISTS `checklist_instance_item_history`;
DROP TABLE IF EXISTS `checklist_schedules`;
DROP TABLE IF EXISTS `checklist_template_versions`;
DROP TABLE IF EXISTS `communication_log_files`;
DROP TABLE IF EXISTS `h_cosmetic_formula_ingredient`;
DROP TABLE IF EXISTS `h_quality_risk_assessments`;
DROP TABLE IF EXISTS `hazard_analysis`;
DROP TABLE IF EXISTS `metal_detection_standards`;
DROP TABLE IF EXISTS `product_ccp_specs`;
DROP TABLE IF EXISTS `product_specifications`;
DROP TABLE IF EXISTS `verification_records`;

-- §3-C. 데이터 있으나 미사용 (아카이브 후)
DROP TABLE IF EXISTS `phase2_lot0_matches_2026_04_28`;
-- sku_aliases (1행): 용도 확인 전까지 보류

-- §4. 사후: DB 테이블 수 = 444 - 43 기대
SELECT COUNT(*) AS tables_now FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE();
