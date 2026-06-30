#!/usr/bin/env python3
"""
멥쌀 재고 v5 → DB 반영 (Stage 2)
=====================================

목적:
  v5 엑셀 원장의 최종 잔량 1,669.98kg에 맞춰 DB를 갱신한다.

현황:
  - 현재 h_inventory(멥쌀) total_quantity = 2,433.72kg
  - 목표 = 1,669.98kg
  - GAP = 763.74kg (이만큼 추가로 OUT 처리 필요)

전략:
  v5 분배 대상 62 배치 중 이미 h_batch_inputs(멥쌀)이 있는 48건은 그대로 두고,
  미등록 14건(3/30~4/17 인절미/마카다미아왕찹쌀떡(혼합)-흰/왕찹쌀떡)에 BOM%에
  맞춰 멥쌀 batch_input을 신규 생성. 14건 BOM 합계 333.35kg에 잔여
  430.39kg을 비례 추가하여 합계 정확히 763.74kg에 도달한다.

  실제 적용: 14건 각각의 "actual 멥쌀 사용량" = BOM_kg × scale_factor
  scale_factor = 763.743 / 333.353 = 2.2912

  → 각 batch_input.actual_quantity는 BOM 그대로가 아닌 평준 스케일을 적용한
    값으로 기록. notes에 산출 식 명시.

DB 변경 사항 (트랜잭션 1건):
  1. h_inventory_lots.supplier_name = '인천광역시청' (6개 멥쌀 LOT)
  2. h_batch_inputs INSERT × 14 (멥쌀 = mat_id 615)
     - lot_id: receipt LOT FIFO (LOT 653 → 655 → 767 → 822 → 830 → 890 → 973)
     - actual_quantity: BOM_kg × 2.2912
     - notes: "v5 분배 (수정전 재고 정합화) BOM% × scale"
  3. h_inventory_transactions INSERT × 14 (usage 트랜잭션)
     - transaction_type=usage, quantity=동일
     - reference_type='batch_input_v5', reference_id=batch_id
  4. h_inventory_lots.current_quantity, available_quantity 차감 (FIFO)
  5. h_inventory.total_quantity = 1669.980, available_quantity = 1669.980

검증:
  - 사전: SELECT total_quantity → 2433.723
  - 사후: SELECT total_quantity → 1669.980 (정확히)
  - 14건 batch_input 합계 = 763.743
  - 7개 LOT supplier_name = 인천광역시청

DRY-RUN:
  python3 apply_mepsal_inventory_v5_to_db.py            # 미리보기만
  python3 apply_mepsal_inventory_v5_to_db.py --commit   # 실제 적용
"""
import pymysql
from urllib.parse import urlparse
from decimal import Decimal, ROUND_HALF_UP
import os
import sys
import argparse
from datetime import datetime

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "mysql://root:G0ld3n%21T1004%23Sec@127.0.0.1:3306/haccp_tenant_db",
)

TENANT_ID = 2
MAT_ID = 615  # 멥쌀(국내산) in h_materials/h_inventory
SUPPLIER_NAME = "인천광역시청"
TARGET_FINAL_STOCK = Decimal("1669.980")

# BOM% (h_mf_ingredients 기준)
BOM_PCT = {
    "쑥판인절미": Decimal("14.3"),
    "판인절미": Decimal("15.1"),
    "콩고물쑥떡": Decimal("9.4"),
    "콩고물쑥떡(동부)": Decimal("9.7"),
    "마카다미아왕찹쌀떡(혼합)-흰": Decimal("9.7"),
    "순인절미": Decimal("15.1"),
    "왕찹쌀떡": Decimal("9.5"),
}

CREATED_BY = 1  # system user


def round3(x: Decimal) -> Decimal:
    return x.quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)


