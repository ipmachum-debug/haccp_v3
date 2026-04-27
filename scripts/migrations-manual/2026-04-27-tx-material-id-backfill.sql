-- =====================================================================
-- PR-§5.2 (PR 1): h_inventory_transactions.material_id 컬럼 추가 + 백필
-- =====================================================================
-- 적용 일자: 2026-04-27
-- 실행 환경: 운영 DB (tenant_id=2)
-- 실행 주체: Genspark 에이전트 (수동 SQL 실행)
-- 관련 PR: fix/tx-material-id-column (스키마 + 백필 SQL)
-- 관련 문서: docs/architecture/06-material-pipeline-fixes-summary.md §5.2
-- =====================================================================
--
-- 배경:
--   기존 getConsumptionSummary 는 4단 COALESCE fallback 으로 원재료명을 매칭:
--     m1 = h_inventory_lots.material_id  → h_materials      (정상)
--     m2 = h_inventory.material_id       → h_materials      (LOT 없음)
--     m3 = h_batch_inputs.material_id    → h_materials      (PR-W5, lot_id=0)
--     im = notes 파싱 (#ID)              → item_master      (PR-W6, orphan)
--
--   PR-W7 까지 화면은 깨끗하지만 "장부엔 있는데 LOT 가 없다" 데이터가 누적.
--   material_id 컬럼을 직접 추가하면:
--     - SELECT 쿼리 단순화 (4단 → 1단 + 잔여 fallback 은 defense-in-depth)
--     - notes 파싱 의존성 제거 (fragile 해소)
--     - 신규 INSERT 시 직접 채워 데이터 무결성 보장
--
-- ⚠️ 실행 순서 엄수 (1 → 2 → 3 → 4 → 5):
--   1. ALTER TABLE (컬럼 추가)
--   2. CREATE INDEX (조회 성능)
--   3. 백필 검증 쿼리 (dry-run, 어떤 행이 채워질지 미리 확인)
--   4. UPDATE (실제 백필) — 4단 fallback 동일 로직
--   5. 사후 검증 (NULL 잔존, 분포 확인)
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. ALTER TABLE — material_id 컬럼 추가 (NULLABLE, ALGORITHM=INSTANT)
-- ---------------------------------------------------------------------
-- MySQL 8.0+ 의 INSTANT 알고리즘 사용 → 메타데이터만 변경, 테이블 재작성 없음.
-- 운영 중 lock 거의 없음.

ALTER TABLE h_inventory_transactions
  ADD COLUMN material_id BIGINT NULL AFTER inventory_id,
  ALGORITHM=INSTANT;


-- ---------------------------------------------------------------------
-- 2. 인덱스 생성 — (tenant_id, material_id, transaction_date)
-- ---------------------------------------------------------------------
-- getConsumptionSummary 같은 월별 + 자재별 집계 쿼리에 필요.
-- ONLINE DDL (lock 거의 없음).

CREATE INDEX idx_tx_tenant_material_date
  ON h_inventory_transactions (tenant_id, material_id, transaction_date);


-- ---------------------------------------------------------------------
-- 3. 백필 dry-run — 어떤 fallback 분기가 얼마나 채워질지 미리 확인
-- ---------------------------------------------------------------------
-- 결과 해석:
--   - m1: lot 직접 매칭 (가장 신뢰)
--   - m2: inventory 매칭 (lot 없을 때)
--   - m3: batch_inputs 매칭 (lot_id=0)
--   - im: notes 파싱 매칭 (orphan)
--   - none: 매칭 실패 (이 행은 NULL 로 남음, 사후 조사 대상)

SELECT
  CASE
    WHEN m1.id IS NOT NULL THEN 'm1'
    WHEN m2.id IS NOT NULL THEN 'm2'
    WHEN m3.id IS NOT NULL THEN 'm3'
    WHEN im.id IS NOT NULL THEN 'im'
    ELSE 'none'
  END AS source,
  COUNT(*) AS cnt
FROM h_inventory_transactions t
LEFT JOIN h_inventory_lots l ON l.id = t.lot_id AND t.lot_id > 0
LEFT JOIN h_materials m1 ON m1.id = l.material_id
LEFT JOIN h_inventory inv ON inv.id = t.inventory_id
LEFT JOIN h_materials m2 ON m2.id = inv.material_id
LEFT JOIN h_batch_inputs bi
  ON bi.id = t.source_line_id
 AND bi.batch_id = t.source_id
 AND bi.tenant_id = t.tenant_id
 AND t.source_type IN ('BATCH','batch_completion')
LEFT JOIN h_materials m3 ON m3.id = bi.material_id
LEFT JOIN item_master im
  ON im.tenant_id = t.tenant_id
 AND im.is_active = 1
 AND t.notes LIKE '원재료 #%자동출고%'
 AND im.id = CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(t.notes, '#', -1), ' ', 1) AS UNSIGNED)
