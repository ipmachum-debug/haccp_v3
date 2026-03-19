-- Excel period: 2026-01
-- Tenant: 2
-- Generated: 2026-03-20T07:56:13.314278

-- Materials with initial stock: 58

-- Receiving records from Excel: 121

-- ============================================
-- STEP 0: 기존 seed 소스의 잘못된 데이터 정리
-- ============================================

-- 이전 시드 데이터의 running_stock을 리셋 (나중에 재계산)
UPDATE material_ledger_daily SET running_stock = 0 WHERE tenant_id = 2;

-- ============================================
-- STEP 1: 초기 재고 (전월재고) 설정
-- 2025-12-31 기준 각 원재료의 시작 재고
-- ============================================

-- 간장: 전월재고 14.64kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 14.640, 14.640, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '간장'
ON DUPLICATE KEY UPDATE adjustment_qty = 14.640, running_stock = 14.640, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 강낭콩((울타리콩)): 전월재고 23.54kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 23.540, 23.540, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '강낭콩((울타리콩))'
ON DUPLICATE KEY UPDATE adjustment_qty = 23.540, running_stock = 23.540, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 건조딸기다이스(외국산): 전월재고 0.25kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 0.250, 0.250, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '건조딸기다이스(외국산)'
ON DUPLICATE KEY UPDATE adjustment_qty = 0.250, running_stock = 0.250, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 건포도: 전월재고 10.68kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 10.680, 10.680, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '건포도'
ON DUPLICATE KEY UPDATE adjustment_qty = 10.680, running_stock = 10.680, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 건호박채(중국산): 전월재고 28.69kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 28.690, 28.690, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '건호박채(중국산)'
ON DUPLICATE KEY UPDATE adjustment_qty = 28.690, running_stock = 28.690, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 검정깨(흑임자): 전월재고 9.02kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 9.020, 9.020, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '검정깨(흑임자)'
ON DUPLICATE KEY UPDATE adjustment_qty = 9.020, running_stock = 9.020, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 고구마가루: 전월재고 3.25kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 3.250, 3.250, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '고구마가루'
ON DUPLICATE KEY UPDATE adjustment_qty = 3.250, running_stock = 3.250, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 고구마무스: 전월재고 10.31kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 10.310, 10.310, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '고구마무스'
ON DUPLICATE KEY UPDATE adjustment_qty = 10.310, running_stock = 10.310, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 고려엉겅퀴((곤드레)국내산): 전월재고 5.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 5.000, 5.000, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '고려엉겅퀴((곤드레)국내산)'
ON DUPLICATE KEY UPDATE adjustment_qty = 5.000, running_stock = 5.000, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 기타가공품(복분자가루): 전월재고 1.98kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 1.980, 1.980, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '기타가공품(복분자가루)'
ON DUPLICATE KEY UPDATE adjustment_qty = 1.980, running_stock = 1.980, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 기타가공품(흑임자가루): 전월재고 10.61kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 10.610, 10.610, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '기타가공품(흑임자가루)'
ON DUPLICATE KEY UPDATE adjustment_qty = 10.610, running_stock = 10.610, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 기타설탕(흑설탕): 전월재고 71.07kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 71.070, 71.070, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '기타설탕(흑설탕)'
ON DUPLICATE KEY UPDATE adjustment_qty = 71.070, running_stock = 71.070, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 냉동쑥(국내산): 전월재고 27.46kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 27.460, 27.460, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '냉동쑥(국내산)'
ON DUPLICATE KEY UPDATE adjustment_qty = 27.460, running_stock = 27.460, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 냉동증숙고구마(중국산): 전월재고 2.25kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 2.250, 2.250, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '냉동증숙고구마(중국산)'
ON DUPLICATE KEY UPDATE adjustment_qty = 2.250, running_stock = 2.250, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 녹차가루: 전월재고 13.71kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 13.710, 13.710, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '녹차가루'
ON DUPLICATE KEY UPDATE adjustment_qty = 13.710, running_stock = 13.710, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 다크초콜릿 컴파운드칩: 전월재고 18.71kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 18.710, 18.710, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '다크초콜릿 컴파운드칩'
ON DUPLICATE KEY UPDATE adjustment_qty = 18.710, running_stock = 18.710, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 단호박분말(중국산): 전월재고 15.06kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 15.060, 15.060, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '단호박분말(중국산)'
ON DUPLICATE KEY UPDATE adjustment_qty = 15.060, running_stock = 15.060, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 당류가공품(단호박농축액): 전월재고 2.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 2.000, 2.000, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '당류가공품(단호박농축액)'
ON DUPLICATE KEY UPDATE adjustment_qty = 2.000, running_stock = 2.000, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 당류가공품(알룰로스,에리스리톨,스테비올배당체혼합): 전월재고 10.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 10.000, 10.000, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '당류가공품(알룰로스,에리스리톨,스테비올배당체혼합)'
ON DUPLICATE KEY UPDATE adjustment_qty = 10.000, running_stock = 10.000, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 대추농축액: 전월재고 1.16kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 1.160, 1.160, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '대추농축액'
ON DUPLICATE KEY UPDATE adjustment_qty = 1.160, running_stock = 1.160, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 대추채(국내산): 전월재고 20.48kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 20.480, 20.480, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '대추채(국내산)'
ON DUPLICATE KEY UPDATE adjustment_qty = 20.480, running_stock = 20.480, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 동부(미얀마산): 전월재고 119.12kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 119.120, 119.120, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '동부(미얀마산)'
ON DUPLICATE KEY UPDATE adjustment_qty = 119.120, running_stock = 119.120, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 딸기레진: 전월재고 11.81kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 11.810, 11.810, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '딸기레진'
ON DUPLICATE KEY UPDATE adjustment_qty = 11.810, running_stock = 11.810, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 마스카포네치즈: 전월재고 23.56kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 23.560, 23.560, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '마스카포네치즈'
ON DUPLICATE KEY UPDATE adjustment_qty = 23.560, running_stock = 23.560, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 마카다미아분태(호주산): 전월재고 35.26kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 35.260, 35.260, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '마카다미아분태(호주산)'
ON DUPLICATE KEY UPDATE adjustment_qty = 35.260, running_stock = 35.260, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 멥쌀(국내산): 전월재고 3167.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 3167.000, 3167.000, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '멥쌀(국내산)'
ON DUPLICATE KEY UPDATE adjustment_qty = 3167.000, running_stock = 3167.000, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 모시잎(국내산): 전월재고 60.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 60.000, 60.000, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '모시잎(국내산)'
ON DUPLICATE KEY UPDATE adjustment_qty = 60.000, running_stock = 60.000, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 물엿(저당물엿): 전월재고 75.58kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 75.580, 75.580, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '물엿(저당물엿)'
ON DUPLICATE KEY UPDATE adjustment_qty = 75.580, running_stock = 75.580, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 밤다이스: 전월재고 13.95kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 13.950, 13.950, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '밤다이스'
ON DUPLICATE KEY UPDATE adjustment_qty = 13.950, running_stock = 13.950, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 복음땅콩분태: 전월재고 3.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 3.000, 3.000, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '복음땅콩분태'
ON DUPLICATE KEY UPDATE adjustment_qty = 3.000, running_stock = 3.000, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 사양벌꿀(국내산): 전월재고 6.71kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 6.710, 6.710, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '사양벌꿀(국내산)'
ON DUPLICATE KEY UPDATE adjustment_qty = 6.710, running_stock = 6.710, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 서양호박(국내산,뉴질랜드산): 전월재고 15.87kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 15.870, 15.870, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '서양호박(국내산,뉴질랜드산)'
ON DUPLICATE KEY UPDATE adjustment_qty = 15.870, running_stock = 15.870, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 설탕: 전월재고 358.04kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 358.040, 358.040, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '설탕'
ON DUPLICATE KEY UPDATE adjustment_qty = 358.040, running_stock = 358.040, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 스트로우베리 에이드 후레쉬: 전월재고 13.18kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 13.180, 13.180, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '스트로우베리 에이드 후레쉬'
ON DUPLICATE KEY UPDATE adjustment_qty = 13.180, running_stock = 13.180, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 쑥가루(국내산): 전월재고 7.02kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 7.020, 7.020, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '쑥가루(국내산)'
ON DUPLICATE KEY UPDATE adjustment_qty = 7.020, running_stock = 7.020, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 아몬드슬라이스: 전월재고 11.15kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 11.150, 11.150, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '아몬드슬라이스'
ON DUPLICATE KEY UPDATE adjustment_qty = 11.150, running_stock = 11.150, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 연유: 전월재고 8.66kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 8.660, 8.660, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '연유'
ON DUPLICATE KEY UPDATE adjustment_qty = 8.660, running_stock = 8.660, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 완두배기: 전월재고 4.24kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 4.240, 4.240, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '완두배기'
ON DUPLICATE KEY UPDATE adjustment_qty = 4.240, running_stock = 4.240, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 자연치즈(체다치즈): 전월재고 5.17kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 5.170, 5.170, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '자연치즈(체다치즈)'
ON DUPLICATE KEY UPDATE adjustment_qty = 5.170, running_stock = 5.170, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 정제수: 전월재고 1158.49kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 1158.490, 1158.490, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '정제수'
ON DUPLICATE KEY UPDATE adjustment_qty = 1158.490, running_stock = 1158.490, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 젤라틴: 전월재고 2.49kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 2.490, 2.490, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '젤라틴'
ON DUPLICATE KEY UPDATE adjustment_qty = 2.490, running_stock = 2.490, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 준초콜릿(외국산): 전월재고 0.85kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 0.850, 0.850, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '준초콜릿(외국산)'
ON DUPLICATE KEY UPDATE adjustment_qty = 0.850, running_stock = 0.850, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 중력분: 전월재고 318.47kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 318.470, 318.470, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '중력분'
ON DUPLICATE KEY UPDATE adjustment_qty = 318.470, running_stock = 318.470, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 참깨(인도산,나이지리아산,탄자니아산,미얀마산): 전월재고 13.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 13.000, 13.000, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '참깨(인도산,나이지리아산,탄자니아산,미얀마산)'
ON DUPLICATE KEY UPDATE adjustment_qty = 13.000, running_stock = 13.000, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 찹쌀(국내산): 전월재고 5954.17kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 5954.170, 5954.170, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '찹쌀(국내산)'
ON DUPLICATE KEY UPDATE adjustment_qty = 5954.170, running_stock = 5954.170, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 천일염: 전월재고 252.4kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 252.400, 252.400, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '천일염'
ON DUPLICATE KEY UPDATE adjustment_qty = 252.400, running_stock = 252.400, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 치즈 [크림치즈]: 전월재고 54.35kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 54.350, 54.350, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '치즈 [크림치즈]'
ON DUPLICATE KEY UPDATE adjustment_qty = 54.350, running_stock = 54.350, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 코코아가공품류(코코아분말): 전월재고 24.03kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 24.030, 24.030, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '코코아가공품류(코코아분말)'
ON DUPLICATE KEY UPDATE adjustment_qty = 24.030, running_stock = 24.030, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 콩기름(대두유): 전월재고 18.24kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 18.240, 18.240, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '콩기름(대두유)'
ON DUPLICATE KEY UPDATE adjustment_qty = 18.240, running_stock = 18.240, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 해바라기씨앗: 전월재고 0.93kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 0.930, 0.930, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '해바라기씨앗'
ON DUPLICATE KEY UPDATE adjustment_qty = 0.930, running_stock = 0.930, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 호두분태(미국산): 전월재고 36.24kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 36.240, 36.240, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '호두분태(미국산)'
ON DUPLICATE KEY UPDATE adjustment_qty = 36.240, running_stock = 36.240, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 호박씨앗(외국산): 전월재고 1.48kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 1.480, 1.480, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '호박씨앗(외국산)'
ON DUPLICATE KEY UPDATE adjustment_qty = 1.480, running_stock = 1.480, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 혼합제제(떡용에스텔): 전월재고 225.37kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 225.370, 225.370, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '혼합제제(떡용에스텔)'
ON DUPLICATE KEY UPDATE adjustment_qty = 225.370, running_stock = 225.370, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 화이트초콜릿: 전월재고 13.14kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 13.140, 13.140, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '화이트초콜릿'
ON DUPLICATE KEY UPDATE adjustment_qty = 13.140, running_stock = 13.140, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 삶은팥: 전월재고 400.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 400.000, 400.000, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '삶은팥'
ON DUPLICATE KEY UPDATE adjustment_qty = 400.000, running_stock = 400.000, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 차조: 전월재고 40.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 40.000, 40.000, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '차조'
ON DUPLICATE KEY UPDATE adjustment_qty = 40.000, running_stock = 40.000, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 초코시럽: 전월재고 1.2kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 1.200, 1.200, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '초코시럽'
ON DUPLICATE KEY UPDATE adjustment_qty = 1.200, running_stock = 1.200, notes = '엑셀 전월재고 이월', source = 'excel_initial';

