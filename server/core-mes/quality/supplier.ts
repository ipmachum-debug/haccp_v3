/**
 * Supplier — 공급업체 관리 (AVL) entity (Layer 2 core-mes / quality)
 *
 * Phase Y-5 — Cross-cutting 도메인.
 *
 * AVL = Approved Vendor List (승인 공급자 목록)
 *
 * 적용 범위:
 *   - 식품 HACCP: 원료 / 부자재 공급자 평가 + 등록
 *   - 화장품 GMP: KGMP §11 — 원료 / 포장재 공급자 자격
 *   - 의약품 KGMP: API / 부형제 공급자 자격 (실사 의무)
 *   - 의료기기: ISO 13485 §7.4 — 외부 공급자 평가 + 재평가
 *
 * ADR-002 준수.
 */

export type SupplierCategory =
  | "raw_material"  // 원료
  | "packaging"     // 포장재
  | "equipment"     // 설비
  | "service"       // 서비스 (검교정 / 컨설팅 / 위탁 등)
  | "other";

/**
 * 진행 상태 — lifecycle.
 *
 * 전이:
 *   under_evaluation → approved | disqualified
 *   approved → under_evaluation (재평가) | suspended | archived
 *   suspended → under_evaluation | disqualified | archived
 *   disqualified → archived
 *   archived → (terminal)
 */
export type SupplierStatus =
  | "under_evaluation" // 평가 중 (신청 / 재평가)
  | "approved"         // 승인 (정상 운영 가능)
  | "suspended"        // 일시 정지 (재평가 필요)
  | "disqualified"     // 자격 박탈
  | "archived";        // 종결

export type IndustryContext =
  | "food"
  | "cosmetic"
  | "pharmaceutical"
  | "health-functional"
  | "medical-device"
  | "general-manufacturing";

/**
 * Supplier entity — DB row.
 */
export interface Supplier {
  readonly id: number;
  readonly tenantId: number;
  readonly industry: IndustryContext;

  /** 코드 (SUP-YYYY-NNNN) */
  readonly code: string;

  readonly name: string;
  readonly category: SupplierCategory;

  /** 담당자 이름 */
  readonly contactPerson: string;
  readonly email: string;
  readonly phone: string;

  /** 사업자등록번호 (선택) */
  readonly bizNumber: string | null;

  /** 주소 (선택) */
  readonly address: string | null;

  /** 승인일 (status='approved' 진입 시) */
  readonly approvedDate: string | null;

  /** 재평가 주기 (개월, 1~120) */
  readonly reEvaluationIntervalMonths: number;

  /** 다음 평가 마감일 (approvedDate + interval 자동 계산) */
  readonly nextEvaluationDate: string | null;

  /** 마지막 평가 점수 (0~100, 선택) */
  readonly evaluationScore: number | null;

  /** 비고 (조건부 승인 / 평가 의견 등) */
  readonly notes: string | null;

  /** 종결일 (archived 시) */
  readonly closedAt: Date | null;

  readonly status: SupplierStatus;

  /**
   * Industry-specific 확장 (JSON).
   * 식품: { kfdaRegistration?: string; haccpCertified?: boolean }
   * 화장품: { kgmpCertified?: boolean; isoCertifications?: string[] }
   * 의약품: { kgmpAuditDate?: string; picsCompliant?: boolean }
   */
  readonly industryMetadata: Record<string, unknown> | null;

  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export function canTransition(from: SupplierStatus, to: SupplierStatus): boolean {
  const allowed: Record<SupplierStatus, readonly SupplierStatus[]> = {
    under_evaluation: ["approved", "disqualified"],
    approved: ["under_evaluation", "suspended", "archived"],
    suspended: ["under_evaluation", "disqualified", "archived"],
    disqualified: ["archived"],
    archived: [],
  };
  return allowed[from].includes(to);
}

/**
 * 다음 평가 마감일 자동 계산.
 */
export function calculateNextEvaluationDate(
  approvedDate: string,
  intervalMonths: number,
): string {
  const d = new Date(approvedDate);
  d.setMonth(d.getMonth() + intervalMonths);
  return d.toISOString().slice(0, 10);
}

/**
 * 평가 점수 기반 status 추천 (조언용).
 *
 *   - 75+ → approved
 *   - 50~74 → approved (조건부 — notes 에 명시 권장)
 *   - <50 → disqualified
 */
export function suggestStatusFromScore(score: number): SupplierStatus {
  if (score >= 75) return "approved";
  if (score >= 50) return "approved"; // 조건부 — 운영자가 notes 에 조건 명시
  return "disqualified";
}
