-- =====================================================================
-- v3 6-a: 백업·임시 테이블 정리 — 12-schema-baseline-step6.md §3~§4 (v2, 빈 테이블 DROP 없음)
-- =====================================================================
-- 실행 시점: FK(#458) 일주일 관찰 종료 후. 실행 주체: Genspark.
-- 원칙: 아카이브 → DROP. 격리 테이블(_orphan_*_20261012)·빈 테이블(미래 기능)은 대상 아님.
-- =====================================================================

-- §1. 아카이브 (서버 셸) — 대상 29개를 한 파일로, gzip 후 보관 경로·크기 보고
--   mysqldump -u <user> -p --single-transaction haccp_tenant_db \
--     _backup_h_batch_inputs_step16 _backup_item_master_step15 _bak_batch_actual_qty_20260510 _bak_batch_inputs_20260509 _bak_ledger_daily_20260509 _bak_ledger_monthly_20260509 _bak_macadamia_product_name_20260510 _bak_orphan_daily_log_ar_20260510 backup_accounting_purchases_154_20260630_100739 backup_accounting_purchases_3_26_add_20260630_101404 backup_accounting_purchases_dongah_correction_20260701 backup_calibration_equipment_20260702 backup_calibration_records_20260702 backup_h_inventory_20260630_095410_v5apply backup_h_inventory_lots_20260630_095410_v5apply backup_purchase_125_delete_20260630_101928 backup_tx_9931_20260630_101404 h_inventory_lots_backup_pid_fix_20260425 k3_mapping_backup_2026_04_26 k5_backfill_backup_2026_04_26 lot_id_nullable_backup_2026_04_28 phase2_lot0_backup_2026_04_28 w2_lot_unit_backup_2026_04_26_il w2_lot_unit_backup_2026_04_26_lots w2_lot_unit_backup_2026_04_26_tx w3_backfill_source_type_backup_2026_04_26 w3_tx_backup_2026_04_26 w4_backup_lot_750_removal_2026_06_25 phase2_lot0_matches_2026_04_28 \
--     > /home/root/backups/haccp/db/step6_archive_$(date +%Y%m%d).sql && gzip /home/root/backups/haccp/db/step6_archive_*.sql

-- §2. DROP — A 백업 28 + C 1. 아카이브 파일 확인 후 한 문장씩.
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
DROP TABLE IF EXISTS `phase2_lot0_matches_2026_04_28`;

-- §3. 사후: 테이블 수 = 실행 직전 수 - 29
SELECT COUNT(*) AS tables_now FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE();
