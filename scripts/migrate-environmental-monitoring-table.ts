/**
 * 마이그레이션: h_environmental_monitoring 테이블 — 환경 모니터링 EMP (Phase Y-12)
 *
 * FSSC 22000 / Codex — Zone 기반 병원균/지표균/ATP 모니터링.
 * 실행: npx tsx scripts/migrate-environmental-monitoring-table.ts
 * 안전: 테이블/인덱스 존재 확인 후에만 생성 (재실행 안전).
 */
import mysql from "mysql2/promise";
import { getDbConfigFromEnv } from "./_lib/db-env.js";

async function migrate() {
  const conn = await mysql.createConnection(getDbConfigFromEnv(process.env));
  console.log("=== 마이그레이션 시작: h_environmental_monitoring (EMP / Phase Y-12) ===\n");

  const [tRows]: any = await conn.execute(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h_environmental_monitoring'`,
  );
  const exists = (tRows as any[]).length > 0;

  if (exists) {
    console.log("✅ h_environmental_monitoring 테이블 이미 존재 — 스킵");
  } else {
    console.log("→ h_environmental_monitoring 테이블 생성 중...");
    await conn.execute(`
      CREATE TABLE h_environmental_monitoring (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        tenant_id INT NOT NULL,

        industry ENUM(
          'food','cosmetic','pharmaceutical',
          'health-functional','medical-device','general-manufacturing'
        ) NOT NULL COMMENT 'Industry view filter (ADR-003 IndustryKey)',

        code VARCHAR(50) NOT NULL COMMENT 'EM-YYYY-NNNN 자동채번',

        sampling_date DATE NOT NULL COMMENT '채취일',
        zone ENUM('zone1','zone2','zone3','zone4') NOT NULL COMMENT '위생구역(1=식품접촉면 ~ 4=처리구역외부)',
        location VARCHAR(255) NOT NULL COMMENT '채취 지점명',
        target ENUM('listeria','salmonella','e_coli','coliform','apc','yeast_mold','atp','other') NOT NULL COMMENT '검사 대상',
        method ENUM('swab','contact_plate','air_settle','water','atp') NOT NULL COMMENT '채취/측정 방법',

        result ENUM('pass','fail','pending') NOT NULL DEFAULT 'pending' COMMENT '판정',
        result_value VARCHAR(255) NULL COMMENT '측정값/판정 상세',
        limit_criteria VARCHAR(255) NULL COMMENT '기준',

        corrective_action TEXT NULL COMMENT '부적합 시 시정조치',
        corrective_action_id INT NULL COMMENT '연계 CAPA id',

        notes TEXT NULL,

        assessed_by INT NULL,
        approved_by INT NULL,
        approved_at TIMESTAMP NULL,
        closed_at TIMESTAMP NULL,

        status ENUM('draft','under_review','approved','archived') NOT NULL DEFAULT 'draft',

        industry_metadata JSON NULL,

        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='Environmental Monitoring (환경 모니터링 EMP FSSC/Codex) — Phase Y-12'
    `);
    console.log("✅ h_environmental_monitoring 테이블 생성 완료");
  }

  const indexes: Array<{ name: string; columns: string; unique?: boolean }> = [
    { name: "uniq_env_monitoring_tenant_code", columns: "tenant_id, code", unique: true },
    { name: "idx_env_monitoring_tenant_industry_status", columns: "tenant_id, industry, status" },
    { name: "idx_env_monitoring_tenant_zone_result", columns: "tenant_id, zone, result" },
    { name: "idx_env_monitoring_tenant_sampling_date", columns: "tenant_id, sampling_date" },
  ];

  for (const idx of indexes) {
    const [existsRows]: any = await conn.execute(
      `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h_environmental_monitoring' AND INDEX_NAME = ?`,
      [idx.name],
    );
    if ((existsRows as any[]).length > 0) {
      console.log(`✅ 인덱스 ${idx.name} 이미 존재 — 스킵`);
      continue;
    }
    const uniqueKw = idx.unique ? "UNIQUE " : "";
    console.log(`→ 인덱스 생성: ${idx.name}`);
    await conn.execute(
      `CREATE ${uniqueKw}INDEX ${idx.name} ON h_environmental_monitoring (${idx.columns})`,
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
