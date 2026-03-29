-- ============================================================================
-- Migration: users.role enum에 accountant, inspector 역할 추가
-- 실행: mysql -u root -p haccp_db < scripts/migrate-add-roles.sql
-- ============================================================================

-- 기존 enum: 'super_admin','admin','worker','monitor','employee'
-- 변경 enum: 'super_admin','admin','accountant','worker','monitor','inspector','employee'

ALTER TABLE users
MODIFY COLUMN role ENUM('super_admin','admin','accountant','worker','monitor','inspector','employee')
NOT NULL DEFAULT 'worker';

-- 확인
SELECT DISTINCT role, COUNT(*) as cnt FROM users GROUP BY role;
