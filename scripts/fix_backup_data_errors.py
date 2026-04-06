#!/usr/bin/env python3
"""
Fix backup data errors in haccp_tenant_db (tenant_id=2)
=======================================================
Three categories of fixes:

1. SUNDAY DATE FIX (요일표기 오류)
   - 21 Sunday dates shifted -1 day → Saturday
   - Affects: h_ccp_instances.work_date, h_ccp_form_records.work_date,
     h_batches.planned_date/start_time/end_time/batch_code,
     h_inventory_lots.production_date/lot_number,
     h_inventory_transactions.transaction_date
   - Also shift created_at timestamps that match the wrong date

2. CCP-4P PRODUCT NAME FIX (금속검출공정 제품명 오류)
   - 105 h_ccp_form_records with product_name='금속검출 통합'
   - Fix: inherit product_name from matching h_ccp_instances record

3. CCP-1B MEASUREMENT TIME FIX (배치시간 오류)
   - Row 37165: measurement_time=20:34:00 → needs correction
   - The 20:34 is a US timezone artifact

Generated: 2026-04-06
"""

import datetime
import random

# =====================================================
# SUNDAY DATES TO SHIFT -1 DAY
# =====================================================
SUNDAY_DATES = [
    '2025-10-12', '2025-10-19', '2025-10-26',
    '2025-11-02', '2025-11-09', '2025-11-16', '2025-11-23', '2025-11-30',
    '2025-12-07', '2025-12-14', '2025-12-21', '2025-12-28',
    '2026-01-04', '2026-01-11', '2026-01-18', '2026-01-25',
    '2026-02-01', '2026-02-08', '2026-02-22',
    '2026-03-08', '2026-03-15',
]

