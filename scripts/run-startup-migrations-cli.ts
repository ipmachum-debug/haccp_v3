/**
 * startupMigrations CLI 러너 (Issue #421 3단계 — CI 전용)
 * ==============================================================================
 * 배경:
 *   이 저장소에서 신규 환경을 세우는 경로는 drizzle 마이그레이션 하나가 아니다.
 *     ① drizzle/*.sql        — drizzle-kit migrate (저널이 깨져 있음, Issue #421)
 *     ② server/db/startupMigrations.ts — 서버 부팅 시 CREATE TABLE IF NOT EXISTS 42개
 *   재현성을 정직하게 측정하려면 ② 도 CI 에서 돌려봐야 한다.
 *
 * ★ 안전장치 — 운영 DB 에서 실수로 도는 것을 막는다
 *   1. ALLOW_STARTUP_MIGRATIONS_CLI=1 환경변수가 없으면 즉시 중단
 *   2. DATABASE_URL 호스트가 localhost/127.0.0.1/::1/mysql 이 아니면 즉시 중단
 *   두 조건을 모두 통과해야 실행된다. (운영은 RUN_STARTUP_MIGRATIONS 로 별도 제어)
 *
 * 사용법 (CI):
 *   ALLOW_STARTUP_MIGRATIONS_CLI=1 DATABASE_URL=mysql://root:pw@127.0.0.1/haccp_ci \
 *     npx tsx scripts/run-startup-migrations-cli.ts
 *
 * 종료 코드:
 *   0 = 실행 완료 (runStartupMigrations 는 내부 오류를 삼키므로 "무사고"를 뜻하지 않는다)
 *   2 = 안전장치에 걸려 실행하지 않음
 * ==============================================================================
 */
import { config } from "dotenv";

config();

function refuse(msg: string): never {
  console.error(`❌ 실행 거부: ${msg}`);
  process.exit(2);
}

async function main() {
  if (process.env.ALLOW_STARTUP_MIGRATIONS_CLI !== "1") {
    refuse("ALLOW_STARTUP_MIGRATIONS_CLI=1 이 아닙니다. 이 스크립트는 CI 전용입니다.");
  }

  const url = process.env.DATABASE_URL;
  if (!url) refuse("DATABASE_URL 이 없습니다.");

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    refuse("DATABASE_URL 형식이 올바르지 않습니다.");
  }
  if (!["localhost", "127.0.0.1", "::1", "mysql"].includes(host)) {
    refuse(`대상 호스트가 로컬이 아닙니다 (${host}). 이 스크립트는 일회용 CI DB 에서만 실행합니다.`);
  }

  console.log(`[CI] startupMigrations 실행 — 대상 ${host}`);
  const { runStartupMigrations } = await import("../server/db/startupMigrations");
  await runStartupMigrations();
  console.log("[CI] startupMigrations 종료");

  // 풀이 열려 있으면 프로세스가 끝나지 않으므로 명시적으로 닫는다.
  try {
    const { getRawConnection } = await import("../server/db/connection");
    const pool: any = await getRawConnection();
    await pool?.end?.();
  } catch {
    // 풀이 없거나 이미 닫혔으면 무시 — 종료를 막지 않는 것이 목적이다.
  }
}

main().catch((e) => {
  console.error("❌ 실패:", e?.message ?? e);
  process.exit(1);
});
