/**
 * 마이그레이션: h_calibrations 테이블 — Calibration (Phase Y-4)
 */
import mysql from "mysql2/promise";
import { getDbConfigFromEnv } from "./_lib/db-env.js";

async function migrate() {
  const conn = await mysql.createConnection(getDbConfigFromEnv(process.env));
  console.log("=== 마이그레이션 시작: h_calibrations (Calibration / Phase Y-4) ===\n");

  const [tRows]: any = await conn.execute(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h_calibrations'`,
  );
  const exists = (tRows as any[]).length > 0;

  if (exists) {
    console.log("✅ h_calibrations 테이블 이미 존재 — 스킵");
  } else {
    console.log("→ h_calibrations 테이블 생성 중...");
    await conn.execute(`
      CREATE TABLE h_calibrations (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        tenant_id INT NOT NULL,

        industry ENUM(
          'food','cosmetic','pharmaceutical',
          'health-functional','medical-device','general-manufacturing'
        ) NOT NULL COMMENT 'Industry view filter (ADR-003 IndustryKey)',

        code VARCHAR(50) NOT NULL COMMENT 'CAL-YYYY-NNNN 자동채번',
        type ENUM('iq','oq','pq','routine') NOT NULL,

        equipment_name VARCHAR(255) NOT NULL,
        equipment_serial VARCHAR(100) NOT NULL,

        vendor VARCHAR(255) NOT NULL,
        vendor_type ENUM('internal','external') NOT NULL,

        scheduled_date DATE NOT NULL,
        actual_date DATE NULL,

        interval_months INT NOT NULL DEFAULT 12,
        next_due_date DATE NULL COMMENT 'actual_date + interval_months 자동 계산',

        measurements JSON NOT NULL COMMENT 'CalibrationMeasurement[]',

        outcome ENUM('pass','conditional_pass','fail','pending')
          NOT NULL DEFAULT 'pending',

        certificate_url VARCHAR(500) NULL,
        conclusion TEXT NULL,

        approved_by INT NULL,
        approved_at TIMESTAMP NULL,
        closed_at TIMESTAMP NULL,

        status ENUM(
          'planned','scheduled','in_progress','completed','archived','cancelled'
        ) NOT NULL DEFAULT 'planned',

        industry_metadata JSON NULL,

        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='Calibration (검교정/설비 자격) — IQ/OQ/PQ/routine (Phase Y-4)'
    `);
    console.log("✅ h_calibrations 테이블 생성 완료");
  }

  const indexes: Array<{ name: string; columns: string; unique?: boolean }> = [
    { name: "uniq_calibration_tenant_code", columns: "tenant_id, code", unique: true },
    { name: "idx_calibration_tenant_industry_status", columns: "tenant_id, industry, status" },
    { name: "idx_calibration_tenant_next_due_date", columns: "tenant_id, next_due_date" },
    { name: "idx_calibration_tenant_equipment", columns: "tenant_id, equipment_serial, status" },
    { name: "idx_calibration_tenant_type_outcome", columns: "tenant_id, type, outcome" },
  ];

  for (const idx of indexes) {
    const [existsRows]: any = await conn.execute(
      `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h_calibrations' AND INDEX_NAME = ?`,
      [idx.name],
    );
    if ((existsRows as any[]).length > 0) {
      console.log(`✅ 인덱스 ${idx.name} 이미 존재 — 스킵`);
      continue;
    }
    const uniqueKw = idx.unique ? "UNIQUE " : "";
    console.log(`→ 인덱스 생성: ${idx.name}`);
    await conn.execute(
      `CREATE ${uniqueKw}INDEX ${idx.name} ON h_calibrations (${idx.columns})`,
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
