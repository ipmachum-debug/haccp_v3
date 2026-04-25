#!/usr/bin/env python3
"""
⚠️  DEPRECATED — 재실행 금지 (2026-04-25)
═══════════════════════════════════════════════════════════════════════
이 스크립트는 일회성 데이터 임포트로 이미 운영DB(tenant 2)에 반영됨.
재실행 시 중복 데이터 + product_id 정합성 깨짐 위험.

[발견된 버그]
- line 188: `INSERT INTO h_products` (구 v1 테이블, 현 시스템은 h_products_v2 사용)
- line 186: `next_product_id = 43` (작성 시점 가정값, 실제 max id 와 무관)
- line 211/554: PRODUCT_MAP[name] 사용 — batch.product_id, lot.product_id 둘 다 v1 ID
- 그 후 migrate-products-v1-to-v2.ts 가 batch.product_id 만 v2 ID 로 정정하면서
  h_inventory_lots 의 product_id 와 미스매치 발생 (운영 사고)
- 2026-04-25 옵션 A 일괄 UPDATE 로 82건 정정 완료

[향후 임포트 작성 시 가이드]
docs/architecture/05-data-import-guide.md 참조.
요약:
  1. PRODUCT_MAP 은 hardcoded 가 아닌 DB 조회로 빌드 (이름 → h_products_v2.id)
  2. 신규 제품은 h_products_v2 INSERT 후 lastInsertId 받아서 사용
  3. batch.product_id 와 h_inventory_lots.product_id 는 반드시 동일 source
  4. 임포트 후 scripts/check-lot-product-mismatch.ts 로 검증
═══════════════════════════════════════════════════════════════════════

생산 데이터 임포트 스크립트 (2026-03-20 ~ 2026-04-03)
- 43개 생산 기록, 22개 제품, 41개 원재료
- 배치 생성, CCP 기록지(h_ccp_instances + h_ccp_form_records + h_ccp_form_rows),
  원료 소모, 재고 트랜잭션, 제품 LOT 생성

CCP 공정 시간 (사용자 지정):
  교반공정(CCP-1B, pg=1): 새벽 05:01 +-10분 시작
  증숙(설기류)공정(CCP-1B, pg=2): 08:00 +-20분 시작
  증숙(약식류)공정(CCP-1B, pg=3): 08:00 +-20분 시작
  금속검출(CCP-4P, pg=5): 하루 1건 (직렬 1대), 08:20 +-10분 시작
    - 테넌트 ID 2는 금속검출기 1대 직렬 운영
    - 하루 총 생산량에 비례하여 제품별 시간 배분
    - 각 제품: sensitivity(품목시작/2시간점검/품목종료) + passage row

h_ccp_form_rows 실제 스키마:
  CCP-1B: batch_seq, equipment_name, measurement_time, input_qty_kg,
          heat_time_min, heat_temp_c, pressure_mpa, temp_edge_c, temp_center_c, result(적합/부적합)
  CCP-4P: batch_seq, equipment_type(sensitivity/passage), product_name,
          metal_pass_time, metal_fe_mid(O/X), metal_sus_mid(O/X), metal_product_only(X),
          metal_fe_product(O/X), metal_sus_product(O/X), note(품목시작/2시간점검/품목종료),
          pass_time_start, pass_time_end, pass_qty, detected_qty, result(적합/부적합)
"""
import json, random, os, sys
from datetime import datetime, timedelta
from collections import defaultdict

random.seed(42)  # reproducible

# ── Load data ──
script_dir = os.path.dirname(os.path.abspath(__file__))
data = json.load(open(os.path.join(script_dir, 'production_0320_0403.json')))

TENANT = 2
SITE = 1
CREATED_BY = 4  # admin user

# ── Current DB max IDs (queried from live DB) ──
MAX_BATCH_ID = 419
MAX_CCP_INSTANCE_ID = 910
MAX_FORM_RECORD_ID = 868
MAX_FORM_ROW_ID = 39129
MAX_LOT_ID = 683
MAX_TXN_ID = 6494

# ── Product mapping (JSON name → product_id) ──
PRODUCT_MAP = {
    '곤드레약식': 4, '꿀설기': 5, '다이스인절미': 6, '단호박설기': 7,
    '롤크림떡(고구마)': 11, '롤크림떡(흑임자)': 16, '마카다미아복분자왕찹쌀떡': 19,
    '마카다미아왕찹쌀떡': 17, '모시개떡': 22, '쑥개떡': 25, '쑥판인절미': 26,
    '왕찹쌀떡': 28, '우유설기': 29, '찹쌀떡(떡마루)': 31,
    '카스테라앙금인절미': 35, '콩고물쑥떡': 36, '판인절미': 38,
    '한입빙수 인절미': 39, '흑임자설기': 41, '흑임자약식': 42,
}

