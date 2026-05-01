/**
 * Domain Module — barrel export
 *
 * Plugin Architecture (Phase Plugin-1 ~ Plugin-7) 의 client-side 진입점.
 *
 * 사용:
 *   import { useDomainPlugin } from "@/domain";
 *   import { buildMenuFromPlugin, getDocumentFormTypes } from "@/domain";
 */

// ─── Hooks ───
export { useDomainPlugin, useDomainPluginByKey, useAllDomainPlugins } from "./useDomainPlugin";
export type { UseDomainPluginResult } from "./useDomainPlugin";

// ─── Engines ───
export {
  buildMenuFromPlugin,
  buildFallbackMenu,
  getIcon,
  ICON_MAP,
  COMMON_MENU_GROUPS,
  SUPER_ADMIN_MENU_ITEMS,
} from "./engines/clientMenuEngine";
export type { BuiltMenuItem } from "./engines/clientMenuEngine";

export {
  getDocumentFormTypes,
  getDocumentFormTypesByCategory,
  getPdfTemplate,
  getAllPdfTemplates,
} from "./engines/clientDocumentEngine";
export type {
  BuiltDocumentFormType,
  DocumentCategoryGroup,
} from "./engines/clientDocumentEngine";

export {
  getNotificationTypes,
  getNotificationTypesByCategory,
  getPriorityColor,
  getNotificationTypeLabel,
} from "./engines/clientNotificationEngine";
export type { NotificationCategory } from "./engines/clientNotificationEngine";

export {
  getApprovalEntityTypes,
  getApprovalEntityTypesByCategory,
  getApprovalWorkflow,
  getEntityTypeLabel,
  canPerformStep,
} from "./engines/clientApprovalEngine";
export type { ApprovalCategory } from "./engines/clientApprovalEngine";

export {
  getDashboardWidgets,
  getWidgetGridClass,
} from "./engines/clientDashboardEngine";

export {
  getMaterialCategories,
  getProductCategories,
  getSupplierCategories,
  getLabel,
  getLabels,
} from "./engines/clientMasterDataEngine";
