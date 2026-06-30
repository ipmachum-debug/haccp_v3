#!/usr/bin/env python3
"""
3/26 멥쌀 매입(accounting_purchases) 신규 등록 + LOT 655 receipt 트랜잭션 재연결
=============================================================================

[배경]
- 2026-03-26 매입(accounting_purchases id=125)은 취소(cancelled) 상태이며,
  이는 4월 초 삭제된 LOT 750(4,000kg) 잔여물입니다.
- 실제 3/26 입고된 LOT 655(MAT-20260331-311, 2,000kg)에 대응되는 정상 매입
  기록이 없어, h_inventory_transactions id=9931 (receipt)의 reference_id가
  여전히 취소된 매입 125를 가리키는 단절(dangling) 상태였습니다.
- 매입 거래 내역 화면의 6건 멥쌀 매입 중 3/26 한 건만 취소로 표시되어
  사용자가 정합성 부족을 지적했습니다.

[정정 정책]
- purchase 125(취소된 행)는 그대로 둠 — LOT 750 취소 흔적 보존
- 3/26 정상 매입을 새로 등록(id=275 예상):
    transaction_date=2026-03-26
    partner_id=54 (인천광역시청, SUP-015)
    item_name='멥쌀(국내산)', material_id=615
    quantity=100.000 (1개=20kg → 2,000kg = LOT 655 입고량)
    unit='개', unit_price=20400, total_amount=2,040,000, tax_amount=0, tax_rate=10
    evidence_type='none', source_type='manual', status='approved'
    created_by=8, tenant_id=2
  (4/14 매입 id=142과 동일한 패턴)
- h_inventory_transactions id=9931.reference_id: 125 → 새 매입 id
- tx 9931.notes에 재연결 이력 1줄 append

[안전장치]
- DRY-RUN 기본, --commit 시 적용
- 백업 테이블 2개 자동 생성:
    backup_accounting_purchases_3_26_add_<ts>  (참고용 — 변경 전 6개 멥쌀 매입 스냅샷)
    backup_tx_9931_<ts>                        (tx 9931 변경 전 스냅샷)
- 단일 트랜잭션 + 사후 검증

[기대 결과]
- 6단의 다른 5건과 동일한 패턴(100개 × 20,400원, 인천광역시청, approved)으로
  3/26 신규 등록 → 총 6건 정상 매입 + 1건 취소(LOT 750 흔적) 표시.
- LOT 655 receipt 트랜잭션이 정상 매입을 가리키므로 회계-재고 정합성 회복.
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

# 신규 매입 사양 (4/14 purchase 142 패턴과 동일)
NEW_TX_DATE = "2026-03-26"
PARTNER_ID = 54  # 인천광역시청
ITEM_NAME = "멥쌀(국내산)"
MATERIAL_ID = 615
NEW_QTY = Decimal("100.000")
UNIT = "개"
UNIT_PRICE = Decimal("20400.00")
NEW_TOTAL = Decimal("2040000.00")
TAX_AMOUNT = Decimal("0.00")
TAX_RATE = Decimal("10.00")
EVIDENCE_TYPE = "none"
SOURCE_TYPE = "manual"
STATUS = "approved"
CREATED_BY = 8

# 재연결할 receipt 트랜잭션 (LOT 655)
TX_ID = 9931
EXPECTED_OLD_REF_ID = 125  # 취소된 매입
EXPECTED_LOT_ID = 655


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

    print("=" * 72)
    print(f"3/26 정상 매입 신규 등록 + LOT 655 재연결 "
          f"({'COMMIT' if args.commit else 'DRY-RUN'})")
    print("=" * 72)

    conn = connect_db()
    try:
        with conn.cursor() as cur:
            # ─────────────────────────────────────────────────────────
            # 1) 사전 검증
            # ─────────────────────────────────────────────────────────
            # 1-1) partner 54 확인
            cur.execute("""SELECT id, company_name, supplier_code, partner_type
                           FROM partners
                           WHERE id=%s AND tenant_id=%s""",
                        (PARTNER_ID, TENANT_ID))
            partner = cur.fetchone()
            if not partner:
                raise RuntimeError(f"partner id={PARTNER_ID} 없음")
            print(f"\n[Partner] {dict(partner)}")
            if "인천" not in (partner["company_name"] or ""):
                raise RuntimeError(
                    f"company_name이 인천광역시청이 아님: {partner['company_name']}"
                )

            # 1-2) 취소된 매입 125 상태 확인 (그대로 두는 행)
            cur.execute("""SELECT id, transaction_date, quantity, total_amount, status
                           FROM accounting_purchases
                           WHERE id=125 AND tenant_id=%s""", (TENANT_ID,))
            p125 = cur.fetchone()
            print(f"\n[기존 취소 매입 125] {dict(p125) if p125 else None}")
            if not p125 or p125["status"] != "cancelled":
                raise RuntimeError("purchase 125 상태가 cancelled가 아님 — 중단")

            # 1-3) 템플릿 매입 142 확인 (참고 표시)
            cur.execute("""SELECT id, transaction_date, partner_id, item_name,
                                  material_id, quantity, unit, unit_price,
                                  total_amount, tax_amount, tax_rate,
                                  evidence_type, source_type, status,
                                  created_by, tenant_id
                           FROM accounting_purchases
                           WHERE id=142 AND tenant_id=%s""", (TENANT_ID,))
            p142 = cur.fetchone()
            print(f"\n[템플릿: 4/14 매입 142] {dict(p142)}")

            # 1-4) tx 9931 현재 상태 확인
            cur.execute("""SELECT id, lot_id, transaction_type, quantity,
                                  transaction_date, reference_type, reference_id,
                                  notes
                           FROM h_inventory_transactions
                           WHERE id=%s AND tenant_id=%s""",
                        (TX_ID, TENANT_ID))
            tx = cur.fetchone()
            if not tx:
                raise RuntimeError(f"tx id={TX_ID} 없음")
            print(f"\n[현재 tx 9931] lot_id={tx['lot_id']}, "
                  f"type={tx['transaction_type']}, qty={tx['quantity']}, "
                  f"date={tx['transaction_date']}, "
                  f"reference={tx['reference_type']}#{tx['reference_id']}")
            print(f"  notes: {tx['notes']}")

            if tx["lot_id"] != EXPECTED_LOT_ID:
                raise RuntimeError(
                    f"예상 lot_id={EXPECTED_LOT_ID}, 실제={tx['lot_id']}"
                )
            if tx["reference_id"] != EXPECTED_OLD_REF_ID:
                raise RuntimeError(
                    f"예상 reference_id={EXPECTED_OLD_REF_ID}, "
                    f"실제={tx['reference_id']} — 이미 수정된 듯, 중단"
                )

            # 1-5) LOT 655 정보 표시
            cur.execute("""SELECT id, lot_number, receipt_date, supplier_name,
                                  quantity, current_quantity, status
                           FROM h_inventory_lots
                           WHERE id=%s""", (EXPECTED_LOT_ID,))
            lot = cur.fetchone()
            print(f"\n[LOT 655] {dict(lot)}")

            # 1-6) MAX id 확인 (신규 매입 id 예상치)
            cur.execute("SELECT COALESCE(MAX(id), 0) AS mx "
                        "FROM accounting_purchases")
            max_id = cur.fetchone()["mx"]
            print(f"\n[MAX(accounting_purchases.id)] {max_id} "
                  f"→ 신규 매입 예상 id={max_id + 1}")

            # 1-7) 6단 멥쌀 매입 현재 상태 일람
            cur.execute("""SELECT id, transaction_date, quantity, unit_price,
                                  total_amount, status
                           FROM accounting_purchases
                           WHERE material_id=%s AND tenant_id=%s
                             AND item_name=%s
                           ORDER BY transaction_date, id""",
                        (MATERIAL_ID, TENANT_ID, ITEM_NAME))
            before_rows = cur.fetchall()
            print(f"\n[변경 전 멥쌀 매입 일람] {len(before_rows)}건")
            for r in before_rows:
                print(f"  id={r['id']:>3}  {r['transaction_date']}  "
                      f"{r['quantity']:>7} {UNIT}  "
                      f"× {r['unit_price']:>10}  "
                      f"= {r['total_amount']:>12}  [{r['status']}]")

            print("\n" + "─" * 72)
            print("[신규 등록 사양]")
            print(f"  transaction_date : {NEW_TX_DATE}")
            print(f"  partner_id       : {PARTNER_ID} (인천광역시청)")
            print(f"  item_name        : {ITEM_NAME}")
            print(f"  material_id      : {MATERIAL_ID}")
            print(f"  quantity         : {NEW_QTY} {UNIT}  (= 2,000kg, LOT 655 대응)")
            print(f"  unit_price       : {UNIT_PRICE}")
            print(f"  total_amount     : {NEW_TOTAL}")
            print(f"  tax_amount/rate  : {TAX_AMOUNT} / {TAX_RATE}%")
            print(f"  evidence_type    : {EVIDENCE_TYPE}")
            print(f"  source_type      : {SOURCE_TYPE}")
            print(f"  status           : {STATUS}")
            print(f"  created_by       : {CREATED_BY}")
            print(f"  tenant_id        : {TENANT_ID}")
            print(f"\n[tx 9931 재연결] reference_id: "
                  f"{EXPECTED_OLD_REF_ID} → <new_purchase_id>")
            print("─" * 72)

            if not args.commit:
                print("\n[DRY-RUN] 변경 없음. --commit 으로 적용.")
                return

            # ─────────────────────────────────────────────────────────
            # 2) 백업
            # ─────────────────────────────────────────────────────────
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            bk1 = f"backup_accounting_purchases_3_26_add_{ts}"
            bk2 = f"backup_tx_9931_{ts}"
            # 변경 전 멥쌀 매입 6건 스냅샷 (참고용)
            cur.execute(
                f"CREATE TABLE {bk1} AS "
                f"SELECT * FROM accounting_purchases "
                f"WHERE material_id=%s AND tenant_id=%s AND item_name=%s",
                (MATERIAL_ID, TENANT_ID, ITEM_NAME),
            )
            # tx 9931 변경 전 스냅샷
            cur.execute(
                f"CREATE TABLE {bk2} AS "
                f"SELECT * FROM h_inventory_transactions WHERE id=%s",
                (TX_ID,),
            )
            print(f"\n[백업] {bk1}, {bk2}")

            # ─────────────────────────────────────────────────────────
            # 3) accounting_purchases INSERT
            # ─────────────────────────────────────────────────────────
            cur.execute(
                """INSERT INTO accounting_purchases
                   (transaction_date, partner_id, item_name, material_id,
                    quantity, unit, unit_price, total_amount,
                    tax_amount, tax_rate,
                    evidence_type, source_type, status,
                    created_by, tenant_id,
                    created_at, updated_at)
                   VALUES (%s, %s, %s, %s,
                           %s, %s, %s, %s,
                           %s, %s,
                           %s, %s, %s,
                           %s, %s,
                           NOW(), NOW())""",
                (NEW_TX_DATE, PARTNER_ID, ITEM_NAME, MATERIAL_ID,
                 NEW_QTY, UNIT, UNIT_PRICE, NEW_TOTAL,
                 TAX_AMOUNT, TAX_RATE,
                 EVIDENCE_TYPE, SOURCE_TYPE, STATUS,
                 CREATED_BY, TENANT_ID),
            )
            new_id = cur.lastrowid
            print(f"\n[INSERT] accounting_purchases 신규 id={new_id}")

            # ─────────────────────────────────────────────────────────
            # 4) tx 9931 재연결
            # ─────────────────────────────────────────────────────────
            append_note = (
                f"\n[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')} 재연결] "
                f"reference_id {EXPECTED_OLD_REF_ID}(cancelled) → {new_id}(approved). "
                f"LOT 655(MAT-20260331-311) ↔ 신규 매입 {new_id}."
            )
            cur.execute(
                """UPDATE h_inventory_transactions
                   SET reference_id=%s,
                       notes=CONCAT(COALESCE(notes,''), %s),
                       updated_at=NOW()
                   WHERE id=%s AND tenant_id=%s""",
                (new_id, append_note, TX_ID, TENANT_ID),
            )
            print(f"[UPDATE] tx 9931 reference_id: "
                  f"{EXPECTED_OLD_REF_ID} → {new_id} ({cur.rowcount}행)")

            # ─────────────────────────────────────────────────────────
            # 5) 사후 검증
            # ─────────────────────────────────────────────────────────
            cur.execute(
                """SELECT id, transaction_date, partner_id, item_name,
                          material_id, quantity, unit, unit_price,
                          total_amount, tax_amount, tax_rate,
                          evidence_type, source_type, status,
                          created_by, tenant_id
                   FROM accounting_purchases WHERE id=%s""",
                (new_id,),
            )
            new_row = cur.fetchone()
            print(f"\n[사후: 신규 매입] {dict(new_row)}")
            assert Decimal(str(new_row["quantity"])) == NEW_QTY
            assert Decimal(str(new_row["total_amount"])) == NEW_TOTAL
            assert new_row["status"] == STATUS
            assert new_row["partner_id"] == PARTNER_ID
            assert new_row["material_id"] == MATERIAL_ID

            cur.execute(
                """SELECT id, reference_type, reference_id, notes
                   FROM h_inventory_transactions WHERE id=%s""",
                (TX_ID,),
            )
            tx_after = cur.fetchone()
            print(f"\n[사후: tx 9931] reference_type={tx_after['reference_type']}, "
                  f"reference_id={tx_after['reference_id']}")
            assert tx_after["reference_id"] == new_id

            # 5-1) 6단(이제 7건: 1 취소 + 6 정상) 일람
            cur.execute(
                """SELECT id, transaction_date, quantity, unit_price,
                          total_amount, status
                   FROM accounting_purchases
                   WHERE material_id=%s AND tenant_id=%s AND item_name=%s
                   ORDER BY transaction_date, id""",
                (MATERIAL_ID, TENANT_ID, ITEM_NAME),
            )
            after_rows = cur.fetchall()
            approved = [r for r in after_rows if r["status"] == "approved"]
            cancelled = [r for r in after_rows if r["status"] == "cancelled"]
            print(f"\n[변경 후 멥쌀 매입 일람] {len(after_rows)}건 "
                  f"(approved={len(approved)}, cancelled={len(cancelled)})")
            for r in after_rows:
                marker = " ←NEW" if r["id"] == new_id else ""
                print(f"  id={r['id']:>3}  {r['transaction_date']}  "
                      f"{r['quantity']:>7} {UNIT}  "
                      f"× {r['unit_price']:>10}  "
                      f"= {r['total_amount']:>12}  [{r['status']}]{marker}")

            if len(approved) != 6:
                raise RuntimeError(
                    f"approved 건수 6 기대, 실제 {len(approved)} — 중단"
                )

            conn.commit()
            print(f"\n[OK] 커밋 완료.")
            print(f"     백업: {bk1}, {bk2}")
            print(f"     신규 매입 id: {new_id}")
    except Exception as e:
        conn.rollback()
        print(f"\n[ERROR] 롤백: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
