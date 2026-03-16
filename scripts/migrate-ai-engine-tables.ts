/**
 * AI 엔진 테이블 마이그레이션 스크립트
 *
 * 생성 테이블:
 * 1. ai_rules - 규칙 정의
 * 2. ai_alerts - 알림/경고
 * 3. ai_audit_logs - AI 판단 로그
 * 4. ai_standards - HACCP 기준서
 * 5. ai_batch_summaries - 배치 AI 요약
 *
 * 실행: npx tsx scripts/migrate-ai-engine-tables.ts
 */

import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// .env 파일 로드
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
    // ============================================================
    // 1. ai_rules - 규칙 정의
    // ============================================================
    console.log("📋 1/5 ai_rules 테이블 생성...");
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS ai_rules (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        code VARCHAR(100) NOT NULL,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        rule_type ENUM('threshold', 'missing', 'overdue', 'anomaly', 'recurrence') NOT NULL,
        entity_type ENUM('ccp', 'checklist', 'equipment', 'batch', 'lot', 'inspection', 'hygiene', 'calibration', 'document', 'training') NOT NULL,
        conditions JSON NOT NULL,
        severity ENUM('low', 'medium', 'high', 'critical') NOT NULL DEFAULT 'medium',
        notify_roles JSON,
        is_active TINYINT NOT NULL DEFAULT 1,
        is_system TINYINT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT NOW(),
        updated_at DATETIME NOT NULL DEFAULT NOW(),
        INDEX idx_ai_rules_tenant (tenant_id),
        INDEX idx_ai_rules_code (tenant_id, code),
        INDEX idx_ai_rules_type (rule_type, entity_type),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("  ✅ ai_rules 생성 완료");

    // ============================================================
    // 2. ai_alerts - 알림/경고
    // ============================================================
    console.log("📋 2/5 ai_alerts 테이블 생성...");
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS ai_alerts (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        rule_id BIGINT,
        rule_code VARCHAR(100) NOT NULL,
        title VARCHAR(300) NOT NULL,
        message TEXT NOT NULL,
        severity ENUM('low', 'medium', 'high', 'critical') NOT NULL,
        entity_type VARCHAR(50) NOT NULL,
        entity_id BIGINT,
        entity_code VARCHAR(100),
        context_data JSON,
        status ENUM('active', 'acknowledged', 'resolved', 'dismissed') NOT NULL DEFAULT 'active',
        acknowledged_by INT,
        acknowledged_at DATETIME,
        resolved_by INT,
        resolved_at DATETIME,
        resolved_note TEXT,
        created_at DATETIME NOT NULL DEFAULT NOW(),
        expires_at DATETIME,
        INDEX idx_ai_alerts_tenant (tenant_id),
        INDEX idx_ai_alerts_status (tenant_id, status),
        INDEX idx_ai_alerts_severity (tenant_id, severity),
        INDEX idx_ai_alerts_entity (entity_type, entity_id),
        INDEX idx_ai_alerts_date (tenant_id, created_at),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (rule_id) REFERENCES ai_rules(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("  ✅ ai_alerts 생성 완료");

    // ============================================================
    // 3. ai_audit_logs - AI 판단 로그
    // ============================================================
    console.log("📋 3/5 ai_audit_logs 테이블 생성...");
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS ai_audit_logs (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        action_type ENUM('rule_evaluation', 'summary_generation', 'document_draft', 'checklist_generation', 'inspection_analysis', 'cause_analysis', 'chat_response') NOT NULL,
        input_data JSON,
        reference_data JSON,
        output_data JSON,
        output_text TEXT,
        user_modified TINYINT DEFAULT 0,
        user_modified_data JSON,
        approved_by INT,
        approved_at DATETIME,
        model_used VARCHAR(100),
        tokens_used INT,
        latency_ms INT,
        user_id INT,
        created_at DATETIME NOT NULL DEFAULT NOW(),
        INDEX idx_ai_audit_tenant (tenant_id),
        INDEX idx_ai_audit_action (action_type),
        INDEX idx_ai_audit_date (tenant_id, created_at),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("  ✅ ai_audit_logs 생성 완료");

    // ============================================================
    // 4. ai_standards - HACCP 기준서
    // ============================================================
    console.log("📋 4/5 ai_standards 테이블 생성...");
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS ai_standards (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        name VARCHAR(300) NOT NULL,
        description TEXT,
        standard_type ENUM('haccp_plan', 'prerequisite', 'operational_prp', 'ccp_standard', 'sanitation', 'quality_standard', 'facility_standard', 'training_standard', 'recall_plan', 'custom') NOT NULL,
        content TEXT NOT NULL,
        parsed_items JSON,
        generated_template_id BIGINT,
        status ENUM('uploaded', 'parsed', 'reviewed', 'applied') NOT NULL DEFAULT 'uploaded',
        version VARCHAR(50),
        effective_date DATETIME,
        is_active TINYINT NOT NULL DEFAULT 1,
        created_by INT,
        created_at DATETIME NOT NULL DEFAULT NOW(),
        updated_at DATETIME NOT NULL DEFAULT NOW(),
        INDEX idx_ai_standards_tenant (tenant_id),
        INDEX idx_ai_standards_type (tenant_id, standard_type),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("  ✅ ai_standards 생성 완료");

    // ============================================================
    // 5. ai_batch_summaries - 배치 AI 요약
    // ============================================================
    console.log("📋 5/5 ai_batch_summaries 테이블 생성...");
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS ai_batch_summaries (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        batch_id BIGINT NOT NULL,
        batch_code VARCHAR(100),
        summary_date DATETIME NOT NULL,
        yield_rate INT,
        defect_rate INT,
        ccp_deviation_count INT,
        checklist_missing_count INT,
        inspection_fail_count INT,
        risk_score INT,
        risk_level ENUM('low', 'medium', 'high', 'critical'),
        summary TEXT,
        anomalies JSON,
        recommendations JSON,
        alert_ids JSON,
        created_at DATETIME NOT NULL DEFAULT NOW(),
        updated_at DATETIME NOT NULL DEFAULT NOW(),
        INDEX idx_ai_batch_summary_tenant (tenant_id),
        INDEX idx_ai_batch_summary_batch (batch_id),
        INDEX idx_ai_batch_summary_date (tenant_id, summary_date),
        INDEX idx_ai_batch_summary_risk (tenant_id, risk_level),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("  ✅ ai_batch_summaries 생성 완료");

    console.log("\n🎉 AI 엔진 테이블 마이그레이션 완료!");
    console.log("   - ai_rules: 규칙 정의");
    console.log("   - ai_alerts: 알림/경고");
    console.log("   - ai_audit_logs: AI 판단 로그");
    console.log("   - ai_standards: HACCP 기준서");
    console.log("   - ai_batch_summaries: 배치 AI 요약");

  } catch (error: any) {
    console.error("❌ 마이그레이션 실패:", error.message);
    throw error;
  } finally {
    await connection.end();
    console.log("🔌 DB 연결 종료");
  }
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
