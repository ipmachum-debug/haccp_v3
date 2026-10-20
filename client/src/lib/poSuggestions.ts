/**
 * 발주 반복 추천 — 이미 넣은 줄인지 (2026-10-20, 번호 체계 2b · Codex 반복 추천 점검)
 *
 * 추천은 '품목 정체성 + 구매 단위' 로 나뉜다 (같은 원료라도 kg 와 포대는 따로). 그래서 이미 넣었는지도 같은 기준:
 * 같은 품목 번호이고 같은 단위일 때만. 이전엔 품목 번호만 봐서, kg 줄이 있으면 포대 추천을 넣지 못했다.
 * 원료가 연결되지 않은 추천(itemMasterId 없음)은 중복으로 보지 않는다 (숫자·이름으로 같다고 추측하지 않음).
 */
export const normPurchaseUnit = (u: unknown) => String(u ?? "").trim().toLowerCase();

export function isSuggestionInLines(
  lines: ReadonlyArray<{ materialId: number | null; unit: string }>,
  s: { itemMasterId?: number | null; unit?: string | null },
): boolean {
  if (s.itemMasterId == null) return false;
  return lines.some((l) => l.materialId != null && Number(l.materialId) === Number(s.itemMasterId) && normPurchaseUnit(l.unit) === normPurchaseUnit(s.unit || "EA"));
}
