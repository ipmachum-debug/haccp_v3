-- =====================================================================
-- PR-K3: BOM/batch material_id PK 통일 마이그레이션 (item_master.id → h_materials.id)
-- =====================================================================
-- 적용 일자: 2026-04-26
-- 실행 환경: 운영 DB (tenant_id=2)
-- 실행 주체: Genspark 에이전트 (수동 SQL 실행)
-- 관련 PR: fix/k3-pk-unification-code (autoMaterialIssue.ts + purchasePost.ts)
-- 관련 문서: docs/architecture/06-material-pipeline.md
--           PR #71 (06 문서), PR #72 (K2), PR #73 (K1)
-- =====================================================================
--
-- ⚠️ 본 SQL 은 이미 운영 DB 에 적용 완료되었음 (2026-04-26 06:47 경)
--    본 파일은 사후 추적/재현용 기록.
--
-- 검증 결과 요약:
--   V1 (잔존 item_master.id 비율) — 5 테이블 PASS, mld 1건 GAP +73 (보정 SQL 별도 실행)
--   V2 (백업 무결성)              — 1,305건 PASS
--   V3 (h_inventory 96행 보존)    — PASS
--   V4 (FEFO 가능성 72%)          — baseline 확보
--   V5 (N:1 5건 합계 보존)        — PASS
--
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 백업 테이블 생성 (UPDATE 전 매핑 보존)
-- ---------------------------------------------------------------------
-- 6개 테이블의 모든 UPDATE 대상 행을 통합 백업.
-- 7일 보존 후 DROP 권장 (롤백 가능성 0 확인 후).

CREATE TABLE IF NOT EXISTS k3_mapping_backup_2026_04_26 (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  source_table VARCHAR(50) NOT NULL,
  source_id BIGINT NOT NULL,
  tenant_id INT NOT NULL,
  old_material_id BIGINT NOT NULL,        -- item_master.id (UPDATE 전)
  new_material_id BIGINT NOT NULL,        -- h_materials.id (UPDATE 후)
  mapping_via VARCHAR(20) NOT NULL,       -- 'legacy_fk' | 'name'
  notes TEXT NULL,                        -- N:1 매핑 등 특이 케이스 메모
  backed_up_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_source (source_table, source_id, tenant_id),
  INDEX idx_tenant (tenant_id)
);

-- ---------------------------------------------------------------------
-- 2. 매핑 임시 테이블 (item_master.id → h_materials.id)
-- ---------------------------------------------------------------------
-- 1순위: item_master.legacy_material_id (= h_materials.id) FK 직접 매핑
-- 2순위: item_master.item_name = h_materials.material_name 정확 일치
-- 3순위: item_master.item_code = h_materials.material_code 일치
-- 다중 일치 시 SKIP (1:1 가드)

-- (이 단계 SQL 은 적용 시점 dry-run 스크립트로 진행되었으며
--  매핑 결과는 k3_mapping_backup_2026_04_26 테이블에 기록됨.
--  v2 dry-run 통계: 1순위 91건 + 2순위 7건, 3순위 0건, 매핑 실패 0건 (자재 단위))

-- ---------------------------------------------------------------------
-- 3. UPDATE 6개 테이블 (단일 트랜잭션)
-- ---------------------------------------------------------------------
-- 영향 행 수:
--   h_batch_inputs        : 432건
--   h_recipe_lines        : 694건
--   h_inbound_lines       : 96건
--   accounting_purchases  : 5건
--   purchase_order_lines  : 5건
--   material_ledger_daily : 73건  (own_product 130건 SKIP)
--   합계                   : 1,305건

START TRANSACTION;

UPDATE h_batch_inputs t
JOIN k3_mapping_backup_2026_04_26 bk
  ON bk.source_table = 'h_batch_inputs'
 AND bk.source_id = t.id
 AND bk.tenant_id = t.tenant_id
SET t.material_id = bk.new_material_id
WHERE t.tenant_id = 2 AND t.material_id = bk.old_material_id;

UPDATE h_recipe_lines t
JOIN k3_mapping_backup_2026_04_26 bk
  ON bk.source_table = 'h_recipe_lines'
 AND bk.source_id = t.id
 AND bk.tenant_id = t.tenant_id
SET t.material_id = bk.new_material_id
WHERE t.tenant_id = 2 AND t.material_id = bk.old_material_id;

UPDATE h_inbound_lines t
JOIN k3_mapping_backup_2026_04_26 bk
  ON bk.source_table = 'h_inbound_lines'
 AND bk.source_id = t.id
 AND bk.tenant_id = t.tenant_id
