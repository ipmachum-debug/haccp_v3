-- ============================================================
-- Step 9 DRY-RUN: 4/20 배치 batch_production 승인요청 백필
-- ============================================================
-- 배경:
--   2026-04-20 배치 3건(586/587/588)이 5/9 21:35에 생성되었으나
--   STEP 4 (batch_production AR 생성) 로직이 누락되어
--   승인 관리 화면(approval.list status=pending_review)에 표시되지 않음
--
-- 정상 패턴 (4/17 배치 579~582):
--   - h_ccp_form_records: CCP-1B는 approval_request_id=NULL, CCP-4P만 ccp_form AR 연결
--   - h_approval_requests: 배치당 batch_production AR 1건 (reference_type='batch')
--
-- 4/20 누락 상태:
--   - 586 (30091 쑥인절미향): batch_production AR ❌
--   - 587 (30063 콩고물쑥떡): batch_production AR ❌
--   - 588 (30028 꿀설기):     batch_production AR ❌
--   (cfr / CCP-4P 통합 AR 2414 는 정상이므로 건드리지 않음)
--
-- 작업: h_approval_requests INSERT 3건 (status=pending_review)
--       기존 4/17 정상 배치 AR(2387~2390)와 동일 컬럼/형식 사용
-- ============================================================

START TRANSACTION;

-- =================== (1) batch 586 (30091 쑥인절미향) ===================
INSERT INTO h_approval_requests
  (site_id, tenant_id, request_type, reference_type, reference_id,
   title, description, status, priority, requested_by, created_at)
VALUES
  (1, 2, 'batch_production', 'batch', 586,
   '[CCP 기록지][자동] 30091-20260420-001 (쑥인절미(쑥향))',
   '제품: 쑥인절미(쑥향)\n계획일: 2026-04-20\nCCP 기록지 자동 백필 (Step 9)\n배치코드: 30091-20260420-001\n[작성자 자동승인 → 검토자 대기]',
   'pending_review', 'high', 4, NOW());

-- =================== (2) batch 587 (30063 콩고물쑥떡) ===================
INSERT INTO h_approval_requests
  (site_id, tenant_id, request_type, reference_type, reference_id,
   title, description, status, priority, requested_by, created_at)
VALUES
  (1, 2, 'batch_production', 'batch', 587,
   '[CCP 기록지][자동] 30063-20260420-001 (콩고물쑥떡)',
   '제품: 콩고물쑥떡\n계획일: 2026-04-20\nCCP 기록지 자동 백필 (Step 9)\n배치코드: 30063-20260420-001\n[작성자 자동승인 → 검토자 대기]',
   'pending_review', 'high', 4, NOW());

-- =================== (3) batch 588 (30028 꿀설기) ===================
INSERT INTO h_approval_requests
  (site_id, tenant_id, request_type, reference_type, reference_id,
   title, description, status, priority, requested_by, created_at)
VALUES
  (1, 2, 'batch_production', 'batch', 588,
   '[CCP 기록지][자동] 30028-20260420-001 (꿀설기)',
   '제품: 꿀설기\n계획일: 2026-04-20\nCCP 기록지 자동 백필 (Step 9)\n배치코드: 30028-20260420-001\n[작성자 자동승인 → 검토자 대기]',
   'pending_review', 'high', 4, NOW());

-- =================== 검증 쿼리 ===================
-- 1) 신규 AR 3건 확인
SELECT id, request_type, reference_type, reference_id, title, status, priority, created_at
FROM h_approval_requests
WHERE tenant_id=2 AND request_type='batch_production' AND reference_id IN (586, 587, 588)
ORDER BY reference_id;

-- 2) 4/20 배치 ↔ AR 연결 통합 확인 (모두 채워져야 함)
SELECT b.id AS batch_id, b.batch_code, b.planned_date, im.item_name,
       ar.id AS ar_id, ar.request_type, ar.status AS ar_status
FROM h_batches b
LEFT JOIN item_master im ON b.product_id=im.id
LEFT JOIN h_approval_requests ar
  ON ar.reference_id=b.id AND ar.request_type='batch_production' AND ar.reference_type='batch'
WHERE b.tenant_id=2 AND b.planned_date='2026-04-20'
ORDER BY b.id;

-- 3) 검토 대기 (pending_review) 카운트 - 화면에 보일 항목
SELECT COUNT(*) AS pending_review_count
FROM h_approval_requests
WHERE tenant_id=2 AND status='pending_review';

-- DRY-RUN: 모든 변경 롤백
ROLLBACK;

SELECT 'DRY-RUN COMPLETED — ROLLBACK 됨. 결과 확인 후 commit 버전 실행하세요.' AS status;