WHERE t.tenant_id = 2
  AND t.material_id IS NULL
GROUP BY source
ORDER BY source;


-- ---------------------------------------------------------------------
-- 4. 백필 UPDATE (4단 fallback 동일 로직)
-- ---------------------------------------------------------------------
-- 주의:
--   - 백필은 t.material_id IS NULL 인 행만 대상 (이미 채워진 신규 행 보호)
--   - im.id 분기는 item_master.id → legacy_material_id 변환 시도
--     (h_materials canonical 우선이므로 legacyMaterialId 가 있으면 그 값 사용)
--   - 한 번에 전체 UPDATE — tenant_id=2 만 대상 (운영 단일 테넌트)
--
-- 실행 시간 추정:
--   tx 행 수 약 4,000 건 가정 → 1~2 초

UPDATE h_inventory_transactions t
LEFT JOIN h_inventory_lots l ON l.id = t.lot_id AND t.lot_id > 0
LEFT JOIN h_inventory inv ON inv.id = t.inventory_id
LEFT JOIN h_batch_inputs bi
  ON bi.id = t.source_line_id
 AND bi.batch_id = t.source_id
 AND bi.tenant_id = t.tenant_id
 AND t.source_type IN ('BATCH','batch_completion')
LEFT JOIN item_master im
  ON im.tenant_id = t.tenant_id
 AND im.is_active = 1
 AND t.notes LIKE '원재료 #%자동출고%'
 AND im.id = CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(t.notes, '#', -1), ' ', 1) AS UNSIGNED)
SET t.material_id = COALESCE(
  l.material_id,
  inv.material_id,
  bi.material_id,
  im.legacy_material_id,  -- item_master 매칭 시 canonical h_materials.id 우선
  im.id                   -- legacy_material_id 가 NULL 이면 item_master.id 자체
)
WHERE t.tenant_id = 2
  AND t.material_id IS NULL;


-- ---------------------------------------------------------------------
-- 5. 사후 검증 쿼리
-- ---------------------------------------------------------------------

-- 5-1. 전체 NULL 잔존 카운트 (목표: 0 또는 매우 작음)
SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN material_id IS NULL THEN 1 ELSE 0 END) AS still_null,
  ROUND(SUM(CASE WHEN material_id IS NULL THEN 1 ELSE 0 END) / COUNT(*) * 100, 2) AS null_pct
FROM h_inventory_transactions
WHERE tenant_id = 2;

-- 5-2. material_id 분포 (h_materials 와 일치하는지)
SELECT
  CASE
    WHEN t.material_id IS NULL THEN 'NULL'
    WHEN m.id IS NOT NULL THEN 'h_materials.id 매칭'
    ELSE 'h_materials 미매칭 (legacy or orphan)'
  END AS status,
  COUNT(*) AS cnt
FROM h_inventory_transactions t
LEFT JOIN h_materials m ON m.id = t.material_id AND m.tenant_id = t.tenant_id
WHERE t.tenant_id = 2
GROUP BY status
ORDER BY cnt DESC;

-- 5-3. NULL 잔존 행 샘플 (수동 조사 필요할 때)
SELECT id, lot_id, inventory_id, source_type, source_id, source_line_id,
       LEFT(notes, 60) AS notes_preview, transaction_date
FROM h_inventory_transactions
WHERE tenant_id = 2
  AND material_id IS NULL
ORDER BY id DESC
LIMIT 20;

-- 5-4. 인덱스 사용 확인 (옵션)
EXPLAIN
SELECT material_id, COUNT(*)
FROM h_inventory_transactions
WHERE tenant_id = 2
  AND transaction_date >= '2026-04-01'
GROUP BY material_id;


-- =====================================================================
-- 적용 완료 후 다음 단계:
--   - 본 SQL 적용 + 5-1 검증 (null_pct < 5% 권장) 통과 후
--   - PR fix/tx-material-id-column 머지 (스키마 sync — 운영 무영향)
--   - 별도 PR 로 INSERT 사이트 수정 (모든 INSERT 에 material_id 작성)
--   - 별도 PR 로 SELECT 단순화 (matchSource 'direct' 추가 + 4단 fallback 정리)
-- =====================================================================