def round2(x: Decimal) -> Decimal:
    return x.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


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
                    help="실제 DB 변경. 미지정 시 DRY-RUN.")
    args = ap.parse_args()

    print("=" * 78)
    print(f"멥쌀 재고 v5 → DB 반영 ({'COMMIT' if args.commit else 'DRY-RUN'})")
    print("=" * 78)

    conn = connect_db()
    try:
        with conn.cursor() as cur:
            # ---- 0) 사전 검증 ----
            cur.execute("""
                SELECT id, total_quantity, available_quantity, unit, item_name
                FROM h_inventory WHERE tenant_id=%s AND material_id=%s
            """, (TENANT_ID, MAT_ID))
            inv = cur.fetchone()
            cur_stock = Decimal(str(inv["total_quantity"]))
            print(f"[0] 사전: 멥쌀 inventory id={inv['id']} total={cur_stock} kg")

            gap = cur_stock - TARGET_FINAL_STOCK
            print(f"    목표: {TARGET_FINAL_STOCK} kg, 차이: {gap} kg")
            if gap <= 0:
                print(f"    ⚠️  목표보다 적거나 같음. 추가 OUT 없음.")
                return

            # ---- 1) 14건 미등록 배치 조회 ----
            cur.execute("""
                SELECT b.id batch_id, b.batch_code, b.planned_date,
                       p.product_name, b.actual_quantity
                FROM h_batches b
                JOIN h_products p ON p.id=b.product_id
                LEFT JOIN h_batch_inputs bi
                  ON bi.batch_id=b.id AND bi.material_id=%s
                WHERE b.tenant_id=%s
                  AND p.product_name IN (
                      '쑥판인절미','판인절미','콩고물쑥떡','콩고물쑥떡(동부)',
                      '마카다미아왕찹쌀떡(혼합)-흰','순인절미','왕찹쌀떡'
                  )
                  AND b.planned_date BETWEEN '2026-03-30' AND '2026-06-12'
                  AND bi.id IS NULL
                ORDER BY b.planned_date, b.id
            """, (MAT_ID, TENANT_ID))
            missing = cur.fetchall()
            print(f"\n[1] 미등록 배치: {len(missing)}건")

            bom_sum = Decimal("0")
            for r in missing:
                pct = BOM_PCT[r["product_name"]]
                kg = round3(Decimal(str(r["actual_quantity"])) * pct / Decimal("100"))
                r["bom_kg"] = kg
                bom_sum += kg
            print(f"    BOM 합계: {bom_sum} kg")

            # ---- 2) Scale factor ----
            scale = gap / bom_sum
            print(f"\n[2] Scale factor = {gap} / {bom_sum} = {scale}")

            # 각 배치별 실제 차감량 (Decimal 정밀, 마지막에 합계 보정)
            allocations = []
            running = Decimal("0")
            for i, r in enumerate(missing):
                if i < len(missing) - 1:
                    qty = round3(r["bom_kg"] * scale)
                else:
                    # 마지막은 나머지 모두 (rounding 누적 오차 보정)
                    qty = round3(gap - running)
                allocations.append((r, qty))
                running += qty

            print(f"\n[3] 분배 결과 ({len(allocations)}건):")
            for r, qty in allocations:
                print(f"    {r['planned_date']} | {r['product_name']:30s} "
                      f"| qty={float(r['actual_quantity']):>6.2f} × BOM "
                      f"{float(BOM_PCT[r['product_name']]):>5.2f}% × {float(scale):.4f} "
                      f"= {qty} kg")
            print(f"    합계: {running} kg (목표 {gap})")
            assert running == gap, f"Sum mismatch: {running} != {gap}"

            # ---- 4) FIFO LOT 매핑 (이미 사용된 LOT 포함) ----
            cur.execute("""
                SELECT id, lot_number, receipt_date, quantity, current_quantity, status
                FROM h_inventory_lots
                WHERE tenant_id=%s AND material_id=%s
                ORDER BY receipt_date, id
            """, (TENANT_ID, MAT_ID))
            lots = cur.fetchall()
            print(f"\n[4] LOTs (FIFO 차감용): {len(lots)}건")
            for L in lots:
                print(f"    id={L['id']:>4d} | {L['lot_number']:32s} | "
                      f"recv={L['receipt_date']} | curr={L['current_quantity']} | {L['status']}")

            # ---- 5) batch_input별 lot_id 할당 (FIFO) ----
            # available lots만 차감 대상 (이미 used=0 LOT은 건드리지 않음)
            avail_lots = [L for L in lots if L["status"] == "available"
                          and Decimal(str(L["current_quantity"])) > 0]
            print(f"    Available LOTs: {[L['lot_number'] for L in avail_lots]}")

            assignments = []  # [(batch_row, qty, [(lot_id, lot_qty), ...])]
            for r, qty in allocations:
                remaining = qty
                lot_slices = []
                while remaining > 0:
                    if not avail_lots:
                        raise RuntimeError("LOT 재고 부족!")
                    cur_lot = avail_lots[0]
                    cur_avail = Decimal(str(cur_lot["current_quantity"]))
                    if cur_avail >= remaining:
                        lot_slices.append((cur_lot["id"], remaining))
                        cur_lot["current_quantity"] = cur_avail - remaining
                        remaining = Decimal("0")
                    else:
                        lot_slices.append((cur_lot["id"], cur_avail))
                        remaining -= cur_avail
                        cur_lot["current_quantity"] = Decimal("0")
                        avail_lots.pop(0)
                assignments.append((r, qty, lot_slices))

            # ---- 6) 변경 사항 미리보기 ----
            print(f"\n[5] LOT 차감 후 상태:")
            for L in lots:
                print(f"    {L['lot_number']:32s} | new_curr={L['current_quantity']}")

            print(f"\n[6] 거래처(인천광역시청) 보정 대상:")
            cur.execute("""SELECT id, lot_number, supplier_name
                           FROM h_inventory_lots
                           WHERE tenant_id=%s AND material_id=%s
                           ORDER BY receipt_date""", (TENANT_ID, MAT_ID))
            for L in cur.fetchall():
                marker = "[변경]" if (L["supplier_name"] or "") != SUPPLIER_NAME else "[유지]"
                print(f"    {marker} id={L['id']:>4d} | {L['lot_number']:32s} "
                      f"| 현재='{L['supplier_name'] or ''}' → '{SUPPLIER_NAME}'")

            # ---- 7) Apply or skip ----
            if not args.commit:
                print("\n[DRY-RUN] 실제 변경 없음. --commit 옵션으로 적용 가능.")
                return

            print("\n[7] 변경 적용 시작...")

            # 7.1 백업 테이블 생성
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            bk1 = f"backup_h_inventory_{ts}_v5apply"
            bk2 = f"backup_h_inventory_lots_{ts}_v5apply"
            cur.execute(f"CREATE TABLE {bk1} AS SELECT * FROM h_inventory "
                        f"WHERE tenant_id=%s AND material_id=%s", (TENANT_ID, MAT_ID))
            cur.execute(f"CREATE TABLE {bk2} AS SELECT * FROM h_inventory_lots "
                        f"WHERE tenant_id=%s AND material_id=%s", (TENANT_ID, MAT_ID))
            print(f"    백업 테이블: {bk1}, {bk2}")

            # 7.2 supplier_name 갱신 (6 LOTs)
            cur.execute("""UPDATE h_inventory_lots
                           SET supplier_name=%s
                           WHERE tenant_id=%s AND material_id=%s
                             AND (supplier_name IS NULL OR supplier_name='')""",
                        (SUPPLIER_NAME, TENANT_ID, MAT_ID))
            print(f"    h_inventory_lots supplier_name 갱신: {cur.rowcount}행")

            # 7.3 batch_inputs + transactions INSERT
            inserted_bi = 0
            inserted_tx = 0
            for r, qty, lot_slices in assignments:
                # 첫 lot_slice의 lot_id를 batch_input.lot_id에 기록 (대표)
                primary_lot_id = lot_slices[0][0]
                cur.execute("""
                    INSERT INTO h_batch_inputs
                      (batch_id, material_id, lot_id, planned_quantity, actual_quantity,
                       unit, input_time, notes, inventory_deducted, created_at, tenant_id)
                    VALUES (%s, %s, %s, %s, %s, 'kg', NOW(),
                            %s, 1, NOW(), %s)
                """, (
                    r["batch_id"], MAT_ID, primary_lot_id,
                    qty, qty,
                    f"[v5 재고 정합화] BOM {BOM_PCT[r['product_name']]}% × scale {float(scale):.4f}",
                    TENANT_ID,
                ))
                bi_id = cur.lastrowid
                inserted_bi += 1

                # transaction per lot slice
                for lot_id, slice_qty in lot_slices:
                    # lot_number 조회
                    cur.execute("SELECT lot_number FROM h_inventory_lots WHERE id=%s",
                                (lot_id,))
                    lot_no = cur.fetchone()["lot_number"]
                    cur.execute("""
                        INSERT INTO h_inventory_transactions
                          (lot_id, inventory_id, material_id, transaction_type, quantity,
                           unit, transaction_date,
                           reference_type, reference_id,
                           notes, created_by, created_at, tenant_id)
                        VALUES (%s, %s, %s, 'usage', %s, 'kg', %s,
                                'batch_input', %s,
                                %s, %s, NOW(), %s)
                    """, (
                        lot_id, inv["id"], MAT_ID, slice_qty, r["planned_date"],
                        bi_id,
                        f"[v5 재고 정합화] batch_id={r['batch_id']} "
                        f"({r['product_name']}) lot={lot_no}",
                        CREATED_BY,
                        TENANT_ID,
                    ))
                    inserted_tx += 1
            print(f"    h_batch_inputs INSERT: {inserted_bi}행")
            print(f"    h_inventory_transactions(usage) INSERT: {inserted_tx}행")

            # 7.4 LOT current_quantity 갱신
            for L in lots:
                cur.execute("""UPDATE h_inventory_lots
                               SET current_quantity=%s, available_quantity=%s,
                                   status=CASE WHEN %s<=0 THEN 'used' ELSE status END,
                                   updated_at=NOW()
                               WHERE id=%s""",
                            (L["current_quantity"], L["current_quantity"],
                             L["current_quantity"], L["id"]))
            print(f"    h_inventory_lots current_quantity 갱신: {len(lots)}행")

            # 7.5 h_inventory 갱신
            cur.execute("""UPDATE h_inventory
                           SET total_quantity=%s, available_quantity=%s,
                               last_updated=NOW(), updated_at=NOW()
                           WHERE id=%s""",
                        (TARGET_FINAL_STOCK, TARGET_FINAL_STOCK, inv["id"]))
            print(f"    h_inventory 갱신: total/available = {TARGET_FINAL_STOCK}")

            # 7.6 사후 검증
            cur.execute("SELECT total_quantity FROM h_inventory WHERE id=%s", (inv["id"],))
            new_stock = Decimal(str(cur.fetchone()["total_quantity"]))
            cur.execute("""SELECT COALESCE(SUM(current_quantity),0) s
                           FROM h_inventory_lots WHERE tenant_id=%s AND material_id=%s
                             AND status='available'""", (TENANT_ID, MAT_ID))
            lot_sum = Decimal(str(cur.fetchone()["s"]))
            print(f"\n[8] 사후 검증")
            print(f"    h_inventory.total_quantity: {new_stock}")
            print(f"    available LOT 합계        : {lot_sum}")
            print(f"    목표                       : {TARGET_FINAL_STOCK}")
            if new_stock == TARGET_FINAL_STOCK and lot_sum == TARGET_FINAL_STOCK:
                print("    ✅ 일치")
            else:
                raise RuntimeError(f"검증 실패: stock={new_stock}, lot={lot_sum}, "
                                   f"target={TARGET_FINAL_STOCK}")

            conn.commit()
            print(f"\n[OK] 커밋 완료. 백업: {bk1}, {bk2}")

    except Exception as e:
        conn.rollback()
        print(f"\n[ERROR] 롤백: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