-- 흑멥쌀: 전월재고 30.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2025-12-31', 0, 0, 30.000, 30.000, '엑셀 전월재고 이월', 'excel_initial'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '흑멥쌀'
ON DUPLICATE KEY UPDATE adjustment_qty = 30.000, running_stock = 30.000, notes = '엑셀 전월재고 이월', source = 'excel_initial';


-- ============================================
-- STEP 2: 엑셀 입고 데이터를 material_ledger_daily에 반영
-- ============================================

-- 2026-01-03 찹쌀(국내산): 입고 200.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-01-03', 200.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '찹쌀(국내산)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 200.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-01-06 냉동쑥(국내산): 입고 10.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-01-06', 10.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '냉동쑥(국내산)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 10.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-01-09 조림류(통팥앙금): 입고 2000.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-01-09', 2000.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '조림류(통팥앙금)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 2000.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-01-10 찹쌀(국내산): 입고 420.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-01-10', 420.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '찹쌀(국내산)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 420.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-01-13 찹쌀(국내산): 입고 200.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-01-13', 200.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '찹쌀(국내산)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 200.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-01-14 물엿(저당물엿): 입고 48.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-01-14', 48.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '물엿(저당물엿)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 48.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-01-14 찹쌀(국내산): 입고 2000.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-01-14', 2000.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '찹쌀(국내산)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 2000.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-01-15 냉동쑥(국내산): 입고 20.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-01-15', 20.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '냉동쑥(국내산)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 20.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-01-15 혼합제제(떡용에스텔): 입고 54.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-01-15', 54.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '혼합제제(떡용에스텔)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 54.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-01-16 기타가공품(프리미엄카스테라가루): 입고 154.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-01-16', 154.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '기타가공품(프리미엄카스테라가루)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 154.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-01-16 두류가공품(콩고물): 입고 2.5kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-01-16', 2.500, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '두류가공품(콩고물)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 2.500, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-01-16 생크림: 입고 36.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-01-16', 36.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '생크림'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 36.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-01-16 자색고구마가루(중국산): 입고 2.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-01-16', 2.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '자색고구마가루(중국산)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 2.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-01-16 화이트초콜릿: 입고 18.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-01-16', 18.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '화이트초콜릿'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 18.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-01-17 고구마가루: 입고 4.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-01-17', 4.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '고구마가루'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 4.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-01-17 다크초콜릿 컴파운드칩: 입고 1.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-01-17', 1.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '다크초콜릿 컴파운드칩'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 1.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-01-17 물엿(저당물엿): 입고 48.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-01-17', 48.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '물엿(저당물엿)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 48.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-01-17 생크림: 입고 84.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-01-17', 84.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '생크림'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 84.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-01-17 연유: 입고 0.5kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-01-17', 0.500, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '연유'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 0.500, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-01-17 치즈 [크림치즈]: 입고 20.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-01-17', 20.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '치즈 [크림치즈]'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 20.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-01-17 화이트초콜릿: 입고 10.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-01-17', 10.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '화이트초콜릿'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 10.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-01-19 물엿(저당물엿): 입고 72.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-01-19', 72.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '물엿(저당물엿)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 72.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-01-19 설탕: 입고 300.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-01-19', 300.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '설탕'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 300.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-01-19 조림류(백옥앙금): 입고 400.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-01-19', 400.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '조림류(백옥앙금)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 400.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-01-20 녹차가루: 입고 2.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-01-20', 2.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '녹차가루'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 2.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-01-21 설탕: 입고 1260.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-01-21', 1260.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '설탕'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 1260.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-01-21 옥수수전분: 입고 80.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-01-21', 80.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '옥수수전분'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 80.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-01-21 찰옥수수전분(미국산): 입고 1000.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-01-21', 1000.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '찰옥수수전분(미국산)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 1000.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-01-22 두류가공품(콩고물): 입고 60.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-01-22', 60.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '두류가공품(콩고물)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 60.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-01-22 물엿(저당물엿): 입고 72.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-01-22', 72.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '물엿(저당물엿)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 72.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-01-24 조림류(백옥앙금): 입고 60.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-01-24', 60.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '조림류(백옥앙금)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 60.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-01-27 조림류(통팥앙금): 입고 2000.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-01-27', 2000.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '조림류(통팥앙금)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 2000.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-01-29 옥수수전분: 입고 80.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-01-29', 80.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '옥수수전분'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 80.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-01-30 설탕: 입고 1260.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-01-30', 1260.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '설탕'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 1260.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-01-30 쑥가루(국내산): 입고 8.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-01-30', 8.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '쑥가루(국내산)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 8.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-01-30 옥수수전분: 입고 500.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-01-30', 500.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '옥수수전분'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 500.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-01-30 찰옥수수전분(미국산): 입고 780.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-01-30', 780.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '찰옥수수전분(미국산)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 780.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-01-30 천일염: 입고 160.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-01-30', 160.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '천일염'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 160.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-01-31 검정콩: 입고 40.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-01-31', 40.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '검정콩'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 40.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-01-31 찹쌀(국내산): 입고 1600.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-01-31', 1600.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '찹쌀(국내산)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 1600.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-02-03 두류가공품(콩고물): 입고 60.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-02-03', 60.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '두류가공품(콩고물)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 60.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-02-03 조림류(통팥앙금): 입고 2000.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-02-03', 2000.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '조림류(통팥앙금)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 2000.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-02-04 마카다미아분태(호주산): 입고 22.68kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-02-04', 22.680, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '마카다미아분태(호주산)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 22.680, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-02-04 혼합제제(떡용에스텔): 입고 36.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-02-04', 36.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '혼합제제(떡용에스텔)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 36.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-02-06 냉동쑥(국내산): 입고 20.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-02-06', 20.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '냉동쑥(국내산)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 20.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-02-06 녹차가루: 입고 4.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-02-06', 4.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '녹차가루'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 4.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-02-06 동부(미얀마산): 입고 20.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-02-06', 20.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '동부(미얀마산)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 20.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-02-06 설탕: 입고 2520.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-02-06', 2520.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '설탕'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 2520.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-02-06 쑥가루(국내산): 입고 8.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-02-06', 8.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '쑥가루(국내산)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 8.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-02-06 조림류(백옥앙금): 입고 60.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-02-06', 60.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '조림류(백옥앙금)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 60.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-02-06 찹쌀(국내산): 입고 1800.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-02-06', 1800.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '찹쌀(국내산)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 1800.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-02-06 호두분태(미국산): 입고 13.61kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-02-06', 13.610, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '호두분태(미국산)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 13.610, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-02-09 고구마가루: 입고 2.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-02-09', 2.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '고구마가루'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 2.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-02-09 고구마무스: 입고 5.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-02-09', 5.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '고구마무스'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 5.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-02-09 두류가공품(콩고물): 입고 60.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-02-09', 60.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '두류가공품(콩고물)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 60.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-02-09 딸기레진: 입고 4.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-02-09', 4.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '딸기레진'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 4.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-02-09 딸기분말(스트로우베리에이드(분말)): 입고 2.1kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-02-09', 2.100, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '딸기분말(스트로우베리에이드(분말))'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 2.100, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-02-09 생크림: 입고 48.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-02-09', 48.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '생크림'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 48.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-02-09 쑥가루(국내산): 입고 8.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-02-09', 8.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '쑥가루(국내산)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 8.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-02-09 젤라틴: 입고 2.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-02-09', 2.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '젤라틴'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 2.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-02-09 조림류(백옥앙금): 입고 120.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-02-09', 120.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '조림류(백옥앙금)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 120.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-02-09 치즈 [크림치즈]: 입고 60.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-02-09', 60.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '치즈 [크림치즈]'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 60.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-02-10 연유: 입고 0.5kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-02-10', 0.500, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '연유'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 0.500, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-02-10 중력분: 입고 20.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-02-10', 20.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '중력분'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 20.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-02-11 조림류(통팥앙금): 입고 3000.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-02-11', 3000.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '조림류(통팥앙금)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 3000.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-02-11 찰옥수수전분(미국산): 입고 1000.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-02-11', 1000.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '찰옥수수전분(미국산)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 1000.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-02-13 기타가공품(프리미엄카스테라가루): 입고 30.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-02-13', 30.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '기타가공품(프리미엄카스테라가루)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 30.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-02-13 기타가공품(흑임자가루): 입고 6.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-02-13', 6.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '기타가공품(흑임자가루)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 6.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-02-13 냉동쑥(국내산): 입고 20.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-02-13', 20.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '냉동쑥(국내산)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 20.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-02-13 동부(미얀마산): 입고 20.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-02-13', 20.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '동부(미얀마산)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 20.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-02-13 복음땅콩분태: 입고 10.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-02-13', 10.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '복음땅콩분태'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 10.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-02-13 자색고구마가루(중국산): 입고 4.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-02-13', 4.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '자색고구마가루(중국산)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 4.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-02-13 조림류(백옥앙금): 입고 60.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-02-13', 60.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '조림류(백옥앙금)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 60.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-02-13 해바라기씨앗: 입고 10.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-02-13', 10.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '해바라기씨앗'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 10.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-02-13 호박씨앗(외국산): 입고 10.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-02-13', 10.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '호박씨앗(외국산)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 10.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-02-13 혼합제제(떡용에스텔): 입고 54.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-02-13', 54.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '혼합제제(떡용에스텔)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 54.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-02-14 자색고구마가루(중국산): 입고 2.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-02-14', 2.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '자색고구마가루(중국산)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 2.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-02-19 두류가공품(콩고물): 입고 100.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-02-19', 100.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '두류가공품(콩고물)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 100.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-02-24 물엿(저당물엿): 입고 144.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-02-24', 144.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '물엿(저당물엿)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 144.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-02-24 조림류(백옥앙금): 입고 40.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-02-24', 40.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '조림류(백옥앙금)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 40.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-02-24 중력분: 입고 200.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-02-24', 200.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '중력분'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 200.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-02-24 찹쌀(국내산): 입고 1000.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-02-24', 1000.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '찹쌀(국내산)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 1000.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-02-25 냉동쑥(국내산): 입고 40.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-02-25', 40.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '냉동쑥(국내산)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 40.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-02-26 대추농축액: 입고 4.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-02-26', 4.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '대추농축액'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 4.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-02-26 해바라기씨앗: 입고 6.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-02-26', 6.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '해바라기씨앗'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 6.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-03-01 냉동쑥(국내산): 입고 40.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-03-01', 40.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '냉동쑥(국내산)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 40.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-03-01 천일염: 입고 320.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-03-01', 320.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '천일염'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 320.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-03-01 혼합제제(떡용에스텔): 입고 108.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-03-01', 108.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '혼합제제(떡용에스텔)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 108.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-03-04 쑥분말: 입고 16.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-03-04', 16.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '쑥분말'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 16.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-03-04 찰옥수수전분(미국산): 입고 2000.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-03-04', 2000.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '찰옥수수전분(미국산)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 2000.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-03-04 찹쌀(국내산): 입고 2400.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-03-04', 2400.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '찹쌀(국내산)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 2400.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-03-05 기타가공품(프리미엄카스테라가루): 입고 288.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-03-05', 288.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '기타가공품(프리미엄카스테라가루)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 288.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-03-05 냉동쑥(국내산): 입고 80.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-03-05', 80.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '냉동쑥(국내산)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 80.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-03-06 쑥분말: 입고 160.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-03-06', 160.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '쑥분말'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 160.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-03-06 젤라틴: 입고 4.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-03-06', 4.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '젤라틴'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 4.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-03-09 물엿(저당물엿): 입고 480.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-03-09', 480.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '물엿(저당물엿)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 480.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-03-09 천일염: 입고 100.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-03-09', 100.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '천일염'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 100.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-03-09 콩기름(대두유): 입고 90.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-03-09', 90.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '콩기름(대두유)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 90.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-03-09 혼합제제(떡용에스텔): 입고 180.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-03-09', 180.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '혼합제제(떡용에스텔)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 180.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-03-11 냉동쑥(국내산): 입고 40.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-03-11', 40.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '냉동쑥(국내산)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 40.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';

