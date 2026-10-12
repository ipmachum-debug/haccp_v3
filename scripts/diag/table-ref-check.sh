#!/usr/bin/env bash
# 6-a 관문 G3 — 대상 테이블을 참조하는 코드·SQL·cron 이 남아 있는지 재검사 (서버에서 실행)
# 사용: bash scripts/diag/table-ref-check.sh   (레포 루트에서)   → 마지막 줄 "참조 0" 이어야 통과
set -u
TARGETS="_backup_h_batch_inputs_step16 _backup_item_master_step15 _bak_batch_actual_qty_20260510 _bak_batch_inputs_20260509 _bak_ledger_daily_20260509 _bak_ledger_monthly_20260509 _bak_macadamia_product_name_20260510 _bak_orphan_daily_log_ar_20260510 backup_accounting_purchases_154_20260630_100739 backup_accounting_purchases_3_26_add_20260630_101404 backup_accounting_purchases_dongah_correction_20260701 backup_calibration_equipment_20260702 backup_calibration_records_20260702 backup_h_inventory_20260630_095410_v5apply backup_h_inventory_lots_20260630_095410_v5apply backup_purchase_125_delete_20260630_101928 backup_tx_9931_20260630_101404 h_inventory_lots_backup_pid_fix_20260425 k3_mapping_backup_2026_04_26 k5_backfill_backup_2026_04_26 lot_id_nullable_backup_2026_04_28 phase2_lot0_backup_2026_04_28 w2_lot_unit_backup_2026_04_26_il w2_lot_unit_backup_2026_04_26_lots w2_lot_unit_backup_2026_04_26_tx w3_backfill_source_type_backup_2026_04_26 w3_tx_backup_2026_04_26 w4_backup_lot_750_removal_2026_06_25 phase2_lot0_matches_2026_04_28"
ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
hits=0
for t in $TARGETS; do
  # 레포: 코드·SQL·셸 (기록 문서·일회성 출력물·이 스크립트·6-a SQL·스키마 스냅샷은 제외 — 스냅샷은 §5 에서 재생성)
  # 제외 = 라이브 참조가 아닌 것:
  #   docs/*.md                          설명 문서
  #   scripts/migrations-manual/*        이 작업 자체의 SQL
  #   drizzle/baseline/actual-schema.json 스키마 스냅샷 (§5 에서 재생성)
  #   sql/step*_*.sql, scripts/_w*, scripts/_*.ts, scripts/backfill-lot0-2026-04.ts  2026-04~06 실행 완료된 일회성 작업 기록
  #   scripts/_lib/schemaScan.ts, scripts/__tests__/*   백업 테이블 "명명 규칙" 의 예시 문자열 (테이블 존재와 무관)
  r=$(cd "$ROOT" && git grep -n --word-regexp "$t" -- ':!docs' ':!*.md' ':!scripts/migrations-manual/*' ':!scripts/diag/table-ref-check.sh' \
       ':!drizzle/baseline/actual-schema.json' ':!sql/step*' ':!scripts/_*' ':!scripts/backfill-lot0-2026-04.ts' ':!scripts/__tests__/*' 2>/dev/null)
  # 서버 cron·운영 스크립트
  c=$(grep -rln --include='*' "$t" /etc/cron* /var/spool/cron /root/*.sh /root/haccp_v3/scripts/*.sh 2>/dev/null)
  if [ -n "$r$c" ]; then hits=$((hits+1)); echo "== $t"; [ -n "$r" ] && echo "$r"; [ -n "$c" ] && echo "$c"; fi
done
echo "참조 $hits"
exit $hits
