#!/usr/bin/env python3
"""
running_stock 재계산 스크립트
material_ledger_daily의 running_stock을 날짜순 누적으로 재계산
"""
import pymysql

TENANT_ID = 2
conn = pymysql.connect(
    host='127.0.0.1', port=3306,
    user='root', password='G0ld3n!T1004#Sec',
    db='haccp_tenant_db', charset='utf8mb4'
)
cur = conn.cursor()

# 모든 원재료 목록
cur.execute("SELECT DISTINCT material_id FROM material_ledger_daily WHERE tenant_id=%s", (TENANT_ID,))
mat_ids = [r[0] for r in cur.fetchall()]
print(f"원재료 {len(mat_ids)}종 재계산 시작...")

fixed = 0
for mat_id in mat_ids:
    cur.execute(
        """SELECT id, receiving_qty, usage_qty, adjustment_qty, running_stock
           FROM material_ledger_daily 
           WHERE tenant_id=%s AND material_id=%s 
           ORDER BY ledger_date ASC, id ASC""",
        (TENANT_ID, mat_id)
    )
    rows = cur.fetchall()
    running = 0.0
    for row_id, recv, usage, adj, old_stock in rows:
        recv = float(recv or 0)
        usage = float(usage or 0)
        adj = float(adj or 0)
        running = running + recv - usage + adj
        if abs(float(old_stock or 0) - running) > 0.001:
            cur.execute("UPDATE material_ledger_daily SET running_stock=%s WHERE id=%s",
                       (round(running, 3), row_id))
            fixed += 1

conn.commit()
print(f"✅ {fixed}건 running_stock 수정 완료")

# 월별 집계도 재생성
cur.execute(
    "SELECT DISTINCT DATE_FORMAT(ledger_date, '%%Y-%%m') as ym FROM material_ledger_daily WHERE tenant_id=%s ORDER BY ym",
    (TENANT_ID,)
)
months = [r[0] for r in cur.fetchall()]
print(f"\n월별 집계 재생성: {len(months)}개월")

# 모든 원재료
cur.execute("SELECT id FROM h_materials WHERE tenant_id=%s AND is_active=1", (TENANT_ID,))
all_mat_ids = [r[0] for r in cur.fetchall()]