# DB product_name (when different from JSON name)
PRODUCT_DB_NAME = {
    '마카다미아왕찹쌀떡': '마카다미아 왕찹쌀떡',
    '찹쌀떡(떡마루)': '찹쌀떡(떡마루)',  # keep original in CCP since that's the DB name
}

# CCP instances use this name mapping (from existing DB records)
CCP_PRODUCT_NAME = {
    '마카다미아왕찹쌀떡': '마카다미아 왕찹쌀떡',
    '찹쌀떡(떡마루)': '찹쌀떡(떡마루)',
}

# New products to create
NEW_PRODUCTS = [
    ('롤크림떡(녹차)', 'PROD-041', '롤크림떡', 'kg'),
    ('오메기떡(녹차)', 'PROD-042', '오메기떡', 'kg'),
    ('흑임자인절미', 'PROD-043', '인절미', 'kg'),
]

# ── Material mapping (JSON name → material_id) ──
MATERIAL_MAP = {
    '강낭콩((울타리콩))': 580, '건호박채(중국산)': 583, '검정깨(흑임자)': 584,
    '검정콩': 585, '고구마가루': 665, '고구마무스': 587,
    '고려엉겅퀴((곤드레)국내산)': 588, '기타가공품(복분자가루)': 590,
    '기타가공품(프리미엄카스테라가루)': 593, '기타가공품(흑임자가루)': 594,
    '기타설탕(흑설탕)': 595, '냉동쑥(국내산)': 596, '단호박분말(중국산)': 600,
    '동부(미얀마산)': 607, '두류가공품(콩고물)': 609, '마카다미아분태(호주산)': 614,
    '멥쌀(국내산)': 615, '모시잎(국내산)': 616, '물엿(저당물엿)': 617,
    '밤다이스': 618, '변성전분(타피오카전분)': 619, '사양벌꿀(국내산)': 621,
    '생크림': 622, '서양호박(국내산,뉴질랜드산)': 623, '설탕': 624,
    '쑥가루(국내산)': 629, '아몬드슬라이스': 630, '옥수수전분': 633,
    '완두배기': 634, '우유(국내산)': 635, '정제수': 638,
    '조림류(백옥앙금)': 640, '조림류(통팥앙금)': 641, '중력분': 643,
    '찹쌀(국내산)': 645, '천일염': 646, '치즈 [크림치즈]': 647,
    '콩기름(대두유)': 649, '호두분태(미국산)': 653,
    '혼합제제(떡용에스텔)': 656, '화이트초콜릿': 658,
}

# ═══════════════════════════════════════════════════════════════
# CCP 공정 매핑 (실제 DB h_ccp_instances에서 확인한 것)
# ═══════════════════════════════════════════════════════════════
# 교반-가열공정(pg=1): 인절미류, 찹쌀떡류, 왕찹쌀떡, 롤크림떡, 마카다미아류, 콩고물쑥떡, 오메기떡
# 증숙(설기류)공정(pg=2): 꿀설기, 단호박설기, 모시개떡, 쑥개떡, 우유설기, 흑임자설기
# 증숙(약식류)공정(pg=3): 곤드레약식, 흑임자약식
# 오븐-굽기공정(pg=4, CCP-2B): 마카다미아왕찹쌀떡, 마카다미아복분자왕찹쌀떡 등 (별도 처리)
# 금속검출공정(pg=5, CCP-4P): 모든 제품

def get_heat_ccp_types(product_name):
    """제품별 열처리 CCP 공정만 결정 (CCP-4P 금속검출은 별도 하루 1건 처리)"""
    # 설기류/개떡류 → 증숙(설기류)(pg=2)
    if any(k in product_name for k in ['설기', '개떡']):
        return [('CCP-1B', 2, '증숙(설기류)공정')]
    # 약식류 → 증숙(약식류)(pg=3)
    if '약식' in product_name:
        return [('CCP-1B', 3, '증숙(약식류)공정')]
    # 마카다미아왕찹쌀떡/복분자왕찹쌀떡 → 교반(pg=1) + 오븐(pg=4, CCP-2B)
    if '마카다미아' in product_name and '왕찹쌀떡' in product_name:
        return [
            ('CCP-1B', 1, '교반-가열공정'),
            ('CCP-2B', 4, '오븐-굽기공정'),
        ]
    # 인절미/찹쌀떡/왕찹쌀떡/콩고물/오메기/롤크림 → 교반(pg=1)
    if any(k in product_name for k in ['인절미', '찹쌀떡', '왕찹쌀', '콩고물', '오메기', '롤크림']):
        return [('CCP-1B', 1, '교반-가열공정')]
    # default: 교반
    return [('CCP-1B', 1, '교반-가열공정')]


