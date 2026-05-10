-- =============================================================================
-- Step 13 (DRY-RUN): 고아 daily_log checklist record 의 누락 AR 보충
-- =============================================================================
-- 배경:
--   h_generic_checklist_records (form_type='daily_log') 와
--   h_approval_requests (request_type='daily_log', reference_type='checklist',
--   reference_id=record.id) 는 1:1 매칭이어야 한다.
--
--   그러나 autoDailyReport.ts 의 "기존 record 분기"는 form_data.batches 만
--   업데이트하고 짝꿍 AR 을 만들지 않아서 다음과 같은 고아가 발생할 수 있다:
--     - record 가 다른 경로 (수동/cron) 로 먼저 생성된 후
--     - 배치 생성 시점의 autoDailyReport 가 "기존" 분기로 빠져 AR 미생성
--
--   확인된 케이스 (tenant_id=2):
--     - record id=717, form_date=2026-05-06, status=draft, site_id=1, created_by=24
--       → 짝꿍 AR 없음 → 승인관리 화면에 표시 안 됨
--
-- 정책:
--   - 자동 삭제 절대 금지 (HACCP 감사 추적 보존)
--   - INSERT 만 수행, 기존 record 의 form_data 는 변경하지 않음
--   - 멱등성 보장: WHERE NOT EXISTS 로 중복 INSERT 차단
-- =============================================================================

USE haccp_tenant_db;

-- ── 1. 검사: tenant_id=2 의 daily_log 고아 record 목록 ──
SELECT 'orphan_daily_log_records' AS check_name,
       COUNT(*) AS orphan_count
FROM h_generic_checklist_records r
LEFT JOIN h_approval_requests ar
  ON ar.tenant_id = r.tenant_id
 AND ar.request_type = 'daily_log'
 AND ar.reference_type = 'checklist'
 AND ar.reference_id = r.id
WHERE r.tenant_id = 2
  AND r.form_type = 'daily_log'
  AND ar.id IS NULL;

-- ── 2. 검사: 고아 record 상세 (실제 어떤 row 가 보충 대상인지 확인) ──
SELECT r.id AS record_id,
       r.site_id, r.tenant_id, r.form_date, r.status, r.created_by, r.created_at,
       CONCAT('[일일일지] ', r.form_date, ' 일반위생관리 및 공정점검표') AS would_insert_title
FROM h_generic_checklist_records r
LEFT JOIN h_approval_requests ar
  ON ar.tenant_id = r.tenant_id
 AND ar.request_type = 'daily_log'
 AND ar.reference_type = 'checklist'
 AND ar.reference_id = r.id
WHERE r.tenant_id = 2
  AND r.form_type = 'daily_log'
  AND ar.id IS NULL
ORDER BY r.form_date;

-- DRY-RUN: INSERT 는 commit 스크립트에서만 수행
SELECT 'DRY-RUN complete — no rows changed' AS status;
