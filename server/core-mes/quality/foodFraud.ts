/**
 * Food Fraud (VACCP) — 식품 사기 취약성 평가 entity (Layer 2 core-mes / quality)
 *
 * Phase Y-8 — FSSC 22000 v6 필수 추가요건 (식품 사기 완화).
 *
 * 적용 표준:
 *   - FSSC 22000 v6 §2.5.4 Food Fraud Mitigation
 *   - GFSI VACCP (Vulnerability Assessment Critical Control Points)
 *   - 경제적 동기에 의한 고의적 부정(EMA: Economically Motivated Adulteration)
 *
 * VACCP 핵심 모델 (원료·공급자별 사기 취약성):
 *   vulnerability_score = likelihood × impact (1~5 × 1~5 = 1~25)
 *   - likelihood = 기회(opportunity) + 경제적 동기(motivation) 종합
 *   - low (1~6) / medium (7~12) / high (15~25, 또는 impact=5)
 *   통제수단(controlMeasures) 적용 후 잔여 취약성 점수를 재계산.
 *
 * foodDefense(Y-7, TACCP) 와 구조 유사하나 도메인이 다름:
 *   - foodDefense = 고의적 위해 (사람을 해치려는 의도 / TACCP)
 *   - foodFraud   = 경제적 사기 (돈을 벌려는 의도 / VACCP)
 *
 * ADR-002 준수.
 */

export type FraudCategory =
  | "dilution"                // 희석 (물/저가원료 혼입)
  | "substitution"            // 대체 (저가 원료로 바꿔치기)
  | "concealment"             // 은폐 (품질 저하 은닉)
  | "mislabeling"             // 표시 위반 (원산지/성분 허위)
  | "counterfeiting"          // 위조 (상표/브랜드 모조)
  | "unapproved_enhancement"  // 미승인 증량/첨가 (불법 첨가물)
  | "gray_market"             // 회색시장 (전용/횡령/밀수)
  | "other";

/**
 * 진행 상태 — lifecycle (foodDefense / riskAssessment 와 동일 구조).
 *
 * 전이:
 *   draft → under_review
 *   under_review → mitigated | accepted | draft (반려)
 *   mitigated → under_review (재평가) | archived
 *   accepted → under_review (재평가) | archived
 *   archived → (terminal)
 */
export type FoodFraudStatus =
  | "draft"          // 초안 (평가 미완)
  | "under_review"   // 검토 중 (식품사기 완화팀 검토)
  | "mitigated"      // 통제수단 적용됨 (CAPA 연계 가능)
  | "accepted"       // 잔여 취약성 수용 (정당화 문서화)
  | "archived";

export type FraudLevel = "low" | "medium" | "high";

export type IndustryContext =
  | "food"
  | "cosmetic"
  | "pharmaceutical"
  | "health-functional"
  | "medical-device"
  | "general-manufacturing";

/**
 * 통제수단 (control measure) — 단일 취약성에 1..n 개.
 *
 * VACCP 통제 예: 공급자 감사 / 성적서(COA) 검증 / mass balance / 진위 검사 / 규격 강화.
 * correctiveActionId: CAPA (Y-2-2) 와 연계 — 이미 발행된 CAPA 가 있으면 참조.
 */
export interface ControlMeasure {
  /** 조치 설명 (예: 공급자 3자 감사 + 로트별 진위 검사) */
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
 * Food Fraud (VACCP) entity — DB row.
 */
export interface FoodFraudAssessment {
  readonly id: number;
  readonly tenantId: number;
  readonly industry: IndustryContext;

  /** 코드 (FF-YYYY-NNNN) */
  readonly code: string;

  /** 취약성 제목 (간결) */
  readonly title: string;

  /** 상세 설명 (시나리오 / 기회 / 동기 / 영향) */
  readonly description: string;

  readonly category: FraudCategory;

  /** 평가 대상 원료 / 식품 (VACCP 는 원료 중심) */
  readonly material: string;

  /** 공급자 (있으면) */
  readonly supplier: string | null;

  /** 발생 가능성 (1~5) — 기회 + 경제적 동기 종합 */
  readonly likelihood: number;

  /** 영향 / 심각도 (1~5) */
  readonly impact: number;

  /**
   * 통제수단 — JSON array.
   * mitigated/accepted 상태 진입 시 최소 1개 권장.
   */
  readonly controlMeasures: readonly ControlMeasure[];

  /** 잔여 취약성 점수 (통제 적용 후 max(residualLikelihood × residualImpact)) */
  readonly residualScore: number | null;

  /** 정당화 (accepted 시 필수) */
  readonly justification: string | null;

  /** 평가자 / 승인자 */
  readonly assessedBy: number | null;
  readonly approvedBy: number | null;
  readonly approvedAt: Date | null;

  readonly closedAt: Date | null;
  readonly status: FoodFraudStatus;

  /**
   * Industry-specific 확장 (JSON).
   * 식품: { emaHistory?: string; supplierId?: number }
   */
  readonly industryMetadata: Record<string, unknown> | null;

  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export function canTransition(from: FoodFraudStatus, to: FoodFraudStatus): boolean {
  const allowed: Record<FoodFraudStatus, readonly FoodFraudStatus[]> = {
    draft: ["under_review"],
    under_review: ["mitigated", "accepted", "draft"],
    mitigated: ["under_review", "archived"],
    accepted: ["under_review", "archived"],
    archived: [],
  };
  return allowed[from].includes(to);
}

/**
 * 취약성 점수 계산 — likelihood × impact.
 *
 * @returns 1~25
 */
export function calculateFraudScore(likelihood: number, impact: number): number {
  if (likelihood < 1 || likelihood > 5) {
    throw new Error("likelihood 는 1~5 범위");
  }
  if (impact < 1 || impact > 5) {
    throw new Error("impact 는 1~5 범위");
  }
  return likelihood * impact;
}

/**
 * 취약성 점수 → 등급.
 *
 *   - impact=5 → 항상 high (단일 치명적 영향)
 *   - score >= 15 → high
 *   - score >= 7  → medium
 *   - else → low
 */
export function classifyFraudLevel(likelihood: number, impact: number): FraudLevel {
  if (impact === 5) return "high";
  const score = likelihood * impact;
  if (score >= 15) return "high";
  if (score >= 7) return "medium";
  return "low";
}

/**
 * 잔여 취약성 점수 계산 — controlMeasures 중 max(residualLikelihood × residualImpact).
 *
 * controlMeasures 가 비어있으면 null.
 */
export function calculateResidualScore(
  controlMeasures: readonly ControlMeasure[],
): number | null {
  if (controlMeasures.length === 0) return null;
  return Math.max(
    ...controlMeasures.map((c) => c.residualLikelihood * c.residualImpact),
  );
}