def random_time_str(base_hour, base_min, delta_min):
    """랜덤 HH:MM:SS 시간 문자열"""
    offset = random.randint(-delta_min, delta_min)
    total_min = base_hour * 60 + base_min + offset
    total_min = max(0, total_min)
    h = total_min // 60
    m = total_min % 60
    return f"{h:02d}:{m:02d}:00"


def ccp_start_time_str(ccp_type, process_group_id):
    """공정별 시작 시간 (HH:MM:SS)"""
    if ccp_type == 'CCP-1B':
        if process_group_id == 1:  # 교반: 05:01 +-10min
            return random_time_str(5, 1, 10)
        elif process_group_id == 2:  # 증숙(설기): 08:00 +-20min
            return random_time_str(8, 0, 20)
        elif process_group_id == 3:  # 증숙(약식): 08:00 +-20min
            return random_time_str(8, 0, 20)
    elif ccp_type == 'CCP-2B':  # 오븐-굽기: 08:00 +-20min
        return random_time_str(8, 0, 20)
    elif ccp_type == 'CCP-4P':  # 금속검출: 08:20 +-10min (직렬 1대, 하루 1건)
        return random_time_str(8, 20, 10)
    return random_time_str(8, 0, 20)


# ── CCP form record critical limits ──
def get_cl_values(ccp_type, process_group_id):
    """CCP 기준값 반환"""
    base = {'cl_metal_sensitivity': 130, 'cl_fe_mm': 2.0, 'cl_sus_mm': 3.0}
    if ccp_type == 'CCP-1B':
        if process_group_id == 1:  # 교반-가열
            return {**base, 'cl_heat_time_min_lo': 10, 'cl_heat_temp_lo': 90.0, 'cl_pressure_mpa_lo': 0.160}
        elif process_group_id == 2:  # 증숙(설기류)
            return {**base, 'cl_heat_time_min_lo': 15, 'cl_heat_temp_lo': 95.0, 'cl_pressure_mpa_lo': 0.180}
        elif process_group_id == 3:  # 증숙(약식류)
            return {**base, 'cl_heat_time_min_lo': 15, 'cl_heat_temp_lo': 95.0, 'cl_pressure_mpa_lo': 0.180}
    elif ccp_type == 'CCP-2B':  # 오븐-굽기
        return {**base, 'cl_heat_time_min_lo': 20, 'cl_heat_temp_lo': 180.0}
    # CCP-4P has no heat params
    return base


# ═══════════════════════════════════════════════════════════════
# SQL Generation
# ═══════════════════════════════════════════════════════════════
sql_lines = []
def sql(line):
    sql_lines.append(line)


sql("SET NAMES utf8mb4;")
sql("SET @saved_sql_mode = @@sql_mode;")
sql("SET sql_mode = '';")
sql("START TRANSACTION;")
sql("")

# ── Phase 0: Create missing products ──
sql("-- ============================================")
sql("-- Phase 0: 신규 제품 등록 (3개)")
sql("-- ============================================")
next_product_id = 43  # MAX existing = 42
for pname, pcode, pcat, punit in NEW_PRODUCTS:
    sql(f"INSERT INTO h_products (product_code, product_name, category, unit, tenant_id) "
        f"VALUES ('{pcode}', '{pname}', '{pcat}', '{punit}', {TENANT});")
    PRODUCT_MAP[pname] = next_product_id
    next_product_id += 1
sql("")

# ── Phase 1: Create batches ──
sql("-- ============================================")
sql("-- Phase 1: 배치 생성 (43개)")
sql("-- ============================================")

daily = defaultdict(list)
for rec in data:
    daily[rec['date']].append(rec)

batch_id = MAX_BATCH_ID + 1  # 420
batch_map = {}  # (date, product_name) → batch_id

for date_str in sorted(daily.keys()):
    recs = daily[date_str]
    date_compact = date_str.replace('-', '')
    for seq, rec in enumerate(recs, 1):
        product_name = rec['product']
        product_id = PRODUCT_MAP[product_name]
        qty = rec['quantityKg']
        batch_code = f"{date_compact}-{seq:03d}"

        start_h = 5
        start_m = random.randint(0, 10)
        duration_h = random.randint(3, 5)
        start_ts = f"{date_str} {start_h:02d}:{start_m:02d}:00"
        end_ts = f"{date_str} {(start_h + duration_h):02d}:{random.randint(0, 59):02d}:00"
        completed_ts = end_ts

        lot_number = f"LOT-{date_compact}-{seq:04d}"
        expiry_date = (datetime.strptime(date_str, '%Y-%m-%d') + timedelta(days=30)).strftime('%Y-%m-%d')

        sql(f"INSERT INTO h_batches (id, site_id, batch_code, batch_order, product_id, "
            f"planned_quantity, actual_quantity, planned_date, start_time, end_time, "
            f"status, mode, lot_number, expiry_date, completed_at, created_by, tenant_id) "
            f"VALUES ({batch_id}, {SITE}, '{batch_code}', {seq}, {product_id}, "
            f"{qty:.2f}, {qty:.2f}, '{date_str}', '{start_ts}', '{end_ts}', "
            f"'completed', 'auto', '{lot_number}', '{expiry_date}', '{completed_ts}', {CREATED_BY}, {TENANT});")

        batch_map[(date_str, product_name)] = batch_id
        batch_id += 1

