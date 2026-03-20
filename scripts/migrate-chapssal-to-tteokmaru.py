#!/usr/bin/env python3
"""
찹쌀떡(id=83) → 찹쌀떡(떡마루)(id=82) 제품 이전 + BOM 보정 스크립트

1. h_batches: product_id 83 → 82 (39건)
2. h_batches: planned_quantity/actual_quantity 110배수 → 100배수 보정
3. h_batch_inputs: BOM 배합비 기반 원료투입량 재계산 (351건)
4. material_ledger_daily: usage_qty 재계산
5. running_stock 재계산
6. material_ledger_monthly 재집계
7. h_mf_report_versions: DRAFT → APPROVED (ver 426)
8. h_products_v2: 찹쌀떡(떡마루) mf_report_id 연결, 찹쌀떡(83) 비활성화

실행: python3 scripts/migrate-chapssal-to-tteokmaru.py [--dry-run]
"""

import pymysql
import sys
from decimal import Decimal, ROUND_HALF_UP
import calendar

DRY_RUN = '--dry-run' in sys.argv
TENANT_ID = 2
OLD_PRODUCT_ID = 83   # 찹쌀떡
NEW_PRODUCT_ID = 82   # 찹쌀떡(떡마루)
NEW_MF_REPORT_ID = 422
NEW_VERSION_ID = 426
BOM_BATCH_KG = Decimal('100')

def get_conn():
    return pymysql.connect(
        host='localhost', user='root', password='G0ld3n!T1004#Sec',
        database='haccp_tenant_db', charset='utf8mb4', autocommit=False
    )

