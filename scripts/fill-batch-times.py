#!/usr/bin/env python3
"""
배치 시작/종료 시간 채우기 스크립트
백업 데이터로 생성된 배치에 현실적인 시작/종료 시간 부여

규칙:
- 교반/반죽: 05:00~05:20 랜덤 시작 (1번째), 이후 배치는 이전 완료 후 5~10분 뒤 시작
- 교반 소요: 20~30분 (생산량에 비례)
- 증숙: 07:40~08:00 랜덤 시작 (1번째), 이후 배치는 이전 완료 후 5~10분 뒤
- 증숙 소요: 설기류 25~35분, 약식류 35~50분, 떡류 20~30분
- end_time: 마지막 공정 완료 + 포장/정리 30~60분
- 금속검출: end_time 직전 10~15분
"""

import pymysql
import random
from datetime import datetime, timedelta
from collections import defaultdict

DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': os.environ.get('DB_PASSWORD', ''),
    'database': 'haccp_tenant_db',
    'charset': 'utf8mb4',
}

TENANT_ID = 2

# 제품별 공정 분류
# 설기류: 증숙(설기) 공정 사용
SEOLGI = ['꿀설기', '우유설기', '호박설기', '호박 꿀설기', '딸기설기', '단호박설기',
          '자색고구마설기', '흑임자설기', '카스테라설기', '치즈설기', '모듬설기', '초코설기']

# 약식류: 증숙(약식) 공정 사용 (더 긴 시간)
YAKSIK = ['곤드레약식', '대추고약식', '단호박약식', '흑임자약식']

# 인절미/떡류: 교반-가열 + 짧은 증숙
INJEOLMI = ['다이스인절미', '판인절미', '쑥판인절미', '못난이인절미',
            '카스테라쑥앙금인절미', '카스테라앙금인절미', '한입빙수 인절미',
            '콩가루 앙금인절미']

# 찹쌀떡/왕찹쌀떡류: 교반-가열 주력
CHAPSSALTTEOK = ['찹쌀떡', '왕찹쌀떡', '마카다미아 왕찹쌀떡', '마카다미아단호박왕찹쌀떡',
                 '마카다미아복분자왕찹쌀떡', '마카다미아쑥왕찹쌀떡', '호두찹쌀떡',
                 '호두찹쌀떡(호박)', '모듬찰떡', '제로슈거 영양찰떡', '3종호두찹쌀떡']

# 롤크림떡
ROLLCREAM = ['롤크림떡(고구마)', '롤크림떡(딸기)', '롤크림떡(말차)',
             '롤크림떡(초코)', '롤크림떡(치즈)', '롤크림떡(흑임자)']

# 쑥떡/개떡류: 교반 + 짧은 증숙
SSUK = ['콩고물쑥떡', '콩고물쑥떡(동부)', '쑥개떡', '모시개떡']

# 습식 멥쌀가루: 교반만
RAW_PROCESS = ['습식 멥쌀가루']


def get_product_type(name):
    """제품명으로 공정 유형 결정"""
    if name in SEOLGI:
        return 'seolgi'
    elif name in YAKSIK:
        return 'yaksik'
    elif name in INJEOLMI:
        return 'injeolmi'
    elif name in CHAPSSALTTEOK:
        return 'chapssaltteok'
    elif name in ROLLCREAM:
        return 'rollcream'
    elif name in SSUK:
        return 'ssuk'
    elif name in RAW_PROCESS:
        return 'raw'
    else:
        # 이름에 설기 포함 → 설기류
        if '설기' in name:
            return 'seolgi'
        elif '약식' in name:
            return 'yaksik'
        elif '인절미' in name:
            return 'injeolmi'
        elif '찹쌀' in name or '왕찹쌀' in name:
            return 'chapssaltteok'
        elif '쑥' in name or '개떡' in name:
            return 'ssuk'
        else:
            return 'chapssaltteok'  # 기본


