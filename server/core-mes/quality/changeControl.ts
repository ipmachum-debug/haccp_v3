/**
 * ChangeControl — 변경관리 entity (Layer 2 core-mes / quality)
 *
 * ============================================================================
 * 모든 industry 공통 cross-cutting 도메인.
 *
 * 적용 범위:
 *   - 식품 HACCP: 제조공정 / 위해분석 / CCP 한계기준 변경
 *   - 화장품 GMP: BMR / Formula / Label / Spec 변경 (KFDA 신고 변경)
 *   - 의약품 KGMP: 변경관리 (Change Control) — KGMP 핵심 SOP
 *   - 의료기기: DMR (Device Master Record) 변경 — ISO 13485 §7.3.7
 *   - ISO 9001: 문서/공정 변경 통제
 *
 * 핵심 invariant:
 *   "이 파일에는 '식품' / '화장품' / 'HACCP' / 'GMP' 라는 단어가
 *    코드 식별자에 0회 등장."
 *   → ADR-002 (no-core-to-industry) 준수.
 *
 * 의존성: 어떤 layer 도 import 하지 않음 (순수 도메인)
 *
 * 사용 패턴 (industry view filter):
 *   - 식품 페이지: list({ industry: "food" }) — industry 컬럼 자동 filter
 *   - 화장품 페이지: list({ industry: "cosmetic" })
 *   - 의약품 페이지: list({ industry: "pharmaceutical" })
 * ============================================================================
 */

/**
 * 변경 유형 — 변경 범위 분류.
 */
export type ChangeType =
  | "process"          // 제조 공정 변경
  | "specification"    // 규격 / 한계기준 변경
  | "formulation"      // 처방 / 배합 변경
  | "equipment"        // 설비 변경
  | "supplier"         // 원료 / 부자재 공급자 변경
  | "label"            // 라벨 / 표기 변경
  | "document"         // SOP / 문서 변경
  | "system"           // IT / 시스템 변경
  | "other";

/**
 * 변경 영향도 — 영향평가 결과.
 *   - critical: 제품 안전성 / 효능 / 품질 영향, 규제 신고 / 사전 승인 필요
 *   - major:    제품 품질 영향 가능, 검증 / 안정성시험 필요
 *   - minor:    제한적 영향, 일반 검토만
 */
export type ChangeImpact = "critical" | "major" | "minor";

/**
 * 변경 진행 상태 — 변경관리 워크플로 단계.
 */
export type ChangeStatus =
  | "draft"        // 초안 (작성 중)
  | "submitted"    // 신청 완료 (검토 대기)
  | "evaluating"   // 영향 평가 중
  | "approved"     // 승인 (실행 대기)
  | "implementing" // 실행 중
  | "verifying"    // 검증 중
  | "closed"       // 완료
  | "rejected"     // 반려
  | "cancelled";   // 취소

/**
 * Industry 컨텍스트 — view filter 키.
 *
 * 본 entity 는 cross-industry 단일 테이블이라, 각 industry 페이지가
 * `WHERE industry = ?` 으로 필터링.
 *
 * 신규 industry 진입 시 추가 (ADR-003 IndustryKey 와 동기화).
 */
export type IndustryContext =
  | "food"
  | "cosmetic"
  | "pharmaceutical"
  | "health-functional"
  | "medical-device"
  | "general-manufacturing";

/**
 * ChangeControl entity — DB row 표현.
 */
export interface ChangeControl {
  /** 도메인 식별자 */
  readonly id: number;

  /** tenant 격리 */
  readonly tenantId: number;

  /** Industry 컨텍스트 (view filter 키) */
  readonly industry: IndustryContext;

  /** 변경 코드 (CC-YYYY-NNNN 자동채번 권장 — 어댑터가 결정) */
  readonly code: string;

  /** 변경 제목 (1줄 요약) */
  readonly title: string;

  /** 변경 사유 / 배경 */
  readonly description: string;

  /** 변경 유형 */
  readonly changeType: ChangeType;

  /** 영향도 (영향평가 후 갱신) */
  readonly impact: ChangeImpact;

  /** 진행 상태 */
  readonly status: ChangeStatus;

  /** 신청자 user_id */
  readonly requestedBy: number;

  /** 신청일 */
  readonly requestedAt: Date;

  /** 승인자 user_id (status=approved 이후) */
  readonly approvedBy: number | null;

  /** 승인일 */
  readonly approvedAt: Date | null;

  /** 실행 완료일 */
  readonly closedAt: Date | null;

  /**
   * Industry-specific 확장 필드 (JSON).
   *
   * 식품: { hazardCategory?: "biological"|"chemical"|"physical"; ccpAffected?: number[] }
   * 화장품: { bmrId?: number; formulaId?: number; labelId?: number; kfdaReportRequired?: boolean }
   * 의약품: { ctdSection?: string; nonRoutineSubmission?: boolean }
   *
   * core-mes 자체는 이 필드를 해석하지 않음 (industry 어댑터가 처리).
   */
  readonly industryMetadata: Record<string, unknown> | null;
}

/**
 * 영향평가 결과 (영향도 변경 시 보고용 도메인 함수).
 *
 * @returns 신규 영향도 + 추가 권장 활동
 */
export interface ImpactAssessment {
  readonly impact: ChangeImpact;
  readonly requiredActivities: readonly string[];
  readonly assessedBy: number;
  readonly assessedAt: Date;
}

/**
 * 진행 상태 전이 가능 여부 검증.
 *
 * 허용 전이:
 *   draft → submitted | cancelled
 *   submitted → evaluating | rejected | cancelled
 *   evaluating → approved | rejected
 *   approved → implementing | cancelled
 *   implementing → verifying | cancelled
 *   verifying → closed
 *   closed → (terminal)
 *   rejected → (terminal — 새 ChangeControl 로 재신청)
 *   cancelled → (terminal)
 */
export function canTransition(from: ChangeStatus, to: ChangeStatus): boolean {
  const allowed: Record<ChangeStatus, readonly ChangeStatus[]> = {
    draft: ["submitted", "cancelled"],
    submitted: ["evaluating", "rejected", "cancelled"],
    evaluating: ["approved", "rejected"],
    approved: ["implementing", "cancelled"],
    implementing: ["verifying", "cancelled"],
    verifying: ["closed"],
    closed: [],
    rejected: [],
    cancelled: [],
  };
  return allowed[from].includes(to);
}
