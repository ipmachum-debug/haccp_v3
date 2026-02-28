-- 클라이언트 승인 프로세스를 위한 Users 테이블 스키마 수정
-- 작성일: 2026-02-03
-- 기존 데이터를 보존하면서 안전하게 수정

-- 1. 회사명 컬럼 추가 (이미 존재하면 무시)
SET @column_exists = (
  SELECT COUNT(*) 
  FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = 'haccp_v3' 
  AND TABLE_NAME = 'users' 
  AND COLUMN_NAME = 'company_name'
);

SET @sql = IF(@column_exists = 0, 
  'ALTER TABLE users ADD COLUMN company_name VARCHAR(255) AFTER user_memo', 
  'SELECT "company_name already exists" AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. 사업자번호 컬럼 추가
SET @column_exists = (
  SELECT COUNT(*) 
  FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = 'haccp_v3' 
  AND TABLE_NAME = 'users' 
  AND COLUMN_NAME = 'business_number'
);

SET @sql = IF(@column_exists = 0, 
  'ALTER TABLE users ADD COLUMN business_number VARCHAR(50) AFTER company_name', 
  'SELECT "business_number already exists" AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. 관리자 메모 컬럼 추가
SET @column_exists = (
  SELECT COUNT(*) 
  FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = 'haccp_v3' 
  AND TABLE_NAME = 'users' 
  AND COLUMN_NAME = 'admin_memo'
);

SET @sql = IF(@column_exists = 0, 
  'ALTER TABLE users ADD COLUMN admin_memo TEXT AFTER business_number', 
  'SELECT "admin_memo already exists" AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 4. user_type ENUM 값 수정 (기존 값 유지하면서 새로운 값 추가)
ALTER TABLE users 
MODIFY COLUMN user_type ENUM(
  'b2b_partner', 
  'general_user', 
  'company_staff', 
  'other',
  'client_admin',
  'employee'
) DEFAULT 'employee';

-- 5. 인덱스 추가 (이미 존재하면 무시 - MySQL 8.0은 IF NOT EXISTS 미지원)
SET @index_exists = (
  SELECT COUNT(*) 
  FROM information_schema.STATISTICS 
  WHERE TABLE_SCHEMA = 'haccp_v3' 
  AND TABLE_NAME = 'users' 
  AND INDEX_NAME = 'idx_user_type'
);

SET @sql = IF(@index_exists = 0, 
  'CREATE INDEX idx_user_type ON users(user_type)', 
  'SELECT "idx_user_type already exists" AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists = (
  SELECT COUNT(*) 
  FROM information_schema.STATISTICS 
  WHERE TABLE_SCHEMA = 'haccp_v3' 
  AND TABLE_NAME = 'users' 
  AND INDEX_NAME = 'idx_approval_status'
);

SET @sql = IF(@index_exists = 0, 
  'CREATE INDEX idx_approval_status ON users(approval_status)', 
  'SELECT "idx_approval_status already exists" AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists = (
  SELECT COUNT(*) 
  FROM information_schema.STATISTICS 
  WHERE TABLE_SCHEMA = 'haccp_v3' 
  AND TABLE_NAME = 'users' 
  AND INDEX_NAME = 'idx_tenant_approval'
);

SET @sql = IF(@index_exists = 0, 
  'CREATE INDEX idx_tenant_approval ON users(tenant_id, approval_status)', 
  'SELECT "idx_tenant_approval already exists" AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 6. 마이그레이션 완료 확인
SELECT 'Users 테이블 스키마 수정 완료' AS message;
