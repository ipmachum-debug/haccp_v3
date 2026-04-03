/**
 * 작업자 레벨 시스템 - 마이그레이션
 * h_training_levels 테이블: 사용자별 점수, 연속일수, 레벨
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
  console.log("📦 작업자 레벨 시스템 마이그레이션\n");

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS h_training_levels (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      tenant_id INT NOT NULL,
      score INT NOT NULL DEFAULT 0,
      streak INT NOT NULL DEFAULT 0,
      max_streak INT NOT NULL DEFAULT 0,
      level INT NOT NULL DEFAULT 1,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_user_tenant (user_id, tenant_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log("✅ h_training_levels 테이블 생성 완료");

  await conn.end();
}

main().catch((e) => { console.error("❌ 에러:", e); process.exit(1); });
