-- =====================================================================
-- v3 6-c: banners 테이블 생성 — Drizzle 에는 있는데 운영 DB 에 없던 표 (12 문서 F 그룹)
-- =====================================================================
-- 대시보드 WelcomeBanner 가 로그인마다 banner.getActiveBanners 를 호출하는데 테이블이 없어
-- 조용히 실패 중. 정의는 drizzle/schema/schema_control_plane_ops.ts 의 banners 그대로.
-- 실행 주체: Genspark. 데이터 없음, 즉시 실행 가능.
CREATE TABLE IF NOT EXISTS banners (
  id INT NOT NULL AUTO_INCREMENT,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'event',
  color VARCHAR(50) DEFAULT 'blue',
  icon VARCHAR(50) DEFAULT 'Bell',
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP NOT NULL,
  target_roles JSON NULL,
  tenant_id INT NULL,
  priority INT DEFAULT 0,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY tenant_id_idx (tenant_id),
  KEY active_idx (is_active),
  KEY date_idx (start_date, end_date),
  CONSTRAINT fk_banners_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- 검증: 대시보드 새로고침 후 PM2 로그에 banner.getActiveBanners 에러 0
