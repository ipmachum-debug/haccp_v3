-- ============================================================================
-- Migration: 결제 관련 테이블/컬럼 추가
-- PG 계약 후 실행: mysql -u root -p haccp_db < scripts/migrate-payment-tables.sql
-- ============================================================================

-- 1. tenants 테이블에 빌링키 컬럼 추가
ALTER TABLE tenants
  ADD COLUMN billing_key VARCHAR(200) NULL COMMENT '토스페이먼츠 빌링키',
  ADD COLUMN customer_key VARCHAR(100) NULL COMMENT '토스페이먼츠 고객키',
  ADD COLUMN card_company VARCHAR(50) NULL COMMENT '등록 카드사',
  ADD COLUMN card_number VARCHAR(30) NULL COMMENT '마스킹 카드번호 (****-1234)';

-- 2. 결제 이력 테이블
CREATE TABLE IF NOT EXISTS subscription_payments (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  payment_key VARCHAR(200) NOT NULL COMMENT '토스 paymentKey',
  order_id VARCHAR(100) NOT NULL COMMENT '주문번호 (HACCP-{tenantId}-{YYYYMM})',
  amount DECIMAL(12, 0) NOT NULL COMMENT '공급가 (부가세 별도)',
  tax_amount DECIMAL(12, 0) NOT NULL DEFAULT 0 COMMENT '부가세',
  status ENUM('paid', 'canceled', 'failed', 'refunded') NOT NULL DEFAULT 'paid',
  plan VARCHAR(20) NOT NULL COMMENT '결제 시점 플랜',
  paid_at TIMESTAMP NULL COMMENT '결제 승인 시각',
  canceled_at TIMESTAMP NULL,
  cancel_reason VARCHAR(500) NULL,
  receipt_url VARCHAR(500) NULL COMMENT '영수증 URL',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_tenant_date (tenant_id, paid_at),
  INDEX idx_order (order_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='SaaS 구독 결제 이력';

-- 확인
DESCRIBE subscription_payments;
SELECT 'Migration completed' as status;
