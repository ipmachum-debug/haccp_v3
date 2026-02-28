-- ============================================================
-- CCP 모니터링 기록지 (양식 기반) - 배치 횟수별 기록
-- PDF 양식 3종 재현:
--   CCP-1B: 가열(증숙)공정 - 교반기/증숙기
--   CCP-2B: 가열(굽기)공정
--   CCP-4P: 금속검출공정
-- ============================================================

-- 1. CCP 기록지 헤더 (1일 1제품 1공정 단위)
CREATE TABLE IF NOT EXISTS h_ccp_form_records (
  id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id     INT          NOT NULL,
  site_id       BIGINT       NOT NULL DEFAULT 1,
  batch_id      BIGINT       NULL,                        -- 연결된 배치
  ccp_type      VARCHAR(20)  NOT NULL,                    -- CCP-1B / CCP-2B / CCP-4P
  work_date     DATE         NOT NULL,                    -- 작성일자
  product_id    BIGINT       NULL,
  product_name  VARCHAR(200) NULL,                        -- 품명
  -- 설비 그룹 설정
  equipment_group_mode  VARCHAR(20) NOT NULL DEFAULT 'sequential',  -- sequential(순차) / parallel(동시)
  equipment_interval_min INT NULL,                        -- 설비간 배치 간격(분)
  -- BOM 기반 배치 계산
  bom_batch_kg       DECIMAL(10,2) NULL,                  -- BOM 배치 목표 생산량(kg)
  planned_qty_kg     DECIMAL(10,2) NULL,                  -- 실제 생산 예정량(kg)
  batch_count        INT          NOT NULL DEFAULT 1,     -- 자동계산된 배치 횟수 = ceil(planned/bom)
  -- 한계기준 (CL) - 공정그룹에서 가져옴
  cl_heating_time_min  INT NULL,         -- 가열시간 최소(분)
  cl_heating_time_max  INT NULL,         -- 가열시간 최대(분)
  cl_pressure_mpa_min  DECIMAL(5,3) NULL, -- 압력 최소(MPa)
  cl_temp_min          DECIMAL(5,1) NULL, -- 온도 최소(℃)
  -- 작성/승인
  writer_id     BIGINT NULL,
  approver_id   BIGINT NULL,
  status        ENUM('draft','submitted','approved','rejected') NOT NULL DEFAULT 'draft',
  approval_request_id BIGINT NULL,       -- h_approval_requests 연결
  notes         TEXT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_batch_id (batch_id),
  INDEX idx_tenant_date (tenant_id, work_date),
  INDEX idx_ccp_type (ccp_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. CCP 기록지 배치 회차별 행 (핵심 측정 기록)
CREATE TABLE IF NOT EXISTS h_ccp_form_rows (
  id               BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id        INT          NOT NULL,
  form_record_id   BIGINT       NOT NULL,                 -- h_ccp_form_records.id
  batch_seq        INT          NOT NULL,                 -- 배치 회차 (1, 2, 3...)
  -- 설비 정보 (CCP-1B 시루 개념 포함)
  equipment_id     INT  NULL,
  equipment_name   VARCHAR(100) NULL,                     -- 교반기1호기, 증숙기2호기, 오븐기 등
  equipment_type   VARCHAR(50)  NULL,                     -- 교반기, 증숙기, 오븐, 금속검출기
  -- 공통 입력 필드
  product_name     VARCHAR(200) NULL,                     -- 품명 (행별 다를 수 있음)
  measurement_time VARCHAR(8)   NULL,                     -- 측정시각 HH:MM
  input_qty_kg     DECIMAL(10,3) NULL,                    -- 투입량(kg)
  -- CCP-1B/2B 공통: 가열시간, 온도
  heating_time_min INT          NULL,                     -- 가열시간(분)
  -- CCP-1B 전용: 압력(MPa), 시루번호, 품온(모서리/중심)
  siru_number      INT          NULL,                     -- 시루 번호 (1,2,3단)
  pressure_mpa     DECIMAL(5,3) NULL,                     -- 압력(MPa) - CCP-1B
  temp_edge_c      DECIMAL(5,1) NULL,                     -- 가열후 품온 모서리(℃) - CCP-1B
  temp_center_c    DECIMAL(5,1) NULL,                     -- 가열후 품온 중심부(℃) - CCP-1B
  -- CCP-2B 전용: 가열온도(오븐 패널 온도)
  temp_oven_c      DECIMAL(5,1) NULL,                     -- 가열온도/판넬온도(℃) - CCP-2B
  -- CCP-4P 전용: 금속검출 측정값들
  metal_fe_mid     VARCHAR(5)   NULL,                     -- Fe만 통과(중간) O/X
  metal_sus_mid    VARCHAR(5)   NULL,                     -- SUS만 통과(중간) O/X
  metal_product_only VARCHAR(5) NULL,                     -- 제품만 통과 O/X
  metal_fe_product VARCHAR(5)   NULL,                     -- Fe+제품 통과(제품중앙위) O/X
  metal_sus_product VARCHAR(5)  NULL,                     -- SUS+제품 통과(제품중앙위) O/X
  -- CCP-4P 2번째 섹션: 통과 통계
  pass_time_start  VARCHAR(8)   NULL,                     -- 최초통과시간
  pass_time_end    VARCHAR(8)   NULL,                     -- 통과종료시간
  pass_qty         INT          NULL,                     -- 통과량(개)
  detected_qty     INT          NULL,                     -- 검출량(개)
  special_notes    TEXT         NULL,                     -- 특이사항
  -- 결과
  result           ENUM('적합','부적합') NULL,
  note             TEXT         NULL,                     -- 비고
  -- 개선조치 (한계기준 이탈 시)
  deviation_content TEXT NULL,                            -- 이탈내용
  corrective_action TEXT NULL,                            -- 개선조치 및 결과
  corrective_by    BIGINT NULL,                           -- 조치자
  corrective_confirmed_by BIGINT NULL,                    -- 확인자
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_form_record (form_record_id),
  INDEX idx_batch_seq (form_record_id, batch_seq)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. 설비 배치 간격 설정 (공정그룹별)
CREATE TABLE IF NOT EXISTS ccp_equipment_batch_settings (
  id                   INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id            INT NOT NULL,
  process_group_id     INT NOT NULL,                      -- ccp_process_groups.id
  group_mode           VARCHAR(20) NOT NULL DEFAULT 'sequential', -- sequential / parallel
  interval_between_min INT NOT NULL DEFAULT 0,            -- 설비간 배치 시작 간격(분)
  max_concurrent       INT NOT NULL DEFAULT 1,            -- 동시 최대 사용 설비수
  notes                TEXT NULL,
  created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tenant_group (tenant_id, process_group_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