-- 2026-03-11 찹쌀(국내산): 입고 1200.0kg
INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
SELECT 2, m.id, '2026-03-11', 1200.000, 0, 0, 0, '엑셀 입고', 'excel_receiving'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '찹쌀(국내산)'
ON DUPLICATE KEY UPDATE receiving_qty = receiving_qty + 1200.000, notes = CONCAT(COALESCE(notes,''), ' +엑셀입고'), source = 'excel_receiving';


-- ============================================
-- STEP 3: running_stock 재계산
-- 원재료별 날짜순으로 누적 계산
-- ============================================


-- running_stock 재계산 프로시저
DELIMITER //
DROP PROCEDURE IF EXISTS recalc_running_stock //
CREATE PROCEDURE recalc_running_stock(IN p_tenant_id INT)
BEGIN
    DECLARE done INT DEFAULT FALSE;
    DECLARE v_mat_id BIGINT;
    DECLARE v_running DECIMAL(12,3);
    DECLARE v_id BIGINT;
    DECLARE v_recv DECIMAL(12,3);
    DECLARE v_usage DECIMAL(12,3);
    DECLARE v_adj DECIMAL(12,3);
    
    -- 원재료 커서
    DECLARE mat_cursor CURSOR FOR
        SELECT DISTINCT material_id FROM material_ledger_daily WHERE tenant_id = p_tenant_id;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;
    
    OPEN mat_cursor;
    mat_loop: LOOP
        FETCH mat_cursor INTO v_mat_id;
        IF done THEN LEAVE mat_loop; END IF;
        
        SET v_running = 0;
        
        -- 해당 원재료의 모든 일별 레코드를 날짜순으로 업데이트
        BEGIN
            DECLARE done2 INT DEFAULT FALSE;
            DECLARE day_cursor CURSOR FOR
                SELECT id, COALESCE(receiving_qty,0), COALESCE(usage_qty,0), COALESCE(adjustment_qty,0)
                FROM material_ledger_daily
                WHERE tenant_id = p_tenant_id AND material_id = v_mat_id
                ORDER BY ledger_date ASC, id ASC;
            DECLARE CONTINUE HANDLER FOR NOT FOUND SET done2 = TRUE;
            
            OPEN day_cursor;
            day_loop: LOOP
                FETCH day_cursor INTO v_id, v_recv, v_usage, v_adj;
                IF done2 THEN LEAVE day_loop; END IF;
                
                SET v_running = v_running + v_recv - v_usage + v_adj;
                UPDATE material_ledger_daily SET running_stock = v_running WHERE id = v_id;
            END LOOP day_loop;
            CLOSE day_cursor;
        END;
        
    END LOOP mat_loop;
    CLOSE mat_cursor;
    
    SELECT 'running_stock recalculation complete' as result;