sql(f"-- Total batches: {batch_id - MAX_BATCH_ID - 1}")
sql("")

# ── Phase 2: CCP Instances + Form Records + Form Rows ──
sql("-- ============================================")
sql("-- Phase 2: CCP 기록지")
sql("-- ============================================")

ccp_id = MAX_CCP_INSTANCE_ID + 1  # 911
fr_id = MAX_FORM_RECORD_ID + 1    # 869
frw_id = MAX_FORM_ROW_ID + 1      # 39130

ccp_count = 0

for date_str in sorted(daily.keys()):
    recs = daily[date_str]
    sql(f"-- === {date_str} ===")

    # ── Phase 2-A: 열처리 CCP (CCP-1B, CCP-2B) - 배치별 생성 ──
    for seq, rec in enumerate(recs, 1):
        product_name = rec['product']
        product_id = PRODUCT_MAP[product_name]
        ccp_name = CCP_PRODUCT_NAME.get(product_name, product_name)
        bid = batch_map[(date_str, product_name)]
        qty = rec['quantityKg']
        heat_ccp_types = get_heat_ccp_types(product_name)

        for ccp_type, pg_id, pg_name in heat_ccp_types:
            cl = get_cl_values(ccp_type, pg_id)
            submit_ts = f"{date_str} {random.randint(10,12):02d}:{random.randint(0,59):02d}:00"
            approve_ts = f"{date_str} {random.randint(13,16):02d}:{random.randint(0,59):02d}:00"

            # ── h_ccp_instances ──
            sql(f"INSERT INTO h_ccp_instances (id, site_id, work_date, ccp_type, process_group_id, "
                f"product_name, product_id, batch_id, status, submitted_at, submitted_by, "
                f"approved_at, approved_by, created_by, tenant_id) "
                f"VALUES ({ccp_id}, {SITE}, '{date_str}', '{ccp_type}', {pg_id}, "
                f"'{ccp_name}', {product_id}, {bid}, 'approved', "
                f"'{submit_ts}', {CREATED_BY}, '{approve_ts}', {CREATED_BY}, {CREATED_BY}, {TENANT});")

            # ── h_ccp_form_records ──
            cl_heat_time_lo = cl.get('cl_heat_time_min_lo', 'NULL')
            cl_heat_temp_lo = cl.get('cl_heat_temp_lo', 'NULL')
            cl_pressure_lo = cl.get('cl_pressure_mpa_lo', 'NULL')
            cl_sens = cl.get('cl_metal_sensitivity', 130)
            cl_fe = cl.get('cl_fe_mm', 2.0)
            cl_sus = cl.get('cl_sus_mm', 3.0)
            batch_count = max(1, int(qty / 100))
            created_at_fr = f"{date_str} {random.randint(5,6):02d}:{random.randint(0,59):02d}:00"

            sql(f"INSERT INTO h_ccp_form_records (id, tenant_id, site_id, batch_id, ccp_type, "
                f"work_date, product_id, product_name, process_group_id, process_group_name, "
                f"planned_qty_kg, batch_count, equip_group_mode, equip_interval_min, "
                f"cl_heat_time_min_lo, cl_heat_temp_lo, cl_pressure_mpa_lo, "
                f"cl_metal_sensitivity, cl_fe_mm, cl_sus_mm, "
                f"writer_id, approver_id, status, submitted_at, approved_at, created_at) "
                f"VALUES ({fr_id}, {TENANT}, {SITE}, {bid}, '{ccp_type}', "
                f"'{date_str}', {product_id}, '{ccp_name}', {pg_id}, '{pg_name}', "
                f"{qty:.2f}, {batch_count}, 'sequential', 10, "
                f"{cl_heat_time_lo}, {cl_heat_temp_lo}, {cl_pressure_lo}, "
                f"{cl_sens}, {cl_fe}, {cl_sus}, "
                f"{CREATED_BY}, {CREATED_BY}, 'approved', '{submit_ts}', '{approve_ts}', '{created_at_fr}');")

            # ── h_ccp_form_rows (열처리) ──
            # Heat process: one row per batch_seq
            for bi in range(1, batch_count + 1):
                # Equipment name pattern from DB
                if pg_id == 1:
                    equip_name = f'교반기{bi}호기'
                    meas_time = random_time_str(5, 1 + (bi - 1) * 17, 10)
                elif pg_id == 2:
                    equip_name = f'시루{bi}호기'
                    meas_time = random_time_str(8, 0 + (bi - 1) * 15, 10)
                elif pg_id == 3:
                    equip_name = f'증숙기{bi}호기'
                    meas_time = random_time_str(8, 0 + (bi - 1) * 15, 10)
                elif pg_id == 4:  # 오븐
                    equip_name = f'오븐{bi}호기'
                    meas_time = random_time_str(8, 0 + (bi - 1) * 15, 10)
                else:
                    equip_name = f'설비{bi}'
                    meas_time = random_time_str(8, 0, 20)

                input_kg = round(qty / batch_count, 2)
                if pg_id in (2, 3):  # 증숙
                    heat_temp_c = round(random.uniform(97.0, 100.0), 1)
                    heat_time_min = random.choice([15, 18, 20, 22, 25])
                    pressure_mpa = round(random.uniform(0.180, 0.220), 3)
                elif pg_id == 4:  # 오븐
                    heat_temp_c = round(random.uniform(180.0, 200.0), 1)
                    heat_time_min = random.choice([20, 25, 30])
                    pressure_mpa = 'NULL'
                else:  # 교반
                    heat_temp_c = round(random.uniform(96.0, 99.5), 1)
                    heat_time_min = 10
                    pressure_mpa = round(random.uniform(0.160, 0.200), 3)

                temp_edge = round(random.uniform(96.0, 99.5), 1)
                temp_center = round(random.uniform(96.0, 99.5), 1)

                pressure_sql = f"{pressure_mpa}" if pressure_mpa != 'NULL' else 'NULL'

                sql(f"INSERT INTO h_ccp_form_rows (id, tenant_id, form_record_id, batch_seq, "
                    f"equipment_name, product_name, measurement_time, input_qty_kg, "
                    f"heat_time_min, heat_temp_c, pressure_mpa, temp_edge_c, temp_center_c, "
                    f"result, created_at, updated_at) "
                    f"VALUES ({frw_id}, {TENANT}, {fr_id}, {bi}, "
                    f"'{equip_name}', '{ccp_name}', '{meas_time}', {input_kg}, "
                    f"{heat_time_min}, {heat_temp_c}, {pressure_sql}, {temp_edge}, {temp_center}, "
                    f"'적합', '{date_str} {meas_time}', '{date_str} {meas_time}');")
                frw_id += 1

            fr_id += 1
            ccp_id += 1
            ccp_count += 1

    # ── Phase 2-B: 금속검출 CCP-4P - 하루 1건 (직렬, 생산량 비례 시간배분) ──
    # 테넌트 ID 2는 금속검출기 1대 직렬 운영
    # 하루 전체 생산량을 기준으로, 제품별로 생산량 비례 시간 배분
    total_daily_qty = sum(r['quantityKg'] for r in recs)
    if total_daily_qty > 0:
        pg_id_metal = 5
        pg_name_metal = '금속검출공정'
        cl_metal = get_cl_values('CCP-4P', pg_id_metal)
        cl_sens = cl_metal.get('cl_metal_sensitivity', 130)
        cl_fe = cl_metal.get('cl_fe_mm', 2.0)
        cl_sus = cl_metal.get('cl_sus_mm', 3.0)

        # 작업 시작시간: 08:20 +-10분
        metal_start_time = ccp_start_time_str('CCP-4P', pg_id_metal)
        metal_start_h = int(metal_start_time[:2])
        metal_start_m = int(metal_start_time[3:5])
        metal_start_total_min = metal_start_h * 60 + metal_start_m

        # 하루 총 작업시간 = 총 생산량에 비례 (기본 500kg당 약 1시간, 최소 2시간, 최대 9시간)
        work_hours = max(2.0, min(9.0, total_daily_qty / 500.0 * 1.0 + 1.5))
        work_minutes = int(work_hours * 60)
        metal_end_total_min = metal_start_total_min + work_minutes
        metal_end_total_min = min(metal_end_total_min, 17 * 60 + 30)  # 최대 17:30

        # h_ccp_instances - 하루 1건 (첫 번째 배치에 연결)
        first_rec = recs[0]
        first_product_name = first_rec['product']
        first_product_id = PRODUCT_MAP[first_product_name]
        first_ccp_name = CCP_PRODUCT_NAME.get(first_product_name, first_product_name)
        first_bid = batch_map[(date_str, first_product_name)]

        submit_ts = f"{date_str} {random.randint(16,17):02d}:{random.randint(0,59):02d}:00"
        approve_ts = f"{date_str} {random.randint(17,18):02d}:{random.randint(0,59):02d}:00"

        sql(f"INSERT INTO h_ccp_instances (id, site_id, work_date, ccp_type, process_group_id, "
            f"product_name, product_id, batch_id, status, submitted_at, submitted_by, "
            f"approved_at, approved_by, created_by, tenant_id) "
            f"VALUES ({ccp_id}, {SITE}, '{date_str}', 'CCP-4P', {pg_id_metal}, "
            f"'금속검출 통합', {first_product_id}, {first_bid}, 'approved', "
            f"'{submit_ts}', {CREATED_BY}, '{approve_ts}', {CREATED_BY}, {CREATED_BY}, {TENANT});")

        # h_ccp_form_records - 하루 1건
        created_at_fr = f"{date_str} {metal_start_h:02d}:{metal_start_m:02d}:00"

        sql(f"INSERT INTO h_ccp_form_records (id, tenant_id, site_id, batch_id, ccp_type, "
            f"work_date, product_id, product_name, process_group_id, process_group_name, "
            f"planned_qty_kg, batch_count, equip_group_mode, equip_interval_min, "
            f"cl_heat_time_min_lo, cl_heat_temp_lo, cl_pressure_mpa_lo, "
            f"cl_metal_sensitivity, cl_fe_mm, cl_sus_mm, "
            f"writer_id, approver_id, status, submitted_at, approved_at, created_at) "
            f"VALUES ({fr_id}, {TENANT}, {SITE}, {first_bid}, 'CCP-4P', "
            f"'{date_str}', {first_product_id}, '금속검출 통합', {pg_id_metal}, '{pg_name_metal}', "
            f"{total_daily_qty:.2f}, {len(recs)}, 'sequential', 10, "
            f"NULL, NULL, NULL, "
            f"{cl_sens}, {cl_fe}, {cl_sus}, "
            f"{CREATED_BY}, {CREATED_BY}, 'approved', '{submit_ts}', '{approve_ts}', '{created_at_fr}');")

        # h_ccp_form_rows - 제품별로 직렬 시간 배분
        # 각 제품: [sensitivity-품목시작] + [sensitivity-2시간점검...] + [sensitivity-품목종료] + [passage]
        bseq = 1
        current_min = metal_start_total_min  # 현재 시간 포인터 (분)
        total_work_min = metal_end_total_min - metal_start_total_min  # 총 작업 분

        for prod_idx, rec in enumerate(recs):
            product_name = rec['product']
            ccp_name = CCP_PRODUCT_NAME.get(product_name, product_name)
            qty = rec['quantityKg']

            # 이 제품에 할당된 시간 = 생산량 비례
            product_time_min = max(15, int(total_work_min * qty / total_daily_qty))
            product_start_min = current_min
            product_end_min = min(current_min + product_time_min, metal_end_total_min)

            # sensitivity 체크: 품목시작 + 2시간마다 점검 + 품목종료
            sens_times = []
            t = product_start_min
            while t < product_end_min:
                sh = t // 60
                sm = t % 60
                sens_times.append(f"{sh:02d}:{sm:02d}:00")
                t += 120  # 2시간 간격
            # 마지막 시간 (품목종료)
            end_sh = product_end_min // 60
            end_sm = product_end_min % 60
            end_time_str = f"{end_sh:02d}:{end_sm:02d}:00"
            if len(sens_times) == 0 or sens_times[-1] != end_time_str:
                sens_times.append(end_time_str)

            # note 할당: 품목시작 / 2시간점검 / 품목종료
            notes = []
            for i in range(len(sens_times)):
                if i == 0:
                    notes.append('품목시작')
                elif i == len(sens_times) - 1:
                    notes.append('품목종료')
                else:
                    notes.append('2시간점검')

            for i, sens_time in enumerate(sens_times):
                note_sql = f"'{notes[i]}'" if notes[i] else 'NULL'
                sql(f"INSERT INTO h_ccp_form_rows (id, tenant_id, form_record_id, batch_seq, "
                    f"equipment_type, product_name, "
                    f"metal_pass_time, metal_fe_mid, metal_sus_mid, "
                    f"metal_product_only, metal_fe_product, metal_sus_product, "
                    f"result, note, created_at, updated_at) "
                    f"VALUES ({frw_id}, {TENANT}, {fr_id}, {bseq}, "
                    f"'sensitivity', '{ccp_name}', "
                    f"'{sens_time}', 'O', 'O', 'X', 'O', 'O', "
                    f"'적합', {note_sql}, "
                    f"'{date_str} {sens_time}', '{date_str} {sens_time}');")
                frw_id += 1
                bseq += 1

            # passage row for this product
            ps_h = product_start_min // 60
            ps_m = product_start_min % 60
            pe_h = product_end_min // 60
            pe_m = product_end_min % 60
            pass_start = f"{ps_h:02d}:{ps_m:02d}:00"
            pass_end = f"{pe_h:02d}:{pe_m:02d}:00"
            pass_qty = int(qty)

            sql(f"INSERT INTO h_ccp_form_rows (id, tenant_id, form_record_id, batch_seq, "
                f"equipment_type, product_name, "
                f"pass_time_start, pass_time_end, pass_qty, detected_qty, "
                f"result, created_at, updated_at) "
                f"VALUES ({frw_id}, {TENANT}, {fr_id}, {bseq}, "
                f"'passage', '{ccp_name}', "
                f"'{pass_start}', '{pass_end}', {pass_qty}, 0, "
                f"'적합', "
                f"'{date_str} {pass_end}', '{date_str} {pass_end}');")
            frw_id += 1
            bseq += 1

            # 다음 제품 시작시간 = 이 제품 종료 + 약간의 간격 (2~5분)
            current_min = product_end_min + random.randint(2, 5)

        fr_id += 1
        ccp_id += 1
        ccp_count += 1

    sql("")

