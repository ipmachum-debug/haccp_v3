-- =====================================================================
-- 원가 정합성 1차 — 입고 LOT 단가 · 출고 원가 · 배치 투입 단가 · 자재 현재 단가 백필   2026-10-13
-- =====================================================================
-- 적용 일자: (Genspark 실행 시 기입)
-- 실행 환경: 운영 DB haccp_tenant_db (MySQL 8.0)
-- 실행 주체: Genspark — §0 백업 → §1 현황 → §2~§5 순서대로 → §6 검증
-- 전제:     PR "fix(cost): 입고 LOT 단가 기록 + 자동출고 단가 보정 + 현재 단가 자동 갱신" 배포 완료
-- 롤백:     §0 백업 테이블에서 unit_price / unit_cost / amount / total_price 복원 (행 삭제 없음)
--
-- 배경 (덤프 2026-10-10 실측, tenant 2)
--   · 매입 등록(createPurchase) 이 만든 MAT- LOT 153건 unit_price NULL. 입고 거래 unit_cost 는 "포대당 가격",
--     quantity 는 kg → 단위 불일치 110건 (예: 찹쌀 50포×65,000 = 3,250,000원 / 1,000kg → kg당 3,250원).
--   · 그 LOT 에서 FEFO 차감된 출고 거래 unit_cost=0: 8월 이후 1,662건 / 1,947건.
--   · 배치 투입 unit_price=0: 8월 이후 1,791건 / 2,011건 → 원가 화면이 마스터 옛 단가(3월) 로 폴백.
--
-- 규칙
--   · LOT 단가 = LOT 수량 단위당. 입고 거래 금액(amount) ÷ 수량(quantity).
--   · 출고 거래 단가 = 그 LOT 의 단가. 배치 투입 단가 = 그 투입의 출고 거래 가중평균.
--   · 자재 현재 단가(h_materials.unit_price) = 최근 입고가. 이력(h_material_price_history) 남김.
--   · 정제수(이름에 '정제수') 는 건드리지 않음 (원가 제외).
-- =====================================================================

-- ---------------------------------------------------------------------
-- §0. 백업 (값 컬럼만)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS _bak_price_20261013_lots AS
  SELECT id, tenant_id, unit_price FROM h_inventory_lots;
CREATE TABLE IF NOT EXISTS _bak_price_20261013_tx AS
  SELECT id, tenant_id, unit_cost, amount FROM h_inventory_transactions;
CREATE TABLE IF NOT EXISTS _bak_price_20261013_inputs AS
  SELECT id, tenant_id, unit_price, total_price FROM h_batch_inputs;
CREATE TABLE IF NOT EXISTS _bak_price_20261013_materials AS
  SELECT id, tenant_id, unit_price FROM h_materials;
SELECT (SELECT COUNT(*) FROM _bak_price_20261013_lots)      AS bak_lots,  (SELECT COUNT(*) FROM h_inventory_lots)         AS src_lots,
       (SELECT COUNT(*) FROM _bak_price_20261013_tx)        AS bak_tx,    (SELECT COUNT(*) FROM h_inventory_transactions) AS src_tx,
       (SELECT COUNT(*) FROM _bak_price_20261013_inputs)    AS bak_in,    (SELECT COUNT(*) FROM h_batch_inputs)           AS src_in,
       (SELECT COUNT(*) FROM _bak_price_20261013_materials) AS bak_mat,   (SELECT COUNT(*) FROM h_materials)              AS src_mat;
-- → 네 쌍 모두 일치 확인 후 진행. 백업 4테이블은 6-a 정리 목록에 추가.

-- ---------------------------------------------------------------------
-- §1. 현황
-- ---------------------------------------------------------------------
SELECT 'lots unit_price NULL/0 (receipt 금액 있음)' AS k, COUNT(*) AS n
  FROM h_inventory_lots l JOIN h_inventory_transactions t ON t.lot_id = l.id AND t.transaction_type = 'receipt'
 WHERE (l.unit_price IS NULL OR l.unit_price = 0) AND t.amount > 0 AND t.quantity > 0
