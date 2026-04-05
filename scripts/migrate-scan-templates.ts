/**
 * 스캔 양식 템플릿 테이블 마이그레이션
 * 실행: npx tsx scripts/migrate-scan-templates.ts
 */
import mysql from "mysql2/promise";

const DB_CONFIG = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "haccp_v3",
};

async function main() {
  const conn = await mysql.createConnection(DB_CONFIG);
  console.log("📦 스캔 양식 템플릿 테이블 생성");

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS h_scan_templates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT NOT NULL,
      checklist_type VARCHAR(50) NOT NULL,
      template_name VARCHAR(100) NOT NULL,
      fields JSON NOT NULL,
      created_by INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_tenant_type (tenant_id, checklist_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log("✅ h_scan_templates 테이블 생성 완료");
  await conn.end();
}

main().catch(console.error);
