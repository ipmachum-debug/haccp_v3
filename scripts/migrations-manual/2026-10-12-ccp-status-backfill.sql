-- =====================================================================
-- CCP 단일 흐름 1단계 — 상태 백필 (기록지 → 인스턴스)   2026-10-12
-- =====================================================================
-- 적용 일자: (Genspark 실행 시 기입)
-- 실행 환경: 운영 DB haccp_tenant_db (MySQL 8.0)
-- 실행 주체: Genspark — §0 백업 → §1 현황 → §2 기록지 보정 → §3 인스턴스 반영 → §4 검증
-- 전제:     PR "feat(ccp): 기록지 → 인스턴스 상태 동기화" 배포 완료 (이후 신규 건은 앱이 동기화)
-- 롤백:     §0 백업 테이블에서 status/approved_at/approver_id 복원 (데이터 삭제 없음)
--
-- 배경 (덤프 2026-10-10 실측, tenant 2)
--   · 기록지(h_ccp_form_records) 가 제출/승인됐는데 인스턴스(h_ccp_instances) 는 draft : 735건
--   · 승인관리에서 승인됐는데(h_approval_requests.status='approved') 기록지는 submitted : 115건
--     → approveRequest 가 2026-04-15 이후 기록지 상태를 안 바꿨음 (PR 에서 고침)
--   · 인스턴스만 approved(배치 완료 경로) 이고 기록지는 draft : 31건 → 내리지 않음 (§3 규칙)
--
-- 규칙 (앱 ccpStatusSync.ts 와 동일)
--   · 방향: 기록지 → 인스턴스. 기록지 데이터는 §2 결재 반영 외 변경 없음.
--   · 올라가기만: draft(0) < submitted(1) < approved(2). rejected 는 항상 반영.
--   · CCP-4P 는 같은 작업일의 4P 인스턴스 전부.
-- =====================================================================

-- ---------------------------------------------------------------------
-- §0. 백업 (status 관련 컬럼만, 전 테넌트)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS _bak_ccp_status_20261012_form AS
  SELECT id, tenant_id, status, approver_id, approved_at, rejected_reason, updated_at
  FROM h_ccp_form_records;
CREATE TABLE IF NOT EXISTS _bak_ccp_status_20261012_inst AS
  SELECT id, tenant_id, status, submitted_at, submitted_by, approved_at, approved_by, updated_at
  FROM h_ccp_instances;
SELECT (SELECT COUNT(*) FROM _bak_ccp_status_20261012_form) AS bak_form,
       (SELECT COUNT(*) FROM h_ccp_form_records)              AS src_form,
       (SELECT COUNT(*) FROM _bak_ccp_status_20261012_inst) AS bak_inst,
       (SELECT COUNT(*) FROM h_ccp_instances)                 AS src_inst;
-- → bak_form = src_form, bak_inst = src_inst 확인 후 진행. (6-a 정리 대상 목록에 이 두 테이블 추가할 것)

-- ---------------------------------------------------------------------
-- §1. 현황 (실행 전 숫자 기록)
-- ---------------------------------------------------------------------
-- 1-a. 기록지 vs 인스턴스 상태 조합
SELECT i.status AS inst_status, f.status AS form_status, COUNT(*) AS n
FROM h_ccp_instances i
JOIN h_ccp_form_records f
  ON f.batch_id = i.batch_id AND f.ccp_type = i.ccp_type AND f.tenant_id = i.tenant_id
GROUP BY 1, 2 ORDER BY 3 DESC;

-- 1-b. 승인관리에서 결재됐는데 기록지에 반영 안 된 건
SELECT ar.status AS ar_status, f.status AS form_status, COUNT(*) AS n
FROM h_ccp_form_records f
JOIN h_approval_requests ar ON ar.id = f.approval_request_id AND ar.tenant_id = f.tenant_id
WHERE ar.status IN ('approved', 'rejected') AND f.status <> ar.status
GROUP BY 1, 2;

-- ---------------------------------------------------------------------
-- §2. 기록지 보정 — 승인관리 결재 결과를 기록지에 반영 (누락된 approveRequest 후처리 소급)
-- ---------------------------------------------------------------------
UPDATE h_ccp_form_records f
JOIN h_approval_requests ar ON ar.id = f.approval_request_id AND ar.tenant_id = f.tenant_id
SET f.status = 'approved',
    f.approver_id = COALESCE(ar.approved_by, f.approver_id),
    f.approved_at = COALESCE(ar.approved_at, f.approved_at, NOW())
WHERE ar.status = 'approved' AND f.status <> 'approved';
-- 예상 ≈ 115 (tenant 2)

