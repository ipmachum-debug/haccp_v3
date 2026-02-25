/**
 * 체크리스트 카테고리 매핑 유틸리티
 * 템플릿 카테고리와 QualityChecklistMap 카테고리 간 매핑 관리
 */

// 템플릿 카테고리 타입
export type TemplateCategory = "CCP" | "SANITATION" | "QUALITY" | "SAFETY" | "TRAINING" | "MAINTENANCE";

// QualityChecklistMap 카테고리 타입
export type MapCategory = "CCP" | "OP" | "위생" | "시설" | "품질" | "검사";

// 카테고리 매핑 테이블
const CATEGORY_MAPPING: Record<MapCategory, TemplateCategory[]> = {
  "CCP": ["CCP"],
  "OP": ["SANITATION"],
  "위생": ["SANITATION", "QUALITY"],
  "시설": ["MAINTENANCE"],
  "품질": ["QUALITY", "TRAINING"],
  "검사": ["SAFETY"],
};

/**
 * QualityChecklistMap 카테고리에 해당하는 템플릿 카테고리 목록 반환
 */
export function getTemplateCategoriesForMapCategory(mapCategory: MapCategory): TemplateCategory[] {
  return CATEGORY_MAPPING[mapCategory] || [];
}

/**
 * 템플릿 카테고리가 QualityChecklistMap 카테고리에 속하는지 확인
 */
export function isTemplateCategoryInMapCategory(
  templateCategory: TemplateCategory | null | "",
  mapCategory: MapCategory
): boolean {
  if (!templateCategory) return false;
  const allowedCategories = CATEGORY_MAPPING[mapCategory];
  return allowedCategories.includes(templateCategory as TemplateCategory);
}

/**
 * 모든 QualityChecklistMap 카테고리 목록 반환
 */
export function getAllMapCategories(): MapCategory[] {
  return Object.keys(CATEGORY_MAPPING) as MapCategory[];
}
