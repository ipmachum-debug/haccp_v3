-- =====================================================================
-- step11_batch_586_actual_quantity_backfill_commit.sql
-- Purpose: status='completed' AND actual_quantity NULL/0 AND
--          production_sku_output 합계 > 0 인 모든 배치 일괄 backfill.
-- Mode: COMMIT (실제 변경 수행)
--
-- 본 마이그레이션은 멱등(idempotent):
--   - 이미 actual_quantity 가 채워져 있으면 UPDATE 영향 0행 (WHERE 절 차단)
--   - 캐시 DELETE 도 idempotent (없는 행은 영향 없음)
--
-- 영향 범위 (dryrun 결과):
--   - 63 batches across 14 dates (4/8 ~ 4/30)
--   - 총 13,418.6 kg backfill
--   - production_daily 캐시 12 행 무효화
--
-- 배경:
--   - PR #277 통합 훅은 신규 배치 자동 처리하지만, 기존 NULL 잔존은 별도 처리.
--   - autoRegenerateProductionDaily() 가 NULL 을 0 으로 보고 달성률 0% 산출 → 빈/잘못된 PDF.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 사전 백업 (한번만 필요 — 재실행 시 EXISTS 면 skip 패턴은 별도 PR 에서 적용)
-- ---------------------------------------------------------------------
-- 백업: NULL 잔존 배치 id + sku_total_kg + planned_date 만 보존
-- (테이블 이미 있으면 INSERT 만 추가 — 멱등 보장)
CREATE TABLE IF NOT EXISTS _bak_batch_actual_qty_20260510 (
  batch_id BIGINT PRIMARY KEY,
  tenant_id INT NOT NULL,
  batch_code VARCHAR(50),
  planned_date DATE,
  prev_actual_quantity DECIMAL(12,3),
  sku_total_kg DECIMAL(12,3),
  backed_up_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT IGNORE INTO _bak_batch_actual_qty_20260510
  (batch_id, tenant_id, batch_code, planned_date, prev_actual_quantity, sku_total_kg)
SELECT
  b.id, b.tenant_id, b.batch_code, b.planned_date,
  b.actual_quantity,
  COALESCE(s.sku_total_kg, 0)
FROM h_batches b
LEFT JOIN (
  SELECT batch_id, SUM(total_kg) AS sku_total_kg
  FROM production_sku_output WHERE tenant_id = 2 GROUP BY batch_id
) s ON s.batch_id = b.id
WHERE b.tenant_id = 2
  AND b.status = 'completed'
  AND (b.actual_quantity IS NULL OR b.actual_quantity = 0)
  AND COALESCE(s.sku_total_kg, 0) > 0;

SELECT COUNT(*) AS backed_up_rows FROM _bak_batch_actual_qty_20260510;

-- ---------------------------------------------------------------------
-- STEP-1. 일괄 backfill — production_sku_output 합계 → h_batches.actual_quantity
-- ---------------------------------------------------------------------
UPDATE h_batches b
JOIN (
  SELECT batch_id, SUM(total_kg) AS sku_total_kg
  FROM production_sku_output
  WHERE tenant_id = 2
  GROUP BY batch_id
) s ON s.batch_id = b.id
SET
  b.actual_quantity = s.sku_total_kg,
  b.updated_at = NOW()
WHERE b.tenant_id = 2
  AND b.status = 'completed'
  AND (b.actual_quantity IS NULL OR b.actual_quantity = 0)
  AND s.sku_total_kg > 0;

SELECT ROW_COUNT() AS backfilled_batches;

-- ---------------------------------------------------------------------
-- STEP-2. h_daily_reports production_daily 캐시 무효화
--   다음 조회 시 autoRegenerateProductionDaily() 가 새 actual_quantity 로 재계산
-- ---------------------------------------------------------------------
DELETE FROM h_daily_reports
WHERE tenant_id = 2
  AND report_type = 'production_daily'
  AND DATE(report_date) IN (
    SELECT DISTINCT DATE(planned_date)
    FROM _bak_batch_actual_qty_20260510
    WHERE tenant_id = 2
  );

SELECT ROW_COUNT() AS invalidated_cache_rows;

-- ---------------------------------------------------------------------
-- STEP-3. 검증
-- ---------------------------------------------------------------------
-- 잔존 NULL 배치 (sku_total_kg > 0 인데 NULL 남아있는지)
SELECT
  COUNT(*) AS remaining_null_with_sku
FROM h_batches b
LEFT JOIN (
  SELECT batch_id, SUM(total_kg) AS sku_total_kg
  FROM production_sku_output WHERE tenant_id = 2 GROUP BY batch_id
) s ON s.batch_id = b.id
WHERE b.tenant_id = 2
  AND b.status = 'completed'
  AND (b.actual_quantity IS NULL OR b.actual_quantity = 0)
  AND COALESCE(s.sku_total_kg, 0) > 0;

-- 백필된 batch 들의 actual_quantity vs sku_total_kg 일치 확인 (불일치 = 0 이어야 정상)
SELECT
  COUNT(*) AS mismatched_batches
FROM h_batches b
JOIN _bak_batch_actual_qty_20260510 bk ON bk.batch_id = b.id
WHERE ABS(COALESCE(b.actual_quantity, 0) - bk.sku_total_kg) > 0.001;
