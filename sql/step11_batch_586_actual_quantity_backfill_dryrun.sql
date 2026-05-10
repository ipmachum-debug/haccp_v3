-- =====================================================================
-- step11_batch_586_actual_quantity_backfill_dryrun.sql
-- Purpose: 4/20 batch 586 (30091-20260420-001) actual_quantity NULL 잔존 보강
-- Mode: DRY-RUN (SELECT만, 변경 없음)
--
-- 배경:
--   - PR #277 (fix/batch-completion-auto-hooks) 의 통합 훅은 신규 배치는
--     자동 처리하지만, 이미 'completed' 상태로 NULL 잔존한 기존 데이터는
--     별도 backfill 필요.
--   - batch 586 (planned_date=2026-04-20):
--     - actual_quantity = NULL
--     - production_sku_output.total_kg 합계 = 531.000 (SKU 1건)
--     - h_batch_inputs = 11 행 (정상)
--   - autoRegenerateProductionDaily() 가 NULL 을 0 으로 보고 4/20 달성률 0%
--     산출 → 4/20 빈/잘못된 PDF 발생.
-- =====================================================================

-- 1) 대상 배치 진단
SELECT
  b.id, b.batch_code, b.status, b.planned_quantity, b.actual_quantity,
  b.planned_date,
  (SELECT COALESCE(SUM(total_kg),0)
     FROM production_sku_output
     WHERE batch_id=b.id AND tenant_id=b.tenant_id) AS sku_total_kg,
  (SELECT COUNT(*)
     FROM production_sku_output
     WHERE batch_id=b.id AND tenant_id=b.tenant_id) AS sku_rows,
  (SELECT COUNT(*)
     FROM h_batch_inputs
     WHERE batch_id=b.id AND tenant_id=b.tenant_id) AS input_rows
FROM h_batches b
WHERE b.id = 586 AND b.tenant_id = 2;

-- 2) 동일 패턴 (status=completed AND actual_quantity NULL AND sku 합계 > 0) 잔존 점검
--    (혹시 다른 배치도 같은 NULL 잔존이 남아있는지 확인 — 일괄 처리 후보)
SELECT
  b.id, b.batch_code, b.planned_date, b.actual_quantity,
  COALESCE(s.sku_total_kg, 0) AS sku_total_kg
FROM h_batches b
LEFT JOIN (
  SELECT batch_id, SUM(total_kg) AS sku_total_kg
  FROM production_sku_output
  WHERE tenant_id = 2
  GROUP BY batch_id
) s ON s.batch_id = b.id
WHERE b.tenant_id = 2
  AND b.status = 'completed'
  AND (b.actual_quantity IS NULL OR b.actual_quantity = 0)
  AND COALESCE(s.sku_total_kg, 0) > 0
ORDER BY b.planned_date ASC, b.id ASC;

-- 3) NULL 잔존 배치들의 planned_date 들의 production_daily 캐시 (backfill 후 무효화 대상)
SELECT
  d.id, d.tenant_id, d.site_id, d.report_date, d.report_type, d.generated_at
FROM h_daily_reports d
WHERE d.tenant_id = 2
  AND d.report_type = 'production_daily'
  AND DATE(d.report_date) IN (
    SELECT DISTINCT DATE(b.planned_date)
    FROM h_batches b
    LEFT JOIN (
      SELECT batch_id, SUM(total_kg) AS sku_total_kg
      FROM production_sku_output WHERE tenant_id = 2 GROUP BY batch_id
    ) s ON s.batch_id = b.id
    WHERE b.tenant_id = 2
      AND b.status = 'completed'
      AND (b.actual_quantity IS NULL OR b.actual_quantity = 0)
      AND COALESCE(s.sku_total_kg, 0) > 0
  )
ORDER BY d.report_date ASC;

-- 4) backfill 영향 요약 (날짜별 배치 수)
SELECT
  DATE(b.planned_date) AS planned_date,
  COUNT(*) AS null_batches,
  SUM(COALESCE(s.sku_total_kg, 0)) AS total_kg_to_backfill
FROM h_batches b
LEFT JOIN (
  SELECT batch_id, SUM(total_kg) AS sku_total_kg
  FROM production_sku_output WHERE tenant_id = 2 GROUP BY batch_id
) s ON s.batch_id = b.id
WHERE b.tenant_id = 2
  AND b.status = 'completed'
  AND (b.actual_quantity IS NULL OR b.actual_quantity = 0)
  AND COALESCE(s.sku_total_kg, 0) > 0
GROUP BY DATE(b.planned_date)
ORDER BY DATE(b.planned_date) ASC;
