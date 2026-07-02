-- ============================================================================
-- P1 Track A — 재고 원장 재조정 (병② 3자 불변식 위반 급성분 복구)
-- ----------------------------------------------------------------------------
-- 배경: docs/architecture/08-inventory-identity-diagnosis.md
--   병② = h_inventory(집계) ↔ h_inventory_lots(LOT) ↔ h_inventory_transactions(원장)
--         3자가 어긋남. P0 진단(#394) 결과 급성:
--           · 3a: 집계 total ≠ ΣLOT available — 44 자재 / 약 22,628 kg
--           · 3b: batch_inputs 차감(deducted=1)했으나 usage 원장 없음 — 285건 / 약 7,041 kg
--   LOT(h_inventory_lots)이 FEFO 차감의 실질 원천(ground truth)이므로,
--     · 집계(h_inventory)는 ΣLOT 으로 재계산하고(3a),
--     · 누락된 소모 원장(usage)은 실제 차감된 LOT 기준으로 소급 복원(3b)한다.
--
-- 성격/안전:
--   · Part 1(3a): 집계 재계산 — 수량 '표시값' 정정. LOT/원장은 안 건드림.
--   · Part 2(3b): usage 원장 소급 INSERT — 순수 audit-trail 보강.
--                 LOT available 은 이미 차감돼 있음(deducted=1) → 재차감 없음.
--   · 전부 STEP 1(DRY-RUN) 먼저. 쓰기 블록은 주석 처리 상태 — 확인 후 해제.
--   · 멱등: 태그(reference_type='backfill_usage', source_id=batch_input.id)로 재실행 안전.
--
-- ⚠️ 실행 주체: Genspark(서버 DB). Claude 는 작성만.
--   ⚠️ 실행 전 PR #396(item_master.legacy FK 백필) 이 먼저 반영돼 있으면 이상적이나,
--      Track A 는 FK 에 의존하지 않는다(canonical material_id 를 LOT 에서 직접 취득).
-- ============================================================================

SET @t := 2;            -- 대상 테넌트 (식품 tenant2). 전체면 NULL 후 아래 필터 조정.
SET @sys_user := 1;     -- created_by NOT NULL. 운영 관리자 user id 로 교체.

-- ════════════════════════════════════════════════════════════════════════
-- PART 1 — (3a) 집계 재계산: h_inventory ← Σ h_inventory_lots
-- ════════════════════════════════════════════════════════════════════════

-- ── STEP 1a (DRY-RUN) ── 집계 vs LOT 3중 비교 (semantics 확인용) ───────────
--   ⚠️ Genspark 확인 필요: total_quantity 의 의미.
--     · 가설 A) total = 현재 보유 = available (reserved 분리 안 씀) → total := ΣLOT.available
--     · 가설 B) total = available + reserved → total := ΣLOT.available + inv.reserved
--   아래 표로 reserved 가 0 인지, LOT.available/current/quantity 중 무엇과 맞는지 눈으로 확인.
SELECT
  inv.material_id,
  m.material_name,
  inv.total_quantity                          AS agg_total,
  inv.available_quantity                      AS agg_available,
  inv.reserved_quantity                       AS agg_reserved,
  ROUND(COALESCE(l.avail, 0), 3)              AS lot_available_sum,   -- status='available' 기준 (정본 후보)
  ROUND(COALESCE(l.curr, 0), 3)               AS lot_current_sum,
  ROUND(COALESCE(l.qty, 0), 3)                AS lot_original_sum,
  ROUND(inv.available_quantity - COALESCE(l.avail, 0), 3) AS avail_gap,   -- 이 값이 정정 대상
  ROUND(inv.total_quantity     - COALESCE(l.avail, 0), 3) AS total_vs_lotavail_gap
FROM h_inventory inv
LEFT JOIN (
  SELECT material_id,
         SUM(available_quantity)                          AS avail,
         SUM(COALESCE(current_quantity, available_quantity)) AS curr,
         SUM(quantity)                                    AS qty
  FROM h_inventory_lots
  WHERE (@t IS NULL OR tenant_id = @t) AND status = 'available'
  GROUP BY material_id
) l ON l.material_id = inv.material_id
LEFT JOIN h_materials m ON m.id = inv.material_id
WHERE (@t IS NULL OR inv.tenant_id = @t)
  AND inv.material_id IS NOT NULL
  AND ROUND(inv.available_quantity - COALESCE(l.avail, 0), 3) <> 0
ORDER BY ABS(inv.available_quantity - COALESCE(l.avail, 0)) DESC;

-- (참고) reserved 가 실제로 쓰이는지 한 줄 확인 — 0 이면 가설 A 채택 가능.
SELECT '3a_reserved_usage' AS metric,
       COUNT(*) AS rows_with_reserved,
       ROUND(COALESCE(SUM(reserved_quantity), 0), 3) AS reserved_sum