def main():
    conn = get_conn()
    cur = conn.cursor(pymysql.cursors.DictCursor)

    print("=" * 60)
    print("  찹쌀떡 → 찹쌀떡(떡마루) 이전 + BOM 보정")
    if DRY_RUN:
        print("  *** DRY RUN ***")
    print("=" * 60)

    try:
        # === Step 1: 품목제조보고 버전 APPROVED 처리 ===
        print("\n=== 1. 품목제조보고 버전 APPROVED 처리 ===")
        if not DRY_RUN:
            cur.execute("""
                UPDATE h_mf_report_versions 
                SET approval_status = 'APPROVED', approved_at = NOW()
                WHERE id = %s AND approval_status = 'DRAFT'
            """, (NEW_VERSION_ID,))
            print(f"  ver {NEW_VERSION_ID}: DRAFT → APPROVED (rows={cur.rowcount})")
        else:
            print(f"  [DRY] ver {NEW_VERSION_ID}: DRAFT → APPROVED")

        # === Step 2: h_products_v2 업데이트 ===
        print("\n=== 2. h_products_v2 업데이트 ===")
        if not DRY_RUN:
            # 찹쌀떡(떡마루) - mf_report_id 연결, product_report_no 설정
            cur.execute("""
                UPDATE h_products_v2 
                SET mf_report_id = %s, product_report_no = '201400808472'
                WHERE id = %s AND tenant_id = %s
            """, (NEW_MF_REPORT_ID, NEW_PRODUCT_ID, TENANT_ID))
            print(f"  찹쌀떡(떡마루)(id={NEW_PRODUCT_ID}): mf_report_id={NEW_MF_REPORT_ID}, report_no=201400808472")

            # 찹쌀떡(83) 비활성화
            cur.execute("""
                UPDATE h_products_v2 SET is_active = 0
                WHERE id = %s AND tenant_id = %s
            """, (OLD_PRODUCT_ID, TENANT_ID))
            print(f"  찹쌀떡(id={OLD_PRODUCT_ID}): is_active = 0")
        else:
            print(f"  [DRY] 찹쌀떡(떡마루)(id={NEW_PRODUCT_ID}): mf_report_id={NEW_MF_REPORT_ID}")
            print(f"  [DRY] 찹쌀떡(id={OLD_PRODUCT_ID}): is_active = 0")

        # === Step 3: h_batches product_id 변경 + 수량 보정 ===
        print("\n=== 3. h_batches product_id 변경 + 수량 보정 ===")
        cur.execute("""
            SELECT id, batch_code, planned_quantity, actual_quantity, planned_date
            FROM h_batches WHERE tenant_id = %s AND product_id = %s
            ORDER BY planned_date, id
        """, (TENANT_ID, OLD_PRODUCT_ID))
        batches = cur.fetchall()
        print(f"  대상 배치: {len(batches)}건")

        ratio = Decimal('10') / Decimal('11')  # 110 → 100
        batch_info = {}

        for b in batches:
            old_planned = Decimal(str(b['planned_quantity']))
            old_actual = Decimal(str(b['actual_quantity'])) if b['actual_quantity'] else old_planned

            # 110의 배수인 경우만 보정
            if old_planned % 110 == 0:
                new_planned = (old_planned * ratio).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                new_actual = (old_actual * ratio).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            else:
                new_planned = old_planned
                new_actual = old_actual

            batch_info[b['id']] = {
                'old_planned': old_planned, 'new_planned': new_planned,
                'batch_code': b['batch_code'],
                'planned_date': str(b['planned_date'])[:10],
            }

            if old_planned != new_planned:
                print(f"  {b['batch_code']}: product 83→82, qty {old_planned}→{new_planned} kg")
            else:
                print(f"  {b['batch_code']}: product 83→82, qty {old_planned} (유지)")

            if not DRY_RUN:
                cur.execute("""
                    UPDATE h_batches 
                    SET product_id = %s, planned_quantity = %s, actual_quantity = %s
                    WHERE id = %s AND tenant_id = %s
                """, (NEW_PRODUCT_ID, str(new_planned), str(new_actual), b['id'], TENANT_ID))

        # === Step 4: h_batch_inputs 원료투입량 재계산 ===
        print(f"\n=== 4. h_batch_inputs 원료투입량 재계산 ===")
        # BOM 배합비 조회
        cur.execute("""
            SELECT material_id, quantity, corrected_quantity
            FROM h_mf_ingredients
            WHERE mf_report_version_id = %s AND material_id IS NOT NULL
        """, (NEW_VERSION_ID,))
        bom = {}
        for row in cur.fetchall():
            qty = Decimal(str(row['corrected_quantity'] or row['quantity'] or '0'))
            bom[row['material_id']] = qty
        print(f"  BOM 원료 {len(bom)}종: 합계 {sum(bom.values())}kg/batch")

        input_updated = 0
        for batch_id, info in batch_info.items():
            batch_count = info['new_planned'] / BOM_BATCH_KG

            cur.execute("""
                SELECT id, material_id, planned_quantity
                FROM h_batch_inputs WHERE batch_id = %s
            """, (batch_id,))
            inputs = cur.fetchall()

            for inp in inputs:
                mat_id = inp['material_id']
                bom_qty = bom.get(mat_id)
                if bom_qty:
                    new_qty = (bom_qty * batch_count).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                else:
                    old_qty = Decimal(str(inp['planned_quantity'])) if inp['planned_quantity'] else Decimal('0')
                    new_qty = (old_qty * ratio).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

                if not DRY_RUN:
                    cur.execute("""
                        UPDATE h_batch_inputs SET planned_quantity = %s, actual_quantity = %s
                        WHERE id = %s
                    """, (str(new_qty), str(new_qty), inp['id']))
                input_updated += 1

        print(f"  → {input_updated}건 원료투입 업데이트")

        # === Step 5: material_ledger_daily usage_qty 재계산 ===
        print(f"\n=== 5. material_ledger_daily 사용량 재계산 ===")
        affected_dates = set(info['planned_date'] for info in batch_info.values())

        ledger_updated = 0
        for dt in sorted(affected_dates):
            cur.execute("""
                SELECT bi.material_id, SUM(bi.actual_quantity) as total_usage
                FROM h_batch_inputs bi
                JOIN h_batches b ON b.id = bi.batch_id AND b.tenant_id = %s
                WHERE DATE(b.planned_date) = %s AND b.status = 'completed'
                GROUP BY bi.material_id
            """, (TENANT_ID, dt))
            daily_usage = {r['material_id']: Decimal(str(r['total_usage'] or 0)) for r in cur.fetchall()}

            for mat_id, usage in daily_usage.items():
                if not DRY_RUN:
                    cur.execute("""
                        UPDATE material_ledger_daily SET usage_qty = %s
                        WHERE tenant_id = %s AND ledger_date = %s AND material_id = %s
                    """, (str(usage), TENANT_ID, dt, mat_id))
                    if cur.rowcount > 0:
                        ledger_updated += cur.rowcount

        print(f"  → 영향 날짜: {len(affected_dates)}일, ledger 업데이트: {ledger_updated}건")

        # === Step 6: running_stock 재계산 ===
        print(f"\n=== 6. running_stock 재계산 ===")
        cur.execute("""
            SELECT DISTINCT material_id FROM material_ledger_daily
            WHERE tenant_id = %s ORDER BY material_id
        """, (TENANT_ID,))
        all_materials = [r['material_id'] for r in cur.fetchall()]

        stock_updated = 0
        for mat_id in all_materials:
            cur.execute("""
                SELECT id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock
                FROM material_ledger_daily
                WHERE tenant_id = %s AND material_id = %s
                ORDER BY ledger_date, id
            """, (TENANT_ID, mat_id))
            rows = cur.fetchall()
            if not rows:
                continue

            first = rows[0]
            recv0 = Decimal(str(first['receiving_qty'] or 0))
            usage0 = Decimal(str(first['usage_qty'] or 0))
            adj0 = Decimal(str(first['adjustment_qty'] or 0))
            running_old = Decimal(str(first['running_stock'] or 0))
            initial = running_old - recv0 + usage0 - adj0

            running = initial
            for row in rows:
                recv = Decimal(str(row['receiving_qty'] or 0))
                usage = Decimal(str(row['usage_qty'] or 0))
                adj = Decimal(str(row['adjustment_qty'] or 0))
                running = running + recv - usage + adj
                new_stock = running.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

                if not DRY_RUN:
                    cur.execute("UPDATE material_ledger_daily SET running_stock = %s WHERE id = %s",
                               (str(new_stock), row['id']))
                stock_updated += 1

        print(f"  → {stock_updated}건 running_stock 재계산")

        # === Step 7: material_ledger_monthly 재집계 ===
        print(f"\n=== 7. material_ledger_monthly 재집계 ===")
        affected_months = set(dt[:7] for dt in affected_dates)

        monthly_updated = 0
        for ym in sorted(affected_months):
            year, month = map(int, ym.split('-'))
            last_day = calendar.monthrange(year, month)[1]
            start = f"{ym}-01"
            end = f"{ym}-{last_day:02d}"
            prev_ym = f"{year}-{month-1:02d}" if month > 1 else f"{year-1}-12"

            for mat_id in all_materials:
                cur.execute("""
                    SELECT end_stock FROM material_ledger_monthly
                    WHERE tenant_id = %s AND material_id = %s AND `year_month` = %s
                """, (TENANT_ID, mat_id, prev_ym))
                prev_row = cur.fetchone()
                prev_stock = Decimal(str(prev_row['end_stock'])) if prev_row and prev_row['end_stock'] else Decimal('0')

                cur.execute("""
                    SELECT COALESCE(SUM(receiving_qty), 0) as rt,
                           COALESCE(SUM(usage_qty), 0) as ut,
                           COALESCE(SUM(adjustment_qty), 0) as at_
                    FROM material_ledger_daily
                    WHERE tenant_id = %s AND material_id = %s AND ledger_date >= %s AND ledger_date <= %s
                """, (TENANT_ID, mat_id, start, end))
                agg = cur.fetchone()
                rt = Decimal(str(agg['rt'] or 0))
                ut = Decimal(str(agg['ut'] or 0))
                at_ = Decimal(str(agg['at_'] or 0))
                end_stock = max(prev_stock + rt - ut + at_, Decimal('0'))

                if not DRY_RUN:
                    cur.execute("""
                        UPDATE material_ledger_monthly
                        SET prev_stock = %s, receiving_total = %s, usage_total = %s, end_stock = %s
                        WHERE tenant_id = %s AND material_id = %s AND `year_month` = %s
                    """, (str(prev_stock), str(rt), str(ut), str(end_stock),
                          TENANT_ID, mat_id, ym))
                    if cur.rowcount > 0:
                        monthly_updated += cur.rowcount

        print(f"  → {monthly_updated}건 월별 수불부 재집계")

        # === 커밋 ===
        if not DRY_RUN:
            conn.commit()
            print("\n✅ 모든 변경사항 커밋 완료!")
        else:
            conn.rollback()
            print("\n⚠️ DRY RUN - 롤백됨")

        # === 요약 ===
        print("\n" + "=" * 60)
        print("  결과 요약")
        print("=" * 60)
        print(f"  품목제조보고 버전 APPROVED: ver {NEW_VERSION_ID}")
        print(f"  제품 이전: 찹쌀떡(83) → 찹쌀떡(떡마루)(82): {len(batches)}건 배치")
        print(f"  수량 보정 (110→100 비율): {sum(1 for i in batch_info.values() if i['old_planned'] != i['new_planned'])}건")
        print(f"  원료투입 재계산: {input_updated}건")
        print(f"  일일 수불부 업데이트: {ledger_updated}건")
        print(f"  running_stock 재계산: {stock_updated}건")
        print(f"  월별 수불부 재집계: {monthly_updated}건")
        print(f"  찹쌀떡(83) 비활성화: ✓")
        print("=" * 60)

    except Exception as e:
        conn.rollback()
        print(f"\n❌ 오류, 롤백: {e}")
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == '__main__':
    main()
