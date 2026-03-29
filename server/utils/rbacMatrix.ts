/**
 * RBAC 권한 매트릭스
 *
 * 역할별 기능 접근 제한을 중앙에서 관리.
 * 새로운 역할이나 기능이 추가되면 이 파일만 수정.
 *
 * 역할 계층:
 *   super_admin > admin > accountant/monitor/inspector > worker > employee
 *
 * 기능 카테고리:
 *   - accounting: 회계 (전표, 분개, 재무보고서)
 *   - inventory: 재고 (입출고, LOT, 수불부)
 *   - production: 생산 (배치, 원가, 완료)
 *   - haccp: HACCP (CCP, 체크리스트)
 *   - inspection: 검사 (육안검사일지, 제품출고일지)
 *   - approval: 승인 (요청, 검토, 최종승인)
 *   - master: 마스터 (원재료, 제품, 거래처)
 *   - system: 시스템 (설정, 백업, 사용자)
 *   - report: 보고서 (재무, 재고, 생산)
 *   - backup: 백업/복구
 */

export type Role = "super_admin" | "admin" | "accountant" | "monitor" | "inspector" | "worker" | "employee";

export type Permission = "read" | "write" | "delete" | "approve" | "export";

export type FeatureArea =
  | "accounting"
  | "inventory"
  | "production"
  | "haccp"
  | "inspection"
  | "approval"
  | "master"
  | "system"
  | "report"
  | "backup";

/**
 * 역할별 권한 매트릭스
 *
 * false = 접근 불가, Permission[] = 해당 권한만 허용
 */
const RBAC_MATRIX: Record<Role, Record<FeatureArea, Permission[] | false>> = {
  // ── 슈퍼관리자: 전체 접근 ──
  super_admin: {
    accounting: ["read", "write", "delete", "approve", "export"],
    inventory: ["read", "write", "delete", "approve", "export"],
    production: ["read", "write", "delete", "approve", "export"],
    haccp: ["read", "write", "delete", "approve", "export"],
    inspection: ["read", "write", "delete", "approve", "export"],
    approval: ["read", "write", "delete", "approve", "export"],
    master: ["read", "write", "delete", "approve", "export"],
    system: ["read", "write", "delete", "approve", "export"],
    report: ["read", "export"],
    backup: ["read", "write", "delete"],
  },

  // ── 관리자: 전체 접근 (시스템 삭제 제외) ──
  admin: {
    accounting: ["read", "write", "delete", "approve", "export"],
    inventory: ["read", "write", "delete", "approve", "export"],
    production: ["read", "write", "delete", "approve", "export"],
    haccp: ["read", "write", "delete", "approve", "export"],
    inspection: ["read", "write", "delete", "approve", "export"],
    approval: ["read", "write", "approve"],
    master: ["read", "write", "delete"],
    system: ["read", "write"],
    report: ["read", "export"],
    backup: ["read", "write"],
  },

  // ── 회계: 회계 + 재고 + 마스터 + 검사(출고일지) ──
  accountant: {
    accounting: ["read", "write", "approve", "export"],
    inventory: ["read", "write", "export"],
    production: ["read"],
    haccp: false,
    inspection: ["read", "export"],              // 육안검사일지, 제품출고일지 열람
    approval: ["read"],
    master: ["read", "write"],                    // 마스터데이터, 품목마스터
    system: false,
    report: ["read", "export"],
    backup: false,
  },

  // ── 품질검토자 (monitor): 승인 + 검사 + 보고서 ──
  monitor: {
    accounting: ["read", "approve", "export"],
    inventory: ["read", "approve"],
    production: ["read", "approve"],
    haccp: ["read", "approve", "export"],
    inspection: ["read", "approve", "export"],
    approval: ["read", "approve"],
    master: ["read"],
    system: ["read"],
    report: ["read", "export"],
    backup: ["read"],
  },

  // ── 품질검사원 (inspector): CCP + 검사 + 체크리스트 중심 ──
  inspector: {
    accounting: false,
    inventory: ["read"],
    production: ["read"],
    haccp: ["read", "write"],                     // CCP 기록 작성
    inspection: ["read", "write", "export"],      // 검사일지 작성
    approval: ["read", "write"],                  // 승인 요청 가능
    master: ["read"],
    system: false,
    report: ["read"],
    backup: false,
  },

  // ── 작업자 (worker): 생산 + CCP + 체크리스트 (수동모드) ──
  worker: {
    accounting: false,
    inventory: ["read"],
    production: ["read", "write"],
    haccp: ["read", "write"],
    inspection: ["read", "write"],
    approval: ["read", "write"],                  // 요청만, 승인 불가
    master: false,
    system: false,
    report: false,
    backup: false,
  },

  // ── 일반직원: 읽기 전용 (공지 등) ──
  employee: {
    accounting: false,
    inventory: false,
    production: false,
    haccp: false,
    inspection: false,
    approval: false,
    master: false,
    system: false,
    report: false,
    backup: false,
  },
};

/** 역할 한글 라벨 */
export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "슈퍼관리자",
  admin: "관리자",
  accountant: "회계",
  monitor: "품질검토자",
  inspector: "품질검사원",
  worker: "작업자",
  employee: "직원",
};

/**
 * 권한 확인
 */
export function hasPermission(
  role: string,
  feature: FeatureArea,
  permission: Permission
): boolean {
  const matrix = RBAC_MATRIX[role as Role];
  if (!matrix) return false;
  const permissions = matrix[feature];
  if (permissions === false) return false;
  return permissions.includes(permission);
}

/**
 * 역할의 전체 권한 조회
 */
export function getRolePermissions(role: string): Record<FeatureArea, Permission[] | false> {
  return RBAC_MATRIX[role as Role] || {} as Record<FeatureArea, Permission[] | false>;
}

/**
 * 특정 기능에 접근 가능한 역할 목록
 */
export function getRolesForFeature(feature: FeatureArea, permission: Permission): Role[] {
  return (Object.keys(RBAC_MATRIX) as Role[]).filter(role =>
    hasPermission(role, feature, permission)
  );
}