FROM h_inventory
WHERE (@t IS NULL OR tenant_id = @t) AND COALESCE(reserved_quantity, 0) <> 0;

-- ── STEP 2a (쓰기, 확인 후 주석 해제) ── 집계 available 을 ΣLOT.available 로 정정 ──
--   기본 정책: available 은 LOT 정본으로 무조건 맞춘다.
--   total 은 reserved 보존(가설 B) — reserved 가 전부 0 이면 결과적으로 total=available.
--   ⚠️ STEP 1a 로 reserved=0 을 확인했다면 그대로, 아니면 정책을 사용자와 재확인.
-- START TRANSACTION;
-- UPDATE h_inventory inv
-- LEFT JOIN (
--   SELECT material_id, SUM(available_quantity) AS avail
--   FROM h_inventory_lots
--   WHERE (@t IS NULL OR tenant_id = @t) AND status = 'available'
--   GROUP BY material_id
-- ) l ON l.material_id = inv.material_id
-- SET inv.available_quantity = ROUND(COALESCE(l.avail, 0), 3),
--     inv.total_quantity     = ROUND(COALESCE(l.avail, 0) + COALESCE(inv.reserved_quantity, 0), 3),
--     inv.last_updated       = NOW()
-- WHERE (@t IS NULL OR inv.tenant_id = @t)
--   AND inv.material_id IS NOT NULL
--   AND ROUND(inv.available_quantity - COALESCE(l.avail, 0), 3) <> 0;
-- SELECT ROW_COUNT() AS reconciled_materials;   -- 예상: STEP 1a 행 수(≈44)
-- COMMIT;   -- STEP 1a 대비 값 확인 후

