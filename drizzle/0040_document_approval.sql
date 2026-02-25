-- ============================================================================
-- 자동 문서 생성 및 승인 관리 시스템 스키마
-- ============================================================================

-- 1. 문서 타입 정의 테이블
CREATE TABLE document_types (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE COMMENT '문서 타입 코드 (production_log, ccp_log, visual_inspection_log, training_log, hygiene_log, prerequisite_log 등)',
  name VARCHAR(200) NOT NULL COMMENT '문서 타입 이름',
  category ENUM('production', 'ccp', 'inspection', 'training', 'hygiene', 'prerequisite', 'other') NOT NULL COMMENT '문서 카테고리',
  description TEXT COMMENT '문서 설명',
  template_path VARCHAR(500) COMMENT 'PDF 템플릿 경로',
  is_active TINYINT DEFAULT 1 NOT NULL COMMENT '활성화 여부',
  auto_generate_on_batch TINYINT DEFAULT 0 NOT NULL COMMENT '배치 생성 시 자동 생성 여부',
  requires_approval TINYINT DEFAULT 1 NOT NULL COMMENT '승인 필요 여부',
  approval_levels INT DEFAULT 3 NOT NULL COMMENT '승인 단계 수 (1: 작성자만, 2: 작성자+검토자, 3: 작성자+검토자+승인자)',
  created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) NOT NULL,
  updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) NOT NULL,
  INDEX idx_document_type_code (code),
  INDEX idx_document_type_category (category),
  INDEX idx_document_type_auto_generate (auto_generate_on_batch)
) COMMENT '문서 타입 정의';

-- 2. 문서 인스턴스 테이블 (생성된 실제 문서)
CREATE TABLE document_instances (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  site_id BIGINT NOT NULL COMMENT '사이트 ID',
  document_type_id BIGINT NOT NULL COMMENT '문서 타입 ID',
  batch_id BIGINT COMMENT '배치 ID (배치 관련 문서인 경우)',
  product_id BIGINT COMMENT '제품 ID',
  work_date DATE NOT NULL COMMENT '작업 날짜',
  
  -- 문서 상태
  status ENUM('draft', 'pending_review', 'pending_approval', 'approved', 'rejected', 'cancelled') DEFAULT 'draft' NOT NULL COMMENT '문서 상태',
  
  -- 작성 정보
  created_by BIGINT NOT NULL COMMENT '작성자 ID',
  created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) NOT NULL,
  
  -- 검토 정보
  reviewer_id BIGINT COMMENT '검토자 ID',
  reviewed_at TIMESTAMP(3) COMMENT '검토 일시',
  review_comments TEXT COMMENT '검토 의견',
  
  -- 승인 정보
  approver_id BIGINT COMMENT '승인자 ID',
  approved_at TIMESTAMP(3) COMMENT '승인 일시',
  approval_comments TEXT COMMENT '승인 의견',
  
  -- 반려 정보
  rejected_by BIGINT COMMENT '반려자 ID',
  rejected_at TIMESTAMP(3) COMMENT '반려 일시',
  rejection_reason TEXT COMMENT '반려 사유',
  
  -- 자동 생성 정보
  is_auto_generated TINYINT DEFAULT 0 NOT NULL COMMENT '자동 생성 여부',
  auto_approval_enabled TINYINT DEFAULT 0 NOT NULL COMMENT '자동 승인 활성화 여부',
  
  -- 문서 데이터 (JSON)
  document_data JSON COMMENT '문서 실제 데이터',
  
  -- PDF 생성 정보
  pdf_url VARCHAR(500) COMMENT '생성된 PDF URL',
  pdf_generated_at TIMESTAMP(3) COMMENT 'PDF 생성 일시',
  
  updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) NOT NULL,
  
  INDEX idx_document_instance_site (site_id),
  INDEX idx_document_instance_type (document_type_id),
  INDEX idx_document_instance_batch (batch_id),
  INDEX idx_document_instance_work_date (work_date),
  INDEX idx_document_instance_status (status),
  INDEX idx_document_instance_created_by (created_by),
  INDEX idx_document_instance_auto_generated (is_auto_generated),
  FOREIGN KEY (document_type_id) REFERENCES document_types(id) ON DELETE RESTRICT
) COMMENT '문서 인스턴스 (생성된 실제 문서)';