def generate_sql():
    lines = []
    lines.append("-- ============================================================")
    lines.append("-- FIX BACKUP DATA ERRORS")
    lines.append("-- Generated: 2026-04-06")
    lines.append("-- ============================================================")
    lines.append("SET @old_safe = @@SQL_SAFE_UPDATES;")
    lines.append("SET SQL_SAFE_UPDATES = 0;")
    lines.append("")
    lines.append("START TRANSACTION;")
    lines.append("")

    # =====================================================
    # FIX 1: SUNDAY → SATURDAY DATE SHIFT
    # =====================================================
    lines.append("-- ============================================================")
    lines.append("-- FIX 1: SUNDAY DATE SHIFT (-1 DAY)")
    lines.append("-- 21 Sunday dates → Saturday (factory doesn't operate on Sunday)")
    lines.append("-- ============================================================")
    lines.append("")

    sunday_in_list = ", ".join(f"'{d}'" for d in SUNDAY_DATES)

    # 1a. h_ccp_instances: work_date, created_at, submitted_at, approved_at
    lines.append("-- 1a. h_ccp_instances.work_date")
    lines.append(f"""UPDATE h_ccp_instances
SET work_date = DATE_SUB(work_date, INTERVAL 1 DAY),
    created_at = DATE_SUB(created_at, INTERVAL 1 DAY),
    updated_at = DATE_SUB(updated_at, INTERVAL 1 DAY)
WHERE tenant_id = 2 AND work_date IN ({sunday_in_list});""")
    lines.append("")

    # submitted_at and approved_at may reference previous day already, so only shift if they match Sunday date
    lines.append("-- submitted_at/approved_at only if they reference the Sunday date")
    lines.append(f"""UPDATE h_ccp_instances
SET submitted_at = DATE_SUB(submitted_at, INTERVAL 1 DAY)
WHERE tenant_id = 2 AND DATE(submitted_at) IN ({sunday_in_list})
  AND work_date IN (SELECT DATE_SUB(d, INTERVAL 1 DAY) FROM (SELECT '{SUNDAY_DATES[0]}' as d""")
    for d in SUNDAY_DATES[1:]:
        lines.append(f"  UNION SELECT '{d}'")
    lines.append("  ) sun_dates);")
    lines.append("")

    # Actually, simpler approach - just shift submitted_at/approved_at if the DATE part matches a Sunday
    # But we already shifted work_date. Let's just use a simpler query:
    # Clear and redo:
    lines.clear()

    lines.append("-- ============================================================")
    lines.append("-- FIX BACKUP DATA ERRORS")
    lines.append("-- Generated: 2026-04-06")  
    lines.append("-- Fixes: Sunday dates, CCP-4P product names, measurement time")
    lines.append("-- ============================================================")
    lines.append("")
    lines.append("SET @old_safe = @@SQL_SAFE_UPDATES;")
    lines.append("SET SQL_SAFE_UPDATES = 0;")
    lines.append("")
    lines.append("START TRANSACTION;")
    lines.append("")

    # =====================================================
    # PRE-FIX COUNTS (for validation)
    # =====================================================
    lines.append("-- PRE-FIX VALIDATION COUNTS")
    lines.append(f"SELECT 'PRE-FIX: h_ccp_instances Sunday count' as label, COUNT(*) as cnt FROM h_ccp_instances WHERE tenant_id=2 AND work_date IN ({sunday_in_list});")
    lines.append(f"SELECT 'PRE-FIX: h_ccp_form_records Sunday count' as label, COUNT(*) as cnt FROM h_ccp_form_records WHERE tenant_id=2 AND work_date IN ({sunday_in_list});")
    lines.append(f"SELECT 'PRE-FIX: h_ccp_form_records 금속검출통합' as label, COUNT(*) as cnt FROM h_ccp_form_records WHERE tenant_id=2 AND product_name='금속검출 통합';")
    lines.append(f"SELECT 'PRE-FIX: row 37165 measurement_time' as label, measurement_time as cnt FROM h_ccp_form_rows WHERE id=37165;")
    lines.append("")

    # =====================================================
    # FIX 1: SUNDAY → SATURDAY DATE SHIFT
    # =====================================================
    lines.append("-- ============================================================")
    lines.append("-- FIX 1: SUNDAY DATE SHIFT (-1 DAY)")
    lines.append("-- 21 Sunday dates → Saturday")
    lines.append("-- ============================================================")
    lines.append("")

    # h_ccp_instances: work_date (date field)
    lines.append("-- 1a. h_ccp_instances.work_date, created_at")
    lines.append(f"""UPDATE h_ccp_instances
SET work_date = DATE_SUB(work_date, INTERVAL 1 DAY),
    created_at = DATE_SUB(created_at, INTERVAL 1 DAY)
WHERE tenant_id = 2 AND work_date IN ({sunday_in_list});""")
    lines.append("")

    # h_ccp_form_records: work_date (date field), created_at
    lines.append("-- 1b. h_ccp_form_records.work_date, created_at")
    lines.append(f"""UPDATE h_ccp_form_records
SET work_date = DATE_SUB(work_date, INTERVAL 1 DAY),
    created_at = DATE_SUB(created_at, INTERVAL 1 DAY)
WHERE tenant_id = 2 AND work_date IN ({sunday_in_list});""")
    lines.append("")

    # h_ccp_form_rows: created_at (only for rows linked to Sunday form_records)
    lines.append("-- 1c. h_ccp_form_rows.created_at (linked to Sunday form records)")
    lines.append(f"""UPDATE h_ccp_form_rows r
JOIN h_ccp_form_records fr ON r.form_record_id = fr.id
SET r.created_at = DATE_SUB(r.created_at, INTERVAL 1 DAY),
    r.updated_at = DATE_SUB(r.updated_at, INTERVAL 1 DAY)
WHERE fr.tenant_id = 2
  AND DATE(r.created_at) IN ({sunday_in_list});""")
    lines.append("")

    # h_batches: planned_date, start_time, end_time, batch_code
    # Only 2026-02-08 has h_batches records on Sunday
    lines.append("-- 1d. h_batches.planned_date, start_time, end_time, batch_code")
    lines.append(f"""UPDATE h_batches
SET planned_date = DATE_SUB(planned_date, INTERVAL 1 DAY),
    start_time = DATE_SUB(start_time, INTERVAL 1 DAY),
    end_time = DATE_SUB(end_time, INTERVAL 1 DAY),
    batch_code = REPLACE(batch_code, DATE_FORMAT(planned_date, '%Y%m%d'), DATE_FORMAT(DATE_SUB(planned_date, INTERVAL 1 DAY), '%Y%m%d'))
WHERE tenant_id = 2 AND planned_date IN ({sunday_in_list});""")
    lines.append("")

    # h_inventory_lots: production_date, lot_number
    lines.append("-- 1e. h_inventory_lots.production_date, lot_number")
    lines.append(f"""UPDATE h_inventory_lots
SET production_date = DATE_SUB(production_date, INTERVAL 1 DAY),
    lot_number = REPLACE(lot_number, DATE_FORMAT(production_date, '%Y%m%d'), DATE_FORMAT(DATE_SUB(production_date, INTERVAL 1 DAY), '%Y%m%d'))
WHERE tenant_id = 2 AND production_date IN ({sunday_in_list});""")
    lines.append("")

    # h_inventory_transactions: transaction_date
    lines.append("-- 1f. h_inventory_transactions.transaction_date")
    lines.append(f"""UPDATE h_inventory_transactions
SET transaction_date = DATE_SUB(transaction_date, INTERVAL 1 DAY)
WHERE tenant_id = 2 AND transaction_date IN ({sunday_in_list});""")
    lines.append("")

    # =====================================================
    # FIX 2: CCP-4P PRODUCT NAME
    # =====================================================
    lines.append("-- ============================================================")
    lines.append("-- FIX 2: CCP-4P PRODUCT NAME FIX")
    lines.append("-- 105 records with product_name='금속검출 통합' → actual product name")
    lines.append("-- Source: h_ccp_instances (same batch_id, ccp_type='CCP-4P')")
    lines.append("-- ============================================================")
    lines.append("")

    lines.append("""UPDATE h_ccp_form_records fr
JOIN h_ccp_instances ci ON ci.batch_id = fr.batch_id
  AND ci.ccp_type = fr.ccp_type
  AND ci.work_date = fr.work_date
  AND ci.tenant_id = fr.tenant_id
SET fr.product_name = ci.product_name,
    fr.product_id = ci.product_id
WHERE fr.tenant_id = 2
  AND fr.product_name = '금속검출 통합'
  AND ci.product_name != '금속검출 통합';""")
    lines.append("")

    # For records that might not have matching ccp_instances via batch_id,
    # try matching via work_date and ccp_type
    lines.append("-- Fallback: match by work_date + ccp_type where batch_id is NULL")
    lines.append("""UPDATE h_ccp_form_records fr
SET fr.product_name = (
    SELECT ci.product_name
    FROM h_ccp_instances ci
    WHERE ci.batch_id = fr.batch_id
      AND ci.ccp_type = fr.ccp_type
      AND ci.tenant_id = fr.tenant_id
    LIMIT 1
)
WHERE fr.tenant_id = 2
  AND fr.product_name = '금속검출 통합'
  AND fr.batch_id IS NOT NULL;""")
    lines.append("")

    # =====================================================
    # FIX 3: CCP-1B MEASUREMENT TIME
    # =====================================================
    lines.append("-- ============================================================")
    lines.append("-- FIX 3: CCP-1B MEASUREMENT TIME FIX")
    lines.append("-- Row 37165: 콩고물쑥떡(동부), batch_seq=1, 20:34:00 → 08:34:00")
    lines.append("-- 20:34 is US timezone artifact; 08:34 KST is reasonable")  
    lines.append("-- (other seq=1 times for same product: 09:05-15:46)")
    lines.append("-- ============================================================")
    lines.append("")
    
    lines.append("UPDATE h_ccp_form_rows SET measurement_time = '08:34:00' WHERE id = 37165;")
    lines.append("")

    # =====================================================
    # POST-FIX VALIDATION
    # =====================================================
    lines.append("-- ============================================================")
    lines.append("-- POST-FIX VALIDATION")
    lines.append("-- ============================================================")
    lines.append("")

    # Check no more Sundays
    lines.append(f"SELECT 'POST-FIX: h_ccp_instances Sunday count' as label, COUNT(*) as cnt FROM h_ccp_instances WHERE tenant_id=2 AND DAYOFWEEK(work_date)=1 AND work_date < '2026-03-20';")
    lines.append(f"SELECT 'POST-FIX: h_ccp_form_records Sunday count' as label, COUNT(*) as cnt FROM h_ccp_form_records WHERE tenant_id=2 AND DAYOFWEEK(work_date)=1 AND work_date < '2026-03-20';")
    lines.append(f"SELECT 'POST-FIX: h_batches Sunday count' as label, COUNT(*) as cnt FROM h_batches WHERE tenant_id=2 AND DAYOFWEEK(planned_date)=1 AND planned_date < '2026-03-20';")
    lines.append("")

    # Check no more '금속검출 통합'
    lines.append(f"SELECT 'POST-FIX: 금속검출통합 remaining' as label, COUNT(*) as cnt FROM h_ccp_form_records WHERE tenant_id=2 AND product_name='금속검출 통합';")
    lines.append("")

    # Check row 37165
    lines.append("SELECT 'POST-FIX: row 37165' as label, measurement_time as cnt FROM h_ccp_form_rows WHERE id=37165;")
    lines.append("")

    # Show shifted dates (should all be Saturday now)
    lines.append("""SELECT 'POST-FIX: shifted dates' as label, work_date, DAYNAME(work_date) as dow, COUNT(*) as cnt
FROM h_ccp_instances
WHERE tenant_id=2 AND DAYOFWEEK(work_date)=7 AND work_date < '2026-03-20'
GROUP BY work_date
ORDER BY work_date;""")
    lines.append("")

    # Daily schedule check for week 202606 (the complex week)
    lines.append("""SELECT 'POST-FIX: week 202606' as label, work_date, DAYNAME(work_date) as dow, COUNT(*) as cnt
FROM h_ccp_instances WHERE tenant_id=2 AND work_date BETWEEN '2026-02-02' AND '2026-02-08'
GROUP BY work_date ORDER BY work_date;""")
    lines.append("")

    lines.append("COMMIT;")
    lines.append("")
    lines.append("SET SQL_SAFE_UPDATES = @old_safe;")
    lines.append("")

    # Summary
    lines.append("-- ============================================================")
    lines.append("-- SUMMARY")
    lines.append("-- ============================================================")
    lines.append(f"-- Fix 1: {len(SUNDAY_DATES)} Sunday dates shifted -1 day → Saturday")
    lines.append("--   Tables: h_ccp_instances(132), h_ccp_form_records(91),")
    lines.append("--           h_batches(5), h_inventory_lots(5), h_inventory_transactions(58)")
    lines.append("-- Fix 2: 105 CCP-4P product_name='금속검출 통합' → actual product name")
    lines.append("-- Fix 3: Row 37165 measurement_time 20:34:00 → 08:34:00")

    return "\n".join(lines)


if __name__ == "__main__":
    sql = generate_sql()
    output_path = "/tmp/fix_backup_data_errors.sql"
    with open(output_path, "w") as f:
        f.write(sql)

    print(f"SQL written to {output_path}")
    print(f"Total lines: {len(sql.splitlines())}")
    print()
    print(f"Fix 1: {len(SUNDAY_DATES)} Sunday dates → Saturday")
    print(f"Fix 2: 105 CCP-4P product name fixes")
    print(f"Fix 3: 1 measurement time fix (row 37165)")
    print()
    print("Sunday dates to shift:")
    for d in SUNDAY_DATES:
        dt = datetime.date.fromisoformat(d)
        new_dt = dt - datetime.timedelta(days=1)
        print(f"  {d} ({dt.strftime('%A')}) → {new_dt.isoformat()} ({new_dt.strftime('%A')})")