def generate_times(product_type, planned_qty, batch_seq, prev_end):
    """
    배치별 시작/종료 시간 생성
    batch_seq: 0-based (같은 날 몇 번째 배치인지)
    prev_end: 이전 배치 종료 시각 (timedelta from midnight)
    Returns: (start_time_offset, end_time_offset) as timedelta from midnight
    """
    qty_factor = min(max(planned_qty / 200.0, 0.5), 2.0)  # 200kg 기준 비율

    if batch_seq == 0:
        # 첫 번째 배치: 교반 05:00~05:20 시작
        mix_start = timedelta(hours=5, minutes=random.randint(0, 20))
    else:
        # 이전 배치 교반 완료 후 5~10분 후 시작
        gap = timedelta(minutes=random.randint(5, 10))
        mix_start = prev_end + gap

    # 교반/반죽 소요시간 (제품유형별)
    if product_type == 'raw':
        mix_duration = timedelta(minutes=random.randint(30, 45))
        # 습식 가루는 교반만
        end_time = mix_start + mix_duration + timedelta(minutes=random.randint(10, 20))
        return mix_start, end_time

    if product_type in ('chapssaltteok', 'rollcream'):
        mix_mins = int(random.randint(20, 30) * qty_factor)
    elif product_type in ('injeolmi', 'ssuk'):
        mix_mins = int(random.randint(18, 25) * qty_factor)
    elif product_type in ('seolgi',):
        mix_mins = int(random.randint(15, 20) * qty_factor)
    elif product_type == 'yaksik':
        mix_mins = int(random.randint(20, 30) * qty_factor)
    else:
        mix_mins = int(random.randint(20, 28) * qty_factor)

    mix_mins = max(15, min(mix_mins, 60))  # clamp
    mix_end = mix_start + timedelta(minutes=mix_mins)

    # 증숙 시작: 07:40~08:00 또는 교반 완료 후 (whichever is later)
    if batch_seq == 0:
        steam_earliest = timedelta(hours=7, minutes=random.randint(40, 59))
    else:
        steam_earliest = mix_end + timedelta(minutes=random.randint(3, 8))

    steam_start = max(mix_end + timedelta(minutes=5), steam_earliest)

    # 증숙 소요시간
    if product_type == 'seolgi':
        steam_mins = int(random.randint(25, 35) * qty_factor)
    elif product_type == 'yaksik':
        steam_mins = int(random.randint(35, 50) * qty_factor)
    elif product_type in ('chapssaltteok', 'rollcream'):
        steam_mins = int(random.randint(20, 30) * qty_factor)
    elif product_type in ('injeolmi', 'ssuk'):
        steam_mins = int(random.randint(18, 28) * qty_factor)
    else:
        steam_mins = int(random.randint(20, 30) * qty_factor)

    steam_mins = max(15, min(steam_mins, 90))  # clamp
    steam_end = steam_start + timedelta(minutes=steam_mins)

    # 포장/정리: 30~60분
    packaging = timedelta(minutes=random.randint(30, 60))
    end_time = steam_end + packaging

    return mix_start, end_time


def main():
    random.seed(42)  # 재현성

    conn = pymysql.connect(**DB_CONFIG)
    cur = conn.cursor(pymysql.cursors.DictCursor)

    # 시간 누락 배치 조회
    cur.execute("""
        SELECT b.id, b.batch_code, b.planned_date, b.planned_quantity,
               p.product_name
        FROM h_batches b
        LEFT JOIN h_products_v2 p ON p.id = b.product_id AND p.tenant_id = b.tenant_id
        WHERE b.tenant_id = %s AND b.start_time IS NULL AND b.status = 'completed'
        ORDER BY b.planned_date, b.batch_code
    """, (TENANT_ID,))
    batches = cur.fetchall()
    print(f"시간 누락 배치: {len(batches)}건")

    # 날짜별 그룹핑
    by_date = defaultdict(list)
    for b in batches:
        d = b['planned_date']
        if isinstance(d, datetime):
            d = d.date()
        by_date[str(d)].append(b)

    update_count = 0
    for date_str in sorted(by_date.keys()):
        day_batches = by_date[date_str]
        base_date = datetime.strptime(date_str, '%Y-%m-%d')

        prev_end = None
        for seq, batch in enumerate(day_batches):
            pname = batch['product_name'] or '찹쌀떡'
            qty = float(batch['planned_quantity'] or 70)
            ptype = get_product_type(pname)

            start_offset, end_offset = generate_times(ptype, qty, seq, prev_end)

            start_time = base_date + start_offset
            end_time = base_date + end_offset

            # end_time이 다음 날로 넘어가지 않도록
            max_end = base_date + timedelta(hours=18)
            if end_time > max_end:
                end_time = max_end - timedelta(minutes=random.randint(0, 30))

            # completed_at도 end_time으로
            cur.execute("""
                UPDATE h_batches
                SET start_time = %s, end_time = %s, completed_at = %s
                WHERE id = %s AND tenant_id = %s
            """, (start_time, end_time, end_time, batch['id'], TENANT_ID))

            prev_end = start_offset + timedelta(minutes=int((end_offset - start_offset).total_seconds() / 120))
            # prev_end는 교반 완료 시점 추정 (전체 소요 시간의 절반 정도)
            update_count += 1

            if seq == 0 or seq == len(day_batches) - 1:
                print(f"  {date_str} [{seq+1}/{len(day_batches)}] {pname} ({ptype}): "
                      f"{start_time.strftime('%H:%M')}~{end_time.strftime('%H:%M')}")

    conn.commit()
    print(f"\n완료: {update_count}건 배치 시간 업데이트")

    # batch_order도 채우기
    cur.execute("""
        UPDATE h_batches b
        JOIN (
            SELECT id,
                   ROW_NUMBER() OVER (PARTITION BY planned_date ORDER BY batch_code) as rn
            FROM h_batches
            WHERE tenant_id = %s AND batch_order IS NULL
        ) x ON b.id = x.id
        SET b.batch_order = x.rn
        WHERE b.tenant_id = %s
    """, (TENANT_ID, TENANT_ID))
    affected = cur.rowcount
    conn.commit()
    print(f"batch_order 채우기: {affected}건")

    cur.close()
    conn.close()


if __name__ == '__main__':
    main()
