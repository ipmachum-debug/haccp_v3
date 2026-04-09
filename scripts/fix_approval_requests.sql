-- ============================================================================
-- Fix ALL CCP approval request titles, descriptions, and create missing ones
-- Scope: tenant_id = 2
-- ============================================================================

SET @tenant_id = 2;
SET @site_id = 2;
SET @requester_id = 4;   -- default user for auto-approvals
SET @reviewer_id = 12;

-- ============================================================================
-- STEP 1: Fix titles and descriptions for ALL existing CCP approval requests
-- ============================================================================

-- Fix CCP-1B titles: [CCP-CCP-1B] YYYY-MM-DD 제품명
UPDATE h_approval_requests ar
JOIN h_ccp_form_records fr ON ar.reference_id = fr.id AND fr.tenant_id = @tenant_id
SET 
  ar.title = CONCAT('[CCP-', fr.ccp_type, '] ', DATE_FORMAT(fr.work_date, '%Y-%m-%d'), ' ', fr.product_name),
  ar.description = CONCAT('CCP 기록지 작성 완료 - ', fr.product_name)
WHERE ar.tenant_id = @tenant_id 
  AND ar.request_type = 'ccp_form'
  AND fr.ccp_type = 'CCP-1B';

-- Fix CCP-2B titles: [CCP-CCP-2B] YYYY-MM-DD 제품명
UPDATE h_approval_requests ar
JOIN h_ccp_form_records fr ON ar.reference_id = fr.id AND fr.tenant_id = @tenant_id
SET 
  ar.title = CONCAT('[CCP-', fr.ccp_type, '] ', DATE_FORMAT(fr.work_date, '%Y-%m-%d'), ' ', fr.product_name),
  ar.description = CONCAT('CCP 기록지 작성 완료 - ', fr.product_name)
WHERE ar.tenant_id = @tenant_id 
  AND ar.request_type = 'ccp_form'
  AND fr.ccp_type = 'CCP-2B';

-- Fix CCP-4P titles: [CCP-CCP-4P] YYYY-MM-DD 금속검출 통합
UPDATE h_approval_requests ar
JOIN h_ccp_form_records fr ON ar.reference_id = fr.id AND fr.tenant_id = @tenant_id
SET 
  ar.title = CONCAT('[CCP-CCP-4P] ', DATE_FORMAT(fr.work_date, '%Y-%m-%d'), ' 금속검출 통합'),
  ar.description = CONCAT('CCP유형: CCP-4P | 작업일: ', DATE_FORMAT(fr.work_date, '%Y-%m-%d'), ' | 금속검출 일일통합 기록지')
WHERE ar.tenant_id = @tenant_id 
  AND ar.request_type = 'ccp_form'
  AND fr.ccp_type = 'CCP-4P';

SELECT 'STEP 1 DONE: Updated existing approval request titles/descriptions' as status;

-- ============================================================================
-- STEP 2: Create missing approval requests for CCP form records
-- ============================================================================

-- Insert missing approvals for CCP-1B
INSERT INTO h_approval_requests (site_id, request_type, reference_type, reference_id, title, description, status, priority, requested_by, requested_at, reviewed_by, reviewed_at, review_comments, approved_by, approved_at, tenant_id)
SELECT 
  @site_id,
  'ccp_form',
  'ccp_form_record',
  fr.id,
  CONCAT('[CCP-CCP-1B] ', DATE_FORMAT(fr.work_date, '%Y-%m-%d'), ' ', fr.product_name),
  CONCAT('CCP 기록지 작성 완료 - ', fr.product_name),
  'approved',
  'medium',
  @requester_id,
  CONCAT(DATE_FORMAT(fr.work_date, '%Y-%m-%d'), ' 17:00:00'),
  @reviewer_id,
  CONCAT(DATE_FORMAT(fr.work_date, '%Y-%m-%d'), ' 17:00:00'),
  '검토 완료',
  @requester_id,
  CONCAT(DATE_FORMAT(fr.work_date, '%Y-%m-%d'), ' 17:30:00'),
  @tenant_id
FROM h_ccp_form_records fr
LEFT JOIN h_approval_requests ar ON ar.reference_id = fr.id AND ar.request_type = 'ccp_form' AND ar.tenant_id = @tenant_id
WHERE fr.tenant_id = @tenant_id 
  AND fr.ccp_type = 'CCP-1B' 
  AND fr.status = 'approved'
  AND ar.id IS NULL;

SELECT ROW_COUNT() as 'CCP-1B approvals created';

-- Insert missing approvals for CCP-2B
INSERT INTO h_approval_requests (site_id, request_type, reference_type, reference_id, title, description, status, priority, requested_by, requested_at, reviewed_by, reviewed_at, review_comments, approved_by, approved_at, tenant_id)
SELECT 
  @site_id,
  'ccp_form',
  'ccp_form_record',
  fr.id,
  CONCAT('[CCP-CCP-2B] ', DATE_FORMAT(fr.work_date, '%Y-%m-%d'), ' ', fr.product_name),
  CONCAT('CCP 기록지 작성 완료 - ', fr.product_name),
  'approved',
  'medium',
  @requester_id,
  CONCAT(DATE_FORMAT(fr.work_date, '%Y-%m-%d'), ' 17:00:00'),
  @reviewer_id,
  CONCAT(DATE_FORMAT(fr.work_date, '%Y-%m-%d'), ' 17:00:00'),
  '검토 완료',
  @requester_id,
  CONCAT(DATE_FORMAT(fr.work_date, '%Y-%m-%d'), ' 17:30:00'),
  @tenant_id
