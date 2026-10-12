-- =====================================================================
-- v3 개편 4단계: 업무 FK 12개 추가 (11-identity-policy-v3.md §3 4단계)
-- =====================================================================
-- 적용 일자: (Genspark 실행 시 기입)
-- 실행 환경: 운영 DB haccp_tenant_db (MySQL 8.0, InnoDB)
-- 실행 주체: Genspark — §1 사전검사 전부 0 확인 → §2 를 한 문장씩 실행 → §3 검증
-- 전제:     0단계 정책(#448) · 1~3단계 데이터 작업(트랙 A, R4-1, 2단계 격리) 완료 보고 (2026-10-12 11:40)
-- 롤백:     §4 (DROP FOREIGN KEY) — 데이터 변경 없음, FK 만 제거
--
-- 왜 FK 인가: 테넌트 격리·원자성·업무 규칙은 코드와 CI 가 지키지만, "잘못된 id 가 들어가는 순간
-- DB 가 거부한다" 는 성질은 FK 만 준다. 사람과 AI 의 실수를 DB 가 막는 유일한 장치.
--
-- ON DELETE 원칙
--   RESTRICT : 마스터(h_materials / h_products_v2 / item_master) 와 원장 이력(h_inventory_lots ← 거래).
--              이력이 있는 마스터·LOT 는 지울 수 없다. 앱은 비활성화(is_active) 로 처리.
--   CASCADE  : 순수 자식(배치 투입·SKU 실적·BOM 버전·BOM 재료). 부모가 지워지면 같이 지워지는 게 의미상 맞다.
--              배치 삭제 역수행(batchCRUD.deleteBatch)은 이미 자식을 먼저 지우므로 영향 없음.
--
-- 이번에 넣지 않는 것 (다음 라운드)
--   h_ccp_form_records.batch_id → h_batches   : 고아 45건 격리 후
--   h_inventory_lots.inventory_id → h_inventory : 완제품 LOT 164건이 집계 행 없음 (10 문서 과제)
--   material_ledger_daily.material_id          : 선택지 A 보류 58건 처리 후
-- =====================================================================

-- ---------------------------------------------------------------------
-- §1. 사전검사 — 전부 0 이어야 §2 진행. 하나라도 >0 이면 멈추고 보고.
-- ---------------------------------------------------------------------
SELECT 'batches.product_id→h_products_v2' k, COUNT(*) n FROM h_batches b WHERE NOT EXISTS (SELECT 1 FROM h_products_v2 p WHERE p.id=b.product_id)
UNION ALL SELECT 'batch_inputs.batch_id→h_batches', COUNT(*) FROM h_batch_inputs bi WHERE NOT EXISTS (SELECT 1 FROM h_batches b WHERE b.id=bi.batch_id)
UNION ALL SELECT 'batch_inputs.material_id→h_materials', COUNT(*) FROM h_batch_inputs bi WHERE NOT EXISTS (SELECT 1 FROM h_materials m WHERE m.id=bi.material_id)
UNION ALL SELECT 'sku_output.batch_id→h_batches', COUNT(*) FROM production_sku_output o WHERE NOT EXISTS (SELECT 1 FROM h_batches b WHERE b.id=o.batch_id)
UNION ALL SELECT 'lots.material_id→h_materials', COUNT(*) FROM h_inventory_lots l WHERE l.material_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM h_materials m WHERE m.id=l.material_id)
UNION ALL SELECT 'lots.product_id→h_products_v2', COUNT(*) FROM h_inventory_lots l WHERE l.product_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM h_products_v2 p WHERE p.id=l.product_id)
UNION ALL SELECT 'tx.lot_id→h_inventory_lots', COUNT(*) FROM h_inventory_transactions t WHERE t.lot_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM h_inventory_lots l WHERE l.id=t.lot_id)
UNION ALL SELECT 'tx.material_id→h_materials', COUNT(*) FROM h_inventory_transactions t WHERE t.material_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM h_materials m WHERE m.id=t.material_id)
UNION ALL SELECT 'mf_reports.product_id→item_master', COUNT(*) FROM h_mf_reports r WHERE NOT EXISTS (SELECT 1 FROM item_master im WHERE im.id=r.product_id)
UNION ALL SELECT 'mf_versions.mf_report_id→h_mf_reports', COUNT(*) FROM h_mf_report_versions v WHERE NOT EXISTS (SELECT 1 FROM h_mf_reports r WHERE r.id=v.mf_report_id)
UNION ALL SELECT 'mf_ingredients.version→h_mf_report_versions', COUNT(*) FROM h_mf_ingredients i WHERE NOT EXISTS (SELECT 1 FROM h_mf_report_versions v WHERE v.id=i.mf_report_version_id)
UNION ALL SELECT 'mf_ingredients.material_id→item_master', COUNT(*) FROM h_mf_ingredients i WHERE i.material_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM item_master im WHERE im.id=i.material_id)
UNION ALL SELECT 'product_skus.item_id→item_master', COUNT(*) FROM product_skus s WHERE NOT EXISTS (SELECT 1 FROM item_master im WHERE im.id=s.item_id);