UPDATE h_ccp_form_records f
JOIN h_approval_requests ar ON ar.id = f.approval_request_id AND ar.tenant_id = f.tenant_id
SET f.status = 'rejected',
    f.approver_id = COALESCE(ar.rejected_by, f.approver_id),
    f.approved_at = COALESCE(ar.rejected_at, NOW()),
    f.rejected_reason = COALESCE(f.rejected_reason, ar.rejection_reason)
WHERE ar.status = 'rejected' AND f.status <> 'rejected';
-- 예상 0~소수

-- ---------------------------------------------------------------------
-- §3. 인스턴스 반영 — 올라가는 방향만. 같은 배치·CCP 유형 (4P 는 같은 작업일 전부)
-- ---------------------------------------------------------------------
-- 3-a. 최신 기록지 1장 매핑 (배치·유형별 MAX(id))
DROP TEMPORARY TABLE IF EXISTS tmp_ccp_form_latest;
CREATE TEMPORARY TABLE tmp_ccp_form_latest AS
  SELECT f.id AS form_id, f.tenant_id, f.batch_id, f.ccp_type, f.work_date, f.status,
         f.writer_id, f.approver_id, f.submitted_at, f.approved_at,
         CASE f.status WHEN 'draft' THEN 0 WHEN 'submitted' THEN 1 WHEN 'approved' THEN 2 ELSE -1 END AS rnk
  FROM h_ccp_form_records f
  JOIN (SELECT tenant_id, batch_id, ccp_type, MAX(id) AS max_id
        FROM h_ccp_form_records GROUP BY tenant_id, batch_id, ccp_type) m
    ON m.max_id = f.id;

-- 3-b. CCP-1B / 2B (배치 단위)
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
-- 예상 ≈ 735 + §2 반영분 (tenant 2)

-- 3-c. CCP-4P (작업일 단위 — 그 날짜의 4P 기록지 최신 1장)
UPDATE h_ccp_instances i
JOIN (
  SELECT t.* FROM tmp_ccp_form_latest t
  JOIN (SELECT tenant_id, work_date, MAX(form_id) AS max_id FROM tmp_ccp_form_latest
        WHERE ccp_type = 'CCP-4P' GROUP BY tenant_id, work_date) d
    ON d.max_id = t.form_id
) t ON t.tenant_id = i.tenant_id AND t.work_date = i.work_date
SET i.status = t.status,
    i.submitted_at = CASE WHEN t.status IN ('submitted','approved') THEN COALESCE(i.submitted_at, t.submitted_at, NOW()) ELSE i.submitted_at END,
    i.submitted_by = CASE WHEN t.status IN ('submitted','approved') THEN COALESCE(i.submitted_by, t.writer_id) ELSE i.submitted_by END,
    i.approved_at  = CASE WHEN t.status IN ('approved','rejected') THEN COALESCE(t.approved_at, NOW()) ELSE i.approved_at END,
    i.approved_by  = CASE WHEN t.status IN ('approved','rejected') THEN COALESCE(t.approver_id, i.approved_by) ELSE i.approved_by END
WHERE i.ccp_type = 'CCP-4P'
  AND ( t.status = 'rejected' AND i.status <> 'rejected'
     OR t.rnk > CASE i.status WHEN 'draft' THEN 0 WHEN 'submitted' THEN 1 WHEN 'approved' THEN 2 ELSE 0 END );

DROP TEMPORARY TABLE IF EXISTS tmp_ccp_form_latest;

-- ---------------------------------------------------------------------
-- §4. 검증
-- ---------------------------------------------------------------------
-- 4-a. §1-a 재실행 → ('draft','submitted') / ('draft','approved') / ('submitted','approved') 조합이 0 이어야 함.
--      ('approved','draft') 31건과 ('approved','submitted') 는 규칙상 그대로 남는다 (내리지 않음).
SELECT i.status AS inst_status, f.status AS form_status, COUNT(*) AS n
FROM h_ccp_instances i
JOIN h_ccp_form_records f
  ON f.batch_id = i.batch_id AND f.ccp_type = i.ccp_type AND f.tenant_id = i.tenant_id
GROUP BY 1, 2 ORDER BY 3 DESC;

-- 4-b. §1-b 재실행 → 0 이어야 함
SELECT ar.status AS ar_status, f.status AS form_status, COUNT(*) AS n
FROM h_ccp_form_records f
JOIN h_approval_requests ar ON ar.id = f.approval_request_id AND ar.tenant_id = f.tenant_id
WHERE ar.status IN ('approved', 'rejected') AND f.status <> ar.status
GROUP BY 1, 2;

-- 4-c. 화면 확인: Today "미완료 CCP" 건수, 통합 대시보드 CCP 미완료, CCP 관리 목록 "제출됨" 배지가 §1 대비 바뀌었는지.
--      기록지 행(h_ccp_form_rows) 은 이 스크립트가 한 건도 건드리지 않는다 — 인쇄 양식 결과 변화 없음.
