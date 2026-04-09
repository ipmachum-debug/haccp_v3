#!/usr/bin/env python3
"""
CCP-4P 금속검출 데이터 수정 스크립트
====================================
프로덕션 DB에서 잘못 생성된 CCP-4P 데이터를 수정합니다.

문제: 2026-03-20 ~ 2026-04-03 기간의 CCP-4P 레코드가 배치별로 생성됨 (45건)
수정: 테넌트 ID 2는 금속검출기 1대 직렬 운영이므로 하루 1건만 있어야 함 (11건)

수정 내용:
1. 기존 CCP-4P form_rows 삭제 (해당 기간)
2. 기존 CCP-4P form_records 삭제 (해당 기간, 45건 → 0)
3. 기존 CCP-4P instances 삭제 (해당 기간, 45건 → 0)
4. 새로운 CCP-4P instances 생성 (하루 1건, 11건)
5. 새로운 CCP-4P form_records 생성 (하루 1건, 11건)
6. 새로운 CCP-4P form_rows 생성 (직렬 시간배분, 품목별 sensitivity + passage)

규칙:
- 08:20 +-10분 작업시작
- 하루 총 생산량에 비례하여 제품별 시간 배분
- 각 제품: sensitivity(품목시작/2시간점검/품목종료) + passage row
- 제품 전환 시 2~5분 간격
"""
import random

random.seed(42)

TENANT = 2
SITE = 1
CREATED_BY = 4

# Production data from DB (batch info per day)
# Format: { date: [(batch_id, product_name, qty_kg), ...] }
DAILY_BATCHES = {
    '2026-03-20': [
        (420, '꿀설기', 286.30),
        (421, '다이스인절미', 66.30),
        (422, '왕찹쌀떡', 190.00),
        (423, '찹쌀떡', 1000.00),
    ],
    '2026-03-23': [
        (424, '다이스인절미', 132.70),
        (425, '마카다미아복분자왕찹쌀떡', 101.40),
        (426, '쑥판인절미', 66.40),
        (427, '오메기떡(녹차)', 100.00),  # product_id 44 → NULL in h_products, use CCP name
        (428, '왕찹쌀떡', 190.00),
        (429, '판인절미', 126.80),
    ],
    '2026-03-24': [
        (430, '꿀설기', 823.20),
        (431, '다이스인절미', 199.00),
        (432, '마카다미아 왕찹쌀떡', 100.50),
        (433, '쑥개떡', 354.00),
        (434, '영양찰떡', 68.00),  # product_id 45 → NULL
    ],
    '2026-03-25': [
        (435, '꿀설기', 238.60),
        (436, '다이스인절미', 199.00),
        (437, '롤크림떡(고구마)', 44.50),
        (438, '쑥영양찰떡', 40.70),  # product_id 43 → NULL
        (439, '우유설기', 43.70),
        (440, '카스테라앙금인절미', 114.50),
        (441, '콩고물쑥떡', 95.30),
    ],
    '2026-03-26': [
        (442, '다이스인절미', 199.00),
        (443, '쑥개떡', 531.00),
        (444, '콩고물쑥떡', 95.30),
    ],
    '2026-03-27': [
        (445, '다이스인절미', 265.40),
        (446, '모시개떡', 88.50),
        (447, '쑥개떡', 796.50),
    ],
    '2026-03-30': [
        (448, '다이스인절미', 199.00),
        (449, '모시개떡', 460.20),
        (450, '쑥개떡', 424.80),
    ],
    '2026-03-31': [
        (451, '다이스인절미', 199.00),
        (452, '단호박설기', 494.20),
        (453, '쑥개떡', 531.00),
    ],
    '2026-04-01': [
        (454, '쑥개떡', 531.00),
        (455, '쑥판인절미', 66.40),
        (456, '판인절미', 63.40),
        (457, '한입빙수 인절미', 199.00),
    ],
    '2026-04-02': [
        (458, '곤드레약식', 40.00),
        (459, '콩고물쑥떡', 381.40),
        (460, '흑임자설기', 459.00),
        (461, '흑임자약식', 40.00),
    ],
    '2026-04-03': [
        (462, '꿀설기', 489.10),
        (463, '왕찹쌀떡', 380.00),
        (464, '롤크림떡(흑임자)', 44.90),
    ],
}

