/**
 * 일지 기록일 — 화면 날짜와 저장 날짜를 하나로 (2026-10-15, Codex 일지 전수 점검)
 *
 * 문제: 공통 양식(ChecklistFormLayout)은 화면에 보이지 않는 formDate(= 저장한 날)를 DB form_date 로 저장하고,
 *       사용자가 고르는 날짜(점검일·발생일·검사일…)는 양식 본문(form_data) 안에 따로 저장했다.
 *       → 목록 "작성일"·월별 조회·승인 제목이 실제 점검일과 다를 수 있다 (덤프 10/14: 방충 #91 2/15 ↔ 점검일 2/10).
 * 수정: 양식이 config.dateField 로 자기 날짜 칸을 알려 주면 그 값을 기록일(form_date)로 쓴다.
 *       날짜 칸이 없는 양식은 공통 양식 머리에 "작성일" 칸을 보여 주고 그 값을 쓴다.
 */
const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function isYmd(v: unknown): v is string {
  return typeof v === "string" && YMD.test(v.slice(0, 10)) && !Number.isNaN(new Date(`${v.slice(0, 10)}T00:00:00`).getTime());
}

/** 저장할 기록일 — 양식의 날짜 칸 값(YYYY-MM-DD)이 있으면 그것, 없거나 비었으면 공통 작성일 */
export function resolveRecordDate(data: Record<string, unknown> | null | undefined, dateField: string | undefined, fallback: string): string {
  if (dateField && data) {
    const v = data[dateField];
    if (isYmd(v)) return v.slice(0, 10);
  }
  return fallback;
}

/** 이전 기록으로 미리 채울 때 지울 날짜 칸 — 지난 날짜가 새 기록에 따라오지 않게 */
export const PREFILL_DATE_KEYS = ["formDate", "checkDate", "date", "inspectionDate", "workDate", "reportDate"] as const;

export function stripPrefillDates<T extends Record<string, unknown>>(data: T, dateField?: string): T {
  const out: Record<string, unknown> = { ...data };
  for (const k of PREFILL_DATE_KEYS) delete out[k];
  if (dateField) delete out[dateField];
  return out as T;
}
