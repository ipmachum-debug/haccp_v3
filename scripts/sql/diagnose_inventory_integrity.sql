-- ============================================================================
-- P0 — 재고·식별자 정합성 계량 (READ-ONLY 진단)
-- ----------------------------------------------------------------------------
-- 목적: docs/architecture/08-inventory-identity-diagnosis.md 의 두 근본 병
--       ① 식별자 파편화(이름매칭)  ② 3자 불변식 미강제
--       가 "지금 몇 건" 깨져 있는지 숫자로 만든다. 이 숫자가 P1~ 수정의 기준선.
-- 성격: 전부 SELECT (읽기 전용). 어떤 행도 변경하지 않음.
-- 실행: Genspark 서버 DB. 결과를 캡처해 공유 → P1 범위(특히 FK 백필 필요 여부) 확정.
-- ============================================================================

SET @t := 2;  -- 대상 테넌트 (식품 tenant2)

-- ════════════════════════════════════════════════════════════════════════
-- 병 ① — 식별자 파편화 (원재료)
-- ════════════════════════════════════════════════════════════════════════

-- (1-a) Path B 자재: item_master(raw_material) 인데 legacy_material_id 가 NULL
--       → createPurchase 가 입고 시 LOT/재고를 아예 안 만든다. P1 의 FK 브릿지도 못 씀.
SELECT '1a_pathB_legacy_null' AS metric,
       COUNT(*) AS cnt
FROM item_master
WHERE tenant_id = @t AND item_type = 'raw_material' AND legacy_material_id IS NULL;

-- (1-b) 끊어진 FK: legacy_material_id 가 존재하지 않는 h_materials 를 가리킴
SELECT '1b_legacy_fk_dangling' AS metric,
       COUNT(*) AS cnt
FROM item_master im
WHERE im.tenant_id = @t AND im.item_type = 'raw_material'
  AND im.legacy_material_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM h_materials m WHERE m.id = im.legacy_material_id);

-- (1-c) 이름 브릿지 실패 예정: item_master 이름이 어떤 h_materials.material_name 과도
--       정확히(TRIM) 일치하지 않는 raw_material → 현 이름매칭 변환이 깨질 자재.
SELECT '1c_name_bridge_would_fail' AS metric,
       COUNT(*) AS cnt
FROM item_master im
WHERE im.tenant_id = @t AND im.item_type = 'raw_material'
  AND NOT EXISTS (
    SELECT 1 FROM h_materials m
    WHERE m.tenant_id = im.tenant_id AND TRIM(m.material_name) = TRIM(im.item_name)
  );

-- (1-d) 이름 중복: 같은 material_name 을 가진 h_materials 가 2건 이상
--       → 이름매칭 LIMIT 1 이 '엉뚱한 자재 LOT' 에서 차감할 위험.
SELECT '1d_duplicate_material_name' AS metric,
       COUNT(*) AS name_groups,
       COALESCE(SUM(c), 0) AS total_rows
FROM (
  SELECT TRIM(material_name) AS nm, COUNT(*) AS c
  FROM h_materials WHERE tenant_id = @t
  GROUP BY TRIM(material_name) HAVING COUNT(*) > 1
) d;

-- (1-e) 상세 목록 (상위 50) — 어떤 자재가 문제인지 눈으로 확인
SELECT im.id AS item_master_id, im.item_code, im.item_name,
       im.legacy_material_id,
       (SELECT m.id FROM h_materials m
        WHERE m.tenant_id = im.tenant_id AND TRIM(m.material_name) = TRIM(im.item_name) LIMIT 1) AS name_matched_h_materials_id,
       CASE WHEN im.legacy_material_id IS NULL THEN 'legacy_null'
            WHEN NOT EXISTS (SELECT 1 FROM h_materials m WHERE m.id = im.legacy_material_id) THEN 'fk_dangling'
            WHEN NOT EXISTS (SELECT 1 FROM h_materials m WHERE m.tenant_id=im.tenant_id AND TRIM(m.material_name)=TRIM(im.item_name)) THEN 'name_no_match'
            ELSE 'ok' END AS status
FROM item_master im
WHERE im.tenant_id = @t AND im.item_type = 'raw_material'
HAVING status <> 'ok'
ORDER BY status, im.id
LIMIT 50;

-- ════════════════════════════════════════════════════════════════════════
-- 병 ① — 식별자 파편화 (제품)
-- ════════════════════════════════════════════════════════════════════════

-- (2-a) item_master(own_product) 의 legacy_product_id 상태
SELECT '2a_product_legacy_status' AS metric,
       SUM(legacy_product_id IS NULL) AS legacy_null,
       SUM(legacy_product_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM h_products_v2 p WHERE p.id = im.legacy_product_id)) AS fk_dangling,
       SUM(legacy_product_id = im.id) AS id_equal_invariant_ok