SET t.material_id = bk.new_material_id
WHERE t.tenant_id = 2 AND t.material_id = bk.old_material_id;

UPDATE accounting_purchases t
JOIN k3_mapping_backup_2026_04_26 bk
  ON bk.source_table = 'accounting_purchases'
 AND bk.source_id = t.id
 AND bk.tenant_id = t.tenant_id
SET t.material_id = bk.new_material_id
WHERE t.tenant_id = 2 AND t.material_id = bk.old_material_id;

UPDATE purchase_order_lines t
JOIN k3_mapping_backup_2026_04_26 bk
  ON bk.source_table = 'purchase_order_lines'
 AND bk.source_id = t.id
 AND bk.tenant_id = t.tenant_id
SET t.material_id = bk.new_material_id
WHERE t.tenant_id = 2 AND t.material_id = bk.old_material_id;

UPDATE material_ledger_daily t
JOIN k3_mapping_backup_2026_04_26 bk
  ON bk.source_table = 'material_ledger_daily'
 AND bk.source_id = t.id
 AND bk.tenant_id = t.tenant_id
SET t.material_id = bk.new_material_id
WHERE t.tenant_id = 2 AND t.material_id = bk.old_material_id;

COMMIT;

-- ---------------------------------------------------------------------
-- 4. 보정 SQL (material_ledger_daily 73건 누락 발견 후 적용)
-- ---------------------------------------------------------------------
-- 적용 직후 V1 검증에서 mld 의 raw_material 73건 잔존 발견.
-- 백업 테이블에는 정상 INSERT 되었으나 실제 UPDATE 가 누락된 것으로 추정.
-- 원인 미상 (root cause 진단 별도 후속 작업).
-- 보정: 백업 테이블을 소스로 다시 UPDATE (멱등성 가드 포함).

-- 사전: 영향 행 수 확인 (기대: 73)
-- SELECT COUNT(*) AS will_update
--   FROM material_ledger_daily mld
--   JOIN k3_mapping_backup_2026_04_26 bk
--     ON bk.source_table = 'material_ledger_daily'
--    AND bk.source_id = mld.id
--    AND bk.tenant_id = mld.tenant_id
--  WHERE mld.tenant_id = 2 AND mld.material_id = bk.old_material_id;

UPDATE material_ledger_daily mld
JOIN k3_mapping_backup_2026_04_26 bk
  ON bk.source_table = 'material_ledger_daily'
 AND bk.source_id = mld.id
 AND bk.tenant_id = mld.tenant_id
SET mld.material_id = bk.new_material_id
WHERE mld.tenant_id = 2
  AND mld.material_id = bk.old_material_id;  -- 멱등성 가드: 이미 UPDATE 된 건 변화 없음

-- ---------------------------------------------------------------------
-- 5. 사후 검증 쿼리 (실행 후 확인용)
-- ---------------------------------------------------------------------
-- V1: 6 테이블 모두 잔존 item_master.id = 0 (mld 는 own_product 130건 제외)
-- V2: 백업 테이블 1,305 행 확인
-- V3: h_inventory 96 행 보존 (K2 결과)
-- V4: 미차감 자재 LOT 매칭 비율 (FEFO 가능성)
-- V5: N:1 통합 자재 5건 합계 보존

-- =====================================================================
-- N:1 통합 자재 5건 (sammelband 변종 통합)
-- =====================================================================
-- 다음 5개 hm_id 가 각각 2개의 item_master.id 를 흡수함:
--
--   hm_id=664 찰옥수수전분            ← im_id=[257, 258]
--   hm_id=674 B-2                    ← im_id=[270, 276]   (포장재)
--   hm_id=675 C-6(김치12kg-2)        ← im_id=[271, 277]   (포장재)
--   hm_id=676 A-13(어상자 15kg-2)    ← im_id=[272, 278]   (포장재, K2 unit='EA')
--   hm_id=678 B-4(홍시1호)           ← im_id=[274, 279]   (포장재)
--
-- 동일 자재의 중복 등록(변종/리네이밍)으로 판단 → 통합이 정합적.
-- 데이터 손실 없음. 백업에서 복원 가능: WHERE old_material_id IN (257,258,270,...,279).

-- =====================================================================
-- 후속 작업
-- =====================================================================
-- W3 (예정) : material_ledger_daily own_product 130 행 정정 (제품 ID 가 material_id 컬럼에 잘못 저장)
-- K5 (예정) : 4/9 미차감 batch 7건 (id 535~541) 재처리 — autoIssueMaterialsForBatch 재호출
-- root cause 진단 (예정) : K3 마이그 시점 mld UPDATE 누락 원인 추적