END //
DELIMITER ;

CALL recalc_running_stock(2);
DROP PROCEDURE IF EXISTS recalc_running_stock;


-- ============================================
-- STEP 4: h_inventory_transactions에 usage 레코드 생성
-- (batch 기반)
-- ============================================


-- 기존 usage 트랜잭션 삭제 (재생성)
DELETE FROM h_inventory_transactions WHERE tenant_id = 2 AND transaction_type = 'usage';

-- batch_inputs 기반으로 usage 트랜잭션 생성
-- lot_id가 NULL인 경우 해당 material의 첫 번째 available LOT 사용
INSERT INTO h_inventory_transactions
    (tenant_id, lot_id, transaction_type, quantity, unit, transaction_date,
     reference_type, reference_id, source_type, notes, created_by)
SELECT 
    bi.tenant_id,
    COALESCE(bi.lot_id, (
        SELECT il.id FROM h_inventory_lots il
        WHERE il.tenant_id = bi.tenant_id 
          AND il.material_id = bi.material_id 
          AND il.status = 'available'
        ORDER BY il.receipt_date ASC, il.id ASC
        LIMIT 1
    )),
    'usage',
    COALESCE(bi.actual_quantity, bi.planned_quantity),
    COALESCE(bi.unit, 'kg'),
    b.planned_date,
    'batch',
    bi.batch_id,
    'batch_completion',
    CONCAT('생산투입-배치#', bi.batch_id),
    1
FROM h_batch_inputs bi
JOIN h_batches b ON b.id = bi.batch_id AND b.tenant_id = bi.tenant_id
WHERE bi.tenant_id = 2
  AND b.status = 'completed'
  AND COALESCE(bi.actual_quantity, bi.planned_quantity) > 0;


-- ============================================
-- STEP 5: 엑셀의 입고 데이터를 h_inventory_lots에도 반영
-- (기존 LOT에 없는 입고건만)
-- ============================================

-- 2026-01-03 찹쌀(국내산) 200.0kg from 농업회사법인㈜이수농산
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260103-0001', m.id, 200.000, 200.000, 200.000,
       'kg', 4000.00, '2026-01-03', '농업회사법인㈜이수농산', 
       '2025-11-24', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '찹쌀(국내산)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-01-03' AND ABS(il.quantity - 200.000) < 0.01
);

-- 2026-01-06 냉동쑥(국내산) 10.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260106-0002', m.id, 10.000, 10.000, 10.000,
       'kg', 7800.00, '2026-01-06', '네이버파이낸셜', 
       '2027-03-16', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '냉동쑥(국내산)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-01-06' AND ABS(il.quantity - 10.000) < 0.01
);

-- 2026-01-09 조림류(통팥앙금) 1500.0kg from 주식회사동아식품
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260109-0003', m.id, 1500.000, 1500.000, 1500.000,
       'kg', 2750.00, '2026-01-09', '주식회사동아식품', 
       '2026-04-06', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '조림류(통팥앙금)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-01-09' AND ABS(il.quantity - 1500.000) < 0.01
);

-- 2026-01-09 조림류(통팥앙금) 500.0kg from 주식회사동아식품
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260109-0004', m.id, 500.000, 500.000, 500.000,
       'kg', 2860.00, '2026-01-09', '주식회사동아식품', 
       '2026-04-07', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '조림류(통팥앙금)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-01-09' AND ABS(il.quantity - 500.000) < 0.01
);

-- 2026-01-10 찹쌀(국내산) 420.0kg from 농업회사법인㈜이수농산
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260110-0005', m.id, 420.000, 420.000, 420.000,
       'kg', 4000.00, '2026-01-10', '농업회사법인㈜이수농산', 
       '2025-10-31', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '찹쌀(국내산)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-01-10' AND ABS(il.quantity - 420.000) < 0.01
);

-- 2026-01-13 찹쌀(국내산) 200.0kg from 농업회사법인㈜이수농산
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260113-0006', m.id, 200.000, 200.000, 200.000,
       'kg', 4000.00, '2026-01-13', '농업회사법인㈜이수농산', 
       '2025-10-31', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '찹쌀(국내산)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-01-13' AND ABS(il.quantity - 200.000) < 0.01
);

-- 2026-01-14 물엿(저당물엿) 48.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260114-0007', m.id, 48.000, 48.000, 48.000,
       'kg', 1625.00, '2026-01-14', '네이버파이낸셜', 
       '2028-01-09', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '물엿(저당물엿)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-01-14' AND ABS(il.quantity - 48.000) < 0.01
);

-- 2026-01-14 찹쌀(국내산) 2000.0kg from 현대농산
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260114-0008', m.id, 2000.000, 2000.000, 2000.000,
       'kg', 3287.50, '2026-01-14', '현대농산', 
       '2026-01-02', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '찹쌀(국내산)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-01-14' AND ABS(il.quantity - 2000.000) < 0.01
);

-- 2026-01-15 냉동쑥(국내산) 20.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260115-0009', m.id, 20.000, 20.000, 20.000,
       'kg', 7800.00, '2026-01-15', '네이버파이낸셜', 
       '2027-03-16', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '냉동쑥(국내산)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-01-15' AND ABS(il.quantity - 20.000) < 0.01
);

-- 2026-01-15 혼합제제(떡용에스텔) 54.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260115-0010', m.id, 54.000, 54.000, 54.000,
       'kg', 5361.11, '2026-01-15', '네이버파이낸셜', 
       '2026-12-30', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '혼합제제(떡용에스텔)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-01-15' AND ABS(il.quantity - 54.000) < 0.01
);

-- 2026-01-16 기타가공품(프리미엄카스테라가루) 144.0kg from ㈜한강에프디에스
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260116-0011', m.id, 144.000, 144.000, 144.000,
       'kg', 7150.00, '2026-01-16', '㈜한강에프디에스', 
       '2026-06-03', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '기타가공품(프리미엄카스테라가루)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-01-16' AND ABS(il.quantity - 144.000) < 0.01
);

-- 2026-01-16 화이트초콜릿 18.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260116-0012', m.id, 18.000, 18.000, 18.000,
       'kg', 9200.00, '2026-01-16', '네이버파이낸셜', 
       '2026-10-15', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '화이트초콜릿'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-01-16' AND ABS(il.quantity - 18.000) < 0.01
);

-- 2026-01-16 기타가공품(프리미엄카스테라가루) 10.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260116-0013', m.id, 10.000, 10.000, 10.000,
       'kg', 12200.00, '2026-01-16', '네이버파이낸셜', 
       '2026-07-14', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '기타가공품(프리미엄카스테라가루)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-01-16' AND ABS(il.quantity - 10.000) < 0.01
);

-- 2026-01-16 자색고구마가루(중국산) 2.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260116-0014', m.id, 2.000, 2.000, 2.000,
       'kg', 11500.00, '2026-01-16', '네이버파이낸셜', 
       '2027-10-13', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '자색고구마가루(중국산)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-01-16' AND ABS(il.quantity - 2.000) < 0.01
);

-- 2026-01-16 두류가공품(콩고물) 2.5kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260116-0015', m.id, 2.500, 2.500, 2.500,
       'kg', 6600.00, '2026-01-16', '네이버파이낸셜', 
       '2026-05-09', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '두류가공품(콩고물)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-01-16' AND ABS(il.quantity - 2.500) < 0.01
);

-- 2026-01-16 생크림 36.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260116-0016', m.id, 36.000, 36.000, 36.000,
       'kg', 7500.00, '2026-01-16', '네이버파이낸셜', 
       '2026-10-27', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '생크림'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-01-16' AND ABS(il.quantity - 36.000) < 0.01
);

-- 2026-01-17 고구마가루 4.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260117-0017', m.id, 4.000, 4.000, 4.000,
       'kg', 12000.00, '2026-01-17', '네이버파이낸셜', 
       '2027-12-21', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '고구마가루'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-01-17' AND ABS(il.quantity - 4.000) < 0.01
);

-- 2026-01-17 치즈 [크림치즈] 20.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260117-0018', m.id, 20.000, 20.000, 20.000,
       'kg', 39700.00, '2026-01-17', '네이버파이낸셜', 
       '2026-08-11', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '치즈 [크림치즈]'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-01-17' AND ABS(il.quantity - 20.000) < 0.01
);

-- 2026-01-17 물엿(저당물엿) 48.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260117-0019', m.id, 48.000, 48.000, 48.000,
       'kg', 1625.00, '2026-01-17', '네이버파이낸셜', 
       '2028-01-09', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '물엿(저당물엿)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-01-17' AND ABS(il.quantity - 48.000) < 0.01
);

