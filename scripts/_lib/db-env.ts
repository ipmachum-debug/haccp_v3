// 자동 dotenv 로드 — child migration 스크립트가 "set -a && source .env" 없이 standalone 실행 가능.
// 이미 process.env 에 값이 있으면 dotenv 는 override 하지 않으므로 안전 (no-op).
// 도입: 2026-05-01 (Y-2 deploy safety tools — db-env Plan C 강화)
import "dotenv/config";

/**
 * scripts/_lib/db-env.ts — child migration 스크립트 공통 DB 환경 helper
 *
 * 목적
 *   각 child migration 스크립트(migrate-iot-ccp-bridge.ts, migrate-car-unique-index.ts,
 *   migrate-change-control-table.ts, migrate-cosmetic-*.ts 등)가 공통으로 사용할
 *   DB 연결 설정 helper. DATABASE_URL 단독 환경에서도 standalone 실행 가능하도록 한다.
 *
 * 배경
 *   - 운영 .env 는 `DATABASE_URL=mysql://...` 형식만 정의 (DB_HOST, DB_USER 등 미정의)
 *   - 기존 child script 는 process.env.DB_HOST/USER/PASSWORD/NAME/PORT 만 참조 →
 *     standalone 실행 시 fallback default(haccp_user/haccp_password/haccp_v3)로
 *     ER_ACCESS_DENIED_ERROR 발생.
 *   - PR #171 에서 runner(migrate-cosmetic-all.ts)는 DATABASE_URL 자동 파싱 추가.
 *     본 helper 는 동일 로직을 child script 도 직접 사용할 수 있도록 분리.
 *
 * 사용법
 *   import mysql from "mysql2/promise";
 *   import { getDbConfig } from "./_lib/db-env";
 *
 *   const conn = await mysql.createConnection(getDbConfig());
 *
 * 우선순위 (높음 → 낮음)
 *   1. process.env.DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME (개별 env 우선)
 *   2. process.env.DATABASE_URL 파싱 결과
 *   3. fallback default (legacy 호환: haccp_user / haccp_password / haccp_v3)
 *
 * 비고
 *   - mysql:// 외 dialect 는 fallback 적용 (URL 만 무시)
 *   - DATABASE_URL 의 password 는 decodeURIComponent 처리 (특수문자 안전)
 *   - charset 등 query string 옵션은 무시 (mysql2 createConnection 의 추가 옵션은
 *     호출자가 spread 로 추가)
 */

export interface DbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

/**
 * DATABASE_URL 만 파싱하여 DbConfig 부분 객체를 반환.
 * URL 이 없거나 파싱 실패 시 빈 객체 반환 (caller 가 fallback 처리).
 */
export function parseDatabaseUrl(
  databaseUrl: string | undefined,
): Partial<DbConfig> {
  if (!databaseUrl) return {};
  const trimmed = databaseUrl.trim();
  if (!trimmed) return {};

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    console.warn(
      `[db-env] DATABASE_URL 파싱 실패 (형식 확인 필요): ${trimmed.replace(/:[^:@]*@/, ":***@")}`,
    );
    return {};
  }

  const out: Partial<DbConfig> = {};

  if (parsed.hostname) out.host = parsed.hostname;
  if (parsed.port) out.port = Number(parsed.port);
  if (parsed.username) out.user = decodeURIComponent(parsed.username);
  if (parsed.password) out.password = decodeURIComponent(parsed.password);
  if (parsed.pathname) {
    const dbName = parsed.pathname.replace(/^\//, "").split("?")[0];
    if (dbName) out.database = dbName;
  }

  return out;
}

/**
 * 최종 DB 연결 설정을 반환.
 *
 * 우선순위: 개별 DB_* env > DATABASE_URL 파싱 > fallback default.
 *
 * @param env - process.env 등 환경변수 객체 (테스트 시 주입 가능). 기본값 process.env.
 * @returns mysql2.createConnection 에 그대로 전달 가능한 DbConfig
 */
export function getDbConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): DbConfig {
  const fromUrl = parseDatabaseUrl(env.DATABASE_URL);

  return {
    host: env.DB_HOST || fromUrl.host || "localhost",
    port: env.DB_PORT ? Number(env.DB_PORT) : (fromUrl.port ?? 3306),
    user: env.DB_USER || fromUrl.user || "haccp_user",
    password:
      env.DB_PASSWORD !== undefined
        ? env.DB_PASSWORD
        : (fromUrl.password ?? "haccp_password"),
    database: env.DB_NAME || fromUrl.database || "haccp_v3",
  };
}

/**
 * 별칭 (alias) — 일부 호출자는 `getDbConfig` 이름을 선호.
 * 새 코드는 가능한 `getDbConfigFromEnv` (인자 명확) 를 사용 권장.
 */
export const getDbConfig = getDbConfigFromEnv;
