-- ============================================================================
-- 과거 입고 재고 정합성 백필 — 누락된 receipt 트랜잭션 소급 생성
-- ----------------------------------------------------------------------------
-- 배경:
--   PR #387(v0.8.279) 이전 createPurchase 는 회계 매입 입고 시 h_inventory_lots(LOT)
--   만 INSERT 하고 h_inventory_transactions(receipt) 를 누락 → 트랜잭션 기반
--   입고합계 ≠ LOT 합계 (tenant2 약 76톤 불일치). 코드는 #387 로 미래분 정상화됨.
--   이 스크립트는 '과거' 누락분(receipt 없는 MAT- LOT)을 소급 보정한다.
--
-- 안전/멱등:
--   - lot_id 기준 receipt 트랜잭션이 '없는' LOT 에만 INSERT (재실행 안전).
--   - 이미 #387 이후 생성된 LOT(정상 receipt 보유)과 과거 부분 백필분은 자동 제외.
--   - 상태(status) 변경/재고 차감 없음 — 순수 audit-trail(receipt) 보강만.
--
-- ⚠️ 실행 주체: Genspark(서버 DB). Claude 는 스크립트 작성만.
--   반드시 STEP 1(DRY-RUN) 먼저 실행해 건수/수량을 사용자와 확인한 뒤
--   STEP 2(백필)를 실행할 것.
-- ============================================================================

-- 시스템 사용자 id (created_by NOT NULL). 운영 관리자 user id 로 교체 후 실행.
SET @sys_user := 1;
-- 대상 테넌트 (식품 tenant2). NULL 이면 전체 테넌트.
SET @scope_tenant := 2;

-- ============================================================================
-- STEP 1 — DRY RUN (읽기 전용). 반드시 먼저 실행하여 규모 확인.
-- ============================================================================

-- (1-a) 누락(orphan) LOT 총 건수 / 총 수량
SELECT
  COUNT(*)              AS orphan_lot_count,
  ROUND(SUM(l.quantity), 3) AS orphan_total_qty
FROM h_inventory_lots l
WHERE l.lot_number LIKE 'MAT-%'
  AND (@scope_tenant IS NULL OR l.tenant_id = @scope_tenant)
  AND NOT EXISTS (
    SELECT 1 FROM h_inventory_transactions t
    WHERE t.lot_id = l.id AND t.transaction_type = 'receipt'
  );

-- (1-b) 자재별 누락 수량 상위 (사용자 확인용)
SELECT
  l.material_id,
  m.material_name,
  COUNT(*)                  AS orphan_lots,
  ROUND(SUM(l.quantity), 3) AS orphan_qty,
  l.unit
FROM h_inventory_lots l
LEFT JOIN h_materials m ON m.id = l.material_id
WHERE l.lot_number LIKE 'MAT-%'
  AND (@scope_tenant IS NULL OR l.tenant_id = @scope_tenant)
  AND NOT EXISTS (
    SELECT 1 FROM h_inventory_transactions t
    WHERE t.lot_id = l.id AND t.transaction_type = 'receipt'
  )
GROUP BY l.material_id, m.material_name, l.unit
ORDER BY orphan_qty DESC;

-- (1-c) 자재별 [LOT 입고합계] vs [receipt 트랜잭션 합계] 불일치 (백필 전 기준선)
SELECT
  lot_sum.material_id,
  m.material_name,
  ROUND(lot_sum.qty, 3)                       AS lot_receipt_qty,
  ROUND(COALESCE(txn_sum.qty, 0), 3)          AS txn_receipt_qty,
  ROUND(lot_sum.qty - COALESCE(txn_sum.qty, 0), 3) AS gap
FROM (
  SELECT material_id, tenant_id, SUM(quantity) AS qty
  FROM h_inventory_lots
  WHERE lot_number LIKE 'MAT-%'
    AND (@scope_tenant IS NULL OR tenant_id = @scope_tenant)
  GROUP BY material_id, tenant_id
) lot_sum
LEFT JOIN (
  SELECT material_id, tenant_id, SUM(quantity) AS qty
  FROM h_inventory_transactions
  WHERE transaction_type = 'receipt'
    AND (@scope_tenant IS NULL OR tenant_id = @scope_tenant)
  GROUP BY material_id, tenant_id
) txn_sum ON txn_sum.material_id = lot_sum.material_id AND txn_sum.tenant_id = lot_sum.tenant_id
LEFT JOIN h_materials m ON m.id = lot_sum.material_id
HAVING gap <> 0
ORDER BY gap DESC;

-- ============================================================================
-- STEP 2 — 백필 (쓰기). STEP 1 확인 후에만 실행.
--   아래 블록을 트랜잭션으로 실행하고, 삽입 건수 확인 후 COMMIT.
-- ============================================================================

-- START TRANSACTION;

-- INSERT INTO h_inventory_transactions
--   (tenant_id, lot_id, material_id, transaction_type, quantity, unit,
--    transaction_date, reference_type, reference_id, source_type, source_id,
--    notes, created_by, created_at)
-- SELECT
--   l.tenant_id, l.id, l.material_id, 'receipt', l.quantity, l.unit,
--   l.receipt_date, 'backfill_receipt', l.id, 'backfill', l.id,
--   CONCAT('[backfill #387] orphan LOT ', l.lot_number, ' 소급 receipt'),
--   @sys_user, NOW()
-- FROM h_inventory_lots l
-- WHERE l.lot_number LIKE 'MAT-%'
--   AND (@scope_tenant IS NULL OR l.tenant_id = @scope_tenant)
--   AND NOT EXISTS (
--     SELECT 1 FROM h_inventory_transactions t
--     WHERE t.lot_id = l.id AND t.transaction_type = 'receipt'
--   );

-- SELECT ROW_COUNT() AS inserted_receipt_rows;   -- 예상: STEP 1-a 의 orphan_lot_count 와 일치
-- COMMIT;   -- 값 확인 후 실행 (문제 시 ROLLBACK;)

-- ============================================================================
-- STEP 3 — 사후 검증 (백필 후 재실행). 1-c 의 gap 이 0 이 되어야 정상.
--   (STEP 1-c 쿼리를 그대로 다시 실행)
-- ============================================================================

-- ============================================================================
-- (선택) STEP 4 — h_inventory 집계 재조정
--   receipt 백필과 별개로, h_inventory.total/available 가 LOT 합계와 어긋난
--   자재가 있으면 아래로 재계산 가능. reserved 등 특수 케이스가 있으면 신중히.
--   ⚠️ 기본 비활성 — 필요 시 사용자 승인 후 개별 검토.
-- ----------------------------------------------------------------------------
-- UPDATE h_inventory inv
-- JOIN (
--   SELECT tenant_id, material_id,
--          SUM(available_quantity) AS avail
--   FROM h_inventory_lots
--   WHERE status = 'available'
--     AND (@scope_tenant IS NULL OR tenant_id = @scope_tenant)
--   GROUP BY tenant_id, material_id
-- ) s ON s.tenant_id = inv.tenant_id AND s.material_id = inv.material_id
-- SET inv.available_quantity = s.avail,
--     inv.last_updated = NOW()
-- WHERE (@scope_tenant IS NULL OR inv.tenant_id = @scope_tenant);