-- 3. 승인 워크플로우 이력 테이블
CREATE TABLE document_approval_history (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  document_instance_id BIGINT NOT NULL COMMENT '문서 인스턴스 ID',
  action ENUM('created', 'submitted_for_review', 'reviewed', 'submitted_for_approval', 'approved', 'rejected', 'cancelled') NOT NULL COMMENT '액션',
  actor_id BIGINT NOT NULL COMMENT '액션 수행자 ID',
  actor_role ENUM('creator', 'reviewer', 'approver', 'admin') NOT NULL COMMENT '액션 수행자 역할',
  comments TEXT COMMENT '의견',
  previous_status VARCHAR(50) COMMENT '이전 상태',
  new_status VARCHAR(50) COMMENT '새 상태',
  created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) NOT NULL,
  
  INDEX idx_approval_history_document (document_instance_id),
  INDEX idx_approval_history_actor (actor_id),
  INDEX idx_approval_history_action (action),
  FOREIGN KEY (document_instance_id) REFERENCES document_instances(id) ON DELETE CASCADE
) COMMENT '승인 워크플로우 이력';

-- 4. 일괄 출력 그룹 테이블
CREATE TABLE document_batch_print_groups (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  site_id BIGINT NOT NULL COMMENT '사이트 ID',
  work_date DATE NOT NULL COMMENT '작업 날짜',
  group_name VARCHAR(200) NOT NULL COMMENT '그룹 이름 (예: 2026-02-04 일일 문서)',
  description TEXT COMMENT '설명',
  
  -- 출력 정보
  total_documents INT DEFAULT 0 NOT NULL COMMENT '총 문서 수',
  printed_by BIGINT COMMENT '출력 요청자 ID',
  printed_at TIMESTAMP(3) COMMENT '출력 일시',
  
  -- PDF 생성 정보
  combined_pdf_url VARCHAR(500) COMMENT '통합 PDF URL',
  pdf_generated_at TIMESTAMP(3) COMMENT 'PDF 생성 일시',
  
  created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) NOT NULL,
  updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) NOT NULL,
  
  INDEX idx_batch_print_site (site_id),
  INDEX idx_batch_print_work_date (work_date),
  INDEX idx_batch_print_printed_by (printed_by)
) COMMENT '일괄 출력 그룹';

-- 5. 일괄 출력 그룹 문서 매핑 테이블
CREATE TABLE document_batch_print_items (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  batch_print_group_id BIGINT NOT NULL COMMENT '일괄 출력 그룹 ID',
  document_instance_id BIGINT NOT NULL COMMENT '문서 인스턴스 ID',
  sort_order INT DEFAULT 0 NOT NULL COMMENT '정렬 순서',
  
  created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) NOT NULL,
  
  INDEX idx_batch_print_item_group (batch_print_group_id),
  INDEX idx_batch_print_item_document (document_instance_id),
  FOREIGN KEY (batch_print_group_id) REFERENCES document_batch_print_groups(id) ON DELETE CASCADE,
  FOREIGN KEY (document_instance_id) REFERENCES document_instances(id) ON DELETE CASCADE
) COMMENT '일괄 출력 그룹 문서 매핑';

