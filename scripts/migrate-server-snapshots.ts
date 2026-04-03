/**
 * 서버 모니터링 스냅샷 테이블 마이그레이션
 * 실행: npx tsx scripts/migrate-server-snapshots.ts
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
  console.log("📦 서버 모니터링 스냅샷 테이블 생성");

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS h_server_snapshots (
      id INT AUTO_INCREMENT PRIMARY KEY,
      cpu_usage INT NOT NULL DEFAULT 0,
      memory_percent INT NOT NULL DEFAULT 0,
      disk_percent INT NOT NULL DEFAULT 0,
      mysql_connections INT NOT NULL DEFAULT 0,
      mysql_threads_running INT NOT NULL DEFAULT 0,
      slow_queries INT NOT NULL DEFAULT 0,
      alerts JSON,
      recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_recorded (recorded_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log("✅ h_server_snapshots 테이블 생성 완료");

  // 90일 이상 오래된 스냅샷 자동 삭제 이벤트 (MySQL)
  try {
    await conn.execute(`
      CREATE EVENT IF NOT EXISTS evt_cleanup_server_snapshots
      ON SCHEDULE EVERY 1 DAY
      DO DELETE FROM h_server_snapshots WHERE recorded_at < DATE_SUB(NOW(), INTERVAL 90 DAY)
    `);
    console.log("✅ 90일 자동 삭제 이벤트 생성");
  } catch (e: any) {
    console.log("⚠️ 이벤트 생성 실패 (권한 부족 가능): " + e.message);
  }

  await conn.end();
}

main().catch(console.error);
