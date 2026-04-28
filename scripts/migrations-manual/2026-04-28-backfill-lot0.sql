-- =====================================================================
-- Phase 2 백필: lot_id=0 자동출고 트랜잭션 → 가장 오래된 활성 LOT 재연결
-- =====================================================================
-- 적용 일자: 2026-04-28
-- 실행 환경: 운영 DB (tenant_id=2)
-- 실행 주체: Genspark 에이전트 (수동 SQL 실행)
-- 관련 PR: feat/phase2-backfill-lot0
-- 관련 문서: scripts/diagnose-lot0-allocation-2026-04.txt
--           scripts/backfill-lot0-2026-04.ts (TypeScript 스크립트)
-- =====================================================================
--
-- 배경:
--   진단 결과 4/06 ~ 4/17 일자 lot_id=0 자동출고 트랜잭션 266건 발견.
--   대부분 (243건/91%) 은 같은 material 의 활성 LOT 이 트랜잭션 일자
--   이전에 이미 존재. autoMaterialIssue 의 마스터-LOT mismatch 등
--   사유로 fallback 으로 lot_id=0 INSERT 됨.
--
--   PR #103 (Phase 1) 으로 신규 발생은 차단됐으나, 기존 트랜잭션의
--   LOT 정보를 복구하면 재고 추적성 ↑ + 회계/HACCP 보고 정확도 ↑.
--
-- 정책:
--   - lot_id=0 + transaction_type='usage' + tenant_id=2 + 4/06~4/17 범위
--   - 같은 material_id + tenant_id + LOT.created_at <= transaction_date
--   - 매칭 후보 중 가장 오래된 LOT (created_at ASC, id ASC) 선택
--   - 매칭 후보 없으면 lot_id=0 유지 (no_lot_ever 케이스)
--
-- ⚠️ 실행 순서 엄수 (1 → 2 → 3 → 4 → 5 → 6 → 7):
--   1. 백업 테이블 생성 (DDL — 트랜잭션 외부)
--   2. 매칭 후보 임시 테이블 생성 (DDL — 트랜잭션 외부)
--   3. BEFORE 통계 (검증)
--   4. BEGIN TRANSACTION
--   5. UPDATE
--   6. 사후 검증 (커밋 전)
--   7. COMMIT (또는 dry-run 시 ROLLBACK)
--
-- 권장 실행 방식:
--   먼저 TypeScript 스크립트로 dry-run 검증:
--     npx tsx scripts/backfill-lot0-2026-04.ts --dry-run
--   결과 확인 후 commit:
--     npx tsx scripts/backfill-lot0-2026-04.ts --commit
--
--   본 SQL 은 스크립트 사용 불가 시 수동 적용용 사본.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. 백업 테이블 (DDL — 트랜잭션 외부)
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS phase2_lot0_backup_2026_04_28;

CREATE TABLE phase2_lot0_backup_2026_04_28 AS
SELECT * FROM h_inventory_transactions
WHERE lot_id = 0
  AND transaction_type = 'usage'
  AND tenant_id = 2
  AND transaction_date BETWEEN '2026-04-06' AND '2026-04-17';

-- 확인 (예상: 266 행)
SELECT COUNT(*) AS backup_rows FROM phase2_lot0_backup_2026_04_28;


-- ---------------------------------------------------------------------
-- 2. 매칭 후보 임시 테이블 (DDL — 트랜잭션 외부)
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS phase2_lot0_matches_2026_04_28;

CREATE TABLE phase2_lot0_matches_2026_04_28 AS
SELECT
  t.id          AS tx_id,
  t.material_id AS material_id,
  t.transaction_date AS tx_date,
  t.quantity    AS quantity,
  (
    SELECT l.id
    FROM h_inventory_lots l
    WHERE l.material_id = t.material_id
      AND l.tenant_id   = t.tenant_id
      AND DATE(l.created_at) <= t.transaction_date
    ORDER BY l.created_at ASC, l.id ASC
    LIMIT 1
  ) AS matched_lot_id
