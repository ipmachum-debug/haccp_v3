-- =====================================================================
-- 단가 관리 — h_materials.price_auto_update 컬럼 추가   2026-10-13
-- =====================================================================
-- 적용 일자: (Genspark 실행 시 기입)
-- 실행 주체: Genspark. 배포 전·후 어느 때 실행해도 안전 (코드는 컬럼이 없으면 "자동 갱신 ON" 으로 동작하고,
--            토글 변경만 컬럼이 있어야 한다).
-- 의미:     1 = 입고가 들어오면 자재 현재 단가(unit_price) 를 자동 갱신 (기본)
--           0 = 수동 고정 — 샘플·1회성 매입·특별가 자재. 입고가가 들어와도 현재 단가를 안 바꿈.
-- 롤백:     ALTER TABLE h_materials DROP COLUMN price_auto_update;
-- =====================================================================

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h_materials' AND COLUMN_NAME = 'price_auto_update');
SET @ddl := IF(@col_exists = 0,
  'ALTER TABLE h_materials ADD COLUMN price_auto_update TINYINT(1) NOT NULL DEFAULT 1 COMMENT ''입고 시 현재 단가 자동 갱신 (0=수동 고정)'' AFTER unit_price',
  'SELECT ''price_auto_update 이미 존재 — 스킵'' AS note');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

-- 검증
SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h_materials' AND COLUMN_NAME = 'price_auto_update';
-- drizzle 스키마 등록은 다음 introspect 재추출(6-a 후) 때 반영. 그 전까지 코드는 raw SQL 로만 이 컬럼을 읽는다.
