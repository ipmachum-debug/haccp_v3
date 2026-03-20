#!/usr/bin/env python3
"""
배치 수량 보정 스크립트 (과거 110kg → 현재 100kg BOM 기준 맞춤)

과거 백업 데이터에서 배치 용량을 110kg으로 잡았으나 실제 BOM은 100kg.
110 배수 → 100 배수로 변환 (비율: 10/11)

수정 대상:
1. h_batches: planned_quantity, actual_quantity
2. h_batch_inputs: planned_quantity, actual_quantity (BOM 배합비 기준 재계산)
3. material_ledger_daily: usage_qty 재계산
4. material_ledger_monthly: 월별 재집계

실행: python3 scripts/fix-batch-qty-bom.py [--dry-run]
"""

import pymysql
import sys
from decimal import Decimal, ROUND_HALF_UP
from collections import defaultdict

DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': 'G0ld3n!T1004#Sec',
    'database': 'haccp_tenant_db',
    'charset': 'utf8mb4',
}

TENANT_ID = 2
DRY_RUN = '--dry-run' in sys.argv

def get_connection():
    return pymysql.connect(**DB_CONFIG, autocommit=False)


def main():
    conn = get_connection()
    cur = conn.cursor(pymysql.cursors.DictCursor)

    print("=" * 60)
    print("  배치 수량 보정: 110kg → 100kg BOM 기준")
    if DRY_RUN:
        print("  *** DRY RUN 모드 - 실제 변경 없음 ***")
    print("=" * 60)

    try:
        # ── Step 1: 110 배수 배치 식별 ──
        print("\n=== 1. 보정 대상 배치 식별 ===")
        cur.execute("""
            SELECT b.id, b.batch_code, b.product_id, b.planned_quantity, b.actual_quantity,
                   b.planned_date, p.product_name, v.batch_target_kg, v.id as version_id
            FROM h_batches b
            JOIN h_products_v2 p ON p.id = b.product_id
            JOIN h_mf_reports r ON r.product_id = b.product_id AND r.tenant_id = b.tenant_id
            JOIN h_mf_report_versions v ON v.mf_report_id = r.id AND v.approval_status = 'APPROVED'
            WHERE b.tenant_id = %s AND b.mode = 'auto'
              AND v.batch_target_kg = 100
              AND CAST(b.planned_quantity AS UNSIGNED) %% 110 = 0
              AND b.planned_quantity > 0
            ORDER BY b.planned_date, b.id
        """, (TENANT_ID,))
        target_batches = cur.fetchall()
        print(f"  대상 배치: {len(target_batches)}건")

        if not target_batches:
            print("  보정 대상 없음. 종료.")
            return

        # 배치별 변환 비율: 10/11
        ratio = Decimal('10') / Decimal('11')

        # ── Step 2: h_batches 수량 보정 ──
        print("\n=== 2. h_batches 수량 보정 ===")
        batch_qty_map = {}  # batch_id → (old_qty, new_qty)
        for b in target_batches:
            old_planned = Decimal(str(b['planned_quantity']))
            old_actual = Decimal(str(b['actual_quantity'])) if b['actual_quantity'] else old_planned
            new_planned = (old_planned * ratio).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            new_actual = (old_actual * ratio).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            batch_qty_map[b['id']] = {
                'old_planned': old_planned,
                'new_planned': new_planned,
                'old_actual': old_actual,
                'new_actual': new_actual,
                'product_name': b['product_name'],
                'batch_code': b['batch_code'],
                'product_id': b['product_id'],
                'version_id': b['version_id'],
                'batch_target_kg': Decimal(str(b['batch_target_kg'])),
                'planned_date': str(b['planned_date'])[:10],
            }
            print(f"  {b['batch_code']} {b['product_name']}: {old_planned} → {new_planned} kg")

            if not DRY_RUN:
                cur.execute("""
                    UPDATE h_batches
                    SET planned_quantity = %s, actual_quantity = %s
                    WHERE id = %s AND tenant_id = %s
                """, (str(new_planned), str(new_actual), b['id'], TENANT_ID))

        print(f"  → {len(batch_qty_map)}건 배치 수량 업데이트")

        # ── Step 3: h_batch_inputs 원료투입량 재계산 ──
        print("\n=== 3. h_batch_inputs 원료투입량 재계산 ===")
        input_updated = 0
        for batch_id, info in batch_qty_map.items():
            # BOM 배합비 조회
            cur.execute("""
                SELECT i.material_id, i.quantity, i.corrected_quantity
                FROM h_mf_ingredients i
                WHERE i.mf_report_version_id = %s AND i.material_id IS NOT NULL
            """, (info['version_id'],))
            bom_ingredients = {}
            for row in cur.fetchall():
                qty_str = row['corrected_quantity'] or row['quantity'] or '0'
                bom_ingredients[row['material_id']] = Decimal(str(qty_str))

            if not bom_ingredients:
                continue

            # 배치수 = 생산량 / BOM 1배치량
            batch_count = info['new_planned'] / info['batch_target_kg']

            # 기존 batch_inputs 조회
            cur.execute("""
                SELECT id, material_id, planned_quantity, actual_quantity
                FROM h_batch_inputs
                WHERE batch_id = %s
            """, (batch_id,))
            inputs = cur.fetchall()

            for inp in inputs:
                mat_id = inp['material_id']
                qty_per_batch = bom_ingredients.get(mat_id)
                if qty_per_batch:
                    new_qty = (qty_per_batch * batch_count).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                else:
                    # BOM에 없는 원료 → 비율 적용
                    old_qty = Decimal(str(inp['planned_quantity'])) if inp['planned_quantity'] else Decimal('0')
                    new_qty = (old_qty * ratio).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

                if not DRY_RUN:
                    cur.execute("""
                        UPDATE h_batch_inputs
                        SET planned_quantity = %s, actual_quantity = %s
                        WHERE id = %s
                    """, (str(new_qty), str(new_qty), inp['id']))
                input_updated += 1

        print(f"  → {input_updated}건 원료투입 업데이트")

        # ── Step 4: material_ledger_daily usage_qty 재계산 ──
        print("\n=== 4. material_ledger_daily 사용량 재계산 ===")
        # 영향 받는 날짜 목록
        affected_dates = set()
        for info in batch_qty_map.values():
            affected_dates.add(info['planned_date'])

        ledger_updated = 0
        for dt in sorted(affected_dates):
            # 해당 날짜의 모든 배치에서 원료 사용량 합계
            cur.execute("""
                SELECT bi.material_id, SUM(bi.actual_quantity) as total_usage
                FROM h_batch_inputs bi
                JOIN h_batches b ON b.id = bi.batch_id AND b.tenant_id = %s
                WHERE DATE(b.planned_date) = %s AND b.status = 'completed'
                GROUP BY bi.material_id
            """, (TENANT_ID, dt))
            daily_usage = {row['material_id']: Decimal(str(row['total_usage'])) if row['total_usage'] else Decimal('0')
                           for row in cur.fetchall()}

            for mat_id, usage in daily_usage.items():
                if not DRY_RUN:
                    cur.execute("""
                        UPDATE material_ledger_daily
                        SET usage_qty = %s
                        WHERE tenant_id = %s AND ledger_date = %s AND material_id = %s
                    """, (str(usage), TENANT_ID, dt, mat_id))
                    if cur.rowcount > 0:
                        ledger_updated += cur.rowcount

        print(f"  → 영향 날짜: {len(affected_dates)}일, ledger 업데이트: {ledger_updated}건")

        # ── Step 5: running_stock 재계산 ──
        print("\n=== 5. running_stock 재계산 ===")
        cur.execute("""
            SELECT DISTINCT material_id FROM material_ledger_daily
            WHERE tenant_id = %s
            ORDER BY material_id
        """, (TENANT_ID,))
        all_materials = [r['material_id'] for r in cur.fetchall()]

        stock_updated = 0
        for mat_id in all_materials:
            cur.execute("""
                SELECT id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock
                FROM material_ledger_daily
                WHERE tenant_id = %s AND material_id = %s
                ORDER BY ledger_date
            """, (TENANT_ID, mat_id))
            rows = cur.fetchall()
            if not rows:
                continue

            # 첫 번째 레코드의 running_stock에서 첫날 입출고를 뺀 값이 초기재고
            first = rows[0]
            recv0 = Decimal(str(first['receiving_qty'])) if first['receiving_qty'] else Decimal('0')
            usage0 = Decimal(str(first['usage_qty'])) if first['usage_qty'] else Decimal('0')
            adj0 = Decimal(str(first['adjustment_qty'])) if first['adjustment_qty'] else Decimal('0')
            # running_stock = prev + recv - usage + adj → prev = running - recv + usage - adj
            running_old = Decimal(str(first['running_stock'])) if first['running_stock'] else Decimal('0')
            initial_stock = running_old - recv0 + usage0 - adj0

            running = initial_stock
            for row in rows:
                recv = Decimal(str(row['receiving_qty'])) if row['receiving_qty'] else Decimal('0')
                usage = Decimal(str(row['usage_qty'])) if row['usage_qty'] else Decimal('0')
                adj = Decimal(str(row['adjustment_qty'])) if row['adjustment_qty'] else Decimal('0')
                running = running + recv - usage + adj
                new_stock = running.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

                if not DRY_RUN:
                    cur.execute("""
                        UPDATE material_ledger_daily
                        SET running_stock = %s
                        WHERE id = %s
                    """, (str(new_stock), row['id']))
                stock_updated += 1

        print(f"  → {stock_updated}건 running_stock 재계산")

        # ── Step 6: material_ledger_monthly 재집계 ──
        print("\n=== 6. material_ledger_monthly 재집계 ===")
        affected_months = set()
        for dt in affected_dates:
            affected_months.add(dt[:7])  # YYYY-MM

        monthly_updated = 0
        for ym in sorted(affected_months):
            year, month = map(int, ym.split('-'))
            import calendar
            last_day = calendar.monthrange(year, month)[1]
            start = f"{ym}-01"
            end = f"{ym}-{last_day:02d}"

            # 이전 달 마감 재고
            prev_ym = f"{year}-{month - 1:02d}" if month > 1 else f"{year - 1}-12"

            for mat_id in all_materials:
                # 전월 말 재고
                cur.execute("""
                    SELECT end_stock FROM material_ledger_monthly
                    WHERE tenant_id = %s AND material_id = %s AND `year_month` = %s
                """, (TENANT_ID, mat_id, prev_ym))
                prev_row = cur.fetchone()
                prev_stock = Decimal(str(prev_row['end_stock'])) if prev_row and prev_row['end_stock'] else Decimal('0')

                # 당월 입고/사용 합계
                cur.execute("""
                    SELECT COALESCE(SUM(receiving_qty), 0) as rt,
                           COALESCE(SUM(usage_qty), 0) as ut
                    FROM material_ledger_daily
                    WHERE tenant_id = %s AND material_id = %s
                      AND ledger_date >= %s AND ledger_date <= %s
                """, (TENANT_ID, mat_id, start, end))
                agg = cur.fetchone()
                rt = Decimal(str(agg['rt'])) if agg['rt'] else Decimal('0')
                ut = Decimal(str(agg['ut'])) if agg['ut'] else Decimal('0')
                end_stock = max(prev_stock + rt - ut, Decimal('0'))

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

        # ── 커밋 ──
        if not DRY_RUN:
            conn.commit()
            print("\n✅ 모든 변경사항 커밋 완료!")
        else:
            conn.rollback()
            print("\n⚠️ DRY RUN - 변경사항 롤백됨")

        # ── 결과 요약 ──
        print("\n" + "=" * 60)
        print("  보정 결과 요약")
        print("=" * 60)
        print(f"  배치 수량 보정: {len(batch_qty_map)}건")
        print(f"  원료투입 재계산: {input_updated}건")
        print(f"  일일 수불부 업데이트: {ledger_updated}건")
        print(f"  running_stock 재계산: {stock_updated}건")
        print(f"  월별 수불부 재집계: {monthly_updated}건")
        print("=" * 60)

    except Exception as e:
        conn.rollback()
        print(f"\n❌ 오류 발생, 롤백: {e}")
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == '__main__':
    main()
