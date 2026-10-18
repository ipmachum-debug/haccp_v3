/**
 * HACCP 교육 과정 표시 값 — 화면·PDF 공통 (2026-10-18)
 *   교육 시간(duration)은 분 단위로 저장한다 (스키마 기준, 과정 목록 화면과 같음).
 */
export const TRAINING_CATEGORY_LABELS: Record<string, string> = {
  haccp_basic: "HACCP 기초",
  haccp_advanced: "HACCP 심화",
  hygiene: "위생 관리",
  safety: "안전 관리",
  quality: "품질 관리",
  equipment: "설비 운영",
  regulation: "법규 교육",
  other: "기타",
};

/** 분 → "1시간 30분" */
export function formatTrainingMinutes(min: number | null | undefined): string {
  const m = Number(min);
  if (!Number.isFinite(m) || m <= 0) return "-";
  const h = Math.floor(m / 60), r = Math.round(m % 60);
  return h && r ? `${h}시간 ${r}분` : h ? `${h}시간` : `${r}분`;
}

export const TRAINING_ATTENDANCE_LABELS: Record<string, string> = {
  registered: "등록",
  attended: "출석",
  absent: "결석",
  excused: "사유 결석",
};
