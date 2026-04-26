-- =====================================================================
-- PR-K2: h_inventory 마스터 백필 + UNIQUE 키 + MAT-097 unit 정정
-- =====================================================================
-- 적용 일자: 2026-04-26
-- 실행 환경: 운영 DB (tenant_id=2)
-- 실행 주체: Genspark 에이전트 (수동 SQL 실행)
-- 관련 PR: fix/k2-h-inventory-upsert (purchasePost.ts UPSERT 코드)
-- 관련 문서: docs/architecture/06-material-pipeline.md (H1~H9 검증)
-- =====================================================================
--
-- ⚠️ 실행 순서 엄수 (1 → 2 → 3):
--   1. ALTER TABLE (UNIQUE 키 추가) — purchasePost UPSERT 의 ON DUPLICATE KEY 기반
--   2. UPDATE h_materials (MAT-097 unit 정정) — 백필 시 'EA' 사용 보장
--   3. INSERT INTO h_inventory (96자재 백필) — 마스터 시드
--   4. 위 3단계 모두 성공 후에만 fix/k2-h-inventory-upsert PR 머지
--
-- 사전 검증 (Genspark dry-run v2 결과):
--   - h_inventory 현재 0행 → 첫 INSERT 안전
--   - 음수 재고 0건 → 백필 안전
--   - h_materials 96건 모두 active=1 → 전체 시드
--   - LOT unit 일관성: 12건 다중 unit 발견 (h_materials.unit 우선이라 백필 영향 없음)
--   - MAT-097 (id=676): 어상자류, unit 누락 → 'EA' 로 정정 (h_materials 기존 분포에 'EA' 1건 존재)
--
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. UNIQUE 키 추가 (purchasePost UPSERT 전제 조건)
-- ---------------------------------------------------------------------
-- 현재 h_inventory.PRIMARY KEY = id 만 존재.
-- (tenant_id, material_id) 복합 UNIQUE 가 없어 ON DUPLICATE KEY UPDATE 불가.
-- 첫 INSERT 전에 추가하여 멱등성 확보.
-- 사전 안전: h_inventory 현재 0행 → 중복키 충돌 위험 0.

ALTER TABLE h_inventory
  ADD UNIQUE KEY uk_inv_material (tenant_id, material_id);

-- ---------------------------------------------------------------------
-- 2. MAT-097 unit 정정 (백필 시 'kg' fallback 방지)
-- ---------------------------------------------------------------------
-- MAT-097 = "A-13(어상자 15kg-2)" 어상자/박스류.
-- h_materials.unit IS NULL 인 유일한 자재 (1건).
-- 미정정 시 백필 SELECT 의 fallback 체인이 'kg' 으로 시드 → 잘못된 단위 영구화.
-- → 정정 후 백필하면 'EA' 로 시드.

UPDATE h_materials
SET unit='EA'
WHERE id=676 AND tenant_id=2 AND unit IS NULL;

-- ---------------------------------------------------------------------
-- 3. h_inventory 백필 (96 자재, 1회성)
-- ---------------------------------------------------------------------
-- 자재별 LOT 집계 + unit fallback 체인 (h_materials → LOT 최빈 → 'kg').
-- product_id IS NULL 조건으로 material LOT 만 집계 (product LOT 385건 제외).

INSERT INTO h_inventory
  (tenant_id, material_id, item_name, unit,
   total_quantity, available_quantity, reserved_quantity,
   created_at, updated_at)
SELECT
  m.tenant_id,
  m.id AS material_id,
  m.material_name AS item_name,
  COALESCE(NULLIF(m.unit, ''), NULLIF(lot_units.unit, ''), 'kg') AS unit,
  COALESCE(lot_agg.total_qty, 0) AS total_quantity,
  COALESCE(lot_agg.available_qty, 0) AS available_quantity,
  0 AS reserved_quantity,
  NOW(),
  NOW()
FROM h_materials m
LEFT JOIN (
  SELECT
    material_id,
    SUM(current_quantity) AS total_qty,
    SUM(CASE WHEN status='available' THEN current_quantity ELSE 0 END) AS available_qty
  FROM h_inventory_lots
  WHERE tenant_id=2
    AND material_id IS NOT NULL
    AND product_id IS NULL
  GROUP BY material_id
) lot_agg ON lot_agg.material_id = m.id
LEFT JOIN (
  SELECT material_id, unit
  FROM (
    SELECT
      material_id,
      unit,
      ROW_NUMBER() OVER (PARTITION BY material_id ORDER BY COUNT(*) DESC) AS rn
    FROM h_inventory_lots
    WHERE tenant_id=2 AND material_id IS NOT NULL
    GROUP BY material_id, unit
  ) ranked
  WHERE rn=1
) lot_units ON lot_units.material_id = m.id
WHERE m.tenant_id=2;

-- ---------------------------------------------------------------------
-- 4. 사후 검증 쿼리 (실행 후 결과 확인용 — INSERT 아님)
-- ---------------------------------------------------------------------
-- 4-1. 96행 INSERT 확인
-- SELECT COUNT(*) FROM h_inventory WHERE tenant_id=2;
-- 기대값: 96

-- 4-2. unit fallback 분포
-- SELECT unit, COUNT(*) FROM h_inventory WHERE tenant_id=2 GROUP BY unit;
-- 기대값: kg ~88, EA 2 (기존 1 + MAT-097), set 4, g 1, L 1 (정상이면 'kg' 강제 fallback 0건)

-- 4-3. UNIQUE 키 확인
-- SHOW INDEXES FROM h_inventory WHERE Key_name='uk_inv_material';
-- 기대값: 1 row

-- 4-4. 음수/이상값 검출
-- SELECT id, material_id, total_quantity, available_quantity FROM h_inventory
-- WHERE tenant_id=2 AND (total_quantity < 0 OR available_quantity < 0 OR available_quantity > total_quantity);
-- 기대값: 0 rows

-- =====================================================================
-- 관련 후속 작업 (별도 PR)
-- =====================================================================
-- W2 (LOT 12건 unit 혼용): h_inventory_lots 데이터 품질 정정 PR (예정)
-- PR-K1 (autoMaterialIssue.ts JOIN 폴백): 본 PR 머지 후 진행 (cosmetic)
-- PR-K3 (BOM/batch material_id 통일): h_inventory 안정 후 진행 (구조)
-- PR-K5 (4/9 미차감 batch 7건 재처리): K1+K3 완료 후 1회 스크립트 실행