sql(f"-- Total CCP instances: {ccp_count}")
sql("")

# ── Phase 3: Material consumption (usage transactions) ──
sql("-- ============================================")
sql("-- Phase 3: 원료 소모 트랜잭션")
sql("-- ============================================")

txn_id = MAX_TXN_ID + 1
txn_count = 0

for date_str in sorted(daily.keys()):
    recs = daily[date_str]
    sql(f"-- === {date_str} 원료소모 ===")
    for rec in recs:
        if not rec.get('materialsUsed'):
            continue
        product_name = rec['product']
        bid = batch_map[(date_str, product_name)]

        for mat_name, mat_qty in rec['materialsUsed'].items():
            mat_id = MATERIAL_MAP.get(mat_name)
            if mat_id is None:
                print(f"WARNING: Material not found: {mat_name}", file=sys.stderr)
                continue

            # Find lot via material_id (any available lot, then any lot if depleted)
            sql(f"INSERT INTO h_inventory_transactions (id, lot_id, transaction_type, "
                f"quantity, unit, transaction_date, reference_type, reference_id, "
                f"purpose, notes, created_by, tenant_id) "
                f"VALUES ({txn_id}, "
                f"COALESCE("
                f"(SELECT id FROM h_inventory_lots WHERE material_id = {mat_id} AND tenant_id = {TENANT} "
                f"AND available_quantity > 0 "
                f"ORDER BY COALESCE(expiry_date, '2099-12-31'), receipt_date LIMIT 1), "
                f"(SELECT id FROM h_inventory_lots WHERE material_id = {mat_id} AND tenant_id = {TENANT} "
                f"ORDER BY id DESC LIMIT 1)"
                f"), "
                f"'usage', {mat_qty:.3f}, 'kg', '{date_str}', 'batch', {bid}, "
                f"'production', '생산투입-배치#{bid}', {CREATED_BY}, {TENANT});")
            txn_id += 1
            txn_count += 1
    sql("")

