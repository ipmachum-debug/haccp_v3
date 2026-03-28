/**
 * KST 타임존 유틸리티
 * 서버: UTC, DB: KST(+09:00), 클라이언트: KST
 *
 * Node.js의 new Date()는 UTC 기준이므로, toISOString().split("T")[0]을 사용하면
 * KST 기준으로 날짜가 1일 빠지는 문제가 발생합니다.
 * 이 유틸리티는 항상 KST 기준 날짜/시간을 반환합니다.
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 현재 KST 날짜 문자열 (YYYY-MM-DD) */
export function todayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  return kst.toISOString().split("T")[0];
}

/** 현재 KST 시각 문자열 (HH:MM:SS) */
export function nowKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  return kst.toISOString().split("T")[1].split(".")[0];
}

/** Date → KST 날짜 문자열 (YYYY-MM-DD) */
export function toKSTDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  return kst.toISOString().split("T")[0];
}

/** Date → KST 타임스탬프 (YYYY-MM-DD HH:MM:SS) */
export function toKSTTimestamp(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  return kst.toISOString().replace("T", " ").split(".")[0];
}

/**
 * 안전한 로컬 날짜 포맷 (toISOString 대체)
 * Date 객체의 로컬 연/월/일을 그대로 YYYY-MM-DD로 반환합니다.
 * DB에서 읽어온 Date나 이미 KST 보정된 Date에 적합합니다.
 */
export function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * N일 전/후의 KST 날짜 (YYYY-MM-DD)
 * @param offsetDays 양수 = 미래, 음수 = 과거
 */
export function offsetKSTDate(offsetDays: number): string {
  const now = new Date();
  const target = new Date(now.getTime() + KST_OFFSET_MS + offsetDays * 24 * 60 * 60 * 1000);
  return target.toISOString().split("T")[0];
}
