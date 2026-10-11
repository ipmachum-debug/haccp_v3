-- ============================================================================
-- material_ledger_daily 의 "제품 행" 식별 + 격리 계획 (Q5-R2 결정 (a), 2026-10-12)
--
-- 배경: productSalePost 가 2026-04-01~08-12 제품 매출을 material_id 컬럼에 product id 로
--       써서 887행(item_master own/external_product) + v2 제품 id 행(orphan 중 90·91·86 류)이
--       원재료 수불부에 섞였다. 코드는 PR 에서 차단. 과거 행은 격리 테이블로 이동한다 (삭제 아님).
--
-- §1 은 SELECT 만. §2 는 Genspark 가 §1 건수를 확인한 뒤 실행하는 쓰기 계획 (주석 해제 후 실행).
-- ============================================================================

-- §1-a. 제품 행 (material_id 가 item_master 의 제품)
SELECT 'ledger_product_rows_item_master' k, COUNT(*) n, MIN(ledger_date) first_dt, MAX(ledger_date) last_dt
FROM material_ledger_daily d
JOIN item_master im ON im.id = d.material_id AND im.tenant_id = d.tenant_id
WHERE im.item_type IN ('own_product', 'external_product')
  AND d.material_id NOT IN (SELECT id FROM h_materials WHERE tenant_id = d.tenant_id);

-- §1-b. 제품 행 (material_id 가 h_products_v2 id 이고 h_materials / item_master 어디에도 없음)
SELECT 'ledger_product_rows_v2' k, COUNT(*) n, MIN(ledger_date) first_dt, MAX(ledger_date) last_dt
FROM material_ledger_daily d
JOIN h_products_v2 p ON p.id = d.material_id AND p.tenant_id = d.tenant_id
WHERE d.material_id NOT IN (SELECT id FROM h_materials WHERE tenant_id = d.tenant_id)
  AND d.material_id NOT IN (SELECT id FROM item_master WHERE tenant_id = d.tenant_id);

-- §1-c. 남는 orphan (자재도 제품도 아님) — 개별 조사 대상 (예: 654 자재 입고 800kg)
SELECT d.material_id, COUNT(*) n, SUM(receiving_qty) recv, SUM(usage_qty) used, MIN(ledger_date) first_dt, MAX(ledger_date) last_dt
FROM material_ledger_daily d
WHERE d.material_id NOT IN (SELECT id FROM h_materials WHERE tenant_id = d.tenant_id)
  AND d.material_id NOT IN (SELECT id FROM item_master WHERE tenant_id = d.tenant_id)
  AND d.material_id NOT IN (SELECT id FROM h_products_v2 WHERE tenant_id = d.tenant_id)
GROUP BY d.material_id ORDER BY n DESC;

-- §1-d. 이동 후 남아야 하는 행 = 전부 h_materials 에 존재해야 한다 (사후 검증, 0 이어야 함)
--   (§2 실행 후 다시 실행)
-- SELECT COUNT(*) FROM material_ledger_daily d
--  WHERE d.material_id NOT IN (SELECT id FROM h_materials WHERE tenant_id = d.tenant_id);

-- ============================================================================
-- §2. 격리 계획 (쓰기) — §1-a + §1-b 건수 확인 후 주석 해제. 트랜잭션으로 묶는다.
-- ============================================================================
-- START TRANSACTION;
-- CREATE TABLE IF NOT EXISTS _orphan_material_ledger_daily_products_20261012 LIKE material_ledger_daily;
-- ALTER TABLE _orphan_material_ledger_daily_products_20261012
--   ADD COLUMN quarantined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
--   ADD COLUMN reason VARCHAR(120) NOT NULL DEFAULT 'Q5-R2(a) product rows in material ledger';
-- INSERT INTO _orphan_material_ledger_daily_products_20261012
--   SELECT d.*, NOW(), 'Q5-R2(a) item_master product'
--   FROM material_ledger_daily d
--   JOIN item_master im ON im.id = d.material_id AND im.tenant_id = d.tenant_id
--   WHERE im.item_type IN ('own_product', 'external_product')
--     AND d.material_id NOT IN (SELECT id FROM h_materials WHERE tenant_id = d.tenant_id);
-- INSERT INTO _orphan_material_ledger_daily_products_20261012
--   SELECT d.*, NOW(), 'Q5-R2(a) v2 product id'
--   FROM material_ledger_daily d
--   JOIN h_products_v2 p ON p.id = d.material_id AND p.tenant_id = d.tenant_id
--   WHERE d.material_id NOT IN (SELECT id FROM h_materials WHERE tenant_id = d.tenant_id)
--     AND d.material_id NOT IN (SELECT id FROM item_master WHERE tenant_id = d.tenant_id);
-- -- 복사 건수 = §1-a + §1-b 인지 확인한 뒤:
-- DELETE d FROM material_ledger_daily d
--   WHERE d.id IN (SELECT id FROM _orphan_material_ledger_daily_products_20261012);
-- COMMIT;
