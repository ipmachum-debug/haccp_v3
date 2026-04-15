/**
 * 원료수불 기간 보고서 (주간/월간) 저장 테이블 마이그레이션
 *
 * 생성 테이블:
 *   1. material_usage_reports - 보고서 헤더 (생성 ↔ 검토 ↔ 승인 ↔ 인쇄)
 *
 * 보고서 본문(JSON) 은 reports_data 컬럼에 그대로 저장 (생성 시점 스냅샷).
 * 승인 후 데이터가 바뀌어도 보고서 인쇄 결과는 변하지 않음.
 *
 * 실행: npx tsx scripts/migrate-material-usage-reports.ts
 */

import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

async function migrate() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "3306"),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "haccp_v3",
    multipleStatements: true,
  });

  console.log("🔗 DB 연결 완료");

  try {
    console.log("📋 material_usage_reports 테이블 생성...");
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS material_usage_reports (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        report_type ENUM('week','month','custom') NOT NULL DEFAULT 'week',
        period_start DATE NOT NULL,
        period_end DATE NOT NULL,
        period_label VARCHAR(200) NOT NULL,
        week_number INT,
        title VARCHAR(255) NOT NULL,
        report_data JSON NOT NULL,
        summary_production_kg DECIMAL(12,3) DEFAULT 0,
        summary_production_kinds INT DEFAULT 0,
        summary_sales_kg DECIMAL(12,3) DEFAULT 0,
        summary_receiving_kg DECIMAL(12,3) DEFAULT 0,
        material_count INT DEFAULT 0,
        batch_count INT DEFAULT 0,
        status ENUM('draft','pending_review','pending_approval','approved','rejected') NOT NULL DEFAULT 'draft',
        approval_request_id BIGINT,
        created_by BIGINT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        reviewed_by BIGINT,
        reviewed_at DATETIME,
        approved_by BIGINT,
        approved_at DATETIME,
        rejected_by BIGINT,
        rejected_at DATETIME,
        rejection_reason TEXT,
        printed_at DATETIME,
        printed_by BIGINT,
        notes TEXT,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_mur_tenant (tenant_id),
        INDEX idx_mur_period (tenant_id, report_type, period_start),
        INDEX idx_mur_status (tenant_id, status),
        UNIQUE KEY uq_mur_period (tenant_id, report_type, period_start, period_end)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("  ✅ material_usage_reports 생성 완료");

    console.log("\n🎉 마이그레이션 완료!");
  } catch (err) {
    console.error("❌ 마이그레이션 실패:", err);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

migrate();