FROM item_master im
WHERE im.tenant_id = @t AND im.item_type = 'own_product';

-- (2-b) 제품명 불일치: 같은 product_id 를 두 정본이 다른 이름으로 부르는 건
--       (배치화면 v2 vs BOM화면 item_master → 화면마다 다른 이름)
SELECT '2b_product_name_divergence' AS metric,
       COUNT(*) AS cnt
FROM h_products_v2 p
JOIN item_master im ON im.id = p.id AND im.tenant_id = p.tenant_id AND im.item_type='own_product'
WHERE p.tenant_id = @t AND TRIM(p.product_name) <> TRIM(im.item_name);

-- ════════════════════════════════════════════════════════════════════════
-- 병 ② — 3자 불변식 위반
-- ════════════════════════════════════════════════════════════════════════

-- (3-a) 집계 vs LOT합 vs 원장합 불일치 (자재별)
--       h_inventory.total  ↔  Σ h_inventory_lots.available  ↔  Σ receipt-usage(부호)
SELECT '3a_three_way_mismatch' AS metric,
       COUNT(*) AS materials_mismatched,
       ROUND(SUM(ABS(agg_total - lot_avail)), 3) AS sum_abs_agg_vs_lot
FROM (
  SELECT inv.material_id,
         inv.total_quantity AS agg_total,
         COALESCE(l.avail, 0) AS lot_avail
  FROM h_inventory inv
  LEFT JOIN (
    SELECT material_id, SUM(available_quantity) AS avail
    FROM h_inventory_lots WHERE tenant_id=@t AND status='available'
    GROUP BY material_id
  ) l ON l.material_id = inv.material_id
  WHERE inv.tenant_id = @t
) x
WHERE ROUND(agg_total - lot_avail, 3) <> 0;

-- (3-b) orphan batch_inputs: inventory_deducted=1 인데 대응 usage 트랜잭션 없음
--       (#361 확장 — 차감 플래그만 있고 원장엔 소모 기록 없음 → 장부 어긋남)
SELECT '3b_deducted_without_usage_tx' AS metric,
       COUNT(*) AS cnt,
       ROUND(SUM(bi.actual_qty), 3) AS total_qty
FROM h_batch_inputs bi
WHERE bi.tenant_id = @t AND bi.inventory_deducted = 1 AND bi.actual_qty > 0
  AND NOT EXISTS (
    SELECT 1 FROM h_inventory_transactions t
    WHERE t.tenant_id = bi.tenant_id AND t.transaction_type = 'usage'
      AND t.material_id = bi.material_id
      AND (t.reference_id = bi.batch_id OR t.source_id = bi.batch_id)
  );

-- (3-c) id 공간 유출: h_batch_inputs.material_id 가 h_materials 에 없음
--       (= item_master.id / h_item_master.id 가 batch_inputs 로 새어 들어옴 → 차감 0건의 원인)
SELECT '3c_batch_input_material_not_in_h_materials' AS metric,
       COUNT(*) AS cnt
FROM h_batch_inputs bi
WHERE bi.tenant_id = @t
  AND NOT EXISTS (SELECT 1 FROM h_materials m WHERE m.id = bi.material_id);

-- (3-d) (참고) 음수 gap: receipt 트랜잭션은 있으나 LOT 이 소진/삭제된 자재
--       (#390 후속 조사 대상 — 소비축 흔적)
SELECT '3d_negative_gap_materials' AS metric,
       COUNT(*) AS cnt,
       ROUND(SUM(gap), 3) AS total_negative_gap
FROM (
  SELECT lot_sum.material_id,
         lot_sum.qty - COALESCE(txn.qty, 0) AS gap
  FROM (SELECT material_id, SUM(quantity) qty FROM h_inventory_lots
        WHERE tenant_id=@t AND lot_number LIKE 'MAT-%' GROUP BY material_id) lot_sum
  LEFT JOIN (SELECT material_id, SUM(quantity) qty FROM h_inventory_transactions
             WHERE tenant_id=@t AND transaction_type='receipt' GROUP BY material_id) txn
    ON txn.material_id = lot_sum.material_id
) y
WHERE gap < 0;

-- ════════════════════════════════════════════════════════════════════════
-- 요약: 위 metric 값들을 캡처해 공유해 주세요.
--   1a/1b/1c/1d 가 크면 → P1 에 FK 백필(legacy_material_id 채우기)을 반드시 동반.
--   3a/3b/3c 가 크면 → P2(불변식 단일화) + P3(과거 재조정) 우선순위 상향.
-- ════════════════════════════════════════════════════════════════════════
