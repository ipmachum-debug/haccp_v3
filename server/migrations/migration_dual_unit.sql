-- ============================================================
-- HACCP v3 Dual-Unit Management System Migration
-- 이중 단위 관리 시스템 (생산 kg ↔ 판매 SKU)
-- Date: 2026-02-18
-- ============================================================

-- 1. item_master - 통합 품목 마스터
-- 원재료(raw_material), 자사제품(own_product), 외부제품(external_product) 통합
CREATE TABLE IF NOT EXISTS item_master (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL DEFAULT 1,
  item_code VARCHAR(50) NOT NULL,
  item_name VARCHAR(200) NOT NULL,
  item_type ENUM('raw_material', 'own_product', 'external_product') NOT NULL,
  category VARCHAR(100),
  base_unit VARCHAR(20) NOT NULL DEFAULT 'kg',  -- 기본 단위 (kg, g, L 등)
  
  -- 원재료 전용 필드
  supplier_id BIGINT,
  purchase_unit VARCHAR(20),           -- 구매 단위 (포대, 박스 등)
  purchase_conversion_rate DECIMAL(10,4) DEFAULT 1.0000,  -- 구매단위 → 기본단위 환산
  
  -- 제품 전용 필드
  product_report_no VARCHAR(50),       -- 품목제조보고 번호
  shelf_life_days INT,
  
  -- 외부제품 전용 필드
  oem_supplier_id BIGINT,             -- OEM 공급업체
  
  -- 가격 정보
  default_unit_price DECIMAL(15,2) DEFAULT 0.00,
  
  -- 원본 참조 (하위 호환성)
  legacy_product_id BIGINT,            -- h_products_v2.id 참조
  legacy_material_id BIGINT,           -- h_materials.id 참조
  
  -- 상태
  is_active TINYINT NOT NULL DEFAULT 1,
  description TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  UNIQUE KEY uq_item_code_tenant (item_code, tenant_id),
  INDEX idx_tenant_id (tenant_id),
  INDEX idx_item_type (item_type),
  INDEX idx_legacy_product (legacy_product_id),
  INDEX idx_legacy_material (legacy_material_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. product_skus - SKU 포장 단위 관리
-- 하나의 제품에 여러 SKU (포장 규격)를 등록
CREATE TABLE IF NOT EXISTS product_skus (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL DEFAULT 1,
  item_id BIGINT NOT NULL,             -- item_master.id (own_product 또는 external_product)
  
  sku_code VARCHAR(50) NOT NULL,       -- SKU 코드 (예: PRD-001-60G30)
  sku_name VARCHAR(200) NOT NULL,      -- SKU 명칭 (예: "롤크림떡(초코) 60g×30ea")
  
  -- 포장 규격
  net_weight_g DECIMAL(10,2),          -- 개당 순중량 (g) (예: 60)
  pieces_per_pack INT DEFAULT 1,       -- 팩당 개수 (예: 30)
  packs_per_box INT DEFAULT 1,         -- 박스당 팩수 (예: 1)
  
  -- 단위 환산
  sales_unit VARCHAR(20) NOT NULL DEFAULT 'box',  -- 판매 단위 (box, pack, ea 등)
  kg_per_sales_unit DECIMAL(10,4) NOT NULL,        -- 판매단위당 kg (예: 1.8 = 60g × 30ea)
  
  -- 가격
  unit_price DECIMAL(15,2) DEFAULT 0.00,  -- 판매단위당 가격
  
  -- 바코드
  barcode VARCHAR(50),
  
  is_active TINYINT NOT NULL DEFAULT 1,
  is_default TINYINT NOT NULL DEFAULT 0,  -- 기본 SKU 여부
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  UNIQUE KEY uq_sku_code_tenant (sku_code, tenant_id),
  INDEX idx_item_id (item_id),
  INDEX idx_tenant_id (tenant_id),
  
  CONSTRAINT fk_sku_item FOREIGN KEY (item_id) REFERENCES item_master(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. production_verification - 생산 검증
-- 배치 완료 시 실제 SKU 단위 생산량 입력 및 검증
CREATE TABLE IF NOT EXISTS production_verification (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL DEFAULT 1,
  batch_id BIGINT NOT NULL,            -- h_production_batches.id
  
  -- SKU별 생산 실적
  sku_id BIGINT,                       -- product_skus.id (NULL이면 kg 단위 직접 입력)
  
  -- 계획
  planned_kg DECIMAL(10,3),            -- 배치 계획 총 kg
  planned_sku_qty INT,                 -- 계획 SKU 수량
  
  -- 실적
  actual_sku_qty INT,                  -- 실제 생산 SKU 수량
  actual_total_kg DECIMAL(10,3),       -- 실제 총 kg (actual_sku_qty × kg_per_sales_unit)
  
  -- 손실/폐기
  waste_kg DECIMAL(10,3) DEFAULT 0.000,  -- 폐기량 (kg)
  waste_reason TEXT,                      -- 폐기 사유
  
  -- 검증 결과
  yield_rate DECIMAL(5,2),             -- 수율 (%) = actual_total_kg / planned_kg × 100
  variance_kg DECIMAL(10,3),           -- 차이 (kg) = actual_total_kg - planned_kg
  variance_pct DECIMAL(5,2),           -- 차이율 (%)
  
  -- 검증 상태
  status ENUM('draft', 'verified', 'approved', 'rejected') DEFAULT 'draft',
  verified_by BIGINT,
  verified_at TIMESTAMP NULL,
  notes TEXT,
  
  created_by BIGINT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_batch_id (batch_id),
  INDEX idx_sku_id (sku_id),
  INDEX idx_tenant_id (tenant_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. production_sku_output - 배치별 SKU 생산 실적 상세
-- 하나의 배치에서 여러 SKU를 생산할 수 있음
CREATE TABLE IF NOT EXISTS production_sku_output (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL DEFAULT 1,
  batch_id BIGINT NOT NULL,            -- h_production_batches.id
  sku_id BIGINT NOT NULL,              -- product_skus.id
  
  quantity INT NOT NULL DEFAULT 0,     -- 생산 수량 (SKU 단위)
  defective_qty INT DEFAULT 0,         -- 불량 수량
  
  -- 자동 계산
  total_kg DECIMAL(10,3),              -- quantity × kg_per_sales_unit
  
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_batch_id (batch_id),
  INDEX idx_sku_id (sku_id),
  INDEX idx_tenant_id (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. cross_validation_reports - 교차 검증 보고서
CREATE TABLE IF NOT EXISTS cross_validation_reports (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL DEFAULT 1,
  batch_id BIGINT NOT NULL,
  report_date DATE NOT NULL,
  
  -- 수율 검증
  planned_output_kg DECIMAL(10,3),
  actual_output_kg DECIMAL(10,3),
  yield_variance_pct DECIMAL(5,2),
  
  -- 원재료 사용 검증
  theoretical_material_kg DECIMAL(10,3),  -- 이론적 원재료 사용량
  actual_material_kg DECIMAL(10,3),       -- 실제 원재료 사용량
  material_variance_pct DECIMAL(5,2),
  
  -- 종합 판정
  overall_status ENUM('pass', 'warning', 'fail') DEFAULT 'pass',
  findings TEXT,
  
  created_by BIGINT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_batch_id (batch_id),
  INDEX idx_tenant_id (tenant_id),
  INDEX idx_report_date (report_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 데이터 마이그레이션: 기존 h_products_v2 → item_master
-- ============================================================
INSERT INTO item_master (tenant_id, item_code, item_name, item_type, category, base_unit, 
  shelf_life_days, product_report_no, legacy_product_id, is_active, description)
SELECT 
  tenant_id,
  product_code,
  product_name,
  'own_product',
  category,
  COALESCE(unit, 'kg'),
  shelf_life_days,
  product_report_no,
  id,
  is_active,
  description
FROM h_products_v2
WHERE NOT EXISTS (
  SELECT 1 FROM item_master im 
  WHERE im.legacy_product_id = h_products_v2.id 
  AND im.tenant_id = h_products_v2.tenant_id
);

-- ============================================================
-- 데이터 마이그레이션: 기존 h_materials → item_master
-- ============================================================
INSERT INTO item_master (tenant_id, item_code, item_name, item_type, category, base_unit,
  supplier_id, purchase_unit, purchase_conversion_rate, default_unit_price,
  legacy_material_id, is_active, description)
SELECT 
  tenant_id,
  material_code,
  material_name,
  'raw_material',
  category,
  COALESCE(unit, 'kg'),
  supplier_id,
  purchase_unit,
  COALESCE(conversion_rate, 1.0000),
  COALESCE(unit_price, 0.00),
  id,
  is_active,
  description
FROM h_materials
WHERE NOT EXISTS (
  SELECT 1 FROM item_master im 
  WHERE im.legacy_material_id = h_materials.id 
  AND im.tenant_id = h_materials.tenant_id
);

-- ============================================================
-- 기본 SKU 생성: 각 자사제품에 대해 기본 kg 단위 SKU 생성
-- ============================================================
INSERT INTO product_skus (tenant_id, item_id, sku_code, sku_name, sales_unit, kg_per_sales_unit, is_default)
SELECT 
  im.tenant_id,
  im.id,
  CONCAT(im.item_code, '-KG'),
  CONCAT(im.item_name, ' (kg)'),
  'kg',
  1.0000,
  1
FROM item_master im
WHERE im.item_type IN ('own_product', 'external_product')
AND NOT EXISTS (
  SELECT 1 FROM product_skus ps 
  WHERE ps.item_id = im.id 
  AND ps.tenant_id = im.tenant_id
);

-- ============================================================
-- 확인 쿼리
-- ============================================================
-- SELECT item_type, COUNT(*) FROM item_master GROUP BY item_type;
-- SELECT COUNT(*) FROM product_skus;
-- SELECT COUNT(*) FROM production_verification;