# Existing CCP-4P form_record IDs to delete (from DB query)
EXISTING_FR_IDS = [
    870, 872, 874, 876,                         # 2026-03-20 (4)
    878, 881, 883, 885, 887, 889,                # 2026-03-23 (6)
    891, 893, 896, 898, 900,                     # 2026-03-24 (5)
    902, 904, 906, 908, 910, 912, 914,           # 2026-03-25 (7)
    916, 918, 920,                               # 2026-03-26 (3)
    922, 924, 926,                               # 2026-03-27 (3)
    928, 930, 932,                               # 2026-03-30 (3)
    934, 936, 938,                               # 2026-03-31 (3)
    940, 942, 944, 946,                          # 2026-04-01 (4)
    948, 950, 952, 954,                          # 2026-04-02 (4)
    956, 958, 960,                               # 2026-04-03 (3)
]

# Existing CCP-4P instance IDs to delete (from DB query)
EXISTING_CI_IDS = [
    912, 914, 916, 918,                          # 2026-03-20 (4)
    920, 923, 925, 927, 929, 931,                # 2026-03-23 (6)
    933, 935, 938, 940, 942,                     # 2026-03-24 (5)
    944, 946, 948, 950, 952, 954, 956,           # 2026-03-25 (7)
    958, 960, 962,                               # 2026-03-26 (3)
    964, 966, 968,                               # 2026-03-27 (3)
    970, 972, 974,                               # 2026-03-30 (3)
    976, 978, 980,                               # 2026-03-31 (3)
    982, 984, 986, 988,                          # 2026-04-01 (4)
    990, 992, 994, 996,                          # 2026-04-02 (4)
    998, 1000, 1002,                             # 2026-04-03 (3)
]

sql_lines = []
def sql(line):
    sql_lines.append(line)


def random_time_str(base_hour, base_min, delta_min):
    offset = random.randint(-delta_min, delta_min)
    total_min = base_hour * 60 + base_min + offset
    total_min = max(0, total_min)
    h = total_min // 60
    m = total_min % 60
    return f"{h:02d}:{m:02d}:00"


# ═══════════════════════════════════════════════════════════
# SQL Generation
# ═══════════════════════════════════════════════════════════
sql("-- ============================================")
sql("-- CCP-4P 금속검출 데이터 수정 (직렬 1대, 하루 1건)")
sql("-- 2026-03-20 ~ 2026-04-03")
sql("-- ============================================")
sql("SET NAMES utf8mb4;")
sql("SET @saved_sql_mode = @@sql_mode;")
sql("SET sql_mode = '';")
sql("SET FOREIGN_KEY_CHECKS = 0;")
sql("START TRANSACTION;")
sql("")

# ── Step 1: Delete existing wrong CCP-4P data ──
sql("-- ============================================")
sql("-- Step 1: 기존 잘못된 CCP-4P 데이터 삭제")
sql("-- ============================================")

# Delete form_rows first (FK dependency)
fr_ids_str = ','.join(str(x) for x in EXISTING_FR_IDS)
sql(f"-- 1a. form_rows 삭제 (form_record_id 기준 - 기존 잘못된 데이터)")
sql(f"DELETE FROM h_ccp_form_rows WHERE tenant_id={TENANT} AND form_record_id IN ({fr_ids_str});")
sql(f"-- 1a-2. form_rows 삭제 (이전 수정으로 생성된 데이터도 삭제)")
sql(f"DELETE FROM h_ccp_form_rows WHERE tenant_id={TENANT} AND form_record_id IN ("
    f"SELECT id FROM h_ccp_form_records WHERE tenant_id={TENANT} AND ccp_type='CCP-4P' "
    f"AND work_date BETWEEN '2026-03-20' AND '2026-04-03' AND product_name='금속검출 통합');")
sql("")

# Delete form_records
sql(f"-- 1b. form_records 삭제 (기존 잘못된 데이터)")
sql(f"DELETE FROM h_ccp_form_records WHERE tenant_id={TENANT} AND id IN ({fr_ids_str});")
sql(f"-- 1b-2. form_records 삭제 (이전 수정 데이터)")
sql(f"DELETE FROM h_ccp_form_records WHERE tenant_id={TENANT} AND ccp_type='CCP-4P' "
    f"AND work_date BETWEEN '2026-03-20' AND '2026-04-03' AND product_name='금속검출 통합';")
