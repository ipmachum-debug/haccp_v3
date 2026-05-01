/**
 * Risk Assessment — 위험 평가 (ICH Q9 / ISO 14971) entity (Layer 2 core-mes / quality)
 *
 * Phase Y-6 — Cross-cutting 도메인 (HACCP / GMP / GVP 공통).
 *
 * 적용 표준:
 *   - 식품 HACCP: 위해 분석 (Hazard Analysis) — Codex Alimentarius
 *   - 화장품 KGMP §3.5 — 안전성 평가 (Safety Assessment)
 *   - 의약품 ICH Q9 — Quality Risk Management (QRM)
 *   - 의료기기 ISO 14971 — Application of risk management
 *
 * 핵심 모델:
 *   risk_score = probability × severity (1~5 × 1~5 = 1~25)
 *   - low (1~6) / medium (7~12) / high (15~25, 또는 severity=5)
 *
 * ADR-002 준수.
 */

export type RiskCategory =
  | "biological"     // 생물학적 (미생물 / 알러지)
  | "chemical"       // 화학적 (잔류농약 / 중금속 / 첨가물)
  | "physical"       // 물리적 (이물 / 파편)
  | "operational"    // 운영 (설비 고장 / 인적 오류)
  | "regulatory"     // 규제 (인허가 / 라벨링 위반)
  | "supplier"       // 공급망 (원료 변동 / 공급 중단)
  | "other";

/**
 * 진행 상태 — lifecycle.
 *
 * 전이:
 *   draft → under_review
 *   under_review → mitigated | accepted | draft (반려)
 *   mitigated → under_review (재평가) | archived
 *   accepted → under_review (재평가) | archived
 *   archived → (terminal)
 */
export type RiskStatus =
  | "draft"          // 초안 (아직 평가 미완)
  | "under_review"   // 검토 중 (CFT / 책임자 검토)
  | "mitigated"      // 완화 조치 적용됨 (CAPA 연계)
  | "accepted"       // 잔여 위험 수용 (정당화 문서화)
  | "archived";

export type RiskSeverityLevel = "low" | "medium" | "high";

export type IndustryContext =
  | "food"
  | "cosmetic"
  | "pharmaceutical"
  | "health-functional"
  | "medical-device"
  | "general-manufacturing";

/**
 * 완화 조치 (mitigation action) — 단일 risk 에 1..n 개.
 *
 * correctiveActionId: CAPA (Y-2-2) 와 연계 — 이미 발행된 CAPA 가 있으면 참조.
 */
export interface MitigationAction {
  /** 조치 설명 */
  readonly description: string;
  /** 담당자 (사용자 id) */
  readonly assigneeId: number | null;
  /** 마감일 */
  readonly dueDate: string | null;
  /** 적용 후 잔여 확률 (1~5) */
  readonly residualProbability: number;
  /** 적용 후 잔여 심각도 (1~5) */
  readonly residualSeverity: number;
  /** 연계 CAPA id (있으면) */
  readonly correctiveActionId: number | null;
  /** 완료 여부 */
  readonly completed: boolean;
}

/**
 * Risk Assessment entity — DB row.
 */
export interface RiskAssessment {
  readonly id: number;
  readonly tenantId: number;
  readonly industry: IndustryContext;

  /** 코드 (RA-YYYY-NNNN) */
  readonly code: string;

  /** 위험 제목 (간결) */
  readonly title: string;

  /** 위험 설명 (상세) */
  readonly description: string;

  readonly category: RiskCategory;

  /** 영향 대상 (예: 제품 / 공정 / 설비 / 공급망) */
  readonly scope: string;

  /** 발생 확률 (1~5) */
  readonly probability: number;

  /** 심각도 (1~5) */
  readonly severity: number;

  /**
   * 완화 조치 — JSON array.
   * mitigated/accepted 상태 진입 시 최소 1개 권장.
   */
  readonly mitigations: readonly MitigationAction[];

  /** 잔여 위험 점수 (mitigations 적용 후 max(residualProbability × residualSeverity)) */
  readonly residualScore: number | null;

  /** 정당화 (accepted 시 필수) */
  readonly justification: string | null;

  /** 평가자 / 책임자 */
  readonly assessedBy: number | null;
  readonly approvedBy: number | null;
  readonly approvedAt: Date | null;

  readonly closedAt: Date | null;
  readonly status: RiskStatus;

  /**
   * Industry-specific 확장 (JSON).
   * 식품: { ccpId?: number; codexCategory?: string }
   * 의약품: { ichQ9Tool?: string; productLifecycleStage?: string }
   * 의료기기: { iso14971Phase?: string; deviceClass?: string }
   */
  readonly industryMetadata: Record<string, unknown> | null;

  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export function canTransition(from: RiskStatus, to: RiskStatus): boolean {
  const allowed: Record<RiskStatus, readonly RiskStatus[]> = {
    draft: ["under_review"],
    under_review: ["mitigated", "accepted", "draft"],
    mitigated: ["under_review", "archived"],
    accepted: ["under_review", "archived"],
    archived: [],
  };
  return allowed[from].includes(to);
}

/**
 * Risk score 계산 — probability × severity.
 *
 * @returns 1~25
 */
export function calculateRiskScore(probability: number, severity: number): number {
  if (probability < 1 || probability > 5) {
    throw new Error("probability 는 1~5 범위");
  }
  if (severity < 1 || severity > 5) {
    throw new Error("severity 는 1~5 범위");
  }
  return probability * severity;
}

/**
 * Risk score → 등급.
 *
 *   - severity=5 → 항상 high (단일 치명적 영향)
 *   - score >= 15 → high
 *   - score >= 7  → medium
 *   - else → low
 */
export function classifyRiskLevel(
  probability: number,
  severity: number,
): RiskSeverityLevel {
  if (severity === 5) return "high";
  const score = probability * severity;
  if (score >= 15) return "high";
  if (score >= 7) return "medium";
  return "low";
}

/**
 * 잔여 위험 점수 계산 — mitigations 중 max(residualProbability × residualSeverity).
 *
 * mitigations 가 비어있으면 null.
 */
export function calculateResidualScore(
  mitigations: readonly MitigationAction[],
): number | null {
  if (mitigations.length === 0) return null;
  return Math.max(
    ...mitigations.map((m) => m.residualProbability * m.residualSeverity),
  );
}
