/**
 * 마스터 도메인 라우터 매핑 — _root.ts 분해 (2026-04-19)
 */
import {
  categoriesRouter,
  groupRouter,
  materialRouter,
  partnersRouter,
  supplierRouter,
  supplierEvaluationRouter,
  templateSettingsRouter,
  itemMasterRouter,
  productSkuRouter,
  intermediateRouter,
  skuBundleRouter,
  skuAliasRouter,
} from "../master";

export const masterRouterMap = {
  material: materialRouter,
  supplier: supplierRouter,
  supplierEvaluation: supplierEvaluationRouter,
  partners: partnersRouter,
  categories: categoriesRouter,
  group: groupRouter,
  templateSettings: templateSettingsRouter,
  itemMaster: itemMasterRouter,
  productSku: productSkuRouter,
  intermediate: intermediateRouter,
  // PR #280 — SKU 번들 (혼합 제품)
  skuBundle: skuBundleRouter,
  // PR #298 — SKU 별칭 (Excel 매칭용)
  skuAlias: skuAliasRouter,
} as const;