sql("")

# Delete instances
ci_ids_str = ','.join(str(x) for x in EXISTING_CI_IDS)
sql(f"-- 1c. instances 삭제 (기존 잘못된 데이터)")
sql(f"DELETE FROM h_ccp_instances WHERE tenant_id={TENANT} AND id IN ({ci_ids_str});")
sql(f"-- 1c-2. instances 삭제 (이전 수정 데이터)")
sql(f"DELETE FROM h_ccp_instances WHERE tenant_id={TENANT} AND ccp_type='CCP-4P' "
    f"AND work_date BETWEEN '2026-03-20' AND '2026-04-03' AND product_name='금속검출 통합';")
sql("")

# Delete old approval requests (referencing deleted form_records)
sql(f"-- 1d. 승인요청 삭제 (기존 잘못된 CCP-4P 승인요청)")
sql(f"DELETE FROM h_approval_requests WHERE tenant_id={TENANT} "
    f"AND reference_type='ccp_form_record' AND reference_id IN ({fr_ids_str});")
sql(f"-- 1d-2. 승인요청 삭제 (이전 수정으로 생성된 CCP-4P 승인요청)")
sql(f"DELETE FROM h_approval_requests WHERE tenant_id={TENANT} "
    f"AND title LIKE '%CCP-4P%' AND title LIKE '%금속검출 통합%' "
    f"AND reference_type='ccp_form_record' "
    f"AND reference_id NOT IN (SELECT id FROM h_ccp_form_records WHERE tenant_id={TENANT} AND ccp_type='CCP-4P');")
sql("")

# ── Step 2: Insert correct CCP-4P data (1 per day) ──
sql("-- ============================================")
sql("-- Step 2: 올바른 CCP-4P 데이터 생성 (하루 1건)")
sql("-- ============================================")

total_new_instances = 0
total_new_records = 0
total_new_rows = 0

