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
} as const;
