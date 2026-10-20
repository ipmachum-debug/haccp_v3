/** 공정 그룹 한계기준 입력 점검 (생성·수정 같은 계약, 2026-10-20 신규 회사 시험 P1) */
/**
 * 한계기준 입력 점검 — 빈칸(null)은 '그 방향 기준 없음' 으로 그대로 둔다 (임의 상한·0 으로 채우지 않음).
 * 숫자가 아닌 값과 하한 > 상한만 막는다.
 */
export function limitProblems(input: Record<string, unknown>): string[] {
  const pairs: Array<[string, string, string]> = [
    ['temperatureMin', 'temperatureMax', '온도'], ['timeMin', 'timeMax', '시간'],
    ['pressureMin', 'pressureMax', '압력'], ['phMin', 'phMax', 'pH'],
  ];
  const out: string[] = [];
  for (const [lo, hi, label] of pairs) {
    const a = input[lo], b = input[hi];
    for (const [k, x] of [[lo, a], [hi, b]] as const) {
      if (x != null && !Number.isFinite(Number(x))) out.push(`${label} ${k.endsWith('Min') ? '최소' : '최대'} 값이 숫자가 아닙니다`);
    }
    if (a != null && b != null && Number(a) > Number(b)) out.push(`${label}: 최소(${a})가 최대(${b})보다 큽니다`);
  }
  return out;
}
