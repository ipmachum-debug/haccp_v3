-- ============================================================================
-- 2026-04-22: B2C 플랫폼 정산 모듈 (Phase 2) 스키마
-- ============================================================================
--
-- 배경:
--   한국 B2C 온라인 판매자의 부가세 신고 자료 관리 전용.
--   이지어드민 주문 수집 (재고 관리) 과 분리된 독립 흐름.
--
-- 테이블:
--   1) partners.customer_type — 거래처를 B2C 플랫폼으로 식별
--   2) b2c_sellers            — 한 플랫폼 아래 복수 셀러 계정 (sokooryceo 등)
--   3) b2c_sales_entries      — 플랫폼×셀러×결제수단×연도×월 매출액
--
-- 사용 예:
--   INSERT INTO partners (company_name, customer_type, ...) VALUES ('옥션', 'b2c_platform', ...);
--   INSERT INTO b2c_sellers (platform_partner_id, seller_code, seller_name)
--     VALUES (<옥션 partner id>, 'sokooryceo', '소구려');
--   INSERT INTO b2c_sales_entries (platform_partner_id, seller_id, payment_method,
--                                   period_year, period_month, gross_amount, ...)
--     VALUES (..., '신용카드', 2026, 1, 111060.00, ...);
-- ============================================================================

-- 1. partners.customer_type 추가 (idempotent — 컬럼 존재 확인)
DROP PROCEDURE IF EXISTS _millio_add_customer_type;
DELIMITER $$
CREATE PROCEDURE _millio_add_customer_type()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'partners'
      AND COLUMN_NAME = 'customer_type'
  ) THEN
    ALTER TABLE partners
      ADD COLUMN customer_type ENUM('b2b','b2c_platform','b2c_direct') NOT NULL DEFAULT 'b2b'
      COMMENT '거래처 유형: b2b / b2c_platform (B2C 전자상거래) / b2c_direct';
  END IF;
END $$
DELIMITER ;
CALL _millio_add_customer_type();
DROP PROCEDURE _millio_add_customer_type;

-- 2. b2c_sellers 테이블
CREATE TABLE IF NOT EXISTS b2c_sellers (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  platform_partner_id BIGINT NOT NULL,
  seller_code VARCHAR(100) NOT NULL,
  seller_name VARCHAR(200),
  notes TEXT,
  is_active TINYINT NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_b2c_sellers (tenant_id, platform_partner_id, seller_code),
  INDEX idx_b2c_sellers_platform (tenant_id, platform_partner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='B2C 플랫폼 내 셀러 계정 (한 사업자 복수 스토어)';

-- 3. b2c_sales_entries 테이블
CREATE TABLE IF NOT EXISTS b2c_sales_entries (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  platform_partner_id BIGINT NOT NULL,
  seller_id BIGINT NOT NULL,
  payment_method VARCHAR(50) NOT NULL COMMENT '신용카드/현금결제/휴대폰결제/기타 등 (플랫폼마다 다름)',
  period_year INT NOT NULL,
  period_month INT NOT NULL,
  gross_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00 COMMENT '총매출 (부가세 포함)',
  supply_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00 COMMENT '공급가액 (부가세 제외)',
  vat_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00 COMMENT '부가세',
  commission_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00 COMMENT '플랫폼 수수료',
  refund_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00 COMMENT '환불/쿠폰 차감',
  net_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00 COMMENT '실수령 예상액',
  file_key VARCHAR(500) COMMENT '원본 정산서 파일 키',
  file_name VARCHAR(255),
  status ENUM('draft','confirmed') NOT NULL DEFAULT 'draft'
    COMMENT 'draft: 입력 중, confirmed: 분기 확정 (분개 생성 완료)',
  confirmed_at TIMESTAMP NULL,
  confirmed_by BIGINT NULL,
  journal_entry_id BIGINT NULL COMMENT '확정 시 생성된 분개 FK',
  notes TEXT,
  created_by BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_b2c_sales_entries (
    tenant_id, platform_partner_id, seller_id, payment_method, period_year, period_month
  ),
  INDEX idx_b2c_sales_period (tenant_id, period_year, period_month),
  INDEX idx_b2c_sales_platform (tenant_id, platform_partner_id),
  INDEX idx_b2c_sales_status (tenant_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='B2C 플랫폼 정산 — 분기별 매출 신고 데이터 (부가세 신고용)';