-- 2026-01-17 다크초콜릿 컴파운드칩 1.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260117-0020', m.id, 1.000, 1.000, 1.000,
       'kg', 23900.00, '2026-01-17', '네이버파이낸셜', 
       '2026-09-01', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '다크초콜릿 컴파운드칩'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-01-17' AND ABS(il.quantity - 1.000) < 0.01
);

-- 2026-01-17 생크림 84.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260117-0021', m.id, 84.000, 84.000, 84.000,
       'kg', 7500.00, '2026-01-17', '네이버파이낸셜', 
       '2026-10-27', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '생크림'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-01-17' AND ABS(il.quantity - 84.000) < 0.01
);

-- 2026-01-17 화이트초콜릿 10.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260117-0022', m.id, 10.000, 10.000, 10.000,
       'kg', 10200.00, '2026-01-17', '네이버파이낸셜', 
       '2026-09-01', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '화이트초콜릿'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-01-17' AND ABS(il.quantity - 10.000) < 0.01
);

-- 2026-01-17 연유 0.5kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260117-0023', m.id, 0.500, 0.500, 0.500,
       'kg', 28000.00, '2026-01-17', '네이버파이낸셜', 
       '2026-04-06', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '연유'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-01-17' AND ABS(il.quantity - 0.500) < 0.01
);

-- 2026-01-19 조림류(백옥앙금) 400.0kg from ㈜에스디컴퍼니
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260119-0024', m.id, 400.000, 400.000, 400.000,
       'kg', 1584.00, '2026-01-19', '㈜에스디컴퍼니', 
       '2026-04-30', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '조림류(백옥앙금)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-01-19' AND ABS(il.quantity - 400.000) < 0.01
);

-- 2026-01-19 설탕 300.0kg from ㈜에스디컴퍼니
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260119-0025', m.id, 300.000, 300.000, 300.000,
       'kg', 1320.00, '2026-01-19', '㈜에스디컴퍼니', 
       '2025-12-21', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '설탕'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-01-19' AND ABS(il.quantity - 300.000) < 0.01
);

-- 2026-01-19 물엿(저당물엿) 72.0kg from ㈜에스디컴퍼니
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260119-0026', m.id, 72.000, 72.000, 72.000,
       'kg', 1695.83, '2026-01-19', '㈜에스디컴퍼니', 
       '2026-09-09', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '물엿(저당물엿)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-01-19' AND ABS(il.quantity - 72.000) < 0.01
);

-- 2026-01-20 녹차가루 2.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260120-0027', m.id, 2.000, 2.000, 2.000,
       'kg', 28000.00, '2026-01-20', '네이버파이낸셜', 
       '2027-12-03', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '녹차가루'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-01-20' AND ABS(il.quantity - 2.000) < 0.01
);

-- 2026-01-21 옥수수전분 80.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260121-0028', m.id, 80.000, 80.000, 80.000,
       'kg', 1175.00, '2026-01-21', '네이버파이낸셜', 
       '2025-11-21', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '옥수수전분'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-01-21' AND ABS(il.quantity - 80.000) < 0.01
);

-- 2026-01-21 찰옥수수전분(미국산) 1000.0kg from 대진유통
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260121-0029', m.id, 1000.000, 1000.000, 1000.000,
       'kg', 2900.00, '2026-01-21', '대진유통', 
       '2026-11-24', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '찰옥수수전분(미국산)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-01-21' AND ABS(il.quantity - 1000.000) < 0.01
);

-- 2026-01-21 설탕 1260.0kg from 대진유통
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260121-0030', m.id, 1260.000, 1260.000, 1260.000,
       'kg', 1166.67, '2026-01-21', '대진유통', 
       '2026-01-02', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '설탕'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-01-21' AND ABS(il.quantity - 1260.000) < 0.01
);

-- 2026-01-22 물엿(저당물엿) 72.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260122-0031', m.id, 72.000, 72.000, 72.000,
       'kg', 1350.00, '2026-01-22', '네이버파이낸셜', 
       '2027-12-16', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '물엿(저당물엿)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-01-22' AND ABS(il.quantity - 72.000) < 0.01
);

-- 2026-01-22 두류가공품(콩고물) 60.0kg from 인투푸드
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260122-0032', m.id, 60.000, 60.000, 60.000,
       'kg', 6652.00, '2026-01-22', '인투푸드', 
       '2026-07-04', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '두류가공품(콩고물)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-01-22' AND ABS(il.quantity - 60.000) < 0.01
);

-- 2026-01-24 조림류(백옥앙금) 60.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260124-0033', m.id, 60.000, 60.000, 60.000,
       'kg', 3480.00, '2026-01-24', '네이버파이낸셜', 
       '2026-06-08', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '조림류(백옥앙금)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-01-24' AND ABS(il.quantity - 60.000) < 0.01
);

-- 2026-01-27 조림류(통팥앙금) 2000.0kg from 주식회사동아식품
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260127-0034', m.id, 2000.000, 2000.000, 2000.000,
       'kg', 2750.00, '2026-01-27', '주식회사동아식품', 
       '2026-04-22', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '조림류(통팥앙금)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-01-27' AND ABS(il.quantity - 2000.000) < 0.01
);

-- 2026-01-29 옥수수전분 80.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260129-0035', m.id, 80.000, 80.000, 80.000,
       'kg', 1175.00, '2026-01-29', '네이버파이낸셜', 
       '2025-11-21', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '옥수수전분'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-01-29' AND ABS(il.quantity - 80.000) < 0.01
);

-- 2026-01-30 천일염 160.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260130-0036', m.id, 160.000, 160.000, 160.000,
       'kg', 620.00, '2026-01-30', '네이버파이낸셜', 
       NULL, 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '천일염'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-01-30' AND ABS(il.quantity - 160.000) < 0.01
);

-- 2026-01-30 쑥가루(국내산) 8.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260130-0037', m.id, 8.000, 8.000, 8.000,
       'kg', 14100.00, '2026-01-30', '네이버파이낸셜', 
       '2027-08-04', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '쑥가루(국내산)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-01-30' AND ABS(il.quantity - 8.000) < 0.01
);

-- 2026-01-30 설탕 1260.0kg from 대진유통
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260130-0038', m.id, 1260.000, 1260.000, 1260.000,
       'kg', 1166.67, '2026-01-30', '대진유통', 
       '2026-01-10', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '설탕'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-01-30' AND ABS(il.quantity - 1260.000) < 0.01
);

-- 2026-01-30 찰옥수수전분(미국산) 780.0kg from 대진유통
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260130-0039', m.id, 780.000, 780.000, 780.000,
       'kg', 2900.00, '2026-01-30', '대진유통', 
       '2026-01-24', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '찰옥수수전분(미국산)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-01-30' AND ABS(il.quantity - 780.000) < 0.01
);

-- 2026-01-30 옥수수전분 500.0kg from 대진유통
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260130-0040', m.id, 500.000, 500.000, 500.000,
       'kg', 1225.00, '2026-01-30', '대진유통', 
       '2028-01-23', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '옥수수전분'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-01-30' AND ABS(il.quantity - 500.000) < 0.01
);

-- 2026-01-31 찹쌀(국내산) 1600.0kg from 현대농산
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260131-0041', m.id, 1600.000, 1600.000, 1600.000,
       'kg', 3287.50, '2026-01-31', '현대농산', 
       '2026-01-19', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '찹쌀(국내산)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-01-31' AND ABS(il.quantity - 1600.000) < 0.01
);

-- 2026-01-31 검정콩 40.0kg from 현대농산
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260131-0042', m.id, 40.000, 40.000, 40.000,
       'kg', 8000.00, '2026-01-31', '현대농산', 
       '2027-01-14', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '검정콩'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-01-31' AND ABS(il.quantity - 40.000) < 0.01
);

-- 2026-02-03 두류가공품(콩고물) 60.0kg from 인투푸드
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260203-0043', m.id, 60.000, 60.000, 60.000,
       'kg', 6652.00, '2026-02-03', '인투푸드', 
       '2026-07-11', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '두류가공품(콩고물)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-03' AND ABS(il.quantity - 60.000) < 0.01
);

-- 2026-02-03 조림류(통팥앙금) 1000.0kg from 주식회사동아식품
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260203-0044', m.id, 1000.000, 1000.000, 1000.000,
       'kg', 2750.00, '2026-02-03', '주식회사동아식품', 
       '2026-04-29', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '조림류(통팥앙금)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-03' AND ABS(il.quantity - 1000.000) < 0.01
);

-- 2026-02-03 조림류(통팥앙금) 1000.0kg from 주식회사동아식품
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260203-0045', m.id, 1000.000, 1000.000, 1000.000,
       'kg', 2860.00, '2026-02-03', '주식회사동아식품', 
       '2026-04-29', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '조림류(통팥앙금)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-03' AND ABS(il.quantity - 1000.000) < 0.01
);

-- 2026-02-04 혼합제제(떡용에스텔) 36.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260204-0046', m.id, 36.000, 36.000, 36.000,
       'kg', 5500.00, '2026-02-04', '네이버파이낸셜', 
       '2026-12-30', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '혼합제제(떡용에스텔)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-04' AND ABS(il.quantity - 36.000) < 0.01
);

