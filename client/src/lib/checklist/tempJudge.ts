/**
 * 온습도 판정 — 현재 기준으로 계산 (일지 PR 2, 2026-10-15)
 * 기준 문구: "18 ~ 26°C" (범위), "15°C 이하", "-18°C 이하", "5°C 이상"
 * 값이 비었거나 숫자가 아니거나 기준을 읽을 수 없으면 "" (미확인) — 추측으로 적합을 만들지 않는다.
 */
export type TempJudgment = "적합" | "부적합" | "";

export function judgeTemp(value: string | number | null | undefined, standard: string | null | undefined): TempJudgment {
  if (value == null || String(value).trim() === "") return "";
  const t = Number(String(value).trim());
  if (!Number.isFinite(t)) return "";
  const std = String(standard ?? "");
  const range = std.match(/(-?\d+(?:\.\d+)?)\s*~\s*(-?\d+(?:\.\d+)?)/);
  if (range) return t >= Number(range[1]) && t <= Number(range[2]) ? "적합" : "부적합";
  const below = std.match(/(-?\d+(?:\.\d+)?)\s*°?\s*C?\s*이하/);
  if (below) return t <= Number(below[1]) ? "적합" : "부적합";
  const above = std.match(/(-?\d+(?:\.\d+)?)\s*°?\s*C?\s*이상/);
  if (above) return t >= Number(above[1]) ? "적합" : "부적합";
  return "";
}
