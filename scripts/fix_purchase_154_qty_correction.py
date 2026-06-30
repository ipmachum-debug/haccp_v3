#!/usr/bin/env python3
"""
4/17 멥쌀 매입(accounting_purchases id=154) 수량 정정
=============================================================

[문제]
화면 표시 (매입 거래 내역):
  2026-04-17 | 인천광역시청 | 멥쌀(국내산) | 100.000 개 × 20,400 = 2,040,000원
실제 입고된 LOT 822(MAT-20260429-326)는 1,000kg 입니다.
1개 = 20kg 환산 시 50개가 정상이며, 합계는 1,020,000원이어야 합니다.

비교: 4/28 매입(id=162)도 동일하게 LOT 830(1,000kg)에 대해
50개 × 20,400 = 1,020,000원으로 정상 처리되어 있습니다.

[정정 내용]
accounting_purchases id=154:
  quantity      : 100.000 → 50.000
  total_amount  : 2,040,000 → 1,020,000
  unit_price    : 20,400.00 (유지)
  status        : approved (유지)

[안전장치]
- 백업 테이블 자동 생성
- 단일 트랜잭션 + 사후 검증
- 사용 예: --commit 없으면 DRY-RUN

[검증]
- 사전: quantity=100, total=2,040,000
- 사후: quantity=50,  total=1,020,000
- LOT 822 quantity(=1,000kg)와 일관성 회복
"""
import pymysql
from urllib.parse import urlparse
from decimal import Decimal
from datetime import datetime
import os
import argparse


DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "mysql://root:G0ld3n%21T1004%23Sec@127.0.0.1:3306/haccp_tenant_db",
)
TENANT_ID = 2
PURCHASE_ID = 154
EXPECTED_OLD_QTY = Decimal("100.000")
EXPECTED_OLD_TOTAL = Decimal("2040000.00")
NEW_QTY = Decimal("50.000")
NEW_TOTAL = Decimal("1020000.00")
UNIT_PRICE = Decimal("20400.00")


def connect_db():
    u = urlparse(DATABASE_URL)
    password = (u.password or "").replace("%21", "!").replace("%23", "#")
    return pymysql.connect(
        host=u.hostname, port=u.port or 3306,
        user=u.username, password=password,
        database=u.path.lstrip("/"),
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=False,
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--commit", action="store_true",
                    help="실제 적용. 미지정 시 DRY-RUN.")
    args = ap.parse_args()

    print("=" * 70)
    print(f"매입 154 (4/17) 수량 정정 ({'COMMIT' if args.commit else 'DRY-RUN'})")
    print("=" * 70)

    conn = connect_db()
    try:
        with conn.cursor() as cur:
            # 1) 사전 검증
            cur.execute("""SELECT id, transaction_date, partner_id, item_name,
                                  quantity, unit, unit_price, total_amount, status
                           FROM accounting_purchases
                           WHERE id=%s AND tenant_id=%s""",
                        (PURCHASE_ID, TENANT_ID))
            row = cur.fetchone()
            if not row:
                raise RuntimeError(f"purchase id={PURCHASE_ID} 없음")
            print(f"\n[현재] {dict(row)}")

            if Decimal(str(row["quantity"])) != EXPECTED_OLD_QTY:
                raise RuntimeError(
                    f"예상 수량 {EXPECTED_OLD_QTY}, 실제 {row['quantity']} — 중단"
                )
            if Decimal(str(row["total_amount"])) != EXPECTED_OLD_TOTAL:
                raise RuntimeError(
                    f"예상 합계 {EXPECTED_OLD_TOTAL}, 실제 {row['total_amount']} — 중단"
                )

            # 2) 같은 패턴(50개) 정상 매입 비교 표시
            cur.execute("""SELECT id, transaction_date, quantity, unit_price, total_amount
                           FROM accounting_purchases
                           WHERE id=162 AND tenant_id=%s""", (TENANT_ID,))
            print(f"\n[참고: 동일 패턴 정상 매입 162] {dict(cur.fetchone())}")

            print(f"\n[정정] quantity {EXPECTED_OLD_QTY} → {NEW_QTY}")
            print(f"       total_amount {EXPECTED_OLD_TOTAL} → {NEW_TOTAL}")
            print(f"       unit_price {UNIT_PRICE} (유지)")

            if not args.commit:
                print("\n[DRY-RUN] 변경 없음. --commit 으로 적용.")
                return

            # 3) 백업
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            bk = f"backup_accounting_purchases_154_{ts}"
            cur.execute(f"CREATE TABLE {bk} AS SELECT * FROM accounting_purchases "
                        f"WHERE id=%s", (PURCHASE_ID,))
            print(f"\n[백업] {bk}")

            # 4) 정정
            cur.execute("""UPDATE accounting_purchases
                           SET quantity=%s, total_amount=%s, updated_at=NOW()
                           WHERE id=%s AND tenant_id=%s""",
                        (NEW_QTY, NEW_TOTAL, PURCHASE_ID, TENANT_ID))
            print(f"[UPDATE] accounting_purchases 154: {cur.rowcount}행")

            # 5) 사후 검증
            cur.execute("""SELECT quantity, total_amount, unit_price, status
                           FROM accounting_purchases WHERE id=%s""", (PURCHASE_ID,))
            after = cur.fetchone()
            print(f"\n[사후] {dict(after)}")
            if (Decimal(str(after["quantity"])) != NEW_QTY
                    or Decimal(str(after["total_amount"])) != NEW_TOTAL):
                raise RuntimeError("검증 실패")

            # 6) LOT 822 일관성 표시
            cur.execute("""SELECT lot_number, quantity FROM h_inventory_lots
                           WHERE id=822""")
            lot = cur.fetchone()
            print(f"\n[일관성 확인] LOT 822 {lot['lot_number']}: "
                  f"{lot['quantity']}kg = {float(lot['quantity']) / 20:.0f}개 "
                  f"vs 매입 {NEW_QTY}개 → {'✓' if int(float(lot['quantity']) / 20) == int(NEW_QTY) else '✗'}")

            conn.commit()
            print(f"\n[OK] 커밋 완료. 백업: {bk}")
    except Exception as e:
        conn.rollback()
        print(f"\n[ERROR] 롤백: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
