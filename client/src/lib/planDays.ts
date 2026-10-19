/**
 * 여러 날 생산 계획 — 날짜·요청 키 규칙 (2026-10-20, #611 추가 검토 P1)
 *
 * 생성은 언제나 '선택한 날짜' 로만 한다 — 날짜가 하나여도 기준일이 아니라 그 날짜, 0개면 만들지 않는다.
 * 요청 키는 날짜마다 `기본키-YYYYMMDD` — 선택한 날짜 수가 바뀌어도 같은 날짜·같은 입력이면 같은 키라서,
 *   일부 날짜만 저장된 뒤 날짜를 줄여 다시 눌러도 이미 만든 날은 다시 만들지 않는다 (서버가 같은 키를 재사용으로 처리).
 */

/** YYYY-MM-DD + n일 (로컬 달력) */
export function addDays(d: string, n: number): string {
  const t = new Date(`${d}T00:00:00`);
  t.setDate(t.getDate() + n);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

/** 기준일부터 days 일 중 뺀 날을 제외한 날짜 (오름차순) */
export function planDates(workDate: string, days: number, offDates: readonly string[]): string[] {
  const n = Math.max(1, Math.floor(days));
  return Array.from({ length: n }, (_, i) => addDays(workDate, i)).filter((d) => !offDates.includes(d));
}

/** 날짜별 요청 키 — 기본키(20자 안팎) + 날짜 8자리. 서버 한도 64자 안에서 날짜가 잘리지 않게 기본키 쪽을 줄인다 */
export function dayRequestKey(base: string, date: string): string {
  const suffix = `-${date.replace(/-/g, "")}`;
  return `${base.slice(0, 64 - suffix.length)}${suffix}`;
}

/** 생성 요청 목록 — 선택한 날짜마다 하나 (0개면 빈 목록 = 생성 안 함) */
export function planCreateRequests(base: string, dates: readonly string[]): Array<{ workDate: string; requestKey: string }> {
  return dates.map((d) => ({ workDate: d, requestKey: dayRequestKey(base, d) }));
}
