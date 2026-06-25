-- =================================================================
-- 백필: 누락된 입고 트랜잭션 (h_inventory_transactions)
-- =================================================================
-- 배경:
--   server/db/haccp/haccpIntegration.ts 의 createPurchase 흐름에서
--   h_inventory_lots INSERT만 수행하고 h_inventory_transactions(receipt) INSERT는
--   누락된 버그가 있었음. 결과적으로:
--     - LOT 합계와 트랜잭션 receipt 합계가 일치하지 않음
--     - 트랜잭션 기반 보고서/입출고대장에서 입고 내역이 사라짐
--     - 멥쌀(615)의 경우 LOT 22,170.9kg vs 트랜잭션 4,000kg → 18,170.9kg 누락
--   코드는 2026-06-25 자로 수정됨 (haccpIntegration.ts +66 lines)
--   본 SQL은 과거 orphan LOT에 대한 receipt 트랜잭션을 소급 INSERT.
--
-- 적용 대상:
--   tenant_id=2, material_id=615 (멥쌀)
--   3~6월 사용자 확인 6건 (총 10,000kg) — '인천광역시청' 발주
--
-- 안전성:
--   - NOT EXISTS 조건으로 이미 존재하는 receipt는 중복 INSERT 차단
--   - reference_type='accounting_purchase' + reference_id=accounting_purchases.id 로 매입전표 연결
--   - 트랜잭션으로 감싸서 부분 실패 방지
--   - DRY-RUN 섹션 먼저 실행 후 결과 검토 → BACKFILL 섹션 실행
-- =================================================================

-- -----------------------------------------------------------------
-- [DRY-RUN] 백필 대상 미리보기
-- -----------------------------------------------------------------
SELECT
  l.id                          AS lot_id,
  l.lot_number,
  l.material_id,
  ROUND(l.quantity,1)           AS qty_kg,
  l.unit,
  l.receipt_date,
  ap.id                         AS purchase_id,
  p.company_name                AS supplier,
  ap.unit_price,
  ap.total_amount,
  ap.created_by
FROM h_inventory_lots l
LEFT JOIN accounting_purchases ap
       ON ap.tenant_id = l.tenant_id
      AND ap.material_id = l.material_id
      AND ap.transaction_date = DATE_FORMAT(l.receipt_date, '%Y-%m-%d')
LEFT JOIN partners p
       ON p.id = ap.partner_id
      AND p.tenant_id = ap.tenant_id
WHERE l.tenant_id = 2
  AND l.material_id = 615
  AND l.lot_number IN (
    'MAT-20260331-311',
    'MAT-20260415-639',
    'MAT-20260429-326',
    'MAT-20260429-895',
    'MAT-20260520-801',
    'MAT-20260623-789'
  )
  AND NOT EXISTS (
    SELECT 1 FROM h_inventory_transactions t
    WHERE t.tenant_id = l.tenant_id
      AND t.material_id = l.material_id
      AND t.lot_id = l.id
      AND t.transaction_type = 'receipt'
  )
ORDER BY l.receipt_date;

-- -----------------------------------------------------------------
-- [BACKFILL] 실제 INSERT (위 DRY-RUN 결과 확인 후 실행)
-- -----------------------------------------------------------------
START TRANSACTION;

INSERT INTO h_inventory_transactions
  (tenant_id, lot_id, material_id, transaction_type,
   quantity, unit, unit_cost, amount,
   transaction_date, reference_type, reference_id,
   notes, created_by)
SELECT
  l.tenant_id,
  l.id                                   AS lot_id,
  l.material_id,
  'receipt'                              AS transaction_type,
  l.quantity,
  l.unit,
  ap.unit_price                          AS unit_cost,
  ap.total_amount                        AS amount,
  l.receipt_date                         AS transaction_date,
  'accounting_purchase'                  AS reference_type,
  ap.id                                  AS reference_id,
  CONCAT(
    '[2026-06-25 백필] haccpIntegration.ts 누락 receipt 트랜잭션 소급 기록. ',
    '공급처=', IFNULL(p.company_name,'인천광역시청'),
    ', LOT=', l.lot_number
  )                                      AS notes,
  IFNULL(ap.created_by, 1)               AS created_by
FROM h_inventory_lots l
LEFT JOIN accounting_purchases ap
       ON ap.tenant_id = l.tenant_id
      AND ap.material_id = l.material_id
      AND ap.transaction_date = DATE_FORMAT(l.receipt_date, '%Y-%m-%d')
LEFT JOIN partners p
       ON p.id = ap.partner_id
      AND p.tenant_id = ap.tenant_id
WHERE l.tenant_id = 2
  AND l.material_id = 615
  AND l.lot_number IN (
    'MAT-20260331-311',
    'MAT-20260415-639',
    'MAT-20260429-326',
    'MAT-20260429-895',
    'MAT-20260520-801',
    'MAT-20260623-789'
  )
  AND NOT EXISTS (
    SELECT 1 FROM h_inventory_transactions t
    WHERE t.tenant_id = l.tenant_id
      AND t.material_id = l.material_id
      AND t.lot_id = l.id
      AND t.transaction_type = 'receipt'
  );

-- 영향받은 행 검증 (반드시 6 이어야 함)
SELECT ROW_COUNT() AS inserted_rows;

-- 검증: 멥쌀 receipt 합계가 14,000kg 이어야 함 (기존 4,000 + 백필 10,000)
SELECT
  ROUND(SUM(quantity),1) AS total_receipt_kg,
  COUNT(*)               AS receipt_count
FROM h_inventory_transactions
WHERE tenant_id = 2 AND material_id = 615 AND transaction_type = 'receipt';

-- 모두 정상이면 COMMIT, 아니면 ROLLBACK
-- COMMIT;
-- ROLLBACK;