-- lot_id = 0 sentinel 잔존 확인 (2026-04-28 NULL 전환 이후 0 이어야 함; >0 이면 UPDATE ... SET lot_id=NULL WHERE lot_id=0 먼저)
SELECT 'tx.lot_id=0 sentinel' k, COUNT(*) n FROM h_inventory_transactions WHERE lot_id = 0;

-- ---------------------------------------------------------------------
-- §2. FK 추가 — 한 문장씩. 실패하면 그 문장의 사전검사 항목을 다시 본다.
--     (MySQL 은 FK 컬럼에 인덱스가 없으면 자동 생성한다)
-- ---------------------------------------------------------------------
-- 생산
ALTER TABLE h_batches
  ADD CONSTRAINT fk_batches_product FOREIGN KEY (product_id) REFERENCES h_products_v2 (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE h_batch_inputs
  ADD CONSTRAINT fk_batch_inputs_batch FOREIGN KEY (batch_id) REFERENCES h_batches (id) ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE h_batch_inputs
  ADD CONSTRAINT fk_batch_inputs_material FOREIGN KEY (material_id) REFERENCES h_materials (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE production_sku_output
  ADD CONSTRAINT fk_sku_output_batch FOREIGN KEY (batch_id) REFERENCES h_batches (id) ON DELETE CASCADE ON UPDATE RESTRICT;

-- 재고 (수량 세계 = 상세 테이블 id)
ALTER TABLE h_inventory_lots
  ADD CONSTRAINT fk_lots_material FOREIGN KEY (material_id) REFERENCES h_materials (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE h_inventory_lots
  ADD CONSTRAINT fk_lots_product FOREIGN KEY (product_id) REFERENCES h_products_v2 (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE h_inventory_transactions
  ADD CONSTRAINT fk_tx_lot FOREIGN KEY (lot_id) REFERENCES h_inventory_lots (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE h_inventory_transactions
  ADD CONSTRAINT fk_tx_material FOREIGN KEY (material_id) REFERENCES h_materials (id) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- BOM (정체성 세계 = item_master id)
ALTER TABLE h_mf_reports
  ADD CONSTRAINT fk_mf_reports_item FOREIGN KEY (product_id) REFERENCES item_master (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE h_mf_report_versions
  ADD CONSTRAINT fk_mf_versions_report FOREIGN KEY (mf_report_id) REFERENCES h_mf_reports (id) ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE h_mf_ingredients
  ADD CONSTRAINT fk_mf_ingredients_version FOREIGN KEY (mf_report_version_id) REFERENCES h_mf_report_versions (id) ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE h_mf_ingredients
  ADD CONSTRAINT fk_mf_ingredients_item FOREIGN KEY (material_id) REFERENCES item_master (id) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- SKU
ALTER TABLE product_skus
  ADD CONSTRAINT fk_skus_item FOREIGN KEY (item_id) REFERENCES item_master (id) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ---------------------------------------------------------------------
-- §3. 검증 — 13개 전부 보여야 함
-- ---------------------------------------------------------------------
SELECT TABLE_NAME, CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE() AND CONSTRAINT_NAME IN (
  'fk_batches_product','fk_batch_inputs_batch','fk_batch_inputs_material','fk_sku_output_batch',
  'fk_lots_material','fk_lots_product','fk_tx_lot','fk_tx_material',
  'fk_mf_reports_item','fk_mf_versions_report','fk_mf_ingredients_version','fk_mf_ingredients_item','fk_skus_item')
ORDER BY TABLE_NAME, CONSTRAINT_NAME;

-- 동작 확인 (실패해야 정상 — 에러 1452 가 나면 FK 가 산다)
-- INSERT INTO h_batch_inputs (tenant_id, batch_id, material_id, planned_quantity, unit) VALUES (2, 999999999, 615, 1, 'kg');

-- ---------------------------------------------------------------------
-- §4. 롤백 (FK 만 제거, 데이터 변경 없음)
-- ---------------------------------------------------------------------
-- ALTER TABLE h_batches DROP FOREIGN KEY fk_batches_product;
-- ALTER TABLE h_batch_inputs DROP FOREIGN KEY fk_batch_inputs_batch;
-- ALTER TABLE h_batch_inputs DROP FOREIGN KEY fk_batch_inputs_material;
-- ALTER TABLE production_sku_output DROP FOREIGN KEY fk_sku_output_batch;
-- ALTER TABLE h_inventory_lots DROP FOREIGN KEY fk_lots_material;
-- ALTER TABLE h_inventory_lots DROP FOREIGN KEY fk_lots_product;
-- ALTER TABLE h_inventory_transactions DROP FOREIGN KEY fk_tx_lot;
-- ALTER TABLE h_inventory_transactions DROP FOREIGN KEY fk_tx_material;
-- ALTER TABLE h_mf_reports DROP FOREIGN KEY fk_mf_reports_item;
-- ALTER TABLE h_mf_report_versions DROP FOREIGN KEY fk_mf_versions_report;
-- ALTER TABLE h_mf_ingredients DROP FOREIGN KEY fk_mf_ingredients_version;
-- ALTER TABLE h_mf_ingredients DROP FOREIGN KEY fk_mf_ingredients_item;
-- ALTER TABLE product_skus DROP FOREIGN KEY fk_skus_item;
