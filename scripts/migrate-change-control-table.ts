/**
 * 마이그레이션: h_change_controls 테이블 추가 — Change Control (변경관리)
 *
 * Phase Y-2-0-a (ADR-003 Industry-First Menu / Phase Y 로드맵).
 * Cross-cutting 도메인 — 모든 industry 공통 단일 테이블 + view filter.
 *
 * 적용:
 *   CREATE TABLE IF NOT EXISTS h_change_controls (...)
 *   + UNIQUE INDEX uniq_change_control_tenant_code (tenant_id, code)
 *   + INDEX idx_change_control_tenant_industry_status (tenant_id, industry, status)
 *   + INDEX idx_change_control_tenant_requested_at (tenant_id, requested_at)
 *   + INDEX idx_change_control_tenant_approved_at (tenant_id, approved_at)
 *
 * 안전:
 *   - idempotent (CREATE TABLE IF NOT EXISTS + 중복 인덱스 감지)
 *   - 기존 데이터 영향 0 (신규 테이블)
 *   - 라우터 미등록 (Y-2-0-b 까지) — 운영 영향 0
 *
 * 실행:
 *   npx tsx scripts/migrate-change-control-table.ts
 */
import mysql from "mysql2/promise";
import { getDbConfigFromEnv } from "./_lib/db-env.js";

async function migrate() {
  const conn = await mysql.createConnection(getDbConfigFromEnv(process.env));

  console.log("=== 마이그레이션 시작: h_change_controls (Change Control / Phase Y-2-0-a) ===\n");

  // 1. 테이블 존재 여부 확인
  const [tRows]: any = await conn.execute(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h_change_controls'`,
  );
  const exists = (tRows as any[]).length > 0;

  if (exists) {
    console.log("✅ h_change_controls 테이블 이미 존재 — 스킵");
  } else {
    console.log("→ h_change_controls 테이블 생성 중...");
    await conn.execute(`
      CREATE TABLE h_change_controls (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        tenant_id INT NOT NULL,

        industry ENUM(
          'food',
          'cosmetic',
          'pharmaceutical',
          'health-functional',
          'medical-device',
          'general-manufacturing'
        ) NOT NULL COMMENT 'Industry view filter (ADR-003 IndustryKey)',

        code VARCHAR(50) NOT NULL COMMENT 'CC-YYYY-NNNN 자동채번',
        title VARCHAR(255) NOT NULL COMMENT '변경 제목',
        description TEXT NOT NULL COMMENT '변경 사유 / 배경',

        change_type ENUM(
          'process','specification','formulation','equipment',
          'supplier','label','document','system','other'
        ) NOT NULL,

        impact ENUM('critical','major','minor') NOT NULL DEFAULT 'minor'
          COMMENT '영향도 (영향평가 후 갱신)',

        status ENUM(
          'draft','submitted','evaluating','approved',
          'implementing','verifying','closed','rejected','cancelled'
        ) NOT NULL DEFAULT 'draft',

        requested_by INT NOT NULL COMMENT '신청자 user_id',
        requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

        approved_by INT NULL COMMENT '승인자 user_id',
        approved_at TIMESTAMP NULL,

        closed_at TIMESTAMP NULL COMMENT '실행 완료일',

        industry_metadata JSON NULL COMMENT 'Industry-specific 확장 필드',

        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='변경관리 — 모든 industry 공통 cross-cutting (Phase Y-2-0-a)'
    `);
    console.log("✅ h_change_controls 테이블 생성 완료");
  }

  // 2. 인덱스 idempotent 추가
  const indexes: Array<{ name: string; columns: string; unique?: boolean }> = [
    {
      name: "uniq_change_control_tenant_code",
      columns: "tenant_id, code",
      unique: true,
    },
    {
      name: "idx_change_control_tenant_industry_status",
      columns: "tenant_id, industry, status",
    },
    {
      name: "idx_change_control_tenant_requested_at",
      columns: "tenant_id, requested_at",
    },
    {
      name: "idx_change_control_tenant_approved_at",
      columns: "tenant_id, approved_at",
    },
  ];

  for (const idx of indexes) {
    const [existsRows]: any = await conn.execute(
      `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'h_change_controls'
         AND INDEX_NAME = ?`,
      [idx.name],
    );
    if ((existsRows as any[]).length > 0) {
      console.log(`✅ 인덱스 ${idx.name} 이미 존재 — 스킵`);
      continue;
    }
    const uniqueKw = idx.unique ? "UNIQUE " : "";
    console.log(`→ 인덱스 생성: ${idx.name}`);
    await conn.execute(
      `CREATE ${uniqueKw}INDEX ${idx.name} ON h_change_controls (${idx.columns})`,
    );
    console.log(`✅ 인덱스 ${idx.name} 생성 완료`);
  }

  console.log("\n=== 마이그레이션 완료 ===");
  await conn.end();
}

migrate().catch((err) => {
  console.error("치명 오류:", err);
  process.exit(1);
});
