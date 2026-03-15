/**
 * 공통 유틸리티 함수
 */

/**
 * undefined 값을 가진 키를 제거하여 안전한 부분 업데이트 객체 반환
 * Drizzle .set()에 전달할 때 사용
 */
export function omitUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as Partial<T>;
}