-- 2026-02-04 마카다미아분태(호주산) 22.68kg from 신동케미칼㈜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260204-0047', m.id, 22.680, 22.680, 22.680,
       'kg', 24500.00, '2026-02-04', '신동케미칼㈜', 
       '2026-05-08', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '마카다미아분태(호주산)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-04' AND ABS(il.quantity - 22.680) < 0.01
);

-- 2026-02-06 호두분태(미국산) 13.61kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260206-0048', m.id, 13.610, 13.610, 13.610,
       'kg', 12490.82, '2026-02-06', '네이버파이낸셜', 
       '2025-11-18', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '호두분태(미국산)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-06' AND ABS(il.quantity - 13.610) < 0.01
);

-- 2026-02-06 조림류(백옥앙금) 60.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260206-0049', m.id, 60.000, 60.000, 60.000,
       'kg', 3480.00, '2026-02-06', '네이버파이낸셜', 
       '2026-06-08', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '조림류(백옥앙금)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-06' AND ABS(il.quantity - 60.000) < 0.01
);

-- 2026-02-06 동부(미얀마산) 20.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260206-0050', m.id, 20.000, 20.000, 20.000,
       'kg', 3215.00, '2026-02-06', '네이버파이낸셜', 
       NULL, 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '동부(미얀마산)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-06' AND ABS(il.quantity - 20.000) < 0.01
);

-- 2026-02-06 냉동쑥(국내산) 20.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260206-0051', m.id, 20.000, 20.000, 20.000,
       'kg', 7800.00, '2026-02-06', '네이버파이낸셜', 
       '2027-05-08', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '냉동쑥(국내산)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-06' AND ABS(il.quantity - 20.000) < 0.01
);

-- 2026-02-06 쑥가루(국내산) 8.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260206-0052', m.id, 8.000, 8.000, 8.000,
       'kg', 14100.00, '2026-02-06', '네이버파이낸셜', 
       '2027-08-04', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '쑥가루(국내산)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-06' AND ABS(il.quantity - 8.000) < 0.01
);

-- 2026-02-06 녹차가루 4.0kg from 인투푸드
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260206-0053', m.id, 4.000, 4.000, 4.000,
       'kg', 34680.00, '2026-02-06', '인투푸드', 
       '2027-12-03', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '녹차가루'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-06' AND ABS(il.quantity - 4.000) < 0.01
);

-- 2026-02-06 설탕 2520.0kg from 대진유통
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260206-0054', m.id, 2520.000, 2520.000, 2520.000,
       'kg', 1153.33, '2026-02-06', '대진유통', 
       '2026-01-10', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '설탕'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-06' AND ABS(il.quantity - 2520.000) < 0.01
);

-- 2026-02-06 찹쌀(국내산) 1800.0kg from 현대농산
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260206-0055', m.id, 1800.000, 1800.000, 1800.000,
       'kg', 3287.50, '2026-02-06', '현대농산', 
       '2026-01-19', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '찹쌀(국내산)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-06' AND ABS(il.quantity - 1800.000) < 0.01
);

-- 2026-02-09 젤라틴 2.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260209-0056', m.id, 2.000, 2.000, 2.000,
       'kg', 20800.00, '2026-02-09', '네이버파이낸셜', 
       '2028-12-22', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '젤라틴'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-09' AND ABS(il.quantity - 2.000) < 0.01
);

-- 2026-02-09 고구마무스 5.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260209-0057', m.id, 5.000, 5.000, 5.000,
       'kg', 5500.00, '2026-02-09', '네이버파이낸셜', 
       '2026-04-01', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '고구마무스'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-09' AND ABS(il.quantity - 5.000) < 0.01
);

-- 2026-02-09 딸기분말(스트로우베리에이드(분말)) 2.1kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260209-0058', m.id, 2.100, 2.100, 2.100,
       'kg', 5500.00, '2026-02-09', '네이버파이낸셜', 
       '2027-07-01', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '딸기분말(스트로우베리에이드(분말))'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-09' AND ABS(il.quantity - 2.100) < 0.01
);

-- 2026-02-09 딸기레진 4.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260209-0059', m.id, 4.000, 4.000, 4.000,
       'kg', 12870.00, '2026-02-09', '네이버파이낸셜', 
       '2026-06-26', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '딸기레진'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-09' AND ABS(il.quantity - 4.000) < 0.01
);

-- 2026-02-09 조림류(백옥앙금) 60.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260209-0060', m.id, 60.000, 60.000, 60.000,
       'kg', 3480.00, '2026-02-09', '네이버파이낸셜', 
       '2026-06-08', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '조림류(백옥앙금)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-09' AND ABS(il.quantity - 60.000) < 0.01
);

-- 2026-02-09 치즈 [크림치즈] 60.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260209-0061', m.id, 60.000, 60.000, 60.000,
       'kg', 9900.00, '2026-02-09', '네이버파이낸셜', 
       '2026-03-12', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '치즈 [크림치즈]'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-09' AND ABS(il.quantity - 60.000) < 0.01
);

-- 2026-02-09 생크림 48.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260209-0062', m.id, 48.000, 48.000, 48.000,
       'kg', 8250.00, '2026-02-09', '네이버파이낸셜', 
       '2026-10-27', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '생크림'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-09' AND ABS(il.quantity - 48.000) < 0.01
);

-- 2026-02-09 조림류(백옥앙금) 60.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260209-0063', m.id, 60.000, 60.000, 60.000,
       'kg', 3480.00, '2026-02-09', '네이버파이낸셜', 
       '2026-07-01', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '조림류(백옥앙금)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-09' AND ABS(il.quantity - 60.000) < 0.01
);

-- 2026-02-09 쑥가루(국내산) 8.0kg from 인투푸드
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260209-0064', m.id, 8.000, 8.000, 8.000,
       'kg', 14205.00, '2026-02-09', '인투푸드', 
       '2027-12-10', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '쑥가루(국내산)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-09' AND ABS(il.quantity - 8.000) < 0.01
);

-- 2026-02-09 두류가공품(콩고물) 60.0kg from 인투푸드
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260209-0065', m.id, 60.000, 60.000, 60.000,
       'kg', 6652.00, '2026-02-09', '인투푸드', 
       '2026-08-02', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '두류가공품(콩고물)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-09' AND ABS(il.quantity - 60.000) < 0.01
);

-- 2026-02-09 고구마가루 2.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260209-0066', m.id, 2.000, 2.000, 2.000,
       'kg', 12000.00, '2026-02-09', '네이버파이낸셜', 
       '2027-12-21', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '고구마가루'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-09' AND ABS(il.quantity - 2.000) < 0.01
);

-- 2026-02-10 중력분 20.0kg from 와마트
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260210-0067', m.id, 20.000, 20.000, 20.000,
       'kg', 890.00, '2026-02-10', '와마트', 
       '2026-12-07', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '중력분'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-10' AND ABS(il.quantity - 20.000) < 0.01
);

-- 2026-02-10 연유 0.5kg from 와마트
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260210-0068', m.id, 0.500, 0.500, 0.500,
       'kg', 11960.00, '2026-02-10', '와마트', 
       '2026-05-28', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '연유'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-10' AND ABS(il.quantity - 0.500) < 0.01
);

-- 2026-02-11 찰옥수수전분(미국산) 1000.0kg from 대진유통
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260211-0069', m.id, 1000.000, 1000.000, 1000.000,
       'kg', 2900.00, '2026-02-11', '대진유통', 
       '2026-01-24', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '찰옥수수전분(미국산)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-11' AND ABS(il.quantity - 1000.000) < 0.01
);

-- 2026-02-11 조림류(통팥앙금) 2000.0kg from 주식회사동아식품
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260211-0070', m.id, 2000.000, 2000.000, 2000.000,
       'kg', 2750.00, '2026-02-11', '주식회사동아식품', 
       '2026-05-04', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '조림류(통팥앙금)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-11' AND ABS(il.quantity - 2000.000) < 0.01
);

-- 2026-02-11 조림류(통팥앙금) 1000.0kg from 주식회사동아식품
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260211-0071', m.id, 1000.000, 1000.000, 1000.000,
       'kg', 2860.00, '2026-02-11', '주식회사동아식품', 
       '2026-05-02', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '조림류(통팥앙금)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-11' AND ABS(il.quantity - 1000.000) < 0.01
);

-- 2026-02-13 혼합제제(떡용에스텔) 54.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260213-0072', m.id, 54.000, 54.000, 54.000,
       'kg', 5453.70, '2026-02-13', '네이버파이낸셜', 
       '2027-01-07', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '혼합제제(떡용에스텔)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-13' AND ABS(il.quantity - 54.000) < 0.01
);

-- 2026-02-13 기타가공품(프리미엄카스테라가루) 20.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260213-0073', m.id, 20.000, 20.000, 20.000,
       'kg', 12600.00, '2026-02-13', '네이버파이낸셜', 
       '2026-07-07', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '기타가공품(프리미엄카스테라가루)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-13' AND ABS(il.quantity - 20.000) < 0.01
);

