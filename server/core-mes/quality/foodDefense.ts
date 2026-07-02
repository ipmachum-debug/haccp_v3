/**
 * Food Defense (TACCP) — 식품 방어 위협 평가 entity (Layer 2 core-mes / quality)
 *
 * Phase Y-7 — FSSC 22000 v6 필수 추가요건 (식품 방어).
 *
 * 적용 표준:
 *   - FSSC 22000 v6 §2.5.3 Food Defense
 *   - PAS 96:2017 — TACCP (Threat Assessment Critical Control Points)
 *   - 식품안전관리인증기준(HACCP) 식품방어계획
 *
 * TACCP 핵심 모델 (고의적 위해 = 오염/변조/사보타주로부터 보호):
 *   threat_score = likelihood × impact (1~5 × 1~5 = 1~25)
 *   - low (1~6) / medium (7~12) / high (15~25, 또는 impact=5)
 *   대응조치(countermeasures) 적용 후 잔여 위협 점수를 재계산.
 *
 * riskAssessment(Y-6, VACCP 아님) 와 구조는 유사하나 도메인이 다름:
 *   - riskAssessment = 우발적 위해 (HACCP 위해분석)
 *   - foodDefense    = 고의적 위협 (TACCP 식품방어)
 *
 * ADR-002 준수.
 */

export type ThreatCategory =
  | "tampering"                // 제품 변조 (완제품/포장 훼손)
  | "intentional_contamination" // 고의적 오염 (생물/화학/물리 이물 투입)
  | "sabotage"                 // 사보타주 (설비/공정 파괴)
  | "cyber"                    // 사이버 공격 (제어시스템/데이터)
  | "insider"                  // 내부자 위협 (직원/협력사)
  | "supply_chain"             // 공급망 침입 (원료/운송 중 개입)
  | "other";

/**
 * 진행 상태 — lifecycle (riskAssessment 와 동일 구조).
 *
 * 전이:
 *   draft → under_review
 *   under_review → mitigated | accepted | draft (반려)
 *   mitigated → under_review (재평가) | archived
 *   accepted → under_review (재평가) | archived
 *   archived → (terminal)
 */
export type FoodDefenseStatus =
  | "draft"          // 초안 (평가 미완)
  | "under_review"   // 검토 중 (식품방어팀 검토)
  | "mitigated"      // 대응조치 적용됨 (CAPA 연계 가능)
  | "accepted"       // 잔여 위협 수용 (정당화 문서화)
  | "archived";

export type ThreatLevel = "low" | "medium" | "high";

export type IndustryContext =
  | "food"
  | "cosmetic"
  | "pharmaceutical"
  | "health-functional"
  | "medical-device"
  | "general-manufacturing";

/**
 * 대응조치 (countermeasure) — 단일 위협에 1..n 개.
 *
 * correctiveActionId: CAPA (Y-2-2) 와 연계 — 이미 발행된 CAPA 가 있으면 참조.
 */
export interface Countermeasure {
  /** 조치 설명 (예: 원료 입고구역 CCTV + 출입통제) */
  readonly description: string;
  /** 담당자 (사용자 id) */
  readonly assigneeId: number | null;
  /** 마감일 */
  readonly dueDate: string | null;
  /** 적용 후 잔여 발생가능성 (1~5) */
  readonly residualLikelihood: number;
  /** 적용 후 잔여 영향 (1~5) */
  readonly residualImpact: number;
  /** 연계 CAPA id (있으면) */
  readonly correctiveActionId: number | null;
  /** 완료 여부 */
  readonly completed: boolean;
}

/**
 * Food Defense (TACCP) entity — DB row.
 */
export interface FoodDefenseAssessment {
  readonly id: number;
  readonly tenantId: number;
  readonly industry: IndustryContext;

  /** 코드 (FD-YYYY-NNNN) */
  readonly code: string;

  /** 위협 제목 (간결) */
  readonly title: string;

  /** 위협 설명 (상세 — 시나리오/취약점/영향) */
  readonly description: string;

  readonly category: ThreatCategory;

  /** 위협 대상 지점 (예: 원료입고 / 보관 / 생산 / 포장 / 출하 / 용수 / 인력) */
  readonly targetPoint: string;

  /** 발생 가능성 (1~5) */
  readonly likelihood: number;

  /** 영향 / 심각도 (1~5) */
  readonly impact: number;

  /**
   * 대응조치 — JSON array.
   * mitigated/accepted 상태 진입 시 최소 1개 권장.
   */
  readonly countermeasures: readonly Countermeasure[];

  /** 잔여 위협 점수 (대응조치 적용 후 max(residualLikelihood × residualImpact)) */
  readonly residualScore: number | null;

  /** 정당화 (accepted 시 필수) */
  readonly justification: string | null;

  /** 평가자 / 승인자 */
  readonly assessedBy: number | null;
  readonly approvedBy: number | null;
  readonly approvedAt: Date | null;

  readonly closedAt: Date | null;
  readonly status: FoodDefenseStatus;

  /**
   * Industry-specific 확장 (JSON).
   * 식품: { pasReference?: string; ccpId?: number }
   */
  readonly industryMetadata: Record<string, unknown> | null;

  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export function canTransition(from: FoodDefenseStatus, to: FoodDefenseStatus): boolean {
  const allowed: Record<FoodDefenseStatus, readonly FoodDefenseStatus[]> = {
    draft: ["under_review"],
    under_review: ["mitigated", "accepted", "draft"],
    mitigated: ["under_review", "archived"],
    accepted: ["under_review", "archived"],
    archived: [],
  };
  return allowed[from].includes(to);
}

/**
 * 위협 점수 계산 — likelihood × impact.
 *
 * @returns 1~25
 */
export function calculateThreatScore(likelihood: number, impact: number): number {
  if (likelihood < 1 || likelihood > 5) {
    throw new Error("likelihood 는 1~5 범위");
  }
  if (impact < 1 || impact > 5) {
    throw new Error("impact 는 1~5 범위");
  }
  return likelihood * impact;
}

/**
 * 위협 점수 → 등급.
 *
 *   - impact=5 → 항상 high (단일 치명적 영향)
 *   - score >= 15 → high
 *   - score >= 7  → medium
 *   - else → low
 */
export function classifyThreatLevel(likelihood: number, impact: number): ThreatLevel {
  if (impact === 5) return "high";
  const score = likelihood * impact;
  if (score >= 15) return "high";
  if (score >= 7) return "medium";
  return "low";
}

/**
 * 잔여 위협 점수 계산 — countermeasures 중 max(residualLikelihood × residualImpact).
 *
 * countermeasures 가 비어있으면 null.
 */
export function calculateResidualScore(
  countermeasures: readonly Countermeasure[],
): number | null {
  if (countermeasures.length === 0) return null;
  return Math.max(
    ...countermeasures.map((c) => c.residualLikelihood * c.residualImpact),
  );
}
