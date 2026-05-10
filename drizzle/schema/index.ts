/**
 * 모든 스키마 export (단일 진실)
 */

// 기존 스키마 파일에서 모든 export 가져오기
export * from "./schema_main";
// B2C 플랫폼 정산 모듈 (Phase 2, 2026-04-22)
export * from "./b2cPlatform";
// auth.ts에서 hUserWidgetSettings만 export (나머지는 schema_main에 있음)
export { hUserWidgetSettings } from "./auth";
export * from "./part2";
export * from "./audit";
export * from "./checklist";
export * from "./checklistTemplateVersion";
export * from "./inspection";
export * from "./lotTraceHistory";
export * from "./haccp7principles";
export * from "./backup";
export * from "./scheduler";
export * from "./equipment";
export * from "./recipe";
export * from "./schema_recipe_new";
export * from "./employee";
export * from "./checklistSchedule";
export * from "./calibration";
export * from "./hygiene";
export * from "./pestControl";
export * from "./organization";
export * from "./companies";
export * from "./schema_accounting_extended";
export * from "./schema_accounting_items";
export * from "./schema_purchase_orders";
export * from "./schema_partner_prices";
export * from "./schema_quotations";
export * from "./schema_tax_invoices";
export * from "./accountingMonthlyReport";
export * from "./schema_categories";
export * from "./accountingAccounts";
export * from "./accountCategories";
export * from "./verification";
export * from "./nonconformingProduct";
export * from "./recall";
export * from "./materialLedger";
export * from "./schema_dual_unit";
export * from "./communicationLog";
export * from "./communicationLogExtensions";
export * from "./communicationLogBoard";
// Partner CRM (Phase 1, 2026-05-05)
export * from "./partnerCrm";
// PR #265 — approval attachments (writer review 사진 업로드)
export * from "./approvalAttachments";
export * from "./ccpMonitoring";
export * from "./expense";
export * from "./support";
export * from "./industryCode";
export * from "./domainEvents";
export * from "./capabilities";
// PR #280 — SKU 번들 (혼합 제품: 다중 생산 → 1 SKU 출고)
export * from "./skuBundles";
// PR #283 — 번들 LOT 매핑 (parent LOT ↔ child LOT N:1, 회수 시뮬레이션)
export * from "./bundleLots";