-- 2026-02-13 기타가공품(흑임자가루) 4.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260213-0074', m.id, 4.000, 4.000, 4.000,
       'kg', 12900.00, '2026-02-13', '네이버파이낸셜', 
       '2026-11-03', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '기타가공품(흑임자가루)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-13' AND ABS(il.quantity - 4.000) < 0.01
);

-- 2026-02-13 자색고구마가루(중국산) 4.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260213-0075', m.id, 4.000, 4.000, 4.000,
       'kg', 11500.00, '2026-02-13', '네이버파이낸셜', 
       '2026-11-26', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '자색고구마가루(중국산)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-13' AND ABS(il.quantity - 4.000) < 0.01
);

-- 2026-02-13 조림류(백옥앙금) 60.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260213-0076', m.id, 60.000, 60.000, 60.000,
       'kg', 3480.00, '2026-02-13', '네이버파이낸셜', 
       '2026-06-08', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '조림류(백옥앙금)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-13' AND ABS(il.quantity - 60.000) < 0.01
);

-- 2026-02-13 냉동쑥(국내산) 20.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260213-0077', m.id, 20.000, 20.000, 20.000,
       'kg', 7800.00, '2026-02-13', '네이버파이낸셜', 
       '2026-05-08', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '냉동쑥(국내산)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-13' AND ABS(il.quantity - 20.000) < 0.01
);

-- 2026-02-13 동부(미얀마산) 20.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260213-0078', m.id, 20.000, 20.000, 20.000,
       'kg', 3215.00, '2026-02-13', '네이버파이낸셜', 
       NULL, 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '동부(미얀마산)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-13' AND ABS(il.quantity - 20.000) < 0.01
);

-- 2026-02-13 호박씨앗(외국산) 10.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260213-0079', m.id, 10.000, 10.000, 10.000,
       'kg', 6000.00, '2026-02-13', '네이버파이낸셜', 
       '2027-10-02', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '호박씨앗(외국산)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-13' AND ABS(il.quantity - 10.000) < 0.01
);

-- 2026-02-13 해바라기씨앗 10.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260213-0080', m.id, 10.000, 10.000, 10.000,
       'kg', 3000.00, '2026-02-13', '네이버파이낸셜', 
       '2027-01-05', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '해바라기씨앗'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-13' AND ABS(il.quantity - 10.000) < 0.01
);

-- 2026-02-13 복음땅콩분태 10.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260213-0081', m.id, 10.000, 10.000, 10.000,
       'kg', 4900.00, '2026-02-13', '네이버파이낸셜', 
       '2027-02-17', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '복음땅콩분태'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-13' AND ABS(il.quantity - 10.000) < 0.01
);

-- 2026-02-13 기타가공품(프리미엄카스테라가루) 10.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260213-0082', m.id, 10.000, 10.000, 10.000,
       'kg', 12200.00, '2026-02-13', '네이버파이낸셜', 
       '2026-07-07', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '기타가공품(프리미엄카스테라가루)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-13' AND ABS(il.quantity - 10.000) < 0.01
);

-- 2026-02-13 기타가공품(흑임자가루) 2.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260213-0083', m.id, 2.000, 2.000, 2.000,
       'kg', 12900.00, '2026-02-13', '네이버파이낸셜', 
       '2026-11-03', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '기타가공품(흑임자가루)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-13' AND ABS(il.quantity - 2.000) < 0.01
);

-- 2026-02-14 자색고구마가루(중국산) 2.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260214-0084', m.id, 2.000, 2.000, 2.000,
       'kg', 11500.00, '2026-02-14', '네이버파이낸셜', 
       '2026-12-30', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '자색고구마가루(중국산)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-14' AND ABS(il.quantity - 2.000) < 0.01
);

-- 2026-02-19 두류가공품(콩고물) 100.0kg from 인투푸드
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260219-0085', m.id, 100.000, 100.000, 100.000,
       'kg', 6652.00, '2026-02-19', '인투푸드', 
       '2026-08-17', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '두류가공품(콩고물)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-19' AND ABS(il.quantity - 100.000) < 0.01
);

-- 2026-02-24 조림류(백옥앙금) 40.0kg from ㈜에스디컴퍼니
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260224-0086', m.id, 40.000, 40.000, 40.000,
       'kg', 15840.00, '2026-02-24', '㈜에스디컴퍼니', 
       '2026-05-04', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '조림류(백옥앙금)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-24' AND ABS(il.quantity - 40.000) < 0.01
);

-- 2026-02-24 물엿(저당물엿) 144.0kg from ㈜에스디컴퍼니
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260224-0087', m.id, 144.000, 144.000, 144.000,
       'kg', 1695.83, '2026-02-24', '㈜에스디컴퍼니', 
       '2026-09-11', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '물엿(저당물엿)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-24' AND ABS(il.quantity - 144.000) < 0.01
);

-- 2026-02-24 중력분 200.0kg from ㈜에스디컴퍼니
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260224-0088', m.id, 200.000, 200.000, 200.000,
       'kg', 900.00, '2026-02-24', '㈜에스디컴퍼니', 
       '2026-12-24', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '중력분'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-24' AND ABS(il.quantity - 200.000) < 0.01
);

-- 2026-02-24 찹쌀(국내산) 1000.0kg from 농업회사법인㈜이수농산
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260224-0089', m.id, 1000.000, 1000.000, 1000.000,
       'kg', 3375.00, '2026-02-24', '농업회사법인㈜이수농산', 
       NULL, 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '찹쌀(국내산)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-24' AND ABS(il.quantity - 1000.000) < 0.01
);

-- 2026-02-25 냉동쑥(국내산) 20.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260225-0090', m.id, 20.000, 20.000, 20.000,
       'kg', 7800.00, '2026-02-25', '네이버파이낸셜', 
       '2026-05-08', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '냉동쑥(국내산)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-25' AND ABS(il.quantity - 20.000) < 0.01
);

-- 2026-02-26 해바라기씨앗 3.0kg from 인투푸드
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260226-0091', m.id, 3.000, 3.000, 3.000,
       'kg', 4280.00, '2026-02-26', '인투푸드', 
       '2025-09-15', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '해바라기씨앗'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-26' AND ABS(il.quantity - 3.000) < 0.01
);

-- 2026-02-26 대추농축액 2.0kg from 인투푸드
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260226-0092', m.id, 2.000, 2.000, 2.000,
       'kg', 34680.00, '2026-02-26', '인투푸드', 
       '2028-01-26', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '대추농축액'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-26' AND ABS(il.quantity - 2.000) < 0.01
);

-- 2026-03-01 혼합제제(떡용에스텔) 54.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260301-0093', m.id, 54.000, 54.000, 54.000,
       'kg', 5361.11, '2026-03-01', '네이버파이낸셜', 
       '2026-12-30', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '혼합제제(떡용에스텔)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-03-01' AND ABS(il.quantity - 54.000) < 0.01
);

-- 2026-03-01 냉동쑥(국내산) 20.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260301-0094', m.id, 20.000, 20.000, 20.000,
       'kg', 7800.00, '2026-03-01', '네이버파이낸셜', 
       '2026-05-08', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '냉동쑥(국내산)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-03-01' AND ABS(il.quantity - 20.000) < 0.01
);

-- 2026-03-01 천일염 160.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260301-0095', m.id, 160.000, 160.000, 160.000,
       'kg', 625.00, '2026-03-01', '네이버파이낸셜', 
       NULL, 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '천일염'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-03-01' AND ABS(il.quantity - 160.000) < 0.01
);

-- 2026-03-04 쑥분말 8.0kg from 인투푸드
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260304-0096', m.id, 8.000, 8.000, 8.000,
       'kg', 14205.00, '2026-03-04', '인투푸드', 
       '2027-12-29', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '쑥분말'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-03-04' AND ABS(il.quantity - 8.000) < 0.01
);

-- 2026-03-04 찹쌀(국내산) 1200.0kg from 농업회사법인㈜이수농산
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260304-0097', m.id, 1200.000, 1200.000, 1200.000,
       'kg', 3375.00, '2026-03-04', '농업회사법인㈜이수농산', 
       NULL, 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '찹쌀(국내산)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-03-04' AND ABS(il.quantity - 1200.000) < 0.01
);

-- 2026-03-04 찰옥수수전분(미국산) 1000.0kg from 대진유통
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260304-0098', m.id, 1000.000, 1000.000, 1000.000,
       'kg', 2900.00, '2026-03-04', '대진유통', 
       '2026-01-25', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '찰옥수수전분(미국산)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-03-04' AND ABS(il.quantity - 1000.000) < 0.01
);

-- 2026-03-05 기타가공품(프리미엄카스테라가루) 144.0kg from ㈜한강에프디에스
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260305-0099', m.id, 144.000, 144.000, 144.000,
       'kg', 7150.00, '2026-03-05', '㈜한강에프디에스', 
       '2026-08-26', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '기타가공품(프리미엄카스테라가루)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-03-05' AND ABS(il.quantity - 144.000) < 0.01
);

