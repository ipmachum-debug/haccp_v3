/**
 * 마이그레이션: 주간 생산계획표 테이블 생성 (PR-PP, 2026-05-28)
 *
 * 생성: h_production_plans
 *   - id PK, tenant_id FK, week_monday DATE
 *   - payload JSON (days 배열)
 *   - author / weekly_notes / updated_by / created_at / updated_at
 *   - UNIQUE (tenant_id, week_monday)
 *
 * 실행: npx tsx scripts/migrate-production-plans.ts
 */
import mysql from "mysql2/promise";

async function migrate() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "haccp_user",
    password: process.env.DB_PASSWORD || "haccp_password",
    database: process.env.DB_NAME || "haccp_v3",
  });

  console.log("=== 마이그레이션 시작: h_production_plans 생성 ===\n");

  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS h_production_plans (
        id INT NOT NULL AUTO_INCREMENT,
        tenant_id INT NOT NULL,
        week_monday DATE NOT NULL,
        payload JSON NOT NULL,
        author VARCHAR(100) DEFAULT '',
        weekly_notes TEXT,
        updated_by INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_tenant_week (tenant_id, week_monday),
        KEY idx_tenant_week (tenant_id, week_monday),
        CONSTRAINT fk_pp_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log("✅ h_production_plans 테이블 생성/확인 완료");
  } catch (e: any) {
    console.error("❌ 실패:", e.message);
    process.exit(1);
  } finally {
    await conn.end();
  }

  console.log("\n=== 완료 ===");
}

migrate().catch((e) => {
  console.error(e);
  process.exit(1);
});
