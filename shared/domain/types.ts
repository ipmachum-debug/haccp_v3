/**
 * Domain shared types — server / client 공용
 */

/** 산업 키 — Drizzle ENUM + Plugin Registry key */
export type IndustryKey =
  | "food"
  | "cosmetic"
  | "pharmaceutical"
  | "health-functional"
  | "medical-device"
  | "general-manufacturing";

export const INDUSTRY_KEYS: readonly IndustryKey[] = [
  "food",
  "cosmetic",
  "pharmaceutical",
  "health-functional",
  "medical-device",
  "general-manufacturing",
] as const;

/** 산업별 한글 라벨 (UI 표시용 — Plugin labelKo 와 동기) */
export const INDUSTRY_LABELS: Record<IndustryKey, string> = {
  food: "식품 HACCP",
  cosmetic: "화장품 GMP",
  pharmaceutical: "의약품 KGMP",
  "health-functional": "건강기능식품",
  "medical-device": "의료기기 ISO 13485",
  "general-manufacturing": "일반 제조 ISO 9001",
};

/** 서버 IndustryCategory → IndustryKey 매핑 */
export function mapCategoryToIndustryKey(
  category: string | null | undefined,
): IndustryKey | null {
  if (!category) return null;
  const map: Record<string, IndustryKey> = {
    food: "food",
    cosmetics: "cosmetic",
    pharma: "pharmaceutical",
    supplement: "health-functional",
    general: "general-manufacturing",
  };
  return map[category] ?? null;
}
