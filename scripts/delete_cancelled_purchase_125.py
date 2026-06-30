#!/usr/bin/env python3
"""
취소된 멥쌀 매입(accounting_purchases id=125) 삭제
================================================================

[배경]
- purchase 125는 LOT 750(실제 미입고 중복 등록 → 삭제됨)의 잔여 흔적으로
  cancelled 상태로 남아 있었습니다.
- 매입 거래 내역 화면에 100개·200개가 같은 날(3/26)에 혼재 표시되어 사용자가
  혼란을 호소했고, "취소건 삭제, 100개만 남기자"고 결정.
- 이전 단계(add_purchase_2026_03_26.py)에서 LOT 655의 receipt tx 9931은
  이미 신규 매입 275로 재연결되었으므로, 125는 어느 곳에서도 참조되지 않는
  고립된 행입니다.

[참조 사전 점검 결과 (DB 직접 확인)]
- accounting_purchase_items(purchase_id=125): 0건
- h_inventory_transactions(reference_type='accounting_purchase', reference_id=125): 0건
- h_inventory_transactions(source_id=125): 0건
- accounting_transactions(reference_id=125): 0건
- accounting_documents/workflow: 무관

[정정 내용]
- DELETE FROM accounting_purchases WHERE id=125 AND tenant_id=2 AND status='cancelled'

[안전장치]
- DRY-RUN 기본, --commit 시 적용
- 백업 테이블 자동 생성: backup_purchase_125_delete_<ts>
- 삭제 전 참조 재검증 (0건 아닐 시 중단)
- 단일 트랜잭션 + 사후 검증
- 삭제 후 멥쌀 매입은 정확히 6건(모두 approved) 남아야 함

[기대 결과]
- 매입 거래 내역 화면에서 멥쌀 = 6건, 모두 approved/100개·50개·100개 패턴
  3/26 → 1건(275, 100개)만 표시되어 혼재 해소.
"""
import pymysql
from urllib.parse import urlparse
from datetime import datetime
import os
import argparse


DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "mysql://root:G0ld3n%21T1004%23Sec@127.0.0.1:3306/haccp_tenant_db",
)
TENANT_ID = 2
PURCHASE_ID = 125
MATERIAL_ID = 615
ITEM_NAME = "멥쌀(국내산)"


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
    print(f"취소된 매입 125(3/26) 삭제 "
          f"({'COMMIT' if args.commit else 'DRY-RUN'})")
    print("=" * 72)

    conn = connect_db()
    try:
        with conn.cursor() as cur:
            # ─────────────────────────────────────────────────────────
            # 1) 대상 확인
            # ─────────────────────────────────────────────────────────
            cur.execute(
                """SELECT id, transaction_date, partner_id, item_name,
                          quantity, unit_price, total_amount, status,
                          notes, canceled_at, canceled_by, tenant_id
                   FROM accounting_purchases
                   WHERE id=%s AND tenant_id=%s""",
                (PURCHASE_ID, TENANT_ID),
            )
            row = cur.fetchone()
            if not row:
                raise RuntimeError(f"purchase id={PURCHASE_ID} 없음")
            print(f"\n[대상] {dict(row)}")
            if row["status"] != "cancelled":
                raise RuntimeError(
                    f"status가 cancelled가 아님: {row['status']} — 중단"
                )

            # ─────────────────────────────────────────────────────────
            # 2) 참조 무결성 재검증 (DRY-RUN/COMMIT 공통)
            # ─────────────────────────────────────────────────────────
            ref_violations = []

            cur.execute(
                "SELECT COUNT(*) AS c FROM accounting_purchase_items "
                "WHERE purchase_id=%s", (PURCHASE_ID,))
            n = cur.fetchone()["c"]
            print(f"\n[참조] accounting_purchase_items: {n}건")
            if n > 0:
                ref_violations.append(f"accounting_purchase_items={n}")

            cur.execute(
                """SELECT COUNT(*) AS c FROM h_inventory_transactions
                   WHERE reference_type='accounting_purchase'
                     AND reference_id=%s""", (PURCHASE_ID,))
            n = cur.fetchone()["c"]
            print(f"[참조] h_inventory_transactions(reference_id): {n}건")
            if n > 0:
                ref_violations.append(
                    f"h_inventory_transactions.reference_id={n}")

            cur.execute(
                """SELECT COUNT(*) AS c FROM h_inventory_transactions
                   WHERE source_id=%s""", (PURCHASE_ID,))
            n = cur.fetchone()["c"]
            print(f"[참조] h_inventory_transactions(source_id): {n}건")
            if n > 0:
                ref_violations.append(
                    f"h_inventory_transactions.source_id={n}")

            cur.execute(
                """SELECT COUNT(*) AS c FROM accounting_transactions
                   WHERE reference_id=%s""", (PURCHASE_ID,))
            n = cur.fetchone()["c"]
            print(f"[참조] accounting_transactions(reference_id): {n}건")
            if n > 0:
                ref_violations.append(
                    f"accounting_transactions.reference_id={n}")

            if ref_violations:
                raise RuntimeError(
                    "다른 곳에서 참조 중 — 삭제 중단: "
                    + ", ".join(ref_violations)
                )
            print("\n[OK] 외부 참조 없음 — 삭제 가능")

            # ─────────────────────────────────────────────────────────
            # 3) 변경 전 멥쌀 매입 일람
            # ─────────────────────────────────────────────────────────
            cur.execute(
                """SELECT id, transaction_date, quantity, unit_price,
                          total_amount, status
                   FROM accounting_purchases
                   WHERE material_id=%s AND tenant_id=%s AND item_name=%s
                   ORDER BY transaction_date, id""",
                (MATERIAL_ID, TENANT_ID, ITEM_NAME),
            )
            before = cur.fetchall()
            print(f"\n[변경 전 멥쌀 매입] {len(before)}건")
            for r in before:
                print(f"  id={r['id']:>3}  {r['transaction_date']}  "
                      f"{r['quantity']:>7}개  × {r['unit_price']:>10}  "
                      f"= {r['total_amount']:>12}  [{r['status']}]")

            if not args.commit:
                print("\n[DRY-RUN] 변경 없음. --commit 으로 적용.")
                return

            # ─────────────────────────────────────────────────────────
            # 4) 백업
            # ─────────────────────────────────────────────────────────
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            bk = f"backup_purchase_125_delete_{ts}"
            cur.execute(
                f"CREATE TABLE {bk} AS "
                f"SELECT * FROM accounting_purchases WHERE id=%s",
                (PURCHASE_ID,),
            )
            print(f"\n[백업] {bk}")

            # ─────────────────────────────────────────────────────────
            # 5) 삭제
            # ─────────────────────────────────────────────────────────
            cur.execute(
                "DELETE FROM accounting_purchases "
                "WHERE id=%s AND tenant_id=%s AND status='cancelled'",
                (PURCHASE_ID, TENANT_ID),
            )
            print(f"[DELETE] accounting_purchases id={PURCHASE_ID}: "
                  f"{cur.rowcount}행")
            if cur.rowcount != 1:
                raise RuntimeError(
                    f"예상 삭제 1행, 실제 {cur.rowcount} — 중단"
                )

            # ─────────────────────────────────────────────────────────
            # 6) 사후 검증
            # ─────────────────────────────────────────────────────────
            cur.execute(
                "SELECT id FROM accounting_purchases WHERE id=%s",
                (PURCHASE_ID,),
            )
            if cur.fetchone():
                raise RuntimeError("삭제 실패 — 행이 여전히 존재")

            cur.execute(
                """SELECT id, transaction_date, quantity, unit_price,
                          total_amount, status
                   FROM accounting_purchases
                   WHERE material_id=%s AND tenant_id=%s AND item_name=%s
                   ORDER BY transaction_date, id""",
                (MATERIAL_ID, TENANT_ID, ITEM_NAME),
            )
            after = cur.fetchall()
            approved = [r for r in after if r["status"] == "approved"]
            cancelled = [r for r in after if r["status"] == "cancelled"]
            print(f"\n[변경 후 멥쌀 매입] {len(after)}건 "
                  f"(approved={len(approved)}, cancelled={len(cancelled)})")
            for r in after:
                print(f"  id={r['id']:>3}  {r['transaction_date']}  "
                      f"{r['quantity']:>7}개  × {r['unit_price']:>10}  "
                      f"= {r['total_amount']:>12}  [{r['status']}]")

            if len(after) != 6 or len(approved) != 6 or len(cancelled) != 0:
                raise RuntimeError(
                    f"기대: 6건 모두 approved. 실제: total={len(after)}, "
                    f"approved={len(approved)}, cancelled={len(cancelled)}"
                )

            # 합계 확인
            total_amount = sum(int(r["total_amount"]) for r in approved)
            total_qty = sum(float(r["quantity"]) for r in approved)
            print(f"\n[합계] 6건 approved: 수량={total_qty:.3f}개, "
                  f"금액={total_amount:,}원")

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