FROM h_inventory_transactions t
WHERE t.lot_id = 0
  AND t.transaction_type = 'usage'
  AND t.tenant_id = 2
  AND t.transaction_date BETWEEN '2026-04-06' AND '2026-04-17';


-- ---------------------------------------------------------------------
-- 3. BEFORE 통계 (검증)
-- ---------------------------------------------------------------------
-- 매칭 분포 (예상: will_update≈243 / will_skip≈3 / total=266)
SELECT
  SUM(CASE WHEN matched_lot_id IS NOT NULL THEN 1 ELSE 0 END) AS will_update,
  SUM(CASE WHEN matched_lot_id IS NULL     THEN 1 ELSE 0 END) AS will_skip,
  COUNT(*) AS total
FROM phase2_lot0_matches_2026_04_28;

-- material 별 분포 (Top 20)
SELECT material_id,
       COUNT(*) AS tx_count,
       SUM(CASE WHEN matched_lot_id IS NOT NULL THEN 1 ELSE 0 END) AS will_update
FROM phase2_lot0_matches_2026_04_28
GROUP BY material_id
ORDER BY tx_count DESC
LIMIT 20;


-- ---------------------------------------------------------------------
-- 4-5-6-7. BEGIN → UPDATE → 검증 → COMMIT
-- ---------------------------------------------------------------------
START TRANSACTION;

-- 4. UPDATE
UPDATE h_inventory_transactions t
JOIN phase2_lot0_matches_2026_04_28 m ON m.tx_id = t.id
SET t.lot_id = m.matched_lot_id
WHERE m.matched_lot_id IS NOT NULL;

-- 5. 사후 검증 (커밋 전, 결과 확인)
SELECT
  SUM(CASE WHEN lot_id = 0 THEN 1 ELSE 0 END) AS remaining_lot0,
  SUM(CASE WHEN lot_id <> 0 THEN 1 ELSE 0 END) AS now_with_lot,
  COUNT(*) AS total
FROM h_inventory_transactions
WHERE transaction_type = 'usage'
  AND tenant_id = 2
  AND transaction_date BETWEEN '2026-04-06' AND '2026-04-17'
  AND id IN (SELECT tx_id FROM phase2_lot0_matches_2026_04_28);

-- 6. 매칭된 LOT 분포 (Top 10)
SELECT t.lot_id, COUNT(*) AS tx_count
FROM h_inventory_transactions t
JOIN phase2_lot0_matches_2026_04_28 m ON m.tx_id = t.id
WHERE m.matched_lot_id IS NOT NULL
GROUP BY t.lot_id
ORDER BY tx_count DESC
LIMIT 10;

-- 7. COMMIT (검증 후)
COMMIT;
-- 또는 dry-run 모드: ROLLBACK;


-- ---------------------------------------------------------------------
-- 8. 최종 검증 (트랜잭션 외부)
-- ---------------------------------------------------------------------
-- 전체 lot_id=0 잔존 카운트 (예상: ≈3, no_lot_ever 케이스)
SELECT COUNT(*) AS remaining_lot0_in_range
FROM h_inventory_transactions
WHERE lot_id = 0
  AND transaction_type = 'usage'
  AND tenant_id = 2
  AND transaction_date BETWEEN '2026-04-06' AND '2026-04-17';


-- =====================================================================
-- 롤백 (commit 후 문제 발견 시):
-- =====================================================================
-- START TRANSACTION;
--
-- UPDATE h_inventory_transactions t
-- JOIN phase2_lot0_backup_2026_04_28 bk ON bk.id = t.id
-- SET t.lot_id = bk.lot_id
-- WHERE t.lot_id <> bk.lot_id;
--
-- -- 검증
-- SELECT COUNT(*) FROM h_inventory_transactions t
-- JOIN phase2_lot0_backup_2026_04_28 bk ON bk.id = t.id
-- WHERE t.lot_id <> bk.lot_id;
-- -- 0 이어야 함
--
-- COMMIT;


-- =====================================================================
-- 정리 (commit + 30일 운영 후 백업 테이블 삭제 가능)
-- =====================================================================
-- DROP TABLE phase2_lot0_backup_2026_04_28;
-- DROP TABLE phase2_lot0_matches_2026_04_28;