UNION ALL SELECT 'receipt tx unit_cost≠amount/quantity', COUNT(*)
  FROM h_inventory_transactions t WHERE t.transaction_type = 'receipt' AND t.amount > 0 AND t.quantity > 0
   AND ABS(t.unit_cost * t.quantity - t.amount) > 1
UNION ALL SELECT 'usage tx unit_cost NULL/0', COUNT(*)
  FROM h_inventory_transactions WHERE transaction_type = 'usage' AND (unit_cost IS NULL OR unit_cost = 0)
UNION ALL SELECT 'batch_inputs unit_price NULL/0', COUNT(*)
  FROM h_batch_inputs WHERE unit_price IS NULL OR unit_price = 0;

-- ---------------------------------------------------------------------
-- §2. 입고 거래 단가 정규화 + LOT 단가 채우기 (LOT 수량 단위당 = 금액 ÷ 수량)
-- ---------------------------------------------------------------------
UPDATE h_inventory_transactions t
   SET t.unit_cost = ROUND(t.amount / t.quantity, 2)
 WHERE t.transaction_type = 'receipt' AND t.amount > 0 AND t.quantity > 0
   AND (t.unit_cost IS NULL OR t.unit_cost = 0 OR ABS(t.unit_cost * t.quantity - t.amount) > 1);

UPDATE h_inventory_lots l
  JOIN (
    SELECT lot_id, MAX(id) AS tx_id FROM h_inventory_transactions
     WHERE transaction_type = 'receipt' AND amount > 0 AND quantity > 0 AND lot_id IS NOT NULL
     GROUP BY lot_id
  ) r ON r.lot_id = l.id
  JOIN h_inventory_transactions t ON t.id = r.tx_id
   SET l.unit_price = ROUND(t.amount / t.quantity, 2)
 WHERE (l.unit_price IS NULL OR l.unit_price = 0);
-- 예상 ≈ 122 (tenant 2)

-- ---------------------------------------------------------------------
-- §3. 출고(usage) 거래 단가·금액 = 그 LOT 의 단가 (단가 없는 행만)
-- ---------------------------------------------------------------------
UPDATE h_inventory_transactions t
  JOIN h_inventory_lots l ON l.id = t.lot_id AND l.tenant_id = t.tenant_id
   SET t.unit_cost = l.unit_price,
       t.amount    = ROUND(l.unit_price * t.quantity, 2)
 WHERE t.transaction_type = 'usage'
   AND (t.unit_cost IS NULL OR t.unit_cost = 0)
   AND l.unit_price IS NOT NULL AND l.unit_price > 0;

-- LOT 단가도 없는 출고(NEG-/COUNT- LOT 차감 등)는 "그 출고일 이전 최근 입고가" 로 (과거는 과거 가격 — CEO 원칙).
-- 오늘 단가를 과거에 덮어쓰지 않는다. 그 날짜 이전 입고가가 없으면 그대로 0 (화면은 마스터 단가로 폴백 표시).
UPDATE h_inventory_transactions t
   SET t.unit_cost = (
         SELECT l.unit_price FROM h_inventory_lots l
          WHERE l.tenant_id = t.tenant_id AND l.material_id = t.material_id
            AND l.unit_price > 0 AND l.lot_number NOT LIKE 'NEG-%' AND l.lot_number NOT LIKE 'COUNT-%'
            AND (l.receipt_date IS NULL OR l.receipt_date <= t.transaction_date)
          ORDER BY l.receipt_date DESC, l.id DESC LIMIT 1
       )
 WHERE t.transaction_type = 'usage'
   AND (t.unit_cost IS NULL OR t.unit_cost = 0);
UPDATE h_inventory_transactions t
   SET t.amount = ROUND(t.unit_cost * t.quantity, 2)
 WHERE t.transaction_type = 'usage' AND t.unit_cost > 0 AND (t.amount IS NULL OR t.amount = 0);

