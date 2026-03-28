/**
 * RBAC 권한 매트릭스
 *
 * 역할별 기능 접근 제한을 중앙에서 관리.
 * 새로운 역할이나 기능이 추가되면 이 파일만 수정.
 *
 * 역할 계층:
 *   super_admin > admin > monitor > worker > employee
 *
 * 기능 카테고리:
 *   - accounting: 회계 (전표, 분개, 재무보고서)
 *   - inventory: 재고 (입출고, LOT, 수불부)
 *   - production: 생산 (배치, 원가, 완료)
 *   - haccp: HACCP (CCP, 체크리스트, 검사)
 *   - approval: 승인 (요청, 검토, 최종승인)
 *   - master: 마스터 (원재료, 제품, 거래처)
 *   - system: 시스템 (설정, 백업, 사용자)
 *   - report: 보고서 (재무, 재고, 생산)
 */

export type Role = "super_admin" | "admin" | "monitor" | "worker" | "employee";

export type Permission = "read" | "write" | "delete" | "approve" | "export";

export type FeatureArea =
  | "accounting"
  | "inventory"
  | "production"
  | "haccp"
  | "approval"
  | "master"
  | "system"
  | "report"
  | "backup";

/**
 * 역할별 권한 매트릭스
 *
 * true = 전체 접근, string[] = 특정 권한만
 */
const RBAC_MATRIX: Record<Role, Record<FeatureArea, Permission[] | false>> = {
  super_admin: {
    accounting: ["read", "write", "delete", "approve", "export"],
    inventory: ["read", "write", "delete", "approve", "export"],
    production: ["read", "write", "delete", "approve", "export"],
    haccp: ["read", "write", "delete", "approve", "export"],
    approval: ["read", "write", "delete", "approve", "export"],
    master: ["read", "write", "delete", "approve", "export"],
    system: ["read", "write", "delete", "approve", "export"],
    report: ["read", "export"],
    backup: ["read", "write", "delete"],
  },

  admin: {
    accounting: ["read", "write", "delete", "approve", "export"],
    inventory: ["read", "write", "delete", "approve", "export"],
    production: ["read", "write", "delete", "approve", "export"],
    haccp: ["read", "write", "delete", "approve", "export"],
    approval: ["read", "write", "approve"],
    master: ["read", "write", "delete"],
    system: ["read", "write"],
    report: ["read", "export"],
    backup: ["read", "write"],
  },

  monitor: {
    accounting: ["read", "approve", "export"],
    inventory: ["read", "approve"],
    production: ["read", "approve"],
    haccp: ["read", "approve", "export"],
    approval: ["read", "approve"],
    master: ["read"],
    system: ["read"],
    report: ["read", "export"],
    backup: ["read"],
  },

  worker: {
    accounting: false,
    inventory: ["read", "write"],
    production: ["read", "write"],
    haccp: ["read", "write"],
    approval: ["read", "write"], // 요청만, 승인은 불가
    master: ["read"],
    system: false,
    report: ["read"],
    backup: false,
  },

  employee: {
    accounting: false,
    inventory: ["read"],
    production: ["read"],
    haccp: ["read"],
    approval: ["read"],
    master: ["read"],
    system: false,
    report: false,
    backup: false,
  },
};

/**
 * 권한 확인
 * @returns true if the role has the requested permission for the feature area
 */
export function hasPermission(
  role: string,
  feature: FeatureArea,
  permission: Permission
): boolean {
  const validRole = role as Role;
  const matrix = RBAC_MATRIX[validRole];
  if (!matrix) return false;

  const permissions = matrix[feature];
  if (permissions === false) return false;
  return permissions.includes(permission);
}

/**
 * 역할의 전체 권한 조회
 */
export function getRolePermissions(role: string): Record<FeatureArea, Permission[] | false> {
  return RBAC_MATRIX[role as Role] || {};
}

/**
 * 특정 기능에 접근 가능한 역할 목록
 */
export function getRolesForFeature(feature: FeatureArea, permission: Permission): Role[] {
  return (Object.keys(RBAC_MATRIX) as Role[]).filter(role =>
    hasPermission(role, feature, permission)
  );
}
