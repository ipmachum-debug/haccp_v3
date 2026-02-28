-- =====================================================
-- CCP Monitoring Form Tables (v2)
-- Based on actual CCP standard forms:
--   CCP-2B: 가열(굽기)공정 모니터링일지
--   CCP-1B: 가열(증숙)공정 모니터링일지 (교반기/증숙기)
--   CCP-4P: 금속검출공정 모니터링일지
-- =====================================================

-- ---------------------------------------------------------
-- 1. h_ccp_form_records: CCP 기록지 헤더 (1일 1장)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS `h_ccp_form_records` (
  `id`                   BIGINT         NOT NULL AUTO_INCREMENT,
  `tenant_id`            INT            NOT NULL DEFAULT 1,
  `site_id`              BIGINT         NOT NULL,
  `batch_id`             BIGINT         NOT NULL,           -- 연결된 배치
  `ccp_type`             VARCHAR(20)    NOT NULL,           -- 'CCP-1B','CCP-2B','CCP-4P'
  `work_date`            DATE           NOT NULL,
  `product_id`           BIGINT         NULL,
  `product_name`         VARCHAR(200)   NULL,
  `process_group_id`     INT            NULL,               -- 공정그룹 (교반기/증숙기 등)
  `process_group_name`   VARCHAR(100)   NULL,

  -- 배치 계산 정보
  `bom_batch_kg`         DECIMAL(10,2)  NULL,               -- BOM 배치단위 (kg)
  `planned_qty_kg`       DECIMAL(10,2)  NULL,               -- 당일 계획생산량 (kg)
  `batch_count`          INT            NOT NULL DEFAULT 1, -- 자동계산 배치수

  -- 설비 그룹 설정
  `equip_group_mode`     ENUM('concurrent','sequential') NOT NULL DEFAULT 'sequential',
  `equip_interval_min`   INT            NULL DEFAULT 10,    -- 순차 시 배치 간격(분)

  -- CL 한계기준 (폼에 표시)
  -- CCP-2B (굽기): 가열시간, 가열온도
  `cl_heat_time_min_lo`  INT            NULL,               -- 가열시간 하한 (분)
  `cl_heat_time_min_hi`  INT            NULL,               -- 가열시간 상한 (분)
  `cl_heat_temp_lo`      DECIMAL(5,1)   NULL,               -- 가열온도 하한 (°C)
  -- CCP-1B (증숙): 가열시간, 압력, 품온
  `cl_pressure_mpa_lo`   DECIMAL(5,3)   NULL,               -- 압력 하한 (Mpa)
  `cl_product_temp_lo`   DECIMAL(5,1)   NULL,               -- 품온 하한 (°C)
  -- CCP-4P (금속검출): Fe, SUS 감도
  `cl_metal_sensitivity` INT            NULL DEFAULT 130,   -- 감도 설정값
  `cl_fe_mm`             DECIMAL(4,1)   NULL DEFAULT 2.0,   -- Fe 불검출 기준 (mm)
  `cl_sus_mm`            DECIMAL(4,1)   NULL DEFAULT 3.0,   -- SUS 불검출 기준 (mm)

  -- 승인 정보
  `writer_id`            BIGINT         NULL,
  `approver_id`          BIGINT         NULL,
  `status`               ENUM('draft','submitted','approved','rejected') NOT NULL DEFAULT 'draft',
  `approval_request_id`  BIGINT         NULL,
  `submitted_at`         TIMESTAMP      NULL,
  `approved_at`          TIMESTAMP      NULL,
  `rejected_reason`      TEXT           NULL,

  `created_at`           TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  INDEX `idx_cfr_batch`   (`batch_id`),
  INDEX `idx_cfr_tenant`  (`tenant_id`, `work_date`),
  INDEX `idx_cfr_type`    (`ccp_type`, `work_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------
-- 2. h_ccp_form_rows: CCP 기록지 행 (배치별 측정 데이터)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS `h_ccp_form_rows` (
  `id`                   BIGINT         NOT NULL AUTO_INCREMENT,
  `tenant_id`            INT            NOT NULL DEFAULT 1,
  `form_record_id`       BIGINT         NOT NULL,           -- FK → h_ccp_form_records.id
  `batch_seq`            INT            NOT NULL DEFAULT 1, -- 배치 순번 (1, 2, 3...)
  `equipment_id`         INT            NULL,               -- 설비 ID
  `equipment_name`       VARCHAR(100)   NULL,               -- 설비명 (시루 1호, 오븐 A 등)
  `equipment_type`       VARCHAR(50)    NULL,               -- 설비 유형 (시루, 교반기, 오븐 등)

  -- 공통 필드
  `product_name`         VARCHAR(200)   NULL,               -- 품명
  `measurement_time`     TIME           NULL,               -- 측정시각
  `input_qty_kg`         DECIMAL(10,2)  NULL,               -- 투입량 (kg)
  `result`               ENUM('적합','부적합') NULL,

  -- CCP-2B (가열굽기) 전용 필드
  `heat_time_min`        INT            NULL,               -- 가열시간 (분)
  `heat_temp_c`          DECIMAL(5,1)   NULL,               -- 가열온도/판넬온도 (°C)

  -- CCP-1B (가열증숙) 전용 필드
  `siru_name`            VARCHAR(50)    NULL,               -- 시루명 (예: 시루1, 시루2)
  `pressure_mpa`         DECIMAL(5,3)   NULL,               -- 압력 (Mpa)
  `temp_edge_c`          DECIMAL(5,1)   NULL,               -- 품온 모서리 (°C)
  `temp_center_c`        DECIMAL(5,1)   NULL,               -- 품온 중심부 (°C)

  -- CCP-4P (금속검출) 전용 필드 - 감도 모니터링
  `metal_pass_time`      TIME           NULL,               -- 통과시간
  `metal_fe_mid`         VARCHAR(10)    NULL,               -- Fe만 통과(중간) O/X
  `metal_sus_mid`        VARCHAR(10)    NULL,               -- SUS만 통과(중간) O/X
  `metal_product_only`   VARCHAR(10)    NULL,               -- 제품만 통과 O/X
  `metal_fe_product`     VARCHAR(10)    NULL,               -- Fe+제품 통과(제품중 양위) O/X
  `metal_sus_product`    VARCHAR(10)    NULL,               -- SUS+제품통과(제품중양위) O/X

  -- CCP-4P 통과량 정보 (두 번째 테이블)
  `pass_time_start`      TIME           NULL,               -- 최초통과시간
  `pass_time_end`        TIME           NULL,               -- 통과종료시간
  `pass_qty`             INT            NULL,               -- 통과량(개)
  `detected_qty`         INT            NULL,               -- 검출량(개)
  `special_note`         TEXT           NULL,               -- 특이사항

  -- 이탈/개선조치
  `is_deviation`         TINYINT        NOT NULL DEFAULT 0,
  `deviation_note`       TEXT           NULL,               -- 이탈내용
  `corrective_action`    TEXT           NULL,               -- 개선조치 및 결과
  `action_by`            VARCHAR(100)   NULL,               -- 조치자
  `confirmed_by`         VARCHAR(100)   NULL,               -- 확인

  `note`                 TEXT           NULL,
  `created_at`           TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  INDEX `idx_cfrow_form`   (`form_record_id`),
  INDEX `idx_cfrow_tenant` (`tenant_id`),
  CONSTRAINT `fk_cfrow_form` FOREIGN KEY (`form_record_id`) REFERENCES `h_ccp_form_records`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------
-- 3. h_ccp_equip_batch_settings: 설비 배치 간격 설정
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS `h_ccp_equip_batch_settings` (
  `id`                   INT            NOT NULL AUTO_INCREMENT,
  `tenant_id`            INT            NOT NULL DEFAULT 1,
  `process_group_id`     INT            NOT NULL,           -- 공정그룹 ID
  `group_mode`           ENUM('concurrent','sequential') NOT NULL DEFAULT 'sequential',
  `interval_between_min` INT            NULL DEFAULT 10,    -- 순차 시 설비간 간격(분)
  `max_concurrent`       INT            NULL DEFAULT 1,     -- 동시 최대 배치수
  `notes`                TEXT           NULL,
  `created_at`           TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ebs` (`tenant_id`, `process_group_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
