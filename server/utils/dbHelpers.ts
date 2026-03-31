/**
 * DB 쿼리 결과 타입 헬퍼
 *
 * Drizzle ORM의 db.execute(sql`...`) 반환값을 안전하게 타이핑
 * (result as any)[0] 패턴을 제거하기 위한 유틸리티
 */

/** Raw SQL 실행 결과에서 행 배열 추출 */
export function getRows<T = Record<string, unknown>>(result: unknown): T[] {
  if (!result) return [];
  if (Array.isArray(result)) {
    // mysql2: [rows, fields] 형태
    if (Array.isArray(result[0])) return result[0] as T[];
    return result as T[];
  }
  return [];
}

/** Raw SQL 실행 결과에서 첫 번째 행 추출 (없으면 null) */
export function getFirstRow<T = Record<string, unknown>>(result: unknown): T | null {
  const rows = getRows<T>(result);
  return rows.length > 0 ? rows[0] : null;
}

/** Raw SQL INSERT 결과에서 insertId 추출 */
export function getInsertId(result: unknown): number {
  if (!result) return 0;
  if (Array.isArray(result) && result[0]) {
    return Number((result[0] as Record<string, unknown>).insertId || 0);
  }
  return Number((result as Record<string, unknown>).insertId || 0);
}

/** 숫자 안전 변환 (NaN 방지) */
export function safeNumber(value: unknown, defaultVal: number = 0): number {
  if (value === null || value === undefined) return defaultVal;
  const n = Number(value);
  return isNaN(n) ? defaultVal : n;
}

/** 소수점 안전 변환 */
export function safeFloat(value: unknown, decimals: number = 2): number {
  const n = safeNumber(value);
  return parseFloat(n.toFixed(decimals));
}
