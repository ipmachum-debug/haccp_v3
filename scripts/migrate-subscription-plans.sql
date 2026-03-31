-- ============================================================================
-- Migration: subscription_package enum 확장 (basic,pro → starter,standard,enterprise)
-- 실행: mysql -u root -p haccp_db < scripts/migrate-subscription-plans.sql
-- ============================================================================

-- 1. enum 확장
ALTER TABLE tenants
MODIFY COLUMN subscription_package ENUM('basic', 'pro', 'starter', 'standard', 'enterprise')
NOT NULL DEFAULT 'starter';

-- 2. 기존 데이터 매핑
UPDATE tenants SET subscription_package = 'starter' WHERE subscription_package = 'basic';
UPDATE tenants SET subscription_package = 'standard' WHERE subscription_package = 'pro';

-- 3. 레거시 값 제거 (기존 값 변환 후)
ALTER TABLE tenants
MODIFY COLUMN subscription_package ENUM('starter', 'standard', 'enterprise')
NOT NULL DEFAULT 'starter';

-- 확인
SELECT id, name, subscription_package, status FROM tenants;