-- ---------------------------------------------------------------------
-- §4. 배치 투입 단가 = 그 투입의 출고 거래 가중평균 (source_line_id = h_batch_inputs.id)
-- ---------------------------------------------------------------------
UPDATE h_batch_inputs bi
  JOIN (
    SELECT source_line_id, SUM(quantity) AS q, SUM(amount) AS a
      FROM h_inventory_transactions
     WHERE transaction_type = 'usage' AND source_type = 'BATCH' AND source_line_id IS NOT NULL
       AND unit_cost > 0 AND quantity > 0
     GROUP BY source_line_id
  ) u ON u.source_line_id = bi.id
  LEFT JOIN h_materials m ON m.id = bi.material_id AND m.tenant_id = bi.tenant_id
   SET bi.unit_price  = ROUND(u.a / u.q, 2),
       bi.total_price = ROUND(u.a, 2)
 WHERE (bi.unit_price IS NULL OR bi.unit_price = 0)
   AND u.q > 0
   AND (m.material_name IS NULL OR m.material_name NOT LIKE '%정제수%');

-- ---------------------------------------------------------------------
-- §5. 자재 현재 단가 = 최근 입고가 (이력 남김). 정제수 제외.
-- ---------------------------------------------------------------------
DROP TEMPORARY TABLE IF EXISTS tmp_latest_receipt_price;
CREATE TEMPORARY TABLE tmp_latest_receipt_price AS
  SELECT l.tenant_id, l.material_id, l.unit_price AS new_price, l.receipt_date
    FROM h_inventory_lots l
    JOIN (SELECT tenant_id, material_id, MAX(CONCAT(DATE_FORMAT(receipt_date, '%Y%m%d'), LPAD(id, 10, '0'))) AS k
            FROM h_inventory_lots
           WHERE unit_price > 0 AND material_id IS NOT NULL
             AND lot_number NOT LIKE 'NEG-%' AND lot_number NOT LIKE 'COUNT-%'
           GROUP BY tenant_id, material_id) x
      ON x.tenant_id = l.tenant_id AND x.material_id = l.material_id
     AND CONCAT(DATE_FORMAT(l.receipt_date, '%Y%m%d'), LPAD(l.id, 10, '0')) = x.k;

INSERT INTO h_material_price_history (tenant_id, material_id, old_price, new_price, changed_by, reason)
SELECT m.tenant_id, m.id, m.unit_price, p.new_price, NULL,
       CONCAT('백필 2026-10-13: 최근 입고가 적용 (입고일 ', DATE_FORMAT(p.receipt_date, '%Y-%m-%d'), ')')
  FROM h_materials m
  JOIN tmp_latest_receipt_price p ON p.tenant_id = m.tenant_id AND p.material_id = m.id
 WHERE (m.unit_price IS NULL OR ABS(m.unit_price - p.new_price) >= 0.01)
   AND m.material_name NOT LIKE '%정제수%';

UPDATE h_materials m
  JOIN tmp_latest_receipt_price p ON p.tenant_id = m.tenant_id AND p.material_id = m.id
   SET m.unit_price = p.new_price, m.updated_at = NOW()
 WHERE (m.unit_price IS NULL OR ABS(m.unit_price - p.new_price) >= 0.01)
   AND m.material_name NOT LIKE '%정제수%';

DROP TEMPORARY TABLE IF EXISTS tmp_latest_receipt_price;

-- ---------------------------------------------------------------------
-- §6. 검증
-- ---------------------------------------------------------------------
-- 6-a. §1 재실행 → 첫 두 줄 0, 나머지 두 줄은 LOT 자체에 단가가 없는 옛 건만 남아야 함
-- 6-b. 찹쌀(국내산) 현재 단가가 최근 입고가(2026-09-28, 3,250원/kg) 인지
SELECT id, material_name, unit_price FROM h_materials WHERE material_name = '찹쌀(국내산)';
-- 6-c. 배치 1101 (30080-20261008-001) 투입 단가가 LOT 단가로 채워졌는지
SELECT bi.id, m.material_name, bi.actual_quantity, bi.unit_price, bi.total_price
  FROM h_batch_inputs bi LEFT JOIN h_materials m ON m.id = bi.material_id
 WHERE bi.batch_id = 1101 ORDER BY bi.id;
-- 6-d. 화면: 생산관리 > 배치비용분석 > 30080-20261008-001 원재료 상세 — 찹쌀 단가 3,250원, 통팥앙금M·찰옥수수전분·혼합제제·밀가루에 단가/비용 표시