sql(f"-- Total material usage txns: {txn_count}")
sql("")

# ── Phase 4: Product LOT creation ──
sql("-- ============================================")
sql("-- Phase 4: 제품 LOT 생성 (생산 완제품 재고)")
sql("-- ============================================")

lot_id = MAX_LOT_ID + 1
lot_count = 0

for date_str in sorted(daily.keys()):
    recs = daily[date_str]
    date_compact = date_str.replace('-', '')
    for seq, rec in enumerate(recs, 1):
        product_name = rec['product']
        product_id = PRODUCT_MAP[product_name]
        qty = rec['quantityKg']
        bid = batch_map[(date_str, product_name)]
        # Use PROD-YYYYMMDD-NNN format (matching existing DB pattern)
        prod_lot_number = f"PROD-{date_compact}-{seq:03d}"
        expiry_date = (datetime.strptime(date_str, '%Y-%m-%d') + timedelta(days=30)).strftime('%Y-%m-%d')

        sql(f"INSERT INTO h_inventory_lots (id, lot_number, batch_id, product_id, "
            f"quantity, current_quantity, available_quantity, unit, "
            f"production_date, status, tenant_id) "
            f"VALUES ({lot_id}, '{prod_lot_number}', {bid}, {product_id}, "
            f"{qty:.3f}, {qty:.3f}, {qty:.3f}, 'kg', "
            f"'{date_str}', 'available', {TENANT});")

        # Receipt transaction for the production output
        sql(f"INSERT INTO h_inventory_transactions (id, lot_id, transaction_type, "
            f"quantity, unit, transaction_date, reference_type, reference_id, "
            f"purpose, notes, created_by, tenant_id) "
            f"VALUES ({txn_id}, {lot_id}, 'receipt', {qty:.3f}, 'kg', "
            f"'{date_str}', 'batch', {bid}, "
            f"'production_output', '배치 {bid} 생산완료 - {product_name} {qty}kg', "
            f"{CREATED_BY}, {TENANT});")
        txn_id += 1
        lot_id += 1
        lot_count += 1
