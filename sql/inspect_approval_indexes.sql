-- ═══════════════════════════════════════════════════════════════
-- 승인 관리 처리이력 성능 점검 SQL (Genspark 실행용)
-- 작성: 2026-09-10 — 처리이력 1,500건+ 상황에서 페이지네이션 + title LIKE 검색 도입 후
-- 이 SQL 은 인덱스가 실제로 잡혀 있는지, EXPLAIN 이 어떻게 나오는지 확인하는 용도.
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- V1. 처리이력 테이블 크기 / 분포 확인
-- ─────────────────────────────────────────────────────────────
SELECT
  tenant_id,
  status,
  COUNT(*) AS n,
  MIN(requested_at) AS first_at,
  MAX(requested_at) AS last_at
FROM h_approval_requests
GROUP BY tenant_id, status
ORDER BY tenant_id, n DESC;

-- ─────────────────────────────────────────────────────────────
-- V2. 현재 인덱스 확인 (h_approval_requests)
-- ─────────────────────────────────────────────────────────────
SHOW INDEX FROM h_approval_requests;

-- 기대: (tenant_id) 단일 인덱스는 있을 가능성 크지만,
-- 목록 쿼리 정렬키인 requested_at DESC 를 함께 커버하는 복합 인덱스는
-- 없을 가능성 큼. 없으면 아래 V3 로 생성 권장.

-- ─────────────────────────────────────────────────────────────
-- V3. 권장 복합 인덱스 (없을 경우 실행)
-- ─────────────────────────────────────────────────────────────
-- 목록 쿼리:
--   WHERE tenant_id = ? AND status = ? [AND request_type = ?] [AND requested_at BETWEEN ? AND ?]
--   ORDER BY requested_at DESC
--   LIMIT 100 OFFSET ?
--
-- 이 패턴에 최적: (tenant_id, status, requested_at DESC)
-- request_type 필터는 status 이후 카디널리티가 낮아 뒤로 배치.
--
-- ⚠ 실행 전 dry-run: 이미 있으면 "Duplicate key name" 에러 남 — 그러면 그대로 두면 됨.
CREATE INDEX idx_approval_tenant_status_reqat
  ON h_approval_requests (tenant_id, status, requested_at DESC);

-- title LIKE '%q%' (prefix 아님) 은 인덱스가 쓰이지 않음 (풀텍스트 or trigram 필요).
-- 우리 검색 UX 는 부분일치라서 인덱스 도움을 못 받음 — 대신 LIMIT 100 으로 스캔 범위를
-- 줄여서 체감 성능을 확보하는 방향. FULLTEXT 는 향후 5,000건 이상 되면 검토.

-- ─────────────────────────────────────────────────────────────
-- V4. EXPLAIN — 대표 쿼리로 실행계획 확인
-- ─────────────────────────────────────────────────────────────
-- tenant_id 는 실제 값으로 치환 (예: 3).
EXPLAIN
SELECT id, title, status, requested_at
FROM h_approval_requests
WHERE tenant_id = 3
  AND status = 'approved'
ORDER BY requested_at DESC
LIMIT 100 OFFSET 0;

-- 기대: type = ref / range, key = idx_approval_tenant_status_reqat, Using where 만.
-- "Using filesort" 가 나오면 정렬용 인덱스가 부족한 것 — V3 를 다시 확인.

-- 검색어 포함 버전.
EXPLAIN
SELECT id, title, status, requested_at
FROM h_approval_requests
WHERE tenant_id = 3
  AND status = 'approved'
  AND (title LIKE '%배치%' OR description LIKE '%배치%')
ORDER BY requested_at DESC
LIMIT 100 OFFSET 0;

-- 기대: 인덱스로 (tenant_id, status) 범위 좁힌 후 title LIKE 는 filter.
-- LIKE 는 인덱스를 못 쓰지만 앞 조건으로 이미 후보가 100~1000 건대면 무시할 수준.

-- ─────────────────────────────────────────────────────────────
-- V5. checklist JOIN 부하 점검
-- ─────────────────────────────────────────────────────────────
-- h_generic_checklist_records 와의 LEFT JOIN 이 payload 를 무겁게 함.
-- id 컬럼에 인덱스가 있는지, 그리고 reference_type 조건과 함께 사용 시
-- 어떻게 실행되는지 확인.
SHOW INDEX FROM h_generic_checklist_records;

EXPLAIN
SELECT r.id, cr.form_data IS NULL AS no_form
FROM h_approval_requests r
LEFT JOIN h_generic_checklist_records cr
  ON r.reference_id = cr.id
 AND r.reference_type IN ('generic_checklist','checklist')
WHERE r.tenant_id = 3
  AND r.status = 'approved'
ORDER BY r.requested_at DESC
LIMIT 100;

-- ─────────────────────────────────────────────────────────────
-- V6. 페이지네이션 실효성 측정 (before / after)
-- ─────────────────────────────────────────────────────────────
-- 실행시간 측정 (SET profiling; 또는 slow query log 로 봐도 됨).
SET profiling = 1;

-- 옛 방식 (전량 SELECT) — 참고용
SELECT COUNT(*) FROM (
  SELECT r.*
  FROM h_approval_requests r
  WHERE r.tenant_id = 3
    AND r.status IN ('approved','rejected','cancelled')
  ORDER BY r.requested_at DESC
) t;

-- 새 방식 (LIMIT 100)
SELECT r.id, r.title, r.status, r.requested_at
FROM h_approval_requests r
WHERE r.tenant_id = 3
  AND r.status IN ('approved','rejected','cancelled')
ORDER BY r.requested_at DESC
LIMIT 100 OFFSET 0;

SHOW PROFILES;
SET profiling = 0;

-- ─────────────────────────────────────────────────────────────
-- V7. (선택) approved_at / rejected_at 인덱스는 필요할까?
-- ─────────────────────────────────────────────────────────────
-- 현재 정렬은 requested_at DESC 로 통일 (approvedAt/rejectedAt 로 정렬하지 않음).
-- 따라서 approved_at 인덱스는 목록에는 불필요. 리포트/집계용으로만 검토.
