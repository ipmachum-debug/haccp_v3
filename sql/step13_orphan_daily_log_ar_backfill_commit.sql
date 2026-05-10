-- =============================================================================
-- Step 13 (COMMIT): 고아 daily_log checklist record 의 누락 AR 보충
-- =============================================================================
-- 배경/정책: step13_orphan_daily_log_ar_backfill_dryrun.sql 헤더 참조
--
-- 작업 내용 (멱등):
--   1. 백업 테이블 (_bak_orphan_daily_log_ar_20260510) 생성: 보충 대상 record 메타
--   2. INSERT INTO h_approval_requests
--      (요청자 = record.created_by, 제목 = [일일일지] {form_date} 일반위생관리 및 공정점검표,
--       status = pending_review, priority = medium)
--      WHERE NOT EXISTS 로 중복 차단
--   3. 검증: 보충 후 고아 0 건이어야 함
-- =============================================================================

USE haccp_tenant_db;

-- ── 1. 백업 테이블 (재실행 시에도 안전 — INSERT IGNORE) ──
CREATE TABLE IF NOT EXISTS _bak_orphan_daily_log_ar_20260510 (
  record_id    BIGINT       NOT NULL,
  site_id      INT          NOT NULL,
  tenant_id    INT          NOT NULL,
  form_date    VARCHAR(20)  NOT NULL,
  status       VARCHAR(50)  NULL,
  created_by   BIGINT       NULL,
  record_created_at TIMESTAMP NULL,
  backed_up_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (record_id)
);

INSERT IGNORE INTO _bak_orphan_daily_log_ar_20260510
  (record_id, site_id, tenant_id, form_date, status, created_by, record_created_at)
SELECT r.id, r.site_id, r.tenant_id, r.form_date, r.status, r.created_by, r.created_at
FROM h_generic_checklist_records r
LEFT JOIN h_approval_requests ar
  ON ar.tenant_id = r.tenant_id
 AND ar.request_type = 'daily_log'
 AND ar.reference_type = 'checklist'
 AND ar.reference_id = r.id
WHERE r.tenant_id = 2
  AND r.form_type = 'daily_log'
  AND ar.id IS NULL;

SELECT 'backup_count' AS step, COUNT(*) AS rows_in_backup
FROM _bak_orphan_daily_log_ar_20260510;

-- ── 2. 누락된 AR 보충 INSERT (멱등 — WHERE NOT EXISTS) ──
INSERT INTO h_approval_requests
  (site_id, tenant_id, request_type, reference_type, reference_id,
   title, description, status, priority, requested_by, created_at)
SELECT
  r.site_id,
  r.tenant_id,
  'daily_log',
  'checklist',
  r.id,
  CONCAT('[일일일지] ', r.form_date, ' 일반위생관리 및 공정점검표'),
  CONCAT('작업일: ', r.form_date,
         '\n[누락 AR 보충 — record_id=', r.id, ' 의 짝꿍 승인요청이 없어 자동 보충]'),
  'pending_review',
  'medium',
  COALESCE(r.created_by, 1),
  NOW()
FROM h_generic_checklist_records r
WHERE r.tenant_id = 2
  AND r.form_type = 'daily_log'
  AND NOT EXISTS (
    SELECT 1 FROM h_approval_requests ar
    WHERE ar.tenant_id = r.tenant_id
      AND ar.request_type = 'daily_log'
      AND ar.reference_type = 'checklist'
      AND ar.reference_id = r.id
  );

SELECT 'inserted_ar_count' AS step, ROW_COUNT() AS rows_affected;

-- ── 3. 검증: 고아 0 건이어야 함 ──
SELECT 'remaining_orphans' AS step, COUNT(*) AS c
FROM h_generic_checklist_records r
LEFT JOIN h_approval_requests ar
  ON ar.tenant_id = r.tenant_id
 AND ar.request_type = 'daily_log'
 AND ar.reference_type = 'checklist'
 AND ar.reference_id = r.id
WHERE r.tenant_id = 2
  AND r.form_type = 'daily_log'
  AND ar.id IS NULL;

-- ── 4. 보충된 AR 확인 (사용자가 화면에서 볼 결과 미리보기) ──
SELECT ar.id AS ar_id, ar.reference_id AS record_id,
       ar.title, ar.status, ar.priority, ar.created_at
FROM h_approval_requests ar
WHERE ar.tenant_id = 2
  AND ar.request_type = 'daily_log'
  AND ar.reference_id IN (
    SELECT record_id FROM _bak_orphan_daily_log_ar_20260510
  )
ORDER BY ar.reference_id;
