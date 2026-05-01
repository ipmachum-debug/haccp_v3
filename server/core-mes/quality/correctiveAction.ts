/**
 * CorrectiveAction — CAPA entity (Layer 2 core-mes / quality)
 *
 * ============================================================================
 * Phase Y-2-2 — Cross-cutting 도메인.
 *
 * CAPA = Corrective Action + Preventive Action
 *   - corrective: 이미 발생한 부적합의 시정 (재발 방지 + 영향 최소화)
 *   - preventive: 잠재 부적합의 사전 예방 (위험 평가 → 사전 조치)
 *
 * 적용 범위 (모든 industry):
 *   - 식품 HACCP: CCP 이탈 / 부적합 → CAR (시정조치)
 *   - 화장품 GMP: IPC fail / Recall → CAR / PA
 *   - 의약품 KGMP: OOS / OOT → CAPA (KGMP 핵심 SOP)
 *   - 의료기기: ISO 13485 §8.5.2/§8.5.3 — Corrective + Preventive
 *
 * 핵심 invariant (ADR-002 준수):
 *   "이 파일에는 '식품' / '화장품' / 'HACCP' / 'GMP' 라는 단어가
 *    코드 식별자에 0회 등장."
 *
 * 의존성: 어떤 layer 도 import 하지 않음 (순수 도메인)
 *
 * Nonconforming 연계:
 *   - h_nonconformings.corrective_action_id (Y-2-1-a 에서 컬럼 추가됨)
 *   - h_corrective_actions.nonconforming_id (FK 양방향)
 *   - 단순 정수 FK — core-mes 가 industry 모름
 * ============================================================================
 */

/**
 * CAPA 유형.
 */
export type CapaType =
  | "corrective"  // 시정조치 (이미 발생한 부적합 처리)
  | "preventive"; // 예방조치 (잠재 위험 사전 처리)

/**
 * 우선순위 — 위험도 기반.
 */
export type CapaPriority = "critical" | "high" | "medium" | "low";

/**
 * 진행 상태 — lifecycle.
 *
 * 전이:
 *   planned → in_progress → effectiveness_check → closed
 *                                                   ↑
 *                                effectiveness_check → in_progress (재실행)
 *                                            ↓
 *                                         cancelled (어느 단계든)
 */
export type CapaStatus =
  | "planned"               // 계획 (작성 중)
  | "in_progress"           // 실행 중
  | "effectiveness_check"   // 효과성 검증 중
  | "closed"                // 종결
  | "cancelled";            // 취소

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
 * CorrectiveAction entity — DB row 표현.
 */
export interface CorrectiveAction {
  /** 도메인 식별자 */
  readonly id: number;

  /** tenant 격리 */
  readonly tenantId: number;

  /** Industry 컨텍스트 (view filter 키) */
  readonly industry: IndustryContext;

  /** 코드 (CAR-YYYY-NNNN 자동채번) */
  readonly code: string;

  /** 유형 */
  readonly type: CapaType;

  /** 우선순위 */
  readonly priority: CapaPriority;

  /** 제목 (1줄 요약) */
  readonly title: string;

  /** 상세 설명 (배경 / 근거) */
  readonly description: string;

  /**
   * 연계 Nonconforming ID (h_nonconformings.id).
   * preventive 인 경우 null (사전 예방 — 부적합 발생 전).
   * Y-2-1 머지 후 FK 강제 가능.
   */
  readonly nonconformingId: number | null;

  /** 담당자 user_id */
  readonly assignedTo: number;

  /** 마감일 */
  readonly dueDate: string;

  /** 조치 계획 (실행 전 작성) */
  readonly actionPlan: string;

  /** 실행 상세 (in_progress 단계) */
  readonly executionDetails: string | null;

  /** 효과성 검증 기준 */
  readonly effectivenessCriteria: string | null;

  /** 효과성 검증 결과 */
  readonly effectivenessResult: string | null;

  /** 검증자 user_id */
  readonly verifiedBy: number | null;
  readonly verifiedAt: Date | null;

  /** 종결일 (closed 시) */
  readonly closedAt: Date | null;

  /** 진행 상태 */
  readonly status: CapaStatus;

  /**
   * Industry-specific 확장 필드 (JSON).
   *
   * 식품: { ccpInstanceId?: number; deviationId?: number }
   * 화장품: { bmrId?: number; recallId?: number }
   * 의약품: { kaersReportNumber?: string; ctdSection?: string }
   *
   * core-mes 자체는 이 필드를 해석하지 않음.
   */
  readonly industryMetadata: Record<string, unknown> | null;

  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * 진행 상태 전이 가능 여부 검증.
 *
 * 허용 전이:
 *   planned → in_progress | cancelled
 *   in_progress → effectiveness_check | cancelled
 *   effectiveness_check → closed | in_progress  (재실행 — 효과성 미달 시)
 *   closed → (terminal)
 *   cancelled → (terminal)
 */
export function canTransition(from: CapaStatus, to: CapaStatus): boolean {
  const allowed: Record<CapaStatus, readonly CapaStatus[]> = {
    planned: ["in_progress", "cancelled"],
    in_progress: ["effectiveness_check", "cancelled"],
    effectiveness_check: ["closed", "in_progress"],
    closed: [],
    cancelled: [],
  };
  return allowed[from].includes(to);
}
