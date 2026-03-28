import { drizzle } from "drizzle-orm/mysql2";
import mysql, { Pool, PoolConnection } from "mysql2/promise";

let _db: ReturnType<typeof drizzle> | null = null;
let _rawConnection: Pool | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb(): Promise<ReturnType<typeof drizzle>> {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const dbUrl = process.env.DATABASE_URL;
      console.log('[Database] Connecting to:', dbUrl.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')); // 비밀번호 숨김

      const url = new URL(process.env.DATABASE_URL);
      const connection = mysql.createPool({
        host: url.hostname,
        port: parseInt(url.port) || 3306,
        user: url.username,
        password: decodeURIComponent(url.password),
        database: url.pathname.slice(1),
        charset: 'utf8mb4',
        connectionLimit: 10,
        connectTimeout: 30000,
        // acquireTimeout removed (mysql2 deprecation)
        waitForConnections: true,
        queueLimit: 0
      });

      // 각 연결마다 character set + KST 타임존 강제 설정 (mysql2는 다중 statement 미지원 → 분리 실행)
      connection.on('connection', (conn: any) => {
        conn.query('SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci', (err: any) => {
          if (err) console.error('[Database] Failed to set charset:', err);
        });
        conn.query("SET time_zone = '+09:00'", (err: any) => {
          if (err) console.error('[Database] Failed to set timezone:', err);
        });
      });

      _db = drizzle(connection) as any;
      console.log('[Database] Connection established successfully');
    } catch (error) {
      console.error("[Database] Failed to connect:", error);
      throw new Error("DB 연결 실패");
    }
  }
  if (!_db) {
    throw new Error("DB 연결 실패");
  }
  return _db;
}

// Get raw MySQL2 connection for parameterized queries
export async function getRawConnection(): Promise<Pool> {
  if (!_rawConnection && process.env.DATABASE_URL) {
    try {
      const url = new URL(process.env.DATABASE_URL);
      _rawConnection = mysql.createPool({
        host: url.hostname,
        port: parseInt(url.port) || 3306,
        user: url.username,
        password: decodeURIComponent(url.password),
        database: url.pathname.slice(1),
        charset: 'utf8mb4'
      });

      // 각 연결마다 character set + KST 타임존 강제 설정 (mysql2는 다중 statement 미지원 → 분리 실행)
      _rawConnection.on('connection', (conn: any) => {
        conn.query('SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci', (err: any) => {
          if (err) console.error('[Database] Failed to set charset on raw connection:', err);
        });
        conn.query("SET time_zone = '+09:00'", (err: any) => {
          if (err) console.error('[Database] Failed to set timezone on raw connection:', err);
        });
      });

      console.log('[Database] Raw connection pool created');
    } catch (error) {
      console.error("[Database] Failed to create raw connection:", error);
      throw new Error("Raw connection creation failed");
    }
  }
  if (!_rawConnection) {
    throw new Error("Raw connection not initialized");
  }
  return _rawConnection;
}

/**
 * 트랜잭션 래퍼 - 단일 PoolConnection에서 BEGIN/COMMIT/ROLLBACK 보장
 * 회계/재고 POST 등 원자성이 필요한 다중 INSERT/UPDATE에 사용
 */
export async function withTransaction<T>(
  fn: (conn: PoolConnection) => Promise<T>,
  operationName?: string
): Promise<T> {
  const pool = await getRawConnection();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    // 트랜잭션 실패 추적
    try {
      const { trackTransactionFailure } = await import("../utils/operationMonitor");
      trackTransactionFailure(operationName || "unknown", err);
    } catch { /* monitor import 실패 시 무시 */ }
    throw err;
  } finally {
    conn.release();
  }
}
