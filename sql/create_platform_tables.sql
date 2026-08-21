-- ============================================================================
-- platform 레이어 테이블 4종 생성 (Issue #431 조사 중 발견)
-- ============================================================================
-- 배경
--   drizzle/schema 는 이 4개를 정의하고 코드가 실제로 쓰는데,
--   저장소 어디에도 이들을 만드는 SQL 이 없었고 운영 DB 에도 없었다.
--   (2026-08-21 확인: information_schema 조회 결과 0행)
--
-- 지금 터지고 있는 것
--   ① 입고 처리
--        purchaseOrder.receive → postPurchase → publishEvent
--        → INSERT INTO domain_events → ER_NO_SUCH_TABLE → 트랜잭션 롤백
--        publishEvent 호출부에 try/catch 가 없어 입고 자체가 실패한다.
--        실측: status='approved' AND posted_at >= '2026-05-11' 인 매입 0건
--              (event-bus 코드가 들어온 날이 2026-05-11)
--
--   ② 재무보고서 — 비관리자 한정
--        financialReports.router 의 requireCapability("ERP_ACCOUNTING","READ")
--        → hasCapability → checkCapability
--        → SELECT id FROM capabilities → ER_NO_SUCH_TABLE → 500
--        checkCapability 에 try/catch 가 없다 (grep 결과 0건).
--        admin / super_admin 은 bypass 되므로 관리자만 쓰는 동안 드러나지 않았다.
--
-- 적용 후 기대 동작
--   ① 입고 처리 정상화
--   ② 비관리자는 500 대신 403 "권한이 없습니다" — fail closed 로 정상화.
--      실제로 접근을 허용하려면 capabilities 행 시드 + role_capabilities 부여가
--      따로 필요하다. 그건 권한 설계 결정이라 이 파일에 넣지 않았다.
--
-- 안전성
--   전부 CREATE TABLE IF NOT EXISTS — 여러 번 실행해도 안전하다.
--   기존 데이터를 건드리지 않는다. DROP / ALTER / DELETE 없음.
--
-- 실행
--   mysql -u <user> -p <db> < sql/create_platform_tables.sql
-- ============================================================================

-- ── ① domain_events — Outbox 패턴 도메인 이벤트 저장소 ──
-- drizzle/schema/domainEvents.ts 와 1:1
CREATE TABLE IF NOT EXISTS `domain_events` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL,
  `event_type` varchar(100) NOT NULL,
  `aggregate_type` varchar(50) NOT NULL,
  `aggregate_id` bigint NOT NULL,
  `payload` json NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_by` bigint DEFAULT NULL,
  `processed_at` timestamp NULL DEFAULT NULL,
  `processing_attempts` int NOT NULL DEFAULT 0,
  `last_error` text,
  PRIMARY KEY (`id`),
  -- worker 가 미처리 행을 훑는 쿼리를 위한 인덱스.
  -- WHERE processed_at IS NULL AND processing_attempts < ? ORDER BY id
  KEY `idx_domain_events_unprocessed` (`processed_at`, `processing_attempts`, `id`),
  KEY `idx_domain_events_tenant` (`tenant_id`, `created_at`),
  KEY `idx_domain_events_aggregate` (`aggregate_type`, `aggregate_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── ② capabilities — 전역 마스터 (feature × action) ──
-- drizzle/schema/capabilities.ts 와 1:1
CREATE TABLE IF NOT EXISTS `capabilities` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(100) NOT NULL,
  `feature_code` varchar(50) NOT NULL,
  `action` varchar(20) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_capabilities_code` (`code`),
  UNIQUE KEY `uniq_capabilities_feature_action` (`feature_code`, `action`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── ③ role_capabilities — 역할에 capability 부여 ──
CREATE TABLE IF NOT EXISTS `role_capabilities` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL,
  `role_id` bigint NOT NULL,
  `capability_id` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_role_capabilities` (`tenant_id`, `role_id`, `capability_id`),
  KEY `idx_role_capabilities_cap` (`capability_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── ④ user_capability_grants — 직접 부여 (역할 우회, 예외용) ──
CREATE TABLE IF NOT EXISTS `user_capability_grants` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL,
  `user_id` bigint NOT NULL,
  `capability_id` int NOT NULL,
  `granted_by` bigint DEFAULT NULL,
  `reason` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_user_capability_grants` (`tenant_id`, `user_id`, `capability_id`),
  KEY `idx_user_capability_grants_user` (`user_id`, `capability_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 확인 ──
SELECT TABLE_NAME, TABLE_ROWS
  FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME IN ('domain_events','capabilities','role_capabilities','user_capability_grants')
 ORDER BY TABLE_NAME;