FROM h_ccp_form_records fr
LEFT JOIN h_approval_requests ar ON ar.reference_id = fr.id AND ar.request_type = 'ccp_form' AND ar.tenant_id = @tenant_id
WHERE fr.tenant_id = @tenant_id 
  AND fr.ccp_type = 'CCP-2B' 
  AND fr.status = 'approved'
  AND ar.id IS NULL;

SELECT ROW_COUNT() as 'CCP-2B approvals created';

-- Insert missing approvals for CCP-4P
INSERT INTO h_approval_requests (site_id, request_type, reference_type, reference_id, title, description, status, priority, requested_by, requested_at, reviewed_by, reviewed_at, review_comments, approved_by, approved_at, tenant_id)
SELECT 
  @site_id,
  'ccp_form',
  'ccp_form_record',
  fr.id,
  CONCAT('[CCP-CCP-4P] ', DATE_FORMAT(fr.work_date, '%Y-%m-%d'), ' 금속검출 통합'),
  CONCAT('CCP유형: CCP-4P | 작업일: ', DATE_FORMAT(fr.work_date, '%Y-%m-%d'), ' | 금속검출 일일통합 기록지'),
  'approved',
  'medium',
  @requester_id,
  CONCAT(DATE_FORMAT(fr.work_date, '%Y-%m-%d'), ' 17:00:00'),
  @reviewer_id,
  CONCAT(DATE_FORMAT(fr.work_date, '%Y-%m-%d'), ' 17:00:00'),
  '검토 완료',
  @requester_id,
  CONCAT(DATE_FORMAT(fr.work_date, '%Y-%m-%d'), ' 17:30:00'),
  @tenant_id
FROM h_ccp_form_records fr
LEFT JOIN h_approval_requests ar ON ar.reference_id = fr.id AND ar.request_type = 'ccp_form' AND ar.tenant_id = @tenant_id
WHERE fr.tenant_id = @tenant_id 
  AND fr.ccp_type = 'CCP-4P' 
  AND fr.status = 'approved'
  AND ar.id IS NULL;

SELECT ROW_COUNT() as 'CCP-4P approvals created';

COMMIT;
SELECT 'STEP 2 DONE: Created missing approval requests' as status;

-- ============================================================================
-- STEP 3: Verification
-- ============================================================================

-- Verify no more missing approvals
SELECT 
  fr.ccp_type,
  COUNT(*) as total_approved_records,
  SUM(CASE WHEN ar.id IS NOT NULL THEN 1 ELSE 0 END) as has_approval,
  SUM(CASE WHEN ar.id IS NULL THEN 1 ELSE 0 END) as missing_approval
FROM h_ccp_form_records fr
LEFT JOIN h_approval_requests ar ON ar.reference_id = fr.id AND ar.request_type = 'ccp_form' AND ar.tenant_id = @tenant_id
WHERE fr.tenant_id = @tenant_id AND fr.status = 'approved'
GROUP BY fr.ccp_type;

-- Verify title dates match work_dates
SELECT 
  fr.ccp_type,
  COUNT(*) as total,
  SUM(CASE WHEN ar.title LIKE CONCAT('%', DATE_FORMAT(fr.work_date, '%Y-%m-%d'), '%') THEN 1 ELSE 0 END) as title_date_correct,
  SUM(CASE WHEN ar.title NOT LIKE CONCAT('%', DATE_FORMAT(fr.work_date, '%Y-%m-%d'), '%') THEN 1 ELSE 0 END) as title_date_wrong
FROM h_approval_requests ar
JOIN h_ccp_form_records fr ON ar.reference_id = fr.id AND fr.tenant_id = @tenant_id
WHERE ar.tenant_id = @tenant_id AND ar.request_type = 'ccp_form'
GROUP BY fr.ccp_type;

-- Verify CCP-1B/2B product names in titles
SELECT 
  'CCP-1B/2B title product match' as check_name,
  SUM(CASE WHEN ar.title LIKE CONCAT('%', fr.product_name) THEN 1 ELSE 0 END) as matching,
  SUM(CASE WHEN ar.title NOT LIKE CONCAT('%', fr.product_name) THEN 1 ELSE 0 END) as mismatching,
  COUNT(*) as total
FROM h_approval_requests ar
JOIN h_ccp_form_records fr ON ar.reference_id = fr.id AND fr.tenant_id = @tenant_id
WHERE ar.tenant_id = @tenant_id AND ar.request_type = 'ccp_form'
AND fr.ccp_type IN ('CCP-1B', 'CCP-2B');

-- Sample March 12 to verify
SELECT 
  ar.id, ar.title, fr.work_date, fr.ccp_type, fr.product_name
FROM h_approval_requests ar
JOIN h_ccp_form_records fr ON ar.reference_id = fr.id
WHERE ar.tenant_id = @tenant_id AND ar.request_type = 'ccp_form'
AND fr.work_date = '2026-03-12'
ORDER BY fr.ccp_type;