sql("")

sql(f"-- Total product LOTs: {lot_count}")
sql("")

# ── Phase 5: Update material LOT quantities ──
sql("-- ============================================")
sql("-- Phase 5: 원료 LOT 잔량 재계산")
sql("-- ============================================")
sql(f"UPDATE h_inventory_lots il")
sql(f"  SET il.available_quantity = GREATEST(0, il.quantity - COALESCE(")
sql(f"    (SELECT SUM(t.quantity) FROM h_inventory_transactions t "
    f"WHERE t.lot_id = il.id AND t.transaction_type = 'usage' AND t.tenant_id = {TENANT}), 0)),")
sql(f"  il.current_quantity = GREATEST(0, il.quantity - COALESCE(")
sql(f"    (SELECT SUM(t.quantity) FROM h_inventory_transactions t "
    f"WHERE t.lot_id = il.id AND t.transaction_type = 'usage' AND t.tenant_id = {TENANT}), 0)),")
sql(f"  il.status = CASE")
sql(f"    WHEN GREATEST(0, il.quantity - COALESCE(")
sql(f"      (SELECT SUM(t.quantity) FROM h_inventory_transactions t "
    f"WHERE t.lot_id = il.id AND t.transaction_type = 'usage' AND t.tenant_id = {TENANT}), 0)) = 0")