-- ════════════════════════════════════════════════════════════════════════
-- PART 2 — (3b) 누락 usage 원장 소급 복원
--   ⚠️ 컬럼명: h_batch_inputs.actual_quantity (진단 #394 의 actual_qty 는 오타).
-- ════════════════════════════════════════════════════════════════════════

-- ── STEP 1b (DRY-RUN) ── orphan 분류: LOT 알려짐(자동 복원 가능) vs 미상(수동) ──
-- (1b-요약)
SELECT
  CASE WHEN bi.lot_id IS NOT NULL AND EXISTS
         (SELECT 1 FROM h_inventory_lots l WHERE l.id = bi.lot_id)
       THEN 'A_lot_known'      -- LOT 로 canonical material_id 확정 가능 → 자동 복원 안전
       ELSE 'B_lot_unknown' END AS class,
  COUNT(*)                                   AS cnt,
  ROUND(SUM(COALESCE(bi.actual_quantity, bi.planned_quantity)), 3) AS qty
FROM h_batch_inputs bi
WHERE bi.tenant_id = @t
  AND bi.inventory_deducted = 1
  AND COALESCE(bi.actual_quantity, bi.planned_quantity) > 0
  AND NOT EXISTS (
    SELECT 1 FROM h_inventory_transactions t
    WHERE t.tenant_id = bi.tenant_id
      AND t.transaction_type = 'usage'
      AND (t.reference_id = bi.batch_id OR t.source_id = bi.batch_id)
      AND (t.material_id = bi.material_id
           OR t.lot_id = bi.lot_id
           OR t.source_id = bi.id)          -- 이미 소급된 건도 orphan 에서 제외(멱등)
  )
GROUP BY class;

-- (1b-상세) 자동 복원 대상(A) 상위 목록 — 사람이 눈으로 확인
SELECT bi.id AS batch_input_id, bi.batch_id, b.batch_code,
       bi.material_id  AS batch_input_material_id,   -- item_master 공간일 수 있음
       l.material_id   AS lot_canonical_material_id,  -- ★ 원장에 넣을 정본 id
       m.material_name,
       ROUND(COALESCE(bi.actual_quantity, bi.planned_quantity), 3) AS use_qty,
       bi.unit, bi.lot_id,
       COALESCE(DATE(bi.input_time), DATE(b.completed_at), b.planned_date, DATE(bi.created_at)) AS use_date
FROM h_batch_inputs bi
JOIN h_inventory_lots l ON l.id = bi.lot_id
LEFT JOIN h_batches   b ON b.id = bi.batch_id
LEFT JOIN h_materials m ON m.id = l.material_id
WHERE bi.tenant_id = @t
  AND bi.inventory_deducted = 1
  AND COALESCE(bi.actual_quantity, bi.planned_quantity) > 0
  AND NOT EXISTS (
    SELECT 1 FROM h_inventory_transactions t
    WHERE t.tenant_id = bi.tenant_id AND t.transaction_type = 'usage'
      AND (t.reference_id = bi.batch_id OR t.source_id = bi.batch_id)
      AND (t.material_id = bi.material_id OR t.lot_id = bi.lot_id OR t.source_id = bi.id)
  )
ORDER BY use_qty DESC
LIMIT 100;

-- ── STEP 2b (쓰기, 확인 후 주석 해제) ── class A(LOT 알려짐)만 usage 원장 소급 ──
--   material_id 는 LOT 의 canonical id(h_materials.id)를 사용 → id 공간 오염 방지.
--   순수 audit 보강(재차감 없음). source_id=bi.id 로 멱등.
-- START TRANSACTION;
-- INSERT INTO h_inventory_transactions
--   (tenant_id, lot_id, material_id, transaction_type, quantity, unit,
--    transaction_date, reference_type, reference_id, source_type, source_id,
--    action_type, notes, created_by, created_at)
-- SELECT
--   bi.tenant_id,
--   bi.lot_id,
--   l.material_id,                                        -- ★ LOT 정본 canonical id
--   'usage',
--   ROUND(COALESCE(bi.actual_quantity, bi.planned_quantity), 3),
--   bi.unit,
--   COALESCE(DATE(bi.input_time), DATE(b.completed_at), b.planned_date, DATE(bi.created_at)),
--   'backfill_usage', bi.batch_id, 'backfill', bi.id,
--   'reconstructed',
--   CONCAT('[backfill #3b] batch_input=', bi.id, ' batch=', bi.batch_id,
--          ' 차감완료(deducted=1)이나 usage 원장 누락분 소급 복원'),
--   @sys_user, NOW()
-- FROM h_batch_inputs bi
-- JOIN h_inventory_lots l ON l.id = bi.lot_id
-- LEFT JOIN h_batches b ON b.id = bi.batch_id
-- WHERE bi.tenant_id = @t
--   AND bi.inventory_deducted = 1
--   AND COALESCE(bi.actual_quantity, bi.planned_quantity) > 0
--   AND NOT EXISTS (
--     SELECT 1 FROM h_inventory_transactions t
--     WHERE t.tenant_id = bi.tenant_id AND t.transaction_type = 'usage'
--       AND (t.reference_id = bi.batch_id OR t.source_id = bi.batch_id)
--       AND (t.material_id = bi.material_id OR t.lot_id = bi.lot_id OR t.source_id = bi.id)
--   );
-- SELECT ROW_COUNT() AS reconstructed_usage_rows;   -- 예상: STEP 1b 의 class A cnt
-- COMMIT;   -- 값 확인 후

-- ── class B(lot_id 미상) 는 자동 복원하지 않음 ──────────────────────────────
--   어느 LOT 이 실제 차감됐는지 원장 근거가 없어 canonical material_id 를 확정 불가.
--   → 개별 조사(배치별 소모 근거 확인) 후 수동 INSERT. P2(applyInventoryDelta 단일화)로
--     신규 발생을 원천 차단하는 것이 근본. class B 건수/수량은 STEP 1b 요약 참고.

-- ════════════════════════════════════════════════════════════════════════
-- STEP 3 (사후 검증) — 백필/재계산 후 재측정
-- ════════════════════════════════════════════════════════════════════════
-- (3-검증-a) 집계 avail_gap 이 0 이 됐는지 (STEP 1a 를 다시 실행해도 됨)
SELECT '3a_after_mismatch' AS metric, COUNT(*) AS materials_still_mismatched
FROM h_inventory inv
LEFT JOIN (
  SELECT material_id, SUM(available_quantity) AS avail
  FROM h_inventory_lots WHERE (@t IS NULL OR tenant_id=@t) AND status='available'
  GROUP BY material_id
) l ON l.material_id = inv.material_id
WHERE (@t IS NULL OR inv.tenant_id=@t) AND inv.material_id IS NOT NULL
  AND ROUND(inv.available_quantity - COALESCE(l.avail,0), 3) <> 0;

-- (3-검증-b) 남은 orphan usage (class A 는 0 이어야, class B 만 남음)
SELECT '3b_after_orphan' AS metric, COUNT(*) AS remaining_orphans,
       ROUND(SUM(COALESCE(bi.actual_quantity, bi.planned_quantity)), 3) AS remaining_qty
FROM h_batch_inputs bi
WHERE bi.tenant_id = @t AND bi.inventory_deducted = 1
  AND COALESCE(bi.actual_quantity, bi.planned_quantity) > 0
  AND NOT EXISTS (
    SELECT 1 FROM h_inventory_transactions t
    WHERE t.tenant_id = bi.tenant_id AND t.transaction_type='usage'
      AND (t.reference_id = bi.batch_id OR t.source_id = bi.batch_id)
      AND (t.material_id = bi.material_id OR t.lot_id = bi.lot_id OR t.source_id = bi.id)
  );
