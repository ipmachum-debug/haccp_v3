-- =====================================================================
-- h_inventory_transactions.lot_id : NOT NULL → NULL 전환 + sentinel 0 → NULL 백필
-- =====================================================================
-- 적용 일자: 2026-04-28
-- 실행 환경: 운영 DB (모든 tenant)
-- 실행 주체: Genspark 에이전트 (수동 SQL 실행)
-- 관련 PR: refactor/lot-id-nullable-sentinel-fix (근본 작업 A)
-- 관련 문서: scripts/diagnose-lot0-allocation-2026-04.txt (Phase 2 진단)
-- 선행: PR #109 Phase 2 백필 commit 완료 (4/06~4/17 lot_id=0 → 정상 LOT)
-- =====================================================================
--
-- 배경:
--   기존 lot_id 컬럼은 NOT NULL. autoMaterialIssue 가 LOT 매칭 실패 시
--   sentinel 값 lot_id=0 으로 INSERT (실제 LOT 0 은 존재하지 않음).
--
--   진짜 근본 문제:
--     1. usage 트랜잭션은 "실제 LOT 참조" 가 도메인 invariant — 이를
--        sentinel 0 으로 표현하면 invariant 가 코드 / DB 어디서도 enforce 안 됨.
--     2. h_inventory_lots 에 FK 추가 불가 (LOT id=0 없음).
--     3. lot_id=0 처리 분기가 SELECT/JOIN 코드에 누적 (outboundManagement,
--        inventoryAnalytics 등).
--
--   해결:
--     - lot_id BIGINT NULL 로 변경 → "매칭 실패" = lot_id IS NULL 로 표현
--     - sentinel 0 → NULL 백필
--     - autoMaterialIssue 의 fallback INSERT 가 lot_id=NULL 로 변경 (PR 코드)
--     - SELECT 조건 호환 처리 (PR 코드, lot_id=0 OR lot_id IS NULL)
--     - (별도 PR) FK 추가 — NULL 허용 FK
--
-- ⚠️ 실행 순서 엄수:
--   1. 백업 테이블 (DDL — 트랜잭션 외부)
--   2. ALTER TABLE (NOT NULL → NULL)  — DDL, instant 알고리즘
--   3. UPDATE (lot_id=0 → NULL)        — DML, 트랜잭션 내부
--   4. 사후 검증
--
-- 선행 조건:
--   - 본 PR 코드 (refactor/lot-id-nullable-sentinel-fix) 가 운영에 배포된 상태여야 함
--   - 이유: SELECT 코드가 lot_id IS NULL 도 매칭하도록 변경되어 있어야 UPDATE 후
--           기존 isLotMissing 표시 정상 동작
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. 백업 테이블 (DDL — 트랜잭션 외부)
-- ---------------------------------------------------------------------
-- lot_id=0 인 행만 백업 (전체 테이블 백업하면 너무 큼)
DROP TABLE IF EXISTS lot_id_nullable_backup_2026_04_28;

CREATE TABLE lot_id_nullable_backup_2026_04_28 AS
SELECT * FROM h_inventory_transactions
WHERE lot_id = 0;

-- 확인
SELECT COUNT(*) AS lot0_rows FROM lot_id_nullable_backup_2026_04_28;
-- 예상: ~4행 (Phase 2 commit 후 잔존)


-- ---------------------------------------------------------------------
-- 2. ALTER TABLE — NOT NULL → NULL
-- ---------------------------------------------------------------------
-- MySQL 8.0+ 의 INSTANT 알고리즘 사용. 메타데이터만 변경, 테이블 재작성 없음.
ALTER TABLE h_inventory_transactions
  MODIFY lot_id BIGINT NULL,
  ALGORITHM=INSTANT;


-- ---------------------------------------------------------------------
-- 3. UPDATE — sentinel 0 → NULL 백필
-- ---------------------------------------------------------------------
START TRANSACTION;

-- BEFORE 통계
SELECT
  SUM(CASE WHEN lot_id = 0    THEN 1 ELSE 0 END) AS sentinel_0,
  SUM(CASE WHEN lot_id IS NULL THEN 1 ELSE 0 END) AS already_null,
  COUNT(*) AS total
FROM h_inventory_transactions;

-- 백필
UPDATE h_inventory_transactions
SET lot_id = NULL
WHERE lot_id = 0;

-- AFTER 검증
SELECT
  SUM(CASE WHEN lot_id = 0    THEN 1 ELSE 0 END) AS still_sentinel_0,
  SUM(CASE WHEN lot_id IS NULL THEN 1 ELSE 0 END) AS now_null,
  COUNT(*) AS total
FROM h_inventory_transactions;
-- still_sentinel_0 = 0 이어야 함

COMMIT;
-- 또는 dry-run 모드: ROLLBACK;


-- ---------------------------------------------------------------------
-- 4. 최종 검증 (트랜잭션 외부)
-- ---------------------------------------------------------------------
-- 컬럼 정의 확인 (lot_id 가 nullable 인지)
SHOW COLUMNS FROM h_inventory_transactions LIKE 'lot_id';
-- Null = YES 이어야 함

-- isLotMissing 분포 (PR 코드 변경 후 lot_id IS NULL 도 isLotMissing=1 로 산출)
SELECT
  COUNT(*) AS total_usage,
  SUM(CASE WHEN lot_id IS NULL THEN 1 ELSE 0 END) AS lot_missing
FROM h_inventory_transactions
WHERE transaction_type = 'usage' AND tenant_id = 2;


-- =====================================================================
-- 롤백 (commit 후 문제 발견 시):
-- =====================================================================
-- START TRANSACTION;
--
-- UPDATE h_inventory_transactions t
-- JOIN lot_id_nullable_backup_2026_04_28 bk ON bk.id = t.id
-- SET t.lot_id = bk.lot_id
-- WHERE t.lot_id IS NULL;
--
-- -- 검증
-- SELECT COUNT(*) FROM h_inventory_transactions t
-- JOIN lot_id_nullable_backup_2026_04_28 bk ON bk.id = t.id
-- WHERE t.lot_id <> bk.lot_id;
-- -- 0 이어야 함
--
-- COMMIT;
--
-- -- 컬럼을 다시 NOT NULL 로:
-- -- (단 NULL 행이 있으면 실패 — 백필 SQL 도 같이 진행해야 함)
-- ALTER TABLE h_inventory_transactions MODIFY lot_id BIGINT NOT NULL;


-- =====================================================================
-- 정리 (commit + 30일 운영 후 백업 테이블 삭제 가능)
-- =====================================================================
-- DROP TABLE lot_id_nullable_backup_2026_04_28;