for date_str in sorted(DAILY_BATCHES.keys()):
    batches = DAILY_BATCHES[date_str]
    total_daily_qty = sum(b[2] for b in batches)
    
    if total_daily_qty <= 0:
        continue
    
    sql(f"-- === {date_str}: {len(batches)} products, {total_daily_qty:.1f} kg ===")
    
    first_batch_id = batches[0][0]
    first_product_name = batches[0][1]
    
    # 작업 시작시간: 08:20 +-10분
    metal_start_time = random_time_str(8, 20, 10)
    metal_start_h = int(metal_start_time[:2])
    metal_start_m = int(metal_start_time[3:5])
    metal_start_total_min = metal_start_h * 60 + metal_start_m
    
    # 하루 총 작업시간 = 총 생산량에 비례
    work_hours = max(2.0, min(9.0, total_daily_qty / 500.0 * 1.0 + 1.5))
    work_minutes = int(work_hours * 60)
    metal_end_total_min = metal_start_total_min + work_minutes
    metal_end_total_min = min(metal_end_total_min, 17 * 60 + 30)  # 최대 17:30
    
    submit_ts = f"{date_str} {random.randint(16,17):02d}:{random.randint(0,59):02d}:00"
    approve_ts = f"{date_str} {random.randint(17,18):02d}:{random.randint(0,59):02d}:00"
    created_at_fr = f"{date_str} {metal_start_h:02d}:{metal_start_m:02d}:00"
    
    # h_ccp_instances - 하루 1건
    sql(f"INSERT INTO h_ccp_instances (site_id, work_date, ccp_type, process_group_id, "
        f"product_name, product_id, batch_id, status, submitted_at, submitted_by, "
        f"approved_at, approved_by, created_by, tenant_id) "
        f"VALUES ({SITE}, '{date_str}', 'CCP-4P', 5, "
        f"'금속검출 통합', NULL, {first_batch_id}, 'approved', "
        f"'{submit_ts}', {CREATED_BY}, '{approve_ts}', {CREATED_BY}, {CREATED_BY}, {TENANT});")
    sql(f"SET @new_ci_id = LAST_INSERT_ID();")
    total_new_instances += 1
    
    # h_ccp_form_records - 하루 1건
    sql(f"INSERT INTO h_ccp_form_records (tenant_id, site_id, batch_id, ccp_type, "
        f"work_date, product_id, product_name, process_group_id, process_group_name, "
        f"planned_qty_kg, batch_count, equip_group_mode, equip_interval_min, "
        f"cl_heat_time_min_lo, cl_heat_temp_lo, cl_pressure_mpa_lo, "
        f"cl_metal_sensitivity, cl_fe_mm, cl_sus_mm, "
        f"writer_id, approver_id, status, submitted_at, approved_at, created_at) "
        f"VALUES ({TENANT}, {SITE}, {first_batch_id}, 'CCP-4P', "
        f"'{date_str}', NULL, '금속검출 통합', 5, '금속검출공정', "
        f"{total_daily_qty:.2f}, {len(batches)}, 'sequential', 10, "
        f"NULL, NULL, NULL, "
        f"130, 2.0, 3.0, "
        f"{CREATED_BY}, {CREATED_BY}, 'approved', '{submit_ts}', '{approve_ts}', '{created_at_fr}');")
    sql(f"SET @new_fr_id = LAST_INSERT_ID();")
    total_new_records += 1
    
    # h_approval_requests - 승인요청 생성 (1 per day)
    sql(f"INSERT INTO h_approval_requests (site_id, request_type, reference_type, reference_id, "
        f"title, status, requested_by, requested_at, approved_by, approved_at, tenant_id) "
        f"VALUES ({SITE}, 'ccp_form', 'ccp_form_record', @new_fr_id, "
        f"'[CCP-CCP-4P] {date_str} 금속검출 통합', 'approved', "
        f"{CREATED_BY}, '{submit_ts}', {CREATED_BY}, '{approve_ts}', {TENANT});")
    sql(f"UPDATE h_ccp_form_records SET approval_request_id = LAST_INSERT_ID() WHERE id = @new_fr_id;")
    
    # h_ccp_form_rows - 제품별 직렬 시간 배분
    bseq = 1
    current_min = metal_start_total_min
    total_work_min = metal_end_total_min - metal_start_total_min
    
    for prod_idx, (batch_id, product_name, qty) in enumerate(batches):
        # 이 제품에 할당된 시간 = 생산량 비례 (최소 15분)
        product_time_min = max(15, int(total_work_min * qty / total_daily_qty))
        product_start_min = current_min
        product_end_min = current_min + product_time_min
        # 마지막 제품이면 남은 시간 모두 배정, 아니면 최대 17:30
        if prod_idx == len(batches) - 1:
            product_end_min = max(product_end_min, current_min + 15)  # 최소 15분
        product_end_min = min(product_end_min, 17 * 60 + 30)  # 최대 17:30
        
        # sensitivity 체크: 품목시작 + 2시간마다 점검 + 품목종료
        sens_times = []
        t = product_start_min
        while t < product_end_min:
            sh = t // 60
            sm = t % 60
            sens_times.append(f"{sh:02d}:{sm:02d}:00")
            t += 120  # 2시간 간격
        
        # 품목종료 시간
        end_sh = product_end_min // 60
        end_sm = product_end_min % 60
        end_time_str = f"{end_sh:02d}:{end_sm:02d}:00"
        if len(sens_times) == 0 or sens_times[-1] != end_time_str:
            sens_times.append(end_time_str)
        
        # note 할당
        notes = []
        for i in range(len(sens_times)):
            if i == 0:
                notes.append('품목시작')
            elif i == len(sens_times) - 1:
                notes.append('품목종료')
            else:
                notes.append('2시간점검')
        
        # sensitivity rows
        for i, sens_time in enumerate(sens_times):
            esc_name = product_name.replace("'", "\\'")
            sql(f"INSERT INTO h_ccp_form_rows (tenant_id, form_record_id, batch_seq, "
                f"product_name, "
                f"metal_pass_time, metal_fe_mid, metal_sus_mid, "
                f"metal_product_only, metal_fe_product, metal_sus_product, "
                f"result, note, created_at, updated_at) "
                f"VALUES ({TENANT}, @new_fr_id, {bseq}, "
                f"'{esc_name}', "
                f"'{sens_time}', 'O', 'O', 'X', 'O', 'O', "
                f"'적합', '{notes[i]}', "
                f"'{date_str} {sens_time}', '{date_str} {sens_time}');")
            bseq += 1
            total_new_rows += 1
        
        # passage row (ensure end > start)
        if product_end_min <= product_start_min:
            product_end_min = product_start_min + 15  # minimum 15 min
        ps_h = product_start_min // 60
        ps_m = product_start_min % 60
        pe_h = product_end_min // 60
        pe_m = product_end_min % 60
        pass_start = f"{ps_h:02d}:{ps_m:02d}:00"
        pass_end = f"{pe_h:02d}:{pe_m:02d}:00"
        pass_qty = int(qty)
        
        esc_name = product_name.replace("'", "\\'")
        sql(f"INSERT INTO h_ccp_form_rows (tenant_id, form_record_id, batch_seq, "
            f"product_name, "
            f"pass_time_start, pass_time_end, pass_qty, detected_qty, "
            f"result, created_at, updated_at) "
            f"VALUES ({TENANT}, @new_fr_id, {bseq}, "
            f"'{esc_name}', "
            f"'{pass_start}', '{pass_end}', {pass_qty}, 0, "
            f"'적합', "
            f"'{date_str} {pass_end}', '{date_str} {pass_end}');")
        bseq += 1
        total_new_rows += 1
        
        # 다음 제품 시작시간 = 이 제품 종료 + 2~5분 간격
        current_min = product_end_min + random.randint(2, 5)
    
    sql("")

