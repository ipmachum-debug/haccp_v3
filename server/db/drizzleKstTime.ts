/**
 * drizzle 의 TIMESTAMP·DATETIME ↔ JS Date 변환을 DB 세션 시간대(+09:00, KST) 와 맞춘다 (2026-10-16, Codex 대시보드 날짜 검토 #2)
 *
 * 사고: 모든 DB 연결은 `SET time_zone = '+09:00'` (connection.ts) 이라 MySQL 은 TIMESTAMP 를 KST 벽시계로 돌려준다.
 *   그런데 drizzle-orm 0.44 의 mysql2 드라이버는 TIMESTAMP·DATETIME 을 문자열로 받아
 *     MySqlTimestamp.mapFromDriverValue = new Date(value + '+0000')   — KST 벽시계를 UTC 로 해석
 *     MySqlDateTime.mapFromDriverValue  = new Date(value + 'Z')        — 〃
 *   로 읽고, 쓸 때는 toISOString() (UTC 벽시계) 를 그대로 넣는다.
 *   → DB 가 기록한 시각(NOW()/DEFAULT, raw SQL) 은 drizzle 로 읽으면 9시간 미래 (감사 이력 18:11 → 화면 10/17 03:11).
 *   → drizzle 로 쓴 JS Date 는 DB 에 9시간 이르게 저장 (2026-10-16 사본 조사: last_login_at·은행 matched_at 등 소수 컬럼).
 *   raw 연결(mysql2 기본, 서버 TZ=Asia/Seoul) 은 이미 KST 로 올바르게 읽는다 — 두 경로가 서로 달랐다.
 * 고정: drizzle 도 세션과 같은 KST 로 해석·기록한다. 한 곳에서, 서버 시작 시 한 번.
 *   - 읽기: 'YYYY-MM-DD HH:MM:SS[.fff]' + '+09:00'
 *   - 쓰기: 같은 순간의 KST 벽시계 문자열
 * DATE(업무일) 와 string 모드 컬럼은 건드리지 않는다. 저장된 값은 바꾸지 않는다 (보정은 별도 승인).
 */
import { MySqlTimestamp, MySqlDateTime } from "drizzle-orm/mysql-core";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** MySQL 이 KST 세션에서 돌려준 'YYYY-MM-DD HH:MM:SS[.ffffff]' → 그 순간의 Date */
export function kstWallToDate(value: string): Date {
  const s = String(value).trim().replace(" ", "T");
  return new Date(`${s}+09:00`);
}

/** Date → KST 세션에 그대로 넣을 'YYYY-MM-DD HH:MM:SS.mmm' (KST 벽시계) */
export function dateToKstWall(value: Date): string {
  return new Date(value.getTime() + KST_OFFSET_MS).toISOString().slice(0, -1).replace("T", " ");
}

let installed = false;

export function installDrizzleKstTime(): void {
  if (installed) return;
  installed = true;
  for (const Cls of [MySqlTimestamp, MySqlDateTime] as any[]) {
    Cls.prototype.mapFromDriverValue = function (value: unknown) {
      return value instanceof Date ? value : kstWallToDate(String(value));
    };
    Cls.prototype.mapToDriverValue = function (value: unknown) {
      return value instanceof Date ? dateToKstWall(value) : value;
    };
  }
}

installDrizzleKstTime();
