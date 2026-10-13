-- =====================================================================
-- 배치 결재 → CCP-1B/2B 기록지 상태 소급 반영   2026-10-13
-- =====================================================================
-- 적용 일자: (Genspark 실행 시 기입)
-- 실행 환경: 운영 DB haccp_tenant_db (MySQL 8.0)
-- 실행 주체: Genspark — §0 백업 → §1 현황 → §2 기록지 보정 → §3 인스턴스 반영 → §4 검증
-- 전제:     PR "fix(ccp): 배치 결재가 CCP-1B/2B 기록지에 반영되지 않던 문제" 배포 완료
--           (이후 신규 결재는 앱 applyBatchDecisionToCcpForms 가 반영)
-- 롤백:     §0 백업 테이블에서 status/approver_id/approved_at 복원 (데이터 삭제 없음)
--
-- 배경 (순인절미 30092-20261008-001, 배치 #1102)
--   · 배치별 CCP-1B/2B 기록지는 배치 생성 시 'submitted' 로만 두고 자기 승인 요청을 만들지 않는다.
--     승인은 배치 단위 요청 "[CCP 기록지] …" (request_type batch_production, reference_type batch) 가 대신.
--   · 그 배치 요청이 approved 돼도 기록지를 'approved' 로 바꾸는 코드가 없어 '제출됨' 에 영구 체류.
--     CCP-4P 는 자기 요청(ccp_form_record)이 있어 정상 승인됨 → 같은 배치에서 1B 제출됨 / 4P 승인 완료 불일치.
--
-- 규칙 (앱 ccpStatusSync.ts 와 동일)
--   · 대상 기록지 = ccp_type <> 'CCP-4P' AND approval_request_id IS NULL (자기 요청이 있으면 그 요청이 정본)
--   · 배치 요청 = 같은 batch_id 의 batch_production/batch 요청 중 최신 1건
--   · 기록지는 approved 로 올리기만. rejected 배치 요청은 기록지도 rejected.
--   · 인스턴스는 올라가는 방향만 (draft < submitted < approved), rejected 는 항상.
-- =====================================================================

-- ---------------------------------------------------------------------
-- §0. 백업 (status 관련 컬럼만, 전 테넌트)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS _bak_ccp_batchdec_20261013_form AS
  SELECT id, tenant_id, status, approver_id, approved_at, rejected_reason, updated_at
  FROM h_ccp_form_records;
CREATE TABLE IF NOT EXISTS _bak_ccp_batchdec_20261013_inst AS
  SELECT id, tenant_id, status, submitted_at, submitted_by, approved_at, approved_by, updated_at
  FROM h_ccp_instances;
SELECT (SELECT COUNT(*) FROM _bak_ccp_batchdec_20261013_form) AS bak_form,
       (SELECT COUNT(*) FROM h_ccp_form_records)                 AS src_form,
       (SELECT COUNT(*) FROM _bak_ccp_batchdec_20261013_inst) AS bak_inst,
       (SELECT COUNT(*) FROM h_ccp_instances)                    AS src_inst;
-- → bak_form = src_form, bak_inst = src_inst 확인 후 진행. (6-a 정리 대상 목록에 이 두 테이블 추가할 것)

-- ---------------------------------------------------------------------
-- §1. 현황 — 배치 요청 최신 1건 매핑 + 불일치 집계
-- ---------------------------------------------------------------------
DROP TEMPORARY TABLE IF EXISTS tmp_batch_req_latest;
CREATE TEMPORARY TABLE tmp_batch_req_latest AS
  SELECT ar.id AS request_id, ar.tenant_id, ar.reference_id AS batch_id, ar.status,
         ar.approved_by, ar.approved_at, ar.rejected_by, ar.rejected_at, ar.rejection_reason
  FROM h_approval_requests ar
  JOIN (SELECT tenant_id, reference_id, MAX(id) AS max_id
        FROM h_approval_requests
        WHERE request_type = 'batch_production' AND reference_type = 'batch'
        GROUP BY tenant_id, reference_id) m
    ON m.max_id = ar.id;

-- 1-a. 배치 요청 상태 vs 기록지 상태 (대상 기록지만)
SELECT r.status AS batch_req_status, f.ccp_type, f.status AS form_status, COUNT(*) AS n
FROM h_ccp_form_records f
JOIN tmp_batch_req_latest r ON r.tenant_id = f.tenant_id AND r.batch_id = f.batch_id
WHERE f.ccp_type <> 'CCP-4P' AND f.approval_request_id IS NULL
GROUP BY 1, 2, 3 ORDER BY 4 DESC;
-- → ('approved', 'CCP-1B', 'submitted') 가 보정 대상. 순인절미 #1102 포함돼야 함.

-- 1-b. 확인용: 순인절미 #1102
SELECT f.id, f.ccp_type, f.status, f.approval_request_id, r.request_id, r.status AS batch_req_status
FROM h_ccp_form_records f
LEFT JOIN tmp_batch_req_latest r ON r.tenant_id = f.tenant_id AND r.batch_id = f.batch_id
WHERE f.batch_id = 1102 AND f.tenant_id = 2;

-- ---------------------------------------------------------------------
-- §2. 기록지 보정 — 배치 요청 결재 결과를 기록지에 반영
-- ---------------------------------------------------------------------
UPDATE h_ccp_form_records f
JOIN tmp_batch_req_latest r ON r.tenant_id = f.tenant_id AND r.batch_id = f.batch_id
SET f.status = 'approved',
    f.approver_id = COALESCE(r.approved_by, f.approver_id),
    f.approved_at = COALESCE(r.approved_at, f.approved_at, NOW()),
    f.rejected_reason = NULL
WHERE r.status = 'approved'
  AND f.ccp_type <> 'CCP-4P' AND f.approval_request_id IS NULL
  AND f.status <> 'approved';
-- 예상 = §1-a 의 ('approved', *, 'submitted'|'draft') 합계

UPDATE h_ccp_form_records f
JOIN tmp_batch_req_latest r ON r.tenant_id = f.tenant_id AND r.batch_id = f.batch_id
SET f.status = 'rejected',
    f.approver_id = COALESCE(r.rejected_by, f.approver_id),
    f.approved_at = COALESCE(r.rejected_at, NOW()),
    f.rejected_reason = COALESCE(f.rejected_reason, r.rejection_reason)
WHERE r.status = 'rejected'
  AND f.ccp_type <> 'CCP-4P' AND f.approval_request_id IS NULL
  AND f.status <> 'rejected';
-- 예상 0~소수

-- ---------------------------------------------------------------------
-- §3. 인스턴스 반영 — 올라가는 방향만 (CCP-1B/2B, 배치·유형 단위)
-- ---------------------------------------------------------------------
DROP TEMPORARY TABLE IF EXISTS tmp_ccp_form_latest;
CREATE TEMPORARY TABLE tmp_ccp_form_latest AS
  SELECT f.id AS form_id, f.tenant_id, f.batch_id, f.ccp_type, f.status,
         f.writer_id, f.approver_id, f.submitted_at, f.approved_at,
         CASE f.status WHEN 'draft' THEN 0 WHEN 'submitted' THEN 1 WHEN 'approved' THEN 2 ELSE -1 END AS rnk
  FROM h_ccp_form_records f
  JOIN (SELECT tenant_id, batch_id, ccp_type, MAX(id) AS max_id
        FROM h_ccp_form_records WHERE ccp_type <> 'CCP-4P'
        GROUP BY tenant_id, batch_id, ccp_type) m
    ON m.max_id = f.id;

UPDATE h_ccp_instances i
JOIN tmp_ccp_form_latest t
  ON t.tenant_id = i.tenant_id AND t.batch_id = i.batch_id AND t.ccp_type = i.ccp_type
SET i.status = t.status,
    i.submitted_at = CASE WHEN t.status IN ('submitted','approved') THEN COALESCE(i.submitted_at, t.submitted_at, NOW()) ELSE i.submitted_at END,
    i.submitted_by = CASE WHEN t.status IN ('submitted','approved') THEN COALESCE(i.submitted_by, t.writer_id) ELSE i.submitted_by END,
    i.approved_at  = CASE WHEN t.status IN ('approved','rejected') THEN COALESCE(t.approved_at, NOW()) ELSE i.approved_at END,
    i.approved_by  = CASE WHEN t.status IN ('approved','rejected') THEN COALESCE(t.approver_id, i.approved_by) ELSE i.approved_by END
WHERE i.ccp_type <> 'CCP-4P'
  AND ( t.status = 'rejected' AND i.status <> 'rejected'
     OR t.rnk > CASE i.status WHEN 'draft' THEN 0 WHEN 'submitted' THEN 1 WHEN 'approved' THEN 2 ELSE 0 END );

DROP TEMPORARY TABLE IF EXISTS tmp_ccp_form_latest;

-- ---------------------------------------------------------------------
-- §4. 검증
-- ---------------------------------------------------------------------
-- 4-a. §1-a 재실행 → ('approved', *, 'submitted') / ('approved', *, 'draft') 가 0 이어야 함
SELECT r.status AS batch_req_status, f.ccp_type, f.status AS form_status, COUNT(*) AS n
FROM h_ccp_form_records f
JOIN tmp_batch_req_latest r ON r.tenant_id = f.tenant_id AND r.batch_id = f.batch_id
WHERE f.ccp_type <> 'CCP-4P' AND f.approval_request_id IS NULL
GROUP BY 1, 2, 3 ORDER BY 4 DESC;

-- 4-b. 순인절미 #1102 → CCP-1B 기록지 approved, 인스턴스 approved
SELECT f.id, f.ccp_type, f.status AS form_status,
       (SELECT GROUP_CONCAT(DISTINCT i.status) FROM h_ccp_instances i
         WHERE i.batch_id = f.batch_id AND i.ccp_type = f.ccp_type AND i.tenant_id = f.tenant_id) AS inst_status
FROM h_ccp_form_records f
WHERE f.batch_id = 1102 AND f.tenant_id = 2;

DROP TEMPORARY TABLE IF EXISTS tmp_batch_req_latest;

-- 4-c. 화면 확인: 배치 #1102 상세 "배치 승인" 카드 CCP-1B 가 "승인 완료 / 승인 완료 (배치 요청)",
--      CCP 관리 목록 순인절미 1B 배지가 "검토중" → "승인 완료".
--      기록지 행(h_ccp_form_rows) 은 한 건도 건드리지 않는다 — 인쇄 양식 결과 변화 없음.
