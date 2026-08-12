-- ERP Basic 요금제 추가 마이그레이션
-- 실행: mysql -u root -p haccpone < scripts/migrate-add-erp-basic-plan.sql

-- 1. tenants 테이블에 erp_basic 패키지 추가
ALTER TABLE tenants
  MODIFY COLUMN subscription_package ENUM('starter', 'standard', 'enterprise', 'erp_basic')
  NOT NULL DEFAULT 'starter';

-- 2. package_features 테이블에 erp_basic 패키지 추가
ALTER TABLE package_features
  MODIFY COLUMN package_name ENUM('basic', 'pro', 'starter', 'standard', 'enterprise', 'erp_basic')
  NOT NULL;

-- 3. erp_basic 패키지 기능 시드
INSERT INTO package_features (tenant_id, package_name, feature_name, is_enabled) VALUES
  (1, 'erp_basic', 'accounting', true),
  (1, 'erp_basic', 'aiAssistant', true),
  (1, 'erp_basic', 'documentPdf', true),
  (1, 'erp_basic', 'excelExport', true),
  (1, 'erp_basic', 'financialReports', true),
  (1, 'erp_basic', 'customPdf', false),
  (1, 'erp_basic', 'apiIntegration', false),
  (1, 'erp_basic', 'autoBackup', false)
ON DUPLICATE KEY UPDATE is_enabled = VALUES(is_enabled);
