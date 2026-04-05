/**
 * Synchronous MySQL2 Pool accessor
 *
 * dailyTraining.ts / serverMonitor.ts 등에서 사용하는
 * `const pool = getPool(); await pool.execute(...)` 패턴을 지원합니다.
 *
 * 내부적으로 connection.ts 의 getRawConnection()과 동일한 연결 파라미터를 사용하되,
 * 동기(sync) 호출이 가능하도록 lazy-init 방식으로 Pool을 생성합니다.
 */
import mysql, { type Pool } from "mysql2/promise";

let _pool: Pool | null = null;

/**
 * 동기적으로 mysql2 Pool 인스턴스를 반환합니다.
 * 최초 호출 시 DATABASE_URL 환경변수에서 풀을 생성합니다.
 */
export function getPool(): Pool {
  if (!_pool) {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error("[pool] DATABASE_URL 환경변수가 설정되지 않았습니다.");
    }
    const url = new URL(dbUrl);
    _pool = mysql.createPool({
      host: url.hostname,
      port: parseInt(url.port) || 3306,
      user: url.username,
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
      charset: "utf8mb4",
      connectionLimit: 10,
      connectTimeout: 30000,
      waitForConnections: true,
      queueLimit: 0,
    });

    // 각 연결마다 charset + KST 타임존 강제 설정
    _pool.on("connection", (conn: any) => {
      conn.query("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci", (err: any) => {
        if (err) console.error("[pool] Failed to set charset:", err);
      });
      conn.query("SET time_zone = '+09:00'", (err: any) => {
        if (err) console.error("[pool] Failed to set timezone:", err);
      });
    });

    console.log("[pool] MySQL connection pool created");
  }
  return _pool;
}
