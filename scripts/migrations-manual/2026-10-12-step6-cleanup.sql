-- =====================================================================
-- v3 6-a: 백업·임시 테이블 정리 — 12-schema-baseline-step6.md §4 (v3: DROP 전 관문 4개 추가, CEO 2026-10-12)
-- =====================================================================
-- 실행 시점: FK(#458) 일주일 관찰 종료 후 — 단, 로그 무사고는 필요조건이지 충분조건이 아니다.
-- 실행 주체: Genspark. 대상 29개 (백업 28 + phase2_lot0_matches 1). 빈 테이블·격리 테이블은 대상 아님.
--
-- ★ DROP 전 관문 4개 — 전부 통과해야 §4 로 간다. 하나라도 어긋나면 멈추고 보고.
--   G1 백업 행수 = 원본 행수 (테이블별, CHECKSUM 포함)
--   G2 백업 파일로 실제 복구가 되는지 (검증용 스키마에 복원 → 행수·CHECKSUM 재비교 → 검증 스키마 삭제)
--   G3 운영 코드·SQL·cron·DB 객체(뷰/트리거/루틴/FK)에서 대상 테이블 참조 0 (scripts/diag/table-ref-check.sh)
--   G4 DROP 후 생산·재고·회계 회귀 테스트 (smoke + 시나리오 4건) 통과
-- =====================================================================

-- ---------------------------------------------------------------------
-- §1. 원본 행수·CHECKSUM 기록 (G1 기준값) — 결과를 로그 파일로 남긴다
-- ---------------------------------------------------------------------
SELECT '_backup_h_batch_inputs_step16' t, COUNT(*) n FROM `_backup_h_batch_inputs_step16` UNION ALL
SELECT '_backup_item_master_step15' t, COUNT(*) n FROM `_backup_item_master_step15` UNION ALL
SELECT '_bak_batch_actual_qty_20260510' t, COUNT(*) n FROM `_bak_batch_actual_qty_20260510` UNION ALL
SELECT '_bak_batch_inputs_20260509' t, COUNT(*) n FROM `_bak_batch_inputs_20260509` UNION ALL
SELECT '_bak_ledger_daily_20260509' t, COUNT(*) n FROM `_bak_ledger_daily_20260509` UNION ALL
SELECT '_bak_ledger_monthly_20260509' t, COUNT(*) n FROM `_bak_ledger_monthly_20260509` UNION ALL
SELECT '_bak_macadamia_product_name_20260510' t, COUNT(*) n FROM `_bak_macadamia_product_name_20260510` UNION ALL
SELECT '_bak_orphan_daily_log_ar_20260510' t, COUNT(*) n FROM `_bak_orphan_daily_log_ar_20260510` UNION ALL
SELECT 'backup_accounting_purchases_154_20260630_100739' t, COUNT(*) n FROM `backup_accounting_purchases_154_20260630_100739` UNION ALL
SELECT 'backup_accounting_purchases_3_26_add_20260630_101404' t, COUNT(*) n FROM `backup_accounting_purchases_3_26_add_20260630_101404` UNION ALL
SELECT 'backup_accounting_purchases_dongah_correction_20260701' t, COUNT(*) n FROM `backup_accounting_purchases_dongah_correction_20260701` UNION ALL
SELECT 'backup_calibration_equipment_20260702' t, COUNT(*) n FROM `backup_calibration_equipment_20260702` UNION ALL
SELECT 'backup_calibration_records_20260702' t, COUNT(*) n FROM `backup_calibration_records_20260702` UNION ALL
SELECT 'backup_h_inventory_20260630_095410_v5apply' t, COUNT(*) n FROM `backup_h_inventory_20260630_095410_v5apply` UNION ALL
SELECT 'backup_h_inventory_lots_20260630_095410_v5apply' t, COUNT(*) n FROM `backup_h_inventory_lots_20260630_095410_v5apply` UNION ALL
SELECT 'backup_purchase_125_delete_20260630_101928' t, COUNT(*) n FROM `backup_purchase_125_delete_20260630_101928` UNION ALL
SELECT 'backup_tx_9931_20260630_101404' t, COUNT(*) n FROM `backup_tx_9931_20260630_101404` UNION ALL
SELECT 'h_inventory_lots_backup_pid_fix_20260425' t, COUNT(*) n FROM `h_inventory_lots_backup_pid_fix_20260425` UNION ALL
SELECT 'k3_mapping_backup_2026_04_26' t, COUNT(*) n FROM `k3_mapping_backup_2026_04_26` UNION ALL
SELECT 'k5_backfill_backup_2026_04_26' t, COUNT(*) n FROM `k5_backfill_backup_2026_04_26` UNION ALL
SELECT 'lot_id_nullable_backup_2026_04_28' t, COUNT(*) n FROM `lot_id_nullable_backup_2026_04_28` UNION ALL
SELECT 'phase2_lot0_backup_2026_04_28' t, COUNT(*) n FROM `phase2_lot0_backup_2026_04_28` UNION ALL
SELECT 'w2_lot_unit_backup_2026_04_26_il' t, COUNT(*) n FROM `w2_lot_unit_backup_2026_04_26_il` UNION ALL
SELECT 'w2_lot_unit_backup_2026_04_26_lots' t, COUNT(*) n FROM `w2_lot_unit_backup_2026_04_26_lots` UNION ALL
SELECT 'w2_lot_unit_backup_2026_04_26_tx' t, COUNT(*) n FROM `w2_lot_unit_backup_2026_04_26_tx` UNION ALL
SELECT 'w3_backfill_source_type_backup_2026_04_26' t, COUNT(*) n FROM `w3_backfill_source_type_backup_2026_04_26` UNION ALL
SELECT 'w3_tx_backup_2026_04_26' t, COUNT(*) n FROM `w3_tx_backup_2026_04_26` UNION ALL
SELECT 'w4_backup_lot_750_removal_2026_06_25' t, COUNT(*) n FROM `w4_backup_lot_750_removal_2026_06_25` UNION ALL
SELECT 'phase2_lot0_matches_2026_04_28' t, COUNT(*) n FROM `phase2_lot0_matches_2026_04_28`;
CHECKSUM TABLE `_backup_h_batch_inputs_step16`, `_backup_item_master_step15`, `_bak_batch_actual_qty_20260510`, `_bak_batch_inputs_20260509`, `_bak_ledger_daily_20260509`, `_bak_ledger_monthly_20260509`, `_bak_macadamia_product_name_20260510`, `_bak_orphan_daily_log_ar_20260510`, `backup_accounting_purchases_154_20260630_100739`, `backup_accounting_purchases_3_26_add_20260630_101404`, `backup_accounting_purchases_dongah_correction_20260701`, `backup_calibration_equipment_20260702`, `backup_calibration_records_20260702`, `backup_h_inventory_20260630_095410_v5apply`, `backup_h_inventory_lots_20260630_095410_v5apply`, `backup_purchase_125_delete_20260630_101928`, `backup_tx_9931_20260630_101404`, `h_inventory_lots_backup_pid_fix_20260425`, `k3_mapping_backup_2026_04_26`, `k5_backfill_backup_2026_04_26`, `lot_id_nullable_backup_2026_04_28`, `phase2_lot0_backup_2026_04_28`, `w2_lot_unit_backup_2026_04_26_il`, `w2_lot_unit_backup_2026_04_26_lots`, `w2_lot_unit_backup_2026_04_26_tx`, `w3_backfill_source_type_backup_2026_04_26`, `w3_tx_backup_2026_04_26`, `w4_backup_lot_750_removal_2026_06_25`, `phase2_lot0_matches_2026_04_28`;

-- ---------------------------------------------------------------------
-- §2. 아카이브 (서버 셸) — 대상 29개를 한 파일로
-- ---------------------------------------------------------------------
--   F=/home/root/backups/haccp/db/step6_archive_$(date +%Y%m%d).sql
--   mysqldump -u <user> -p --single-transaction --quick haccp_tenant_db _backup_h_batch_inputs_step16 _backup_item_master_step15 _bak_batch_actual_qty_20260510 _bak_batch_inputs_20260509 _bak_ledger_daily_20260509 _bak_ledger_monthly_20260509 _bak_macadamia_product_name_20260510 _bak_orphan_daily_log_ar_20260510 backup_accounting_purchases_154_20260630_100739 backup_accounting_purchases_3_26_add_20260630_101404 backup_accounting_purchases_dongah_correction_20260701 backup_calibration_equipment_20260702 backup_calibration_records_20260702 backup_h_inventory_20260630_095410_v5apply backup_h_inventory_lots_20260630_095410_v5apply backup_purchase_125_delete_20260630_101928 backup_tx_9931_20260630_101404 h_inventory_lots_backup_pid_fix_20260425 k3_mapping_backup_2026_04_26 k5_backfill_backup_2026_04_26 lot_id_nullable_backup_2026_04_28 phase2_lot0_backup_2026_04_28 w2_lot_unit_backup_2026_04_26_il w2_lot_unit_backup_2026_04_26_lots w2_lot_unit_backup_2026_04_26_tx w3_backfill_source_type_backup_2026_04_26 w3_tx_backup_2026_04_26 w4_backup_lot_750_removal_2026_06_25 phase2_lot0_matches_2026_04_28 > $F
--   gzip -k $F && ls -l $F* && sha256sum $F.gz   # 경로·크기·해시를 보고에 적는다

-- ---------------------------------------------------------------------
-- §3. 복구 검증 (G1·G2) — 검증용 스키마에 복원해서 원본과 비교
-- ---------------------------------------------------------------------
-- CREATE DATABASE haccp_step6_verify;
--   mysql -u <user> -p haccp_step6_verify < $F
-- 복원본 행수·CHECKSUM (§1 과 같은 문장을 haccp_step6_verify 에서 실행) → 테이블별 전부 일치해야 통과
-- 예: SELECT (SELECT COUNT(*) FROM haccp_tenant_db.`w3_tx_backup_2026_04_26`) AS src,
--            (SELECT COUNT(*) FROM haccp_step6_verify.`w3_tx_backup_2026_04_26`) AS restored;
-- 통과 후: DROP DATABASE haccp_step6_verify;

-- ---------------------------------------------------------------------
-- §3-b. 참조 재검사 (G3) — DB 쪽
-- ---------------------------------------------------------------------
SELECT 'fk' kind, CONSTRAINT_NAME name, TABLE_NAME FROM information_schema.REFERENTIAL_CONSTRAINTS
 WHERE CONSTRAINT_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IN ('_backup_h_batch_inputs_step16', '_backup_item_master_step15', '_bak_batch_actual_qty_20260510', '_bak_batch_inputs_20260509', '_bak_ledger_daily_20260509', '_bak_ledger_monthly_20260509', '_bak_macadamia_product_name_20260510', '_bak_orphan_daily_log_ar_20260510', 'backup_accounting_purchases_154_20260630_100739', 'backup_accounting_purchases_3_26_add_20260630_101404', 'backup_accounting_purchases_dongah_correction_20260701', 'backup_calibration_equipment_20260702', 'backup_calibration_records_20260702', 'backup_h_inventory_20260630_095410_v5apply', 'backup_h_inventory_lots_20260630_095410_v5apply', 'backup_purchase_125_delete_20260630_101928', 'backup_tx_9931_20260630_101404', 'h_inventory_lots_backup_pid_fix_20260425', 'k3_mapping_backup_2026_04_26', 'k5_backfill_backup_2026_04_26', 'lot_id_nullable_backup_2026_04_28', 'phase2_lot0_backup_2026_04_28', 'w2_lot_unit_backup_2026_04_26_il', 'w2_lot_unit_backup_2026_04_26_lots', 'w2_lot_unit_backup_2026_04_26_tx', 'w3_backfill_source_type_backup_2026_04_26', 'w3_tx_backup_2026_04_26', 'w4_backup_lot_750_removal_2026_06_25', 'phase2_lot0_matches_2026_04_28')
UNION ALL SELECT 'view', TABLE_NAME, '' FROM information_schema.VIEWS
 WHERE TABLE_SCHEMA = DATABASE() AND (VIEW_DEFINITION LIKE '%_backup_h_batch_inputs_step16%' OR VIEW_DEFINITION LIKE '%_backup_item_master_step15%' OR VIEW_DEFINITION LIKE '%_bak_batch_actual_qty_20260510%' OR VIEW_DEFINITION LIKE '%_bak_batch_inputs_20260509%' OR VIEW_DEFINITION LIKE '%_bak_ledger_daily_20260509%' OR VIEW_DEFINITION LIKE '%_bak_ledger_monthly_20260509%' OR VIEW_DEFINITION LIKE '%_bak_macadamia_product_name_20260510%' OR VIEW_DEFINITION LIKE '%_bak_orphan_daily_log_ar_20260510%' OR VIEW_DEFINITION LIKE '%backup_accounting_purchases_154_20260630_100739%' OR VIEW_DEFINITION LIKE '%backup_accounting_purchases_3_26_add_20260630_101404%' OR VIEW_DEFINITION LIKE '%backup_accounting_purchases_dongah_correction_20260701%' OR VIEW_DEFINITION LIKE '%backup_calibration_equipment_20260702%' OR VIEW_DEFINITION LIKE '%backup_calibration_records_20260702%' OR VIEW_DEFINITION LIKE '%backup_h_inventory_20260630_095410_v5apply%' OR VIEW_DEFINITION LIKE '%backup_h_inventory_lots_20260630_095410_v5apply%' OR VIEW_DEFINITION LIKE '%backup_purchase_125_delete_20260630_101928%' OR VIEW_DEFINITION LIKE '%backup_tx_9931_20260630_101404%' OR VIEW_DEFINITION LIKE '%h_inventory_lots_backup_pid_fix_20260425%' OR VIEW_DEFINITION LIKE '%k3_mapping_backup_2026_04_26%' OR VIEW_DEFINITION LIKE '%k5_backfill_backup_2026_04_26%' OR VIEW_DEFINITION LIKE '%lot_id_nullable_backup_2026_04_28%' OR VIEW_DEFINITION LIKE '%phase2_lot0_backup_2026_04_28%' OR VIEW_DEFINITION LIKE '%w2_lot_unit_backup_2026_04_26_il%' OR VIEW_DEFINITION LIKE '%w2_lot_unit_backup_2026_04_26_lots%' OR VIEW_DEFINITION LIKE '%w2_lot_unit_backup_2026_04_26_tx%' OR VIEW_DEFINITION LIKE '%w3_backfill_source_type_backup_2026_04_26%' OR VIEW_DEFINITION LIKE '%w3_tx_backup_2026_04_26%' OR VIEW_DEFINITION LIKE '%w4_backup_lot_750_removal_2026_06_25%' OR VIEW_DEFINITION LIKE '%phase2_lot0_matches_2026_04_28%')
UNION ALL SELECT 'trigger', TRIGGER_NAME, EVENT_OBJECT_TABLE FROM information_schema.TRIGGERS
 WHERE TRIGGER_SCHEMA = DATABASE() AND (ACTION_STATEMENT LIKE '%_backup_h_batch_inputs_step16%' OR ACTION_STATEMENT LIKE '%_backup_item_master_step15%' OR ACTION_STATEMENT LIKE '%_bak_batch_actual_qty_20260510%' OR ACTION_STATEMENT LIKE '%_bak_batch_inputs_20260509%' OR ACTION_STATEMENT LIKE '%_bak_ledger_daily_20260509%' OR ACTION_STATEMENT LIKE '%_bak_ledger_monthly_20260509%' OR ACTION_STATEMENT LIKE '%_bak_macadamia_product_name_20260510%' OR ACTION_STATEMENT LIKE '%_bak_orphan_daily_log_ar_20260510%' OR ACTION_STATEMENT LIKE '%backup_accounting_purchases_154_20260630_100739%' OR ACTION_STATEMENT LIKE '%backup_accounting_purchases_3_26_add_20260630_101404%' OR ACTION_STATEMENT LIKE '%backup_accounting_purchases_dongah_correction_20260701%' OR ACTION_STATEMENT LIKE '%backup_calibration_equipment_20260702%' OR ACTION_STATEMENT LIKE '%backup_calibration_records_20260702%' OR ACTION_STATEMENT LIKE '%backup_h_inventory_20260630_095410_v5apply%' OR ACTION_STATEMENT LIKE '%backup_h_inventory_lots_20260630_095410_v5apply%' OR ACTION_STATEMENT LIKE '%backup_purchase_125_delete_20260630_101928%' OR ACTION_STATEMENT LIKE '%backup_tx_9931_20260630_101404%' OR ACTION_STATEMENT LIKE '%h_inventory_lots_backup_pid_fix_20260425%' OR ACTION_STATEMENT LIKE '%k3_mapping_backup_2026_04_26%' OR ACTION_STATEMENT LIKE '%k5_backfill_backup_2026_04_26%' OR ACTION_STATEMENT LIKE '%lot_id_nullable_backup_2026_04_28%' OR ACTION_STATEMENT LIKE '%phase2_lot0_backup_2026_04_28%' OR ACTION_STATEMENT LIKE '%w2_lot_unit_backup_2026_04_26_il%' OR ACTION_STATEMENT LIKE '%w2_lot_unit_backup_2026_04_26_lots%' OR ACTION_STATEMENT LIKE '%w2_lot_unit_backup_2026_04_26_tx%' OR ACTION_STATEMENT LIKE '%w3_backfill_source_type_backup_2026_04_26%' OR ACTION_STATEMENT LIKE '%w3_tx_backup_2026_04_26%' OR ACTION_STATEMENT LIKE '%w4_backup_lot_750_removal_2026_06_25%' OR ACTION_STATEMENT LIKE '%phase2_lot0_matches_2026_04_28%')
UNION ALL SELECT 'routine', ROUTINE_NAME, '' FROM information_schema.ROUTINES
 WHERE ROUTINE_SCHEMA = DATABASE() AND (ROUTINE_DEFINITION LIKE '%_backup_h_batch_inputs_step16%' OR ROUTINE_DEFINITION LIKE '%_backup_item_master_step15%' OR ROUTINE_DEFINITION LIKE '%_bak_batch_actual_qty_20260510%' OR ROUTINE_DEFINITION LIKE '%_bak_batch_inputs_20260509%' OR ROUTINE_DEFINITION LIKE '%_bak_ledger_daily_20260509%' OR ROUTINE_DEFINITION LIKE '%_bak_ledger_monthly_20260509%' OR ROUTINE_DEFINITION LIKE '%_bak_macadamia_product_name_20260510%' OR ROUTINE_DEFINITION LIKE '%_bak_orphan_daily_log_ar_20260510%' OR ROUTINE_DEFINITION LIKE '%backup_accounting_purchases_154_20260630_100739%' OR ROUTINE_DEFINITION LIKE '%backup_accounting_purchases_3_26_add_20260630_101404%' OR ROUTINE_DEFINITION LIKE '%backup_accounting_purchases_dongah_correction_20260701%' OR ROUTINE_DEFINITION LIKE '%backup_calibration_equipment_20260702%' OR ROUTINE_DEFINITION LIKE '%backup_calibration_records_20260702%' OR ROUTINE_DEFINITION LIKE '%backup_h_inventory_20260630_095410_v5apply%' OR ROUTINE_DEFINITION LIKE '%backup_h_inventory_lots_20260630_095410_v5apply%' OR ROUTINE_DEFINITION LIKE '%backup_purchase_125_delete_20260630_101928%' OR ROUTINE_DEFINITION LIKE '%backup_tx_9931_20260630_101404%' OR ROUTINE_DEFINITION LIKE '%h_inventory_lots_backup_pid_fix_20260425%' OR ROUTINE_DEFINITION LIKE '%k3_mapping_backup_2026_04_26%' OR ROUTINE_DEFINITION LIKE '%k5_backfill_backup_2026_04_26%' OR ROUTINE_DEFINITION LIKE '%lot_id_nullable_backup_2026_04_28%' OR ROUTINE_DEFINITION LIKE '%phase2_lot0_backup_2026_04_28%' OR ROUTINE_DEFINITION LIKE '%w2_lot_unit_backup_2026_04_26_il%' OR ROUTINE_DEFINITION LIKE '%w2_lot_unit_backup_2026_04_26_lots%' OR ROUTINE_DEFINITION LIKE '%w2_lot_unit_backup_2026_04_26_tx%' OR ROUTINE_DEFINITION LIKE '%w3_backfill_source_type_backup_2026_04_26%' OR ROUTINE_DEFINITION LIKE '%w3_tx_backup_2026_04_26%' OR ROUTINE_DEFINITION LIKE '%w4_backup_lot_750_removal_2026_06_25%' OR ROUTINE_DEFINITION LIKE '%phase2_lot0_matches_2026_04_28%');
-- 기대: 0행. (덤프 10/10 기준: 뷰 2개(v_orphan_batch_inputs, v_zero_priced_recent_inputs)·트리거 0·루틴 0 모두 대상 참조 없음)
-- 코드·cron 쪽은 서버에서:  bash scripts/diag/table-ref-check.sh   → "참조 0" 이어야 통과

-- ---------------------------------------------------------------------
-- §4. DROP — G1~G3 통과 후 한 문장씩
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- §5. 사후 (G4 + 구조 정합성)
-- ---------------------------------------------------------------------
SELECT COUNT(*) AS tables_now FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE();  -- 실행 직전 - 29
-- G4 회귀 (앱으로, DB 직접 아님):
--   1) smoke: npx tsx scripts/smoke-f2-pipeline.ts
--   2) 배치 1건 생성→시작(자동출고)→완료 (SKU LOT·생산완료 분개 생성 확인)
--   3) 매입 1건 확정 (LOT·원장·집계·분개) / 매출 1건 확정 (COGS 제품 1430)
--   4) 실사 탭 품목 ±1 (LOT·원장·집계 동시 이동)
--   5) scripts/diag/identity-namespace-diag.sql §B·§C·§D 재실행 — 실행 전과 동일해야 함
-- 구조 정합성: introspect 재추출 → npx tsx scripts/diag/schema-diff.ts <schema.ts> → DB-only 0 / 스키마-only 0
-- 스냅샷 갱신: npx tsx scripts/dump-schema-baseline.ts → drizzle/baseline/actual-schema.json 을 PR 로 (CI 가 이 파일을 본다)
