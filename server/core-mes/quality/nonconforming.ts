/**
 * Nonconforming — 부적합 entity (Layer 2 core-mes / quality)
 *
 * ============================================================================
 * 모든 industry 공통 cross-cutting 도메인 (Phase Y-2-1).
 *
 * 적용 범위:
 *   - 식품 HACCP: CCP 이탈 / 입출고 검사 / 위생 / 고객 불만 → 부적합 발견
 *   - 화장품 GMP: IPC fail / Stability 이탈 / Release 거부 / 회수 (recall)
 *   - 의약품 KGMP: OOS (Out of Specification) / OOT (Out of Trend) / PMS
 *   - 의료기기: NCR (Nonconformance Report) — ISO 13485 §8.3
 *
 * 핵심 invariant (ADR-002 준수):
 *   "이 파일에는 '식품' / '화장품' / 'HACCP' / 'GMP' 라는 단어가
 *    코드 식별자에 0회 등장."
 *
 * 의존성: 어떤 layer 도 import 하지 않음 (순수 도메인)
 *
 * 사용 패턴 (industry view filter):
 *   - 식품 페이지: list({ industry: "food" })
 *   - 화장품 페이지: list({ industry: "cosmetic" })
 *   - cross-industry 보고: list() — admin 전용
 * ============================================================================
 */

/**
 * 발견 경로 — 어디서 부적합이 감지되었는지.
 */
export type DetectionSource =
  | "incoming_inspection"   // 입고 검사
  | "in_process_inspection" // 공정 검사 (IPC)
  | "final_inspection"      // 출하 검사 (Release)
  | "customer_complaint"    // 고객 불만
  | "internal_audit"        // 내부 감사
  | "ccp_monitoring"        // CCP 모니터링 (식품 HACCP) / IPC 이탈 (GMP)
  | "stability_test"        // 안정성시험 (화장품/의약품 ICH Q1A)
  | "other";

/**
 * 부적합 유형 — 자연 분류.
 */
export type NonconformityType =
  | "physical"      // 물리적 (이물질, 파손 등)
  | "chemical"      // 화학적 (잔류 농약, 중금속 등)
  | "biological"    // 생물학적 (미생물, 병원성균 등)
  | "sensory"       // 관능적 (색, 맛, 냄새, 외관)
  | "packaging"     // 포장 불량
  | "labeling"      // 표시 불량
  | "specification" // 규격 미달 (수치 한계 외)
  | "other";

/**
 * 원인 카테고리 — 5M (Material/Method/Machine/Man/Environment) + Other.
 */
export type CauseCategory =
  | "material"    // 원재료
  | "process"     // 공정 (Method)
  | "equipment"   // 장비 (Machine)
  | "human_error" // 인적 오류 (Man)
  | "environment" // 환경
  | "method"      // 방법
  | "other";

/**
 * 처리 방법.
 */
export type DisposalMethod =
  | "pending"            // 처리 대기
  | "rework"             // 재작업
  | "downgrade"          // 등급 하향
  | "alternative_use"    // 용도 변경
  | "disposal"           // 폐기
  | "return_to_supplier" // 공급업체 반품
  | "customer_return";   // 고객 반품

/**
 * 진행 상태 — lifecycle.
 *
 * 전이:
 *   detected → under_investigation → pending_disposal → disposed → closed
 *                                                      ↓
 *                                                   cancelled (어느 단계든)
 */
export type NonconformingStatus =
  | "detected"            // 발견
  | "under_investigation" // 조사 중
  | "pending_disposal"    // 처리 대기
  | "disposed"            // 처리 완료
  | "closed"              // 종결
  | "cancelled";          // 취소

/**
 * Industry 컨텍스트 — view filter 키 (ADR-003 IndustryKey 와 동기).
 */
export type IndustryContext =
  | "food"
  | "cosmetic"
  | "pharmaceutical"
  | "health-functional"
  | "medical-device"
  | "general-manufacturing";

/**
 * Nonconforming entity — DB row 표현.
 */
export interface Nonconforming {
  /** 도메인 식별자 */
  readonly id: number;

  /** tenant 격리 */
  readonly tenantId: number;

  /** Industry 컨텍스트 (view filter 키) */
  readonly industry: IndustryContext;

  /** 부적합 코드 (NCR-YYYY-NNNN 자동채번) */
  readonly code: string;

  /** 발견일 (YYYY-MM-DD) */
  readonly detectionDate: string;

  /** 발견 경로 */
  readonly detectionSource: DetectionSource;

  /** 부적합 유형 */
  readonly nonconformityType: NonconformityType;

  /** 부적합 상세 설명 */
  readonly description: string;

  /** 제품/원료 식별 — industry 별 의미 다름 (industryMetadata 로 보강) */
  readonly itemName: string;
  /** LOT 번호 (선택) */
  readonly lotNumber: string | null;
  /** 부적합 수량 */
  readonly quantity: number;
  /** 단위 */
  readonly unit: string;

  /** 근본 원인 (조사 후 채워짐) */
  readonly rootCause: string | null;
  /** 원인 카테고리 (5M) */
  readonly causeCategory: CauseCategory | null;

  /** 처리 방법 */
  readonly disposalMethod: DisposalMethod;
  /** 처리일 */
  readonly disposalDate: string | null;
  /** 처리 상세 */
  readonly disposalDetails: string | null;
  /** 처리 비용 */
  readonly disposalCost: number | null;

  /** 발견자 user_id */
  readonly detectedBy: number;
  /** 처리 책임자 user_id */
  readonly responsiblePerson: number | null;
  /** 승인자 user_id */
  readonly approvedBy: number | null;
  readonly approvedAt: Date | null;

  /** 연계 시정조치 (CAPA) ID — Y-2-2 머지 후 활성 */
  readonly correctiveActionId: number | null;

  /** 재발 방지 대책 */
  readonly preventiveActions: string | null;

  /** 진행 상태 */
  readonly status: NonconformingStatus;

  /** 비고 */
  readonly notes: string | null;

  /**
   * Industry-specific 확장 필드 (JSON).
   *
   * 식품: { ccpInstanceId?: number; deviationId?: number; batchId?: number }
   * 화장품: { bmrId?: number; ipcId?: number; releaseId?: number; recallTargeted?: boolean }
   * 의약품: { oosNumber?: string; ootCategory?: string }
   *
   * core-mes 자체는 이 필드를 해석하지 않음 (industry 어댑터가 처리).
   */
  readonly industryMetadata: Record<string, unknown> | null;

  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * 진행 상태 전이 가능 여부 검증.
 *
 * 허용 전이:
 *   detected → under_investigation | cancelled
 *   under_investigation → pending_disposal | cancelled
 *   pending_disposal → disposed | cancelled
 *   disposed → closed
 *   closed → (terminal)
 *   cancelled → (terminal)
 */
export function canTransition(
  from: NonconformingStatus,
  to: NonconformingStatus,
): boolean {
  const allowed: Record<NonconformingStatus, readonly NonconformingStatus[]> = {
    detected: ["under_investigation", "cancelled"],
    under_investigation: ["pending_disposal", "cancelled"],
    pending_disposal: ["disposed", "cancelled"],
    disposed: ["closed"],
    closed: [],
    cancelled: [],
  };
  return allowed[from].includes(to);
}
