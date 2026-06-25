-- ============================================================================
-- LOT 750 (4,000kg 멥쌀, 인천광역시청, 2026-03-26) 잘못된 입고 제거
-- ============================================================================
-- 배경:
--   사용자가 2026-03-26 인천광역시청으로부터 2,000kg만 입고했으나, 
--   시스템에 LOT 655(2,000kg) + LOT 750(4,000kg) 두 건이 잘못 등록됨.
--   실제 입고는 LOT 655(2,000kg)만 정상.
--   LOT 750은 입고되지 않은 가짜 입고 → 삭제 처리.
--
-- 영향 범위:
--   - h_inventory_lots.id=750 (status=used, available=0, quantity=4000)
--   - h_inventory_transactions.id=6975 (receipt 4000kg, 2026-03-26)
--   - accounting_purchases.id=125 (200개 × 10,200원 = 2,040,000원, status=paid)
--   - h_inventory (material 615 멥쌀): 건드리지 않음 (현재고 2,433.7kg가 실재고와 일치)
--   - h_batch_inputs: LOT 750 직접 참조 0건 (영향 없음)
--   - 월/일 마감: 빈 상태 (영향 없음)
--
-- 실행 일자: 2026-06-25
-- 참조 PR: #365
-- ============================================================================

-- 안전을 위해 트랜잭션으로 묶어 실행
START TRANSACTION;

-- ─────────────────────────────────────────────────────────────────────────────
-- [1] 백업 (감사용)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS w4_backup_lot_750_removal_2026_06_25 (
    backup_type     VARCHAR(50),
    backup_data     JSON,
    backed_up_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO w4_backup_lot_750_removal_2026_06_25 (backup_type, backup_data)
SELECT 'h_inventory_lots', JSON_OBJECT(
    'id', id, 'lot_number', lot_number, 'material_id', material_id,
    'quantity', quantity, 'available_quantity', available_quantity,
    'receipt_date', receipt_date, 'supplier_name', supplier_name,
    'status', status, 'unit_price', unit_price, 'tenant_id', tenant_id,
    'inventory_id', inventory_id
) FROM h_inventory_lots WHERE id = 750;

INSERT INTO w4_backup_lot_750_removal_2026_06_25 (backup_type, backup_data)
SELECT 'h_inventory_transactions', JSON_OBJECT(
    'id', id, 'lot_id', lot_id, 'material_id', material_id,
    'transaction_type', transaction_type, 'quantity', quantity,
    'transaction_date', transaction_date, 'reference_type', reference_type,
    'source_id', source_id, 'source_type', source_type, 'tenant_id', tenant_id
) FROM h_inventory_transactions WHERE id = 6975;

INSERT INTO w4_backup_lot_750_removal_2026_06_25 (backup_type, backup_data)
SELECT 'accounting_purchases', JSON_OBJECT(
    'id', id, 'transaction_date', transaction_date, 'partner_id', partner_id,
    'item_name', item_name, 'material_id', material_id, 'quantity', quantity,
    'unit', unit, 'unit_price', unit_price, 'total_amount', total_amount,
    'status', status, 'posted_at', posted_at, 'tenant_id', tenant_id
) FROM accounting_purchases WHERE id = 125;

-- ─────────────────────────────────────────────────────────────────────────────
-- [2] LOT 750 관련 데이터 삭제
-- ─────────────────────────────────────────────────────────────────────────────

-- (a) inventory_transaction 삭제 (receipt 4,000kg)
DELETE FROM h_inventory_transactions WHERE id = 6975 AND lot_id = 750 AND tenant_id = 2;

-- (b) LOT 삭제
DELETE FROM h_inventory_lots WHERE id = 750 AND tenant_id = 2;

-- (c) accounting_purchase 취소 처리 (status='canceled', 데이터는 보존)
UPDATE accounting_purchases 
SET status = 'cancelled',                     -- ENUM('pending','approved','paid','cancelled')
    canceled_at = NOW(),
    canceled_by = 0,                          -- 시스템(스크립트)
    notes = CONCAT(COALESCE(notes, ''), 
                   '[2026-06-25 시스템 취소: LOT 750은 실제 입고되지 않은 중복 등록. PR #365]')
WHERE id = 125 AND tenant_id = 2;

-- ─────────────────────────────────────────────────────────────────────────────
-- [3] 검증
-- ─────────────────────────────────────────────────────────────────────────────
-- LOT이 사라졌는지 확인
SELECT 'verify_lot_deleted' AS check_name, COUNT(*) AS should_be_zero 
FROM h_inventory_lots WHERE id = 750;

-- 트랜잭션이 사라졌는지 확인
SELECT 'verify_txn_deleted' AS check_name, COUNT(*) AS should_be_zero 
FROM h_inventory_transactions WHERE id = 6975;

-- 회계 매입이 canceled됐는지 확인
SELECT 'verify_purchase_canceled' AS check_name, id, status, canceled_at, canceled_by
FROM accounting_purchases WHERE id = 125;

-- 멥쌀(615) 입고 총량 재집계 (LOT 750 제거 후)
SELECT 'verify_mepsal_lot_total' AS check_name, 
       COUNT(*) AS lot_count,
       SUM(quantity) AS total_received_kg,
       SUM(available_quantity) AS total_available_kg
FROM h_inventory_lots 
WHERE tenant_id = 2 AND material_id = 615;

COMMIT;

-- ============================================================================
-- 결과 예상:
--   - h_inventory_lots: 멥쌀(615) LOT 8개 (이전 9개에서 LOT 750 제거)
--   - h_inventory_transactions: receipt 8건 (이전 9건에서 1건 제거)
--   - accounting_purchases.id=125: status='canceled' (회계 기록 보존)
--   - h_inventory.id=36 (멥쌀): 변경 없음 (현재 available=2,433.7kg)
-- ============================================================================
