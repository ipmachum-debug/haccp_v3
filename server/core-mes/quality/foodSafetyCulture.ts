/**
 * Food Safety Culture (식품안전문화) — 문화 진단 entity (Layer 2 core-mes / quality)
 *
 * Phase Y-9 — FSSC 22000 v6 필수 추가요건 (식품안전문화).
 *
 * 적용 표준:
 *   - FSSC 22000 v6 §2.5.1 Food Safety and Quality Culture
 *   - GFSI Food Safety Culture (Position Paper) — 5 dimension 기반
 *   - Codex CXC 1-1969 일반원칙 (경영진 의지 / 소통)
 *
 * 핵심 모델 (리스크 스코어링이 아님 — 문화 성숙도 진단):
 *   6개 차원 각 1~5점 → 종합점수(평균 1.0~5.0) → 성숙도 등급.
 *   진단 후 차원별 개선활동(improvementActions)을 등록·추적.
 *
 * ADR-002 준수.
 */

/**
 * 문화 진단 방법.
 */
export type AssessmentMethod =
  | "survey"       // 설문
  | "interview"    // 인터뷰
  | "observation"  // 관찰
  | "mixed";       // 혼합

/**
 * 진행 상태 — lifecycle (진단 → 검토 → 승인 → 종결).
 *
 * 전이:
 *   draft → under_review
 *   under_review → approved | draft (반려)
 *   approved → under_review (재진단) | archived
 *   archived → (terminal)
 */
export type CultureStatus =
  | "draft"
  | "under_review"
  | "approved"
  | "archived";

export type MaturityLevel = "initial" | "developing" | "mature" | "excellent";

export type IndustryContext =
  | "food"
  | "cosmetic"
  | "pharmaceutical"
  | "health-functional"
  | "medical-device"
  | "general-manufacturing";

/**
 * 문화 6개 차원 점수 (각 1~5).
 *
 * GFSI / FSSC 식품안전문화 핵심 차원을 실무형으로 정리:
 *   - leadership            : 리더십 · 경영진 의지
 *   - communication         : 소통 · 정보공유
 *   - awareness             : 인식 · 교육
 *   - accountability        : 책임 · 실행
 *   - resources             : 자원 · 시스템
 *   - continuousImprovement : 지속적 개선
 */
export interface DimensionScores {
  readonly leadership: number;
  readonly communication: number;
  readonly awareness: number;
  readonly accountability: number;
  readonly resources: number;
  readonly continuousImprovement: number;
}

export const CULTURE_DIMENSIONS: readonly (keyof DimensionScores)[] = [
  "leadership",
  "communication",
  "awareness",
  "accountability",
  "resources",
  "continuousImprovement",
];

/**
 * 차원별 개선활동 — 단일 진단에 0..n 개.
 */
export interface ImprovementAction {
  /** 대상 차원 */
  readonly dimension: keyof DimensionScores;
  /** 개선 활동 설명 */
  readonly description: string;
  /** 담당자 (사용자 id) */
  readonly assigneeId: number | null;
  /** 마감일 */
  readonly dueDate: string | null;
  /** 완료 여부 */
  readonly completed: boolean;
}

/**
 * Food Safety Culture 진단 entity — DB row.
 */
export interface FoodSafetyCultureAssessment {
  readonly id: number;
  readonly tenantId: number;
  readonly industry: IndustryContext;

  /** 코드 (FSC-YYYY-NNNN) */
  readonly code: string;

  /** 진단 제목 */
  readonly title: string;

  /** 진단 대상 기간 (예: "2026 상반기") */
  readonly assessmentPeriod: string;

  /** 진단 방법 */
  readonly method: AssessmentMethod;

  /** 참여 인원 */
  readonly participantCount: number;

  /** 6개 차원 점수 */
  readonly dimensionScores: DimensionScores;

  /** 종합 점수 (평균 1.0~5.0) */
  readonly overallScore: number;

  /** 개선활동 — JSON array */
  readonly improvementActions: readonly ImprovementAction[];

  /** 요약 / 소견 */
  readonly summary: string | null;

  readonly assessedBy: number | null;
  readonly approvedBy: number | null;
  readonly approvedAt: Date | null;

  readonly closedAt: Date | null;
  readonly status: CultureStatus;

  readonly industryMetadata: Record<string, unknown> | null;

  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export function canTransition(from: CultureStatus, to: CultureStatus): boolean {
  const allowed: Record<CultureStatus, readonly CultureStatus[]> = {
    draft: ["under_review"],
    under_review: ["approved", "draft"],
    approved: ["under_review", "archived"],
    archived: [],
  };
  return allowed[from].includes(to);
}

/**
 * 종합 점수 계산 — 6개 차원 평균 (소수 1자리 반올림).
 *
 * @returns 1.0 ~ 5.0
 */
export function calculateOverallScore(scores: DimensionScores): number {
  for (const dim of CULTURE_DIMENSIONS) {
    const v = scores[dim];
    if (v < 1 || v > 5) throw new Error(`${dim} 점수는 1~5 범위`);
  }
  const sum = CULTURE_DIMENSIONS.reduce((acc, dim) => acc + scores[dim], 0);
  return Math.round((sum / CULTURE_DIMENSIONS.length) * 10) / 10;
}

/**
 * 종합 점수 → 성숙도 등급.
 *
 *   < 2.5 → initial   (초기)
 *   < 3.5 → developing (발전)
 *   < 4.5 → mature     (성숙)
 *   >= 4.5 → excellent (우수)
 */
export function classifyMaturity(overallScore: number): MaturityLevel {
  if (overallScore < 2.5) return "initial";
  if (overallScore < 3.5) return "developing";
  if (overallScore < 4.5) return "mature";
  return "excellent";
}
