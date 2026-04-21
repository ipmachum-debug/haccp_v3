/**
 * HR 관련 유틸 + 라벨 맵 — HRManagement.tsx 에서 추출 (2026-04-19)
 */

/** Date/string/unknown 을 안전하게 YYYY-MM-DD 로 변환 */
export const safeDate = (v: unknown): string => {
  if (!v) return "-";
  if (typeof v === "string") return v.slice(0, 10);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
};

/** 원화 포맷 */
export const fmt = (n: number) => `₩${n.toLocaleString()}`;

/** 휴가 유형 라벨 + 색상 */
export const leaveTypeLabels: Record<string, { label: string; color: string }> = {
  annual: { label: "연차", color: "bg-blue-100 text-blue-700" },
  sick: { label: "병가", color: "bg-red-100 text-red-700" },
  personal: { label: "경조", color: "bg-purple-100 text-purple-700" },
  maternity: { label: "출산", color: "bg-pink-100 text-pink-700" },
  other: { label: "기타", color: "bg-gray-100 text-gray-700" },
};

/** 휴가 상태 라벨 + 색상 */
export const statusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: "대기", color: "bg-amber-100 text-amber-700" },
  approved: { label: "승인", color: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "반려", color: "bg-red-100 text-red-700" },
};