-- 6. 자동 승인 설정 테이블
CREATE TABLE document_auto_approval_settings (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  site_id BIGINT NOT NULL COMMENT '사이트 ID',
  document_type_id BIGINT NOT NULL COMMENT '문서 타입 ID',
  
  -- 자동 승인 설정
  auto_approval_enabled TINYINT DEFAULT 0 NOT NULL COMMENT '자동 승인 활성화 여부',
  auto_approval_delay_minutes INT DEFAULT 0 COMMENT '자동 승인 지연 시간 (분, 0이면 즉시)',
  
  -- 조건 설정 (JSON)
  conditions JSON COMMENT '자동 승인 조건 (예: 특정 제품, 특정 배치 타입 등)',
  
  -- 승인자 설정
  default_reviewer_id BIGINT COMMENT '기본 검토자 ID',
  default_approver_id BIGINT COMMENT '기본 승인자 ID',
  
  created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) NOT NULL,
  updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) NOT NULL,
  
  INDEX idx_auto_approval_site (site_id),
  INDEX idx_auto_approval_document_type (document_type_id),
  UNIQUE KEY uk_auto_approval_site_type (site_id, document_type_id),
  FOREIGN KEY (document_type_id) REFERENCES document_types(id) ON DELETE CASCADE
) COMMENT '자동 승인 설정';

-- ============================================================================
-- 초기 데이터: 문서 타입
-- ============================================================================

INSERT INTO document_types (code, name, category, description, auto_generate_on_batch, requires_approval, approval_levels) VALUES
('production_log', '생산일지', 'production', '배치별 생산 기록', 1, 1, 3),
('ccp_log', 'CCP 일지', 'ccp', 'CCP 모니터링 기록', 1, 1, 3),
('visual_inspection_log', '육안검사 일지', 'inspection', '제품 육안 검사 기록', 1, 1, 3),
('training_log', '교육훈련 일지', 'training', '직원 교육 훈련 기록', 0, 1, 3),
('hygiene_log', '위생관리 일지', 'hygiene', '위생 점검 및 관리 기록', 1, 1, 3),
('prerequisite_log', '선행관리 일지', 'prerequisite', '선행 요구사항 관리 기록', 1, 1, 3),
('equipment_cleaning_log', '설비 세척 일지', 'hygiene', '설비 세척 및 소독 기록', 1, 1, 3),
('water_quality_log', '수질 검사 일지', 'prerequisite', '용수 수질 검사 기록', 1, 1, 3),
('personal_hygiene_log', '개인위생 점검 일지', 'hygiene', '작업자 개인위생 점검 기록', 1, 1, 3),
('foreign_material_log', '이물 관리 일지', 'inspection', '이물 발견 및 조치 기록', 1, 1, 3);

-- ============================================================================
-- 뷰: 승인 대기 문서 목록
-- ============================================================================

CREATE OR REPLACE VIEW v_pending_approval_documents AS
SELECT 
  di.id,
  di.site_id,
  dt.code AS document_type_code,
  dt.name AS document_type_name,
  dt.category AS document_category,
  di.batch_id,
  di.product_id,
  di.work_date,
  di.status,
  di.created_by,
  di.created_at,
  di.reviewer_id,
  di.reviewed_at,
  di.approver_id,
  di.is_auto_generated,
  di.auto_approval_enabled,
  CASE 
    WHEN di.status = 'pending_review' THEN di.reviewer_id
    WHEN di.status = 'pending_approval' THEN di.approver_id
    ELSE NULL
  END AS pending_user_id
FROM document_instances di
JOIN document_types dt ON di.document_type_id = dt.id
WHERE di.status IN ('pending_review', 'pending_approval');

-- ============================================================================
-- 뷰: 일일 문서 출력 대상 목록
-- ============================================================================

CREATE OR REPLACE VIEW v_daily_approved_documents AS
SELECT 
  di.id,
  di.site_id,
  dt.code AS document_type_code,
  dt.name AS document_type_name,
  dt.category AS document_category,
  di.batch_id,
  di.product_id,
  di.work_date,
  di.status,
  di.approved_at,
  di.pdf_url,
  di.pdf_generated_at
FROM document_instances di
JOIN document_types dt ON di.document_type_id = dt.id
WHERE di.status = 'approved'
ORDER BY di.work_date DESC, dt.category, di.id;
