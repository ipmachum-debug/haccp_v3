-- Migration: Create tables previously auto-created at runtime in Express routers
-- Date: 2026-03-01
-- Description: Move runtime CREATE TABLE calls to proper migration
--   - custom_period_logs (was in customPeriodLogs.ts)
--   - notifications (was in notifications.ts)
--   - training_logs (was in trainingLogs.ts, originally SQLite)

-- ============================================================================
-- custom_period_logs (특정기간일지)
-- ============================================================================
CREATE TABLE IF NOT EXISTS custom_period_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  start_date DATE NOT NULL COMMENT '시작일자',
  end_date DATE NOT NULL COMMENT '종료일자',
  inspector VARCHAR(100) NOT NULL COMMENT '점검자',
  log_type VARCHAR(50) NOT NULL COMMENT '일지 유형',
  content TEXT COMMENT '점검 내용',
  special_notes TEXT COMMENT '특이사항',
  improvement_action TEXT COMMENT '개선조치 및 결과',
  action_taker VARCHAR(100) COMMENT '조치자',
  confirmation VARCHAR(100) COMMENT '확인',
  status ENUM('작성중', '승인대기', '승인완료') DEFAULT '작성중',
  approved_by VARCHAR(100) COMMENT '승인자',
  approved_at DATETIME COMMENT '승인일시',
  rejected_reason TEXT COMMENT '반려 사유',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tenant_date (tenant_id, start_date, end_date),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='특정기간일지';

-- ============================================================================
-- notifications (알림)
-- ============================================================================
CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  user_id INT COMMENT '수신자 ID',
  title VARCHAR(255) NOT NULL COMMENT '알림 제목',
  message TEXT NOT NULL COMMENT '알림 내용',
  type ENUM('일지작성', '승인요청', '승인완료', '반려', '기타') DEFAULT '기타',
  log_type VARCHAR(50) COMMENT '일지 유형 (daily, weekly, monthly, yearly, custom)',
  log_id INT COMMENT '일지 ID',
  is_read BOOLEAN DEFAULT FALSE COMMENT '읽음 여부',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_tenant_user (tenant_id, user_id),
  INDEX idx_read (is_read),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='알림';

-- ============================================================================
-- training_logs (교육훈련일지) - converted from SQLite to MySQL
-- ============================================================================
CREATE TABLE IF NOT EXISTS training_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  educator VARCHAR(200) NOT NULL,
  location VARCHAR(200) NOT NULL,
  training_date DATE NOT NULL,
  start_time VARCHAR(20) NOT NULL,
  end_time VARCHAR(20) NOT NULL,
  target_audience TEXT NOT NULL,
  category VARCHAR(100) NOT NULL,
  material VARCHAR(200) NOT NULL,
  topic_1 TEXT,
  topic_2 TEXT,
  topic_3 TEXT,
  topic_4 TEXT,
  content_summary TEXT,
  content_result TEXT,
  evidence_photos JSON COMMENT 'JSON array of photo URLs',
  attendees JSON COMMENT 'JSON array of attendee info',
  concentration VARCHAR(50),
  understanding VARCHAR(50),
  application VARCHAR(50),
  improvement_action TEXT,
  status ENUM('작성중', '승인대기', '승인완료') DEFAULT '작성중',
  creator VARCHAR(100),
  reviewer VARCHAR(100),
  approver VARCHAR(100),
  approved_at DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tenant_date (tenant_id, training_date),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='교육훈련일지';