sql(f"    THEN 'used'")
sql(f"    ELSE il.status")
sql(f"  END")
sql(f"WHERE il.tenant_id = {TENANT} AND il.material_id IS NOT NULL;")
sql("")

# ── Phase 6: Verification ──
sql("-- ============================================")
sql("-- Phase 6: 검증 쿼리")
sql("-- ============================================")
sql("COMMIT;")
sql("")
sql(f"SELECT '=== 배치 수 ===' as label, COUNT(*) as cnt FROM h_batches WHERE tenant_id = {TENANT} AND planned_date BETWEEN '2026-03-20' AND '2026-04-03';")
sql(f"SELECT '=== CCP 인스턴스 ===' as label, COUNT(*) as cnt FROM h_ccp_instances WHERE tenant_id = {TENANT} AND work_date BETWEEN '2026-03-20' AND '2026-04-03';")
sql(f"SELECT '=== CCP Form Records ===' as label, COUNT(*) as cnt FROM h_ccp_form_records WHERE tenant_id = {TENANT} AND work_date BETWEEN '2026-03-20' AND '2026-04-03';")
sql(f"SELECT planned_date, COUNT(*) as batches, SUM(actual_quantity) as total_kg FROM h_batches WHERE tenant_id = {TENANT} AND planned_date BETWEEN '2026-03-20' AND '2026-04-03' GROUP BY planned_date ORDER BY planned_date;")
sql(f"SELECT '=== 원료소모 ===' as label, COUNT(*) as cnt FROM h_inventory_transactions WHERE tenant_id = {TENANT} AND transaction_type = 'usage' AND transaction_date BETWEEN '2026-03-20' AND '2026-04-03';")
sql(f"SELECT '=== 제품LOT ===' as label, COUNT(*) as cnt FROM h_inventory_lots WHERE tenant_id = {TENANT} AND product_id IS NOT NULL AND production_date BETWEEN '2026-03-20' AND '2026-04-03';")
sql(f"SELECT id, product_name, product_code FROM h_products WHERE tenant_id = {TENANT} AND product_code IN ('PROD-041','PROD-042','PROD-043');")
sql("")
sql("SET sql_mode = @saved_sql_mode;")

# ── Write SQL file ──
output_path = '/tmp/import_production_0320_0403.sql'
with open(output_path, 'w', encoding='utf-8') as f:
    f.write('\n'.join(sql_lines) + '\n')

print(f"SQL file written to {output_path}")
print(f"  Lines: {len(sql_lines)}")
print(f"  Batches: {batch_id - MAX_BATCH_ID - 1}")
print(f"  CCP instances: {ccp_count}")
print(f"  Form records: {fr_id - MAX_FORM_RECORD_ID - 1}")
print(f"  Form rows: {frw_id - MAX_FORM_ROW_ID - 1}")
print(f"  Material usage txns: {txn_count}")
print(f"  Product LOTs: {lot_count}")
print(f"  Receipt txns: {lot_count}")
print(f"  New products: {len(NEW_PRODUCTS)}")
print(f"  Dates: {sorted(daily.keys())}")
print(f"\n=== Daily Summary ===")
for d in sorted(daily.keys()):
    recs = daily[d]
    total_kg = sum(r['quantityKg'] for r in recs)
    print(f"  {d}: {len(recs)} batches, {total_kg:.1f} kg")
