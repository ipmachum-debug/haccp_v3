/**
 * HACCP 교육 참가자 판정 규칙 (2026-10-18, Codex 교육 점검 EDU-02 후속)
 *
 * 참석 · 평가 합격 · 수료증 은 서로 다른 사실이다 — 하나가 다른 것을 자동으로 만들지 않는다.
 * 순수 함수 — DB 없음.
 */

/** 평가 합격 여부 — 과정 합격 점수가 있으면 그 기준, 없으면 판정하지 않음(null) */
export function decidePassed(score: number, passingScore: unknown): 0 | 1 | null {
  const p = passingScore == null || passingScore === "" ? null : Number(passingScore);
  if (p == null || !Number.isFinite(p)) return null;
  return score >= p ? 1 : 0;
}

/** 수료증 발급 전 막을 이유 (빈 배열이면 발급 가능) */
export function certificateBlockers(p: {
  attendanceStatus: string | null | undefined;
  passed: number | null | undefined;
  certificateIssued: number | null | undefined;
}, course: { hasAssessment?: number | null; passingScore?: unknown } | null | undefined): string[] {
  const out: string[] = [];
  if (Number(p.certificateIssued) === 1) out.push("이미 수료증이 발급됐습니다.");
  if (p.attendanceStatus !== "attended") out.push("출석 처리된 참가자만 수료증을 받을 수 있습니다.");
  const needsPass = Number(course?.hasAssessment) === 1 || (course?.passingScore != null && course.passingScore !== "");
  if (needsPass && Number(p.passed) !== 1) out.push("평가 합격 전입니다 — 평가 점수를 먼저 등록하세요.");
  return out;
}

/** 재교육 기한 = 교육일 + 유효기간(개월). 말일 넘침은 그 달 말일로 */
export function expiryFromTrainingDate(trainingDate: string, validityMonths: number | null | undefined): string | null {
  if (!validityMonths || validityMonths <= 0) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(trainingDate);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]) - 1 + validityMonths, d = Number(m[3]);
  const ty = y + Math.floor(mo / 12), tm = ((mo % 12) + 12) % 12;
  const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return `${ty}-${String(tm + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}
