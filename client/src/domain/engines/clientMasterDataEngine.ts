/**
 * Client Master Data Engine — Plugin 기반 마스터 카테고리 / 라벨
 *
 * Phase Plugin-7 (Master Data Engine).
 *
 * 역할:
 *   - Plugin 의 masterCategories (materials / products / suppliers) 노출
 *   - labels 매핑 (batch → 제조번호 vs LOT vs Batch)
 *
 * 사용처:
 *   - 원료/품목 마스터 등록 시 카테고리 dropdown
 *   - 라벨 동적 변환 (BatchList → 제조번호 List vs Batch List vs LOT List)
 */

import type {
  IndustryPlugin,
  CategoryDef,
  LabelKey,
  LabelMap,
} from "@shared/domain/IndustryPlugin";

/**
 * 원료 카테고리 (산업별).
 */
export function getMaterialCategories(plugin: IndustryPlugin | null): CategoryDef[] {
  if (!plugin) return [];
  return [...plugin.masterCategories.materials].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  );
}

/**
 * 제품 카테고리 (산업별).
 */
export function getProductCategories(plugin: IndustryPlugin | null): CategoryDef[] {
  if (!plugin) return [];
  return [...plugin.masterCategories.products].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  );
}

/**
 * 공급업체 카테고리 (산업별).
 */
export function getSupplierCategories(plugin: IndustryPlugin | null): CategoryDef[] {
  if (!plugin?.masterCategories.suppliers) return [];
  return [...plugin.masterCategories.suppliers].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  );
}

/**
 * 라벨 변환 (예: batch → "배치" vs "제조번호" vs "LOT").
 */
export function getLabel(
  plugin: IndustryPlugin | null,
  key: LabelKey,
  fallback?: string,
): string {
  if (!plugin) return fallback ?? key;
  return plugin.labels[key] ?? fallback ?? key;
}

/**
 * 전체 라벨 맵 반환.
 */
export function getLabels(plugin: IndustryPlugin | null): LabelMap | null {
  return plugin?.labels ?? null;
}
