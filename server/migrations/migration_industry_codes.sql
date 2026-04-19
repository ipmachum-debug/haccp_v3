-- ============================================
-- 업종코드 피처 시스템 마이그레이션
-- Millio AI - 제조기반 올인원 AI ERP
-- Date: 2026-04-19
-- ============================================

-- 1. tenants 테이블에 업종코드 컬럼 추가
ALTER TABLE tenants
  ADD COLUMN industry_code VARCHAR(20) DEFAULT NULL COMMENT 'KSIC 업종코드 (ex: C10, C1011, C20)',
  ADD COLUMN industry_category VARCHAR(50) DEFAULT NULL COMMENT '대분류 (food, cosmetics, supplement, pharma, general)';

-- 2. 업종코드 마스터 테이블
CREATE TABLE IF NOT EXISTS industry_codes (
  code VARCHAR(20) PRIMARY KEY COMMENT '업종코드 (KSIC 기반)',
  parent_code VARCHAR(20) DEFAULT NULL COMMENT '상위 업종코드',
  name_ko VARCHAR(200) NOT NULL COMMENT '업종명 (한국어)',
  name_en VARCHAR(200) DEFAULT NULL COMMENT '업종명 (영어)',
  description TEXT COMMENT '업종 설명',
  category VARCHAR(50) NOT NULL COMMENT '대분류 카테고리',
  icon VARCHAR(50) DEFAULT NULL COMMENT '아이콘 (lucide icon name)',
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX category_idx (category),
  INDEX parent_idx (parent_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. 업종별 기능 매핑 테이블
CREATE TABLE IF NOT EXISTS industry_feature_mappings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  industry_code VARCHAR(20) NOT NULL COMMENT '업종코드',
  feature_key VARCHAR(100) NOT NULL COMMENT '기능 키 (module:xxx, feature:xxx)',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  config_json JSON DEFAULT NULL COMMENT '추가 설정',
  description TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX unique_mapping (industry_code, feature_key),
  INDEX feature_key_idx (feature_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. 업종별 인증 요구사항 테이블
CREATE TABLE IF NOT EXISTS industry_certifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  industry_code VARCHAR(20) NOT NULL,
  cert_code VARCHAR(50) NOT NULL COMMENT '인증 코드 (HACCP, GMP 등)',
  cert_name_ko VARCHAR(200) NOT NULL,
  cert_name_en VARCHAR(200) DEFAULT NULL,
  requirement VARCHAR(20) NOT NULL DEFAULT 'optional' COMMENT 'mandatory/recommended/optional',
  regulation_ref TEXT COMMENT '관련 법령',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX unique_cert (industry_code, cert_code),
  INDEX industry_idx (industry_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 시드 데이터: 업종코드 마스터
-- ============================================

INSERT INTO industry_codes (code, parent_code, name_ko, name_en, category, icon, sort_order) VALUES
-- 식품 제조업
('C10', NULL, '식품 제조업', 'Food Manufacturing', 'food', 'chef-hat', 10),
('C1011', 'C10', '도축업', 'Slaughtering', 'food', 'beef', 11),
('C1012', 'C10', '육류 가공·저장업', 'Meat Processing', 'food', 'beef', 12),
('C1020', 'C10', '수산물 가공·저장업', 'Seafood Processing', 'food', 'fish', 13),
('C1030', 'C10', '과실·채소 가공·저장업', 'Fruit & Vegetable Processing', 'food', 'apple', 14),
('C1040', 'C10', '유제품 제조업', 'Dairy Manufacturing', 'food', 'milk', 15),
('C1050', 'C10', '곡물 가공·전분 제조업', 'Grain & Starch Manufacturing', 'food', 'wheat', 16),
('C1061', 'C10', '떡·빵·과자류 제조업', 'Bakery & Confectionery', 'food', 'cake-slice', 17),
('C1071', 'C10', '조미료·소스 제조업', 'Seasoning & Sauce Manufacturing', 'food', 'utensils-crossed', 18),
('C1079', 'C10', '기타 식품 제조업', 'Other Food Manufacturing', 'food', 'package', 19),
('C1080', 'C10', '동물용 사료 제조업', 'Animal Feed Manufacturing', 'food', 'paw-print', 20),
('C11', NULL, '음료 제조업', 'Beverage Manufacturing', 'food', 'cup-soda', 21),

-- 건강기능식품
('C10_SUP', NULL, '건강기능식품 제조업', 'Health Supplement Manufacturing', 'supplement', 'pill', 30),

-- 화장품 제조업
('C20', NULL, '화장품 제조업', 'Cosmetics Manufacturing', 'cosmetics', 'sparkles', 40),
('C2041', 'C20', '화장품 제조업', 'Cosmetics Manufacturing', 'cosmetics', 'sparkles', 41),
('C2042', 'C20', '치약·비누·세정제 제조업', 'Toothpaste, Soap & Detergent', 'cosmetics', 'droplets', 42),

-- 의약품 제조업
('C21', NULL, '의약품 제조업', 'Pharmaceutical Manufacturing', 'pharma', 'syringe', 50),
('C2110', 'C21', '의약품 제조업', 'Pharmaceutical Manufacturing', 'pharma', 'syringe', 51),
('C2120', 'C21', '의약외품 제조업', 'Quasi-drug Manufacturing', 'pharma', 'pill', 52),

-- 전자부품·장비
('C26', NULL, '전자부품·컴퓨터·통신장비 제조업', 'Electronics Manufacturing', 'electronics', 'cpu', 60),

-- 섬유·의복
('C13', NULL, '섬유·직물 제조업', 'Textile Manufacturing', 'textile', 'scissors', 70),
('C14', NULL, '의복 제조업', 'Apparel Manufacturing', 'textile', 'shirt', 71),

-- 일반 제조업
('C_GENERAL', NULL, '일반 제조업', 'General Manufacturing', 'general', 'factory', 99)
ON DUPLICATE KEY UPDATE name_ko = VALUES(name_ko), name_en = VALUES(name_en);

-- ============================================
-- 시드 데이터: 업종별 인증 요구사항
-- ============================================

INSERT INTO industry_certifications (industry_code, cert_code, cert_name_ko, cert_name_en, requirement, sort_order) VALUES
-- 식품
('C10', 'HACCP', '식품안전관리인증기준(HACCP)', 'HACCP', 'mandatory', 1),
('C10', 'ISO22000', '식품안전경영시스템', 'ISO 22000', 'recommended', 2),
('C10', 'FSSC22000', '식품안전시스템인증', 'FSSC 22000', 'optional', 3),
-- 건기식
('C10_SUP', 'HACCP', '식품안전관리인증기준(HACCP)', 'HACCP', 'mandatory', 1),
('C10_SUP', 'GMP', '건강기능식품 GMP', 'GMP for Health Supplements', 'mandatory', 2),
('C10_SUP', 'ISO22000', '식품안전경영시스템', 'ISO 22000', 'recommended', 3),
-- 화장품
('C20', 'cGMP', '화장품 우수제조관리기준(cGMP)', 'cGMP for Cosmetics', 'mandatory', 1),
('C20', 'ISO22716', '화장품 GMP 국제표준', 'ISO 22716', 'recommended', 2),
('C20', 'ISO9001', '품질경영시스템', 'ISO 9001', 'optional', 3),
-- 의약품
('C21', 'KGMP', '의약품 제조 및 품질관리기준(KGMP)', 'KGMP', 'mandatory', 1),
('C21', 'PIC/S', 'PIC/S GMP', 'PIC/S GMP', 'recommended', 2),
('C21', 'ISO13485', '의료기기 품질경영시스템', 'ISO 13485', 'optional', 3),
-- 전자
('C26', 'ISO9001', '품질경영시스템', 'ISO 9001', 'recommended', 1),
('C26', 'ISO14001', '환경경영시스템', 'ISO 14001', 'optional', 2),
('C26', 'IATF16949', '자동차 품질경영시스템', 'IATF 16949', 'optional', 3),
-- 일반
('C_GENERAL', 'ISO9001', '품질경영시스템', 'ISO 9001', 'optional', 1),
('C_GENERAL', 'ISO14001', '환경경영시스템', 'ISO 14001', 'optional', 2)
ON DUPLICATE KEY UPDATE cert_name_ko = VALUES(cert_name_ko);

-- ============================================
-- 기존 테넌트 기본값 설정 (식품 제조 — 기존 HACCP 고객)
-- ============================================

UPDATE tenants 
SET industry_code = 'C10', industry_category = 'food'
WHERE industry_code IS NULL;
