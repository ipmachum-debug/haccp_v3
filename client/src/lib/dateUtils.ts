/**
 * 클라이언트 사이드 날짜 유틸리티
 *
 * 브라우저의 new Date()는 사용자 로컬 시간대를 사용하지만,
 * toISOString()은 항상 UTC로 변환하므로 KST(+9)에서 자정~오전 8:59 사이에
 * 날짜가 하루 빠지는 문제가 발생합니다.
 *
 * 이 유틸리티는 로컬(브라우저) 시간대 기준으로 날짜를 포맷합니다.
 */

/** Date → 로컬 날짜 문자열 (YYYY-MM-DD) */
export function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 오늘 날짜 (YYYY-MM-DD, 로컬 기준) */
export function todayLocal(): string {
  return formatLocalDate(new Date());
}

/** N일 전/후 날짜 (YYYY-MM-DD, 로컬 기준) */
export function offsetLocalDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return formatLocalDate(d);
}
