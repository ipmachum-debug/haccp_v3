/**
 * Client Approval Engine — Plugin 기반 승인 entity / workflow 카탈로그
 *
 * Phase Plugin-6 (Approval Engine).
 *
 * 역할:
 *   - Plugin 의 approvals.entityTypes / workflows 를 단일 source 로 노출
 *   - 카테고리 별 그룹화 (BMR / Release / Stability / Validation 등)
 *   - 단계별 권한 매핑
 *
 * 사용처:
 *   - ApprovalManagement: 승인 entity 탭 동적 생성
 *   - 승인 페이지: 단계별 가능 액션 결정
 *
 * 마이그레이션:
 *   기존 ApprovalManagement 의 하드코딩된 entity_type
 *   (food_product_report 등) 가 plugin.approvals.entityTypes 로 흡수.
 */

import type {
  IndustryPlugin,
  ApprovalEntityTypeDef,
  ApprovalWorkflowDef,
  ApprovalStep,
} from "@shared/domain/IndustryPlugin";

export interface ApprovalCategory {
  category: string;
  entityTypes: ApprovalEntityTypeDef[];
}

/**
 * Plugin 의 approval entity type 평면 배열.
 */
export function getApprovalEntityTypes(
  plugin: IndustryPlugin | null,
): ApprovalEntityTypeDef[] {
  if (!plugin) return [];
  return [...plugin.approvals.entityTypes];
}

/**
 * 카테고리 별 그룹화 (탭 그룹 용).
 */
export function getApprovalEntityTypesByCategory(
  plugin: IndustryPlugin | null,
): ApprovalCategory[] {
  const types = getApprovalEntityTypes(plugin);
  const map = new Map<string, ApprovalEntityTypeDef[]>();
  for (const t of types) {
    const arr = map.get(t.category) ?? [];
    arr.push(t);
    map.set(t.category, arr);
  }
  return Array.from(map.entries()).map(([category, entityTypes]) => ({
    category,
    entityTypes,
  }));
}

/**
 * Workflow 조회.
 */
export function getApprovalWorkflow(
  plugin: IndustryPlugin | null,
  workflowCode: string,
): ApprovalWorkflowDef | null {
  if (!plugin) return null;
  return plugin.approvals.workflows.find((w) => w.code === workflowCode) ?? null;
}

/**
 * Entity type code → 라벨 변환.
 */
export function getEntityTypeLabel(
  plugin: IndustryPlugin | null,
  code: string,
): string {
  if (!plugin) return code;
  const t = plugin.approvals.entityTypes.find((t) => t.code === code);
  return t?.label ?? code;
}

/**
 * 사용자 role 이 특정 단계에서 액션 가능한지 확인.
 */
export function canPerformStep(
  plugin: IndustryPlugin | null,
  workflowCode: string,
  step: ApprovalStep,
  userRole: string,
): boolean {
  const workflow = getApprovalWorkflow(plugin, workflowCode);
  if (!workflow) return false;
  const allowedRoles = workflow.stepRoles[step] ?? [];
  return allowedRoles.includes(userRole);
}
