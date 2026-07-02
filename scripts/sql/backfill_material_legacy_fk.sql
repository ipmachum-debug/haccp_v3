-- ============================================================================
-- P1 Track B — item_master.legacy_material_id FK 백필 (병① 식별자 파편화)
-- ----------------------------------------------------------------------------
-- 목적: PR #395(resolver FK 우선)가 완전히 동작하려면 FK 가 채워져 있어야 함.
--       P0 진단: 1a legacy_null 5건 / 1b dangling 3건.
-- 성격: STEP 1 읽기전용 → STEP 2 안전 자동(이름 유일매칭만) → STEP 3 수동(스크램블).
-- 실행: Genspark 서버 DB. ⚠️ PR #395 배포 '전에' 실행 권장.
-- ============================================================================
SET @t := 2;

-- ── STEP 1 (DRY-RUN) ── 채울 대상과 후보 확인 ─────────────────────────────
-- (1-a) legacy_null 자재 + 이름 매칭 후보(정확히 1건이어야 자동 백필 안전)
SELECT im.id AS item_master_id, im.item_code, im.item_name,
  (SELECT COUNT(*) FROM h_materials m
     WHERE m.tenant_id=im.tenant_id AND TRIM(m.material_name)=TRIM(im.item_name)) AS name_match_cnt,
  (SELECT m.id FROM h_materials m
     WHERE m.tenant_id=im.tenant_id AND TRIM(m.material_name)=TRIM(im.item_name) LIMIT 1) AS name_match_hm_id
FROM item_master im
WHERE im.tenant_id=@t AND im.item_type='raw_material' AND im.legacy_material_id IS NULL
ORDER BY im.id;

-- (1-b) dangling 자재 — 현재 legacy 가 존재하지 않는 h_materials 를 가리킴 (스크램블 위험)
SELECT im.id AS item_master_id, im.item_code, im.item_name,
  im.legacy_material_id AS current_dangling_legacy,
  (SELECT m.id FROM h_materials m
     WHERE m.tenant_id=im.tenant_id AND TRIM(m.material_name)=TRIM(im.item_name) LIMIT 1) AS name_match_hm_id,
  (SELECT m.material_name FROM h_materials m WHERE m.id=im.legacy_material_id) AS fk_target_name
FROM item_master im
WHERE im.tenant_id=@t AND im.item_type='raw_material'
  AND im.legacy_material_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM h_materials m WHERE m.id=im.legacy_material_id)
ORDER BY im.id;

-- ── STEP 2 (자동 백필, 안전) ── legacy_null + 이름 매칭이 '정확히 1건'인 자재만 ──
-- (이름 후보가 0건이거나 2건 이상이면 자동 백필 제외 → STEP 3 수동)
-- START TRANSACTION;
-- UPDATE item_master im
-- SET im.legacy_material_id = (
--   SELECT m.id FROM h_materials m
--   WHERE m.tenant_id=im.tenant_id AND TRIM(m.material_name)=TRIM(im.item_name) LIMIT 1)
-- WHERE im.tenant_id=@t AND im.item_type='raw_material' AND im.legacy_material_id IS NULL
--   AND (SELECT COUNT(*) FROM h_materials m
--        WHERE m.tenant_id=im.tenant_id AND TRIM(m.material_name)=TRIM(im.item_name)) = 1;
-- SELECT ROW_COUNT() AS backfilled;   -- 예상: 이름 유일매칭 legacy_null 건수
-- COMMIT;   -- 확인 후

-- ── STEP 3 (수동) ── dangling/스크램블 + 이름 매칭 없는 legacy_null ──────────
--   FK 와 이름이 서로 다른 자재를 가리키는 경우(스크램블)는 사람이 정본 확인 필수.
--   예) 찰옥수수전분: legacy=663 vs 이름매칭=664 — 실제 어느 자재인지 확인 후:
-- UPDATE item_master SET legacy_material_id = <검증된 h_materials.id>
--   WHERE id = <item_master.id> AND tenant_id=@t;
--
--   ※ h_materials 쪽 이름/코드도 함께 점검(잘못된 쪽을 병합/비활성)하는 게 근본적.

-- ── STEP 4 (검증) ── 백필 후 P0 1a/1b 가 줄었는지 재측정 ───────────────────
-- SELECT
--   SUM(legacy_material_id IS NULL) AS still_null,
--   SUM(legacy_material_id IS NOT NULL
--       AND NOT EXISTS (SELECT 1 FROM h_materials m WHERE m.id=item_master.legacy_material_id)) AS still_dangling
-- FROM item_master WHERE tenant_id=@t AND item_type='raw_material';