sql("-- ============================================")
sql("-- Step 3: 검증 쿼리")
sql("-- ============================================")
sql("COMMIT;")
sql("SET FOREIGN_KEY_CHECKS = 1;")
sql("SET sql_mode = @saved_sql_mode;")
sql("")

# Verification queries
sql(f"-- 검증: CCP-4P 하루 1건 확인")
sql(f"SELECT work_date, COUNT(*) as cnt, GROUP_CONCAT(id) as ids, "
    f"GROUP_CONCAT(product_name SEPARATOR ' | ') as products "
    f"FROM h_ccp_form_records "
    f"WHERE tenant_id={TENANT} AND ccp_type='CCP-4P' AND work_date BETWEEN '2026-03-20' AND '2026-04-03' "
    f"GROUP BY work_date ORDER BY work_date;")
sql("")
sql(f"-- 검증: CCP-4P form_rows 수 확인")
sql(f"SELECT fr.work_date, COUNT(frw.id) as row_cnt "
    f"FROM h_ccp_form_records fr "
    f"JOIN h_ccp_form_rows frw ON frw.form_record_id = fr.id "
    f"WHERE fr.tenant_id={TENANT} AND fr.ccp_type='CCP-4P' AND fr.work_date BETWEEN '2026-03-20' AND '2026-04-03' "
    f"GROUP BY fr.work_date ORDER BY fr.work_date;")
sql("")
sql(f"-- 검증: CCP-4P instances 수 확인")
sql(f"SELECT work_date, COUNT(*) as cnt "
    f"FROM h_ccp_instances "
    f"WHERE tenant_id={TENANT} AND ccp_type='CCP-4P' AND work_date BETWEEN '2026-03-20' AND '2026-04-03' "
    f"GROUP BY work_date ORDER BY work_date;")

# Write SQL file
output_path = '/tmp/fix_ccp4p_serial.sql'
with open(output_path, 'w', encoding='utf-8') as f:
    f.write('\n'.join(sql_lines) + '\n')

print(f"SQL file written to {output_path}")
print(f"  Lines: {len(sql_lines)}")
print(f"  Deleted: {len(EXISTING_FR_IDS)} form_records, {len(EXISTING_CI_IDS)} instances")
print(f"  Created: {total_new_instances} instances, {total_new_records} form_records, {total_new_rows} form_rows")
print(f"  Dates: {sorted(DAILY_BATCHES.keys())}")
print(f"\n=== Daily Summary ===")
for d in sorted(DAILY_BATCHES.keys()):
    batches = DAILY_BATCHES[d]
    total_kg = sum(b[2] for b in batches)
    print(f"  {d}: {len(batches)} products, {total_kg:.1f} kg → 1 CCP-4P record")