for ym in months:
    year, month = map(int, ym.split('-'))
    import calendar
    last_day = calendar.monthrange(year, month)[1]
    start_date = f"{ym}-01"
    end_date = f"{ym}-{last_day:02d}"
    prev_month = f"{year-1}-12" if month == 1 else f"{year}-{month-1:02d}"
    
    for mat_id in all_mat_ids:
        # 전월 재고
        cur.execute(
            "SELECT end_stock FROM material_ledger_monthly WHERE tenant_id=%s AND material_id=%s AND `year_month`=%s",
            (TENANT_ID, mat_id, prev_month)
        )
        prev_row = cur.fetchone()
        prev_stock = float(prev_row[0]) if prev_row else 0.0
        
        # 일별 데이터 (adjustment_qty 포함)
        cur.execute(
            """SELECT DAY(ledger_date) as d, receiving_qty, usage_qty, adjustment_qty
               FROM material_ledger_daily
               WHERE tenant_id=%s AND material_id=%s AND ledger_date >= %s AND ledger_date <= %s""",
            (TENANT_ID, mat_id, start_date, end_date)
        )
        daily = cur.fetchall()
        
        rd = [0.0] * 31
        ud = [0.0] * 31
        rt = ut = at = 0.0
        for d, recv, usg, adj in daily:
            i = int(d) - 1
            rd[i] = float(recv or 0)
            ud[i] = float(usg or 0)
            rt += rd[i]
            ut += ud[i]
            at += float(adj or 0)
        
        if rt == 0 and ut == 0 and at == 0 and prev_stock == 0:
            continue
        
        end_stock = prev_stock + rt - ut + at
        
        # Upsert
        placeholders = [TENANT_ID, mat_id, ym, prev_stock, rt] + rd + [ut] + ud + [end_stock]
        cur.execute(
            """INSERT INTO material_ledger_monthly 
               (tenant_id, material_id, `year_month`, prev_stock, receiving_total,
                receiving_day_01,receiving_day_02,receiving_day_03,receiving_day_04,receiving_day_05,
                receiving_day_06,receiving_day_07,receiving_day_08,receiving_day_09,receiving_day_10,
                receiving_day_11,receiving_day_12,receiving_day_13,receiving_day_14,receiving_day_15,
                receiving_day_16,receiving_day_17,receiving_day_18,receiving_day_19,receiving_day_20,
                receiving_day_21,receiving_day_22,receiving_day_23,receiving_day_24,receiving_day_25,
                receiving_day_26,receiving_day_27,receiving_day_28,receiving_day_29,receiving_day_30,
                receiving_day_31,
                usage_total,
                usage_day_01,usage_day_02,usage_day_03,usage_day_04,usage_day_05,
                usage_day_06,usage_day_07,usage_day_08,usage_day_09,usage_day_10,
                usage_day_11,usage_day_12,usage_day_13,usage_day_14,usage_day_15,
                usage_day_16,usage_day_17,usage_day_18,usage_day_19,usage_day_20,
                usage_day_21,usage_day_22,usage_day_23,usage_day_24,usage_day_25,
                usage_day_26,usage_day_27,usage_day_28,usage_day_29,usage_day_30,
                usage_day_31,
                end_stock)
               VALUES (""" + ",".join(["%s"]*69) + """)
               ON DUPLICATE KEY UPDATE
                prev_stock=VALUES(prev_stock), receiving_total=VALUES(receiving_total),
                receiving_day_01=VALUES(receiving_day_01),receiving_day_02=VALUES(receiving_day_02),
                receiving_day_03=VALUES(receiving_day_03),receiving_day_04=VALUES(receiving_day_04),
                receiving_day_05=VALUES(receiving_day_05),receiving_day_06=VALUES(receiving_day_06),
                receiving_day_07=VALUES(receiving_day_07),receiving_day_08=VALUES(receiving_day_08),
                receiving_day_09=VALUES(receiving_day_09),receiving_day_10=VALUES(receiving_day_10),
                receiving_day_11=VALUES(receiving_day_11),receiving_day_12=VALUES(receiving_day_12),
                receiving_day_13=VALUES(receiving_day_13),receiving_day_14=VALUES(receiving_day_14),
                receiving_day_15=VALUES(receiving_day_15),receiving_day_16=VALUES(receiving_day_16),
                receiving_day_17=VALUES(receiving_day_17),receiving_day_18=VALUES(receiving_day_18),
                receiving_day_19=VALUES(receiving_day_19),receiving_day_20=VALUES(receiving_day_20),
                receiving_day_21=VALUES(receiving_day_21),receiving_day_22=VALUES(receiving_day_22),
                receiving_day_23=VALUES(receiving_day_23),receiving_day_24=VALUES(receiving_day_24),
                receiving_day_25=VALUES(receiving_day_25),receiving_day_26=VALUES(receiving_day_26),
                receiving_day_27=VALUES(receiving_day_27),receiving_day_28=VALUES(receiving_day_28),
                receiving_day_29=VALUES(receiving_day_29),receiving_day_30=VALUES(receiving_day_30),
                receiving_day_31=VALUES(receiving_day_31),
                usage_total=VALUES(usage_total),
                usage_day_01=VALUES(usage_day_01),usage_day_02=VALUES(usage_day_02),
                usage_day_03=VALUES(usage_day_03),usage_day_04=VALUES(usage_day_04),
                usage_day_05=VALUES(usage_day_05),usage_day_06=VALUES(usage_day_06),
                usage_day_07=VALUES(usage_day_07),usage_day_08=VALUES(usage_day_08),
                usage_day_09=VALUES(usage_day_09),usage_day_10=VALUES(usage_day_10),
                usage_day_11=VALUES(usage_day_11),usage_day_12=VALUES(usage_day_12),
                usage_day_13=VALUES(usage_day_13),usage_day_14=VALUES(usage_day_14),
                usage_day_15=VALUES(usage_day_15),usage_day_16=VALUES(usage_day_16),
                usage_day_17=VALUES(usage_day_17),usage_day_18=VALUES(usage_day_18),
                usage_day_19=VALUES(usage_day_19),usage_day_20=VALUES(usage_day_20),
                usage_day_21=VALUES(usage_day_21),usage_day_22=VALUES(usage_day_22),
                usage_day_23=VALUES(usage_day_23),usage_day_24=VALUES(usage_day_24),
                usage_day_25=VALUES(usage_day_25),usage_day_26=VALUES(usage_day_26),
                usage_day_27=VALUES(usage_day_27),usage_day_28=VALUES(usage_day_28),
                usage_day_29=VALUES(usage_day_29),usage_day_30=VALUES(usage_day_30),
                usage_day_31=VALUES(usage_day_31),
                end_stock=VALUES(end_stock), updated_at=NOW()""",
            placeholders
        )
    conn.commit()
    print(f"  {ym} 집계 완료")

print(f"\n✅ 전체 재계산 완료")
conn.close()