-- 2026-03-05 냉동쑥(국내산) 40.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260305-0100', m.id, 40.000, 40.000, 40.000,
       'kg', 7800.00, '2026-03-05', '네이버파이낸셜', 
       '2026-05-08', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '냉동쑥(국내산)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-03-05' AND ABS(il.quantity - 40.000) < 0.01
);

-- 2026-03-06 쑥분말 80.0kg from 대진유통
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260306-0101', m.id, 80.000, 80.000, 80.000,
       'kg', 12600.00, '2026-03-06', '대진유통', 
       '2028-01-07', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '쑥분말'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-03-06' AND ABS(il.quantity - 80.000) < 0.01
);

-- 2026-03-06 젤라틴 2.0kg from 인투푸드
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260306-0102', m.id, 2.000, 2.000, 2.000,
       'kg', 20800.00, '2026-03-06', '인투푸드', 
       '2029-01-20', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '젤라틴'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-03-06' AND ABS(il.quantity - 2.000) < 0.01
);

-- 2026-02-25 냉동쑥(국내산) 20.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260225-0103', m.id, 20.000, 20.000, 20.000,
       'kg', 7800.00, '2026-02-25', '네이버파이낸셜', 
       '2026-05-08', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '냉동쑥(국내산)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-25' AND ABS(il.quantity - 20.000) < 0.01
);

-- 2026-02-26 해바라기씨앗 3.0kg from 인투푸드
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260226-0104', m.id, 3.000, 3.000, 3.000,
       'kg', 4280.00, '2026-02-26', '인투푸드', 
       '2025-09-15', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '해바라기씨앗'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-26' AND ABS(il.quantity - 3.000) < 0.01
);

-- 2026-02-26 대추농축액 2.0kg from 인투푸드
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260226-0105', m.id, 2.000, 2.000, 2.000,
       'kg', 34680.00, '2026-02-26', '인투푸드', 
       '2028-01-26', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '대추농축액'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-02-26' AND ABS(il.quantity - 2.000) < 0.01
);

-- 2026-03-01 혼합제제(떡용에스텔) 54.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260301-0106', m.id, 54.000, 54.000, 54.000,
       'kg', 5361.11, '2026-03-01', '네이버파이낸셜', 
       '2026-12-30', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '혼합제제(떡용에스텔)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-03-01' AND ABS(il.quantity - 54.000) < 0.01
);

-- 2026-03-01 냉동쑥(국내산) 20.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260301-0107', m.id, 20.000, 20.000, 20.000,
       'kg', 7800.00, '2026-03-01', '네이버파이낸셜', 
       '2026-05-08', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '냉동쑥(국내산)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-03-01' AND ABS(il.quantity - 20.000) < 0.01
);

-- 2026-03-01 천일염 160.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260301-0108', m.id, 160.000, 160.000, 160.000,
       'kg', 625.00, '2026-03-01', '네이버파이낸셜', 
       NULL, 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '천일염'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-03-01' AND ABS(il.quantity - 160.000) < 0.01
);

-- 2026-03-04 쑥분말 8.0kg from 인투푸드
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260304-0109', m.id, 8.000, 8.000, 8.000,
       'kg', 14205.00, '2026-03-04', '인투푸드', 
       '2027-12-29', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '쑥분말'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-03-04' AND ABS(il.quantity - 8.000) < 0.01
);

-- 2026-03-04 찹쌀(국내산) 1200.0kg from 농업회사법인㈜이수농산
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260304-0110', m.id, 1200.000, 1200.000, 1200.000,
       'kg', 3375.00, '2026-03-04', '농업회사법인㈜이수농산', 
       NULL, 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '찹쌀(국내산)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-03-04' AND ABS(il.quantity - 1200.000) < 0.01
);

-- 2026-03-04 찰옥수수전분(미국산) 1000.0kg from 대진유통
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260304-0111', m.id, 1000.000, 1000.000, 1000.000,
       'kg', 2900.00, '2026-03-04', '대진유통', 
       '2026-01-25', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '찰옥수수전분(미국산)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-03-04' AND ABS(il.quantity - 1000.000) < 0.01
);

-- 2026-03-05 기타가공품(프리미엄카스테라가루) 144.0kg from ㈜한강에프디에스
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260305-0112', m.id, 144.000, 144.000, 144.000,
       'kg', 7150.00, '2026-03-05', '㈜한강에프디에스', 
       '2026-08-26', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '기타가공품(프리미엄카스테라가루)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-03-05' AND ABS(il.quantity - 144.000) < 0.01
);

-- 2026-03-05 냉동쑥(국내산) 40.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260305-0113', m.id, 40.000, 40.000, 40.000,
       'kg', 7800.00, '2026-03-05', '네이버파이낸셜', 
       '2026-05-08', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '냉동쑥(국내산)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-03-05' AND ABS(il.quantity - 40.000) < 0.01
);

-- 2026-03-06 쑥분말 80.0kg from 대진유통
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260306-0114', m.id, 80.000, 80.000, 80.000,
       'kg', 12600.00, '2026-03-06', '대진유통', 
       '2028-01-07', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '쑥분말'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-03-06' AND ABS(il.quantity - 80.000) < 0.01
);

-- 2026-03-06 젤라틴 2.0kg from 인투푸드
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260306-0115', m.id, 2.000, 2.000, 2.000,
       'kg', 20800.00, '2026-03-06', '인투푸드', 
       '2029-01-20', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '젤라틴'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-03-06' AND ABS(il.quantity - 2.000) < 0.01
);

-- 2026-03-09 혼합제제(떡용에스텔) 180.0kg from 대진유통
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260309-0116', m.id, 180.000, 180.000, 180.000,
       'kg', 4555.56, '2026-03-09', '대진유통', 
       '2027-01-28', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '혼합제제(떡용에스텔)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-03-09' AND ABS(il.quantity - 180.000) < 0.01
);

-- 2026-03-09 콩기름(대두유) 90.0kg from 대진유통
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260309-0117', m.id, 90.000, 90.000, 90.000,
       'kg', 2444.44, '2026-03-09', '대진유통', 
       '2027-05-20', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '콩기름(대두유)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-03-09' AND ABS(il.quantity - 90.000) < 0.01
);

-- 2026-03-09 물엿(저당물엿) 480.0kg from 대진유통
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260309-0118', m.id, 480.000, 480.000, 480.000,
       'kg', 1466.67, '2026-03-09', '대진유통', 
       '2026-02-08', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '물엿(저당물엿)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-03-09' AND ABS(il.quantity - 480.000) < 0.01
);

-- 2026-03-09 천일염 100.0kg from 대진유통
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260309-0119', m.id, 100.000, 100.000, 100.000,
       'kg', 900.00, '2026-03-09', '대진유통', 
       NULL, 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '천일염'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-03-09' AND ABS(il.quantity - 100.000) < 0.01
);

-- 2026-03-11 찹쌀(국내산) 1200.0kg from 농업회사법인㈜이수농산
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260311-0120', m.id, 1200.000, 1200.000, 1200.000,
       'kg', 3375.00, '2026-03-11', '농업회사법인㈜이수농산', 
       NULL, 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '찹쌀(국내산)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-03-11' AND ABS(il.quantity - 1200.000) < 0.01
);

-- 2026-03-11 냉동쑥(국내산) 40.0kg from 네이버파이낸셜
INSERT IGNORE INTO h_inventory_lots 
    (tenant_id, lot_number, material_id, quantity, current_quantity, available_quantity, 
     unit, unit_price, receipt_date, supplier_name, expiry_date, status)
SELECT 2, 'LOT-EXCEL-20260311-0121', m.id, 40.000, 40.000, 40.000,
       'kg', 7800.00, '2026-03-11', '네이버파이낸셜', 
       '2027-05-16', 'available'
FROM h_materials m WHERE m.tenant_id = 2 AND m.material_name = '냉동쑥(국내산)'
AND NOT EXISTS (
    SELECT 1 FROM h_inventory_lots il 
    WHERE il.tenant_id = 2 AND il.material_id = m.id 
      AND il.receipt_date = '2026-03-11' AND ABS(il.quantity - 40.000) < 0.01
);


-- ============================================
-- STEP 6: 입고 LOT에 대한 receipt 트랜잭션 생성
-- ============================================


-- Excel LOT의 receipt 트랜잭션 (중복 방지)
INSERT INTO h_inventory_transactions
    (tenant_id, lot_id, transaction_type, quantity, unit, transaction_date,
     reference_type, source_type, notes, created_by)
SELECT 
    il.tenant_id,
    il.id,
    'receipt',
    il.quantity,
    il.unit,
    il.receipt_date,
    'excel_import',
    'excel_import',
    CONCAT('엑셀입고-', il.supplier_name),
    1
FROM h_inventory_lots il
WHERE il.tenant_id = 2
  AND il.lot_number LIKE 'LOT-EXCEL-%'
  AND NOT EXISTS (
      SELECT 1 FROM h_inventory_transactions t
      WHERE t.tenant_id = il.tenant_id AND t.lot_id = il.id AND t.transaction_type = 'receipt'
  );


-- ============================================
-- DONE
-- ============================================
-- Total receiving records: 121
-- Initial stock entries: 58

