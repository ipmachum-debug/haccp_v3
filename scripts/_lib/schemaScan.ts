/**
 * 스키마 조사용 순수 유틸 (Issue #421 / #431)
 * ==============================================================================
 * ★ 2026-08-21 — 코드 참조 집계(countColumnReferences)를 제거했다.
 *
 *   그 기능은 "이 컬럼을 쓰는 코드가 있는가" 를 컬럼명 grep 으로 근사했는데,
 *   drizzle 은 **속성명과 컬럼명이 다를 수 있다**는 축을 놓쳤다.
 *     속성 memo → 컬럼 notes,  속성 transactionDate → 컬럼 tx_date
 *   그래서 정상 코드를 "없는 컬럼을 55회 참조" 로 잘못 읽었다 (#431).
 *
 *   근본 원인은 기준을 낡은 스냅샷으로 잡은 것이었다. 기준을 현행 스키마 파일로
 *   바꾸면(scripts/_lib/currentSchema.ts) 대조 결과가 전부 실제 결함이므로
 *   우선순위를 매길 보조 지표 자체가 필요 없다. 그래서 되살리지 않았다.
 * ==============================================================================
 */

/**
 * 수동 백업 테이블 판별.
 * 스키마의 일부가 아니라 운영 중 떠둔 사본이므로 baseline 에서 제외한다.
 * (넣어두면 신규 환경이 남의 백업까지 만들게 된다.)
 *
 * 판별 기준은 "타임스탬프가 붙었는가" 다. 운영 중 뜨는 사본은 날짜를 달고,
 * 정상 테이블은 달지 않는다. 이름에 backup 이 들어간다는 것만으로는 부족하다 —
 * h_backups / h_backup_logs 는 백업 관리 기능의 정식 테이블이다.
 *
 * 매칭:  _backup_x  _bak_x  x_backup  x_bak  x_backup_20260419  x_20260422
 *        backup_purchases_154_20260630_100739   (2026-08-21 추가: 선행 _ 없는 형태)
 *        backup_h_inventory_20260630_095410_v5apply
 * 비매칭: backup_policies  h_backups  h_backup_logs  bank_accounts
 */
export const BACKUP_TABLE_RE =
  /^_(backup|bak)_|^(backup|bak)_.*_\d{8}|_(backup|bak)(_\d+)?$|_\d{8}(_\d{6})?$/i;

/** snake_case → camelCase */
export function toCamel(snake: string): string {
  return snake.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}
