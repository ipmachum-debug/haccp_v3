/**
 * Allergen Management (알레르겐 관리) — 품목/원료별 알레르겐 평가 entity (Layer 2 core-mes / quality)
 *
 * Phase Y-11 — 식품 알레르겐 관리 (FSSC 22000 / Codex / 식약처 표시기준).
 *
 * 적용 표준:
 *   - 식품 등의 표시·광고에 관한 법률 (알레르기 유발물질 표시)
 *   - FSSC 22000 / Codex CXC 80-2020 (Allergen Management)
 *   - 교차오염(cross-contact) 관리 + "may contain" 표시
 *
 * 핵심 모델 (리스크 스코어링이 아님):
 *   대상(품목/원료)별로 의도적 함유 알레르겐 + 교차오염 가능 알레르겐을
 *   기준 카탈로그(KOREAN_ALLERGENS)에서 선택 → 통제수단 + 표시문구 관리.
 *
 * ADR-002 준수.
 */

/**
 * 한국 식약처 알레르기 유발물질 표시대상 (19품목).
 *
 * ※ 규정 개정 시 이 목록만 갱신하면 됨 (단일 source).
 */
export const KOREAN_ALLERGENS = [
  { code: "egg", label: "난류(가금류)" },
  { code: "milk", label: "우유" },
  { code: "buckwheat", label: "메밀" },
  { code: "peanut", label: "땅콩" },
  { code: "soybean", label: "대두" },
  { code: "wheat", label: "밀" },
  { code: "pine_nut", label: "잣" },
  { code: "walnut", label: "호두" },
  { code: "crab", label: "게" },
  { code: "shrimp", label: "새우" },
  { code: "squid", label: "오징어" },
  { code: "mackerel", label: "고등어" },
  { code: "shellfish", label: "조개류(굴·전복·홍합)" },
  { code: "peach", label: "복숭아" },
  { code: "tomato", label: "토마토" },
  { code: "pork", label: "돼지고기" },
  { code: "beef", label: "쇠고기" },
  { code: "chicken", label: "닭고기" },
  { code: "sulfites", label: "아황산류" },
] as const;

export type AllergenCode = (typeof KOREAN_ALLERGENS)[number]["code"];

export const ALLERGEN_CODES: readonly AllergenCode[] = KOREAN_ALLERGENS.map((a) => a.code);

const ALLERGEN_LABEL_MAP: Record<string, string> = Object.fromEntries(
  KOREAN_ALLERGENS.map((a) => [a.code, a.label]),
);

export function allergenLabel(code: string): string {
  return ALLERGEN_LABEL_MAP[code] ?? code;
}

export function isValidAllergenCode(code: string): code is AllergenCode {
  return code in ALLERGEN_LABEL_MAP;
}

export type SubjectType = "product" | "material";

/**
 * 진행 상태 — lifecycle (평가 → 검토 → 승인 → 종결).
 *
 * 전이:
 *   draft → under_review
 *   under_review → approved | draft (반려)
 *   approved → under_review (재평가) | archived
 *   archived → (terminal)
 */
export type AllergenStatus =
  | "draft"
  | "under_review"
  | "approved"
  | "archived";

export type IndustryContext =
  | "food"
  | "cosmetic"
  | "pharmaceutical"
  | "health-functional"
  | "medical-device"
  | "general-manufacturing";

/**
 * 통제수단 (control measure) — 교차오염 방지.
 *
 * 예: 전용 라인 / 작업 순서(알레르겐 최후 생산) / 세척 밸리데이션 / 표시 검증.
 */
export interface ControlMeasure {
  readonly description: string;
  readonly assigneeId: number | null;
  readonly dueDate: string | null;
  readonly completed: boolean;
}

/**
 * Allergen Assessment entity — DB row.
 */
export interface AllergenAssessment {
  readonly id: number;
  readonly tenantId: number;
  readonly industry: IndustryContext;

  /** 코드 (AL-YYYY-NNNN) */
  readonly code: string;

  /** 평가 제목 */
  readonly title: string;

  /** 평가 대상 유형 (제품 / 원료) */
  readonly subjectType: SubjectType;

  /** 평가 대상명 (품목/원료명) */
  readonly subjectName: string;

  /** 의도적 함유 알레르겐 (코드 배열) */
  readonly presentAllergens: readonly string[];

  /** 교차오염 가능 알레르겐 ("may contain", 코드 배열) */
  readonly crossContactAllergens: readonly string[];

  /** 교차오염 통제수단 */
  readonly controlMeasures: readonly ControlMeasure[];

  /** 표시(라벨) 문구 */
  readonly labelingStatement: string | null;

  readonly assessedBy: number | null;
  readonly approvedBy: number | null;
  readonly approvedAt: Date | null;

  readonly closedAt: Date | null;
  readonly status: AllergenStatus;

  readonly industryMetadata: Record<string, unknown> | null;

  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export function canTransition(from: AllergenStatus, to: AllergenStatus): boolean {
  const allowed: Record<AllergenStatus, readonly AllergenStatus[]> = {
    draft: ["under_review"],
    under_review: ["approved", "draft"],
    approved: ["under_review", "archived"],
    archived: [],
  };
  return allowed[from].includes(to);
}

/**
 * 표시 문구 자동 생성 — 의도적 함유 + 교차오염.
 *
 * 예: "이 제품은 밀, 대두를 함유하고 있으며, 우유·땅콩을 사용한 제품과 같은 제조시설에서 제조하고 있습니다."
 */
export function buildLabelingStatement(
  presentAllergens: readonly string[],
  crossContactAllergens: readonly string[],
): string {
  const parts: string[] = [];
  if (presentAllergens.length > 0) {
    const names = presentAllergens.map(allergenLabel).join(", ");
    parts.push(`이 제품은 ${names}을(를) 함유하고 있습니다.`);
  }
  if (crossContactAllergens.length > 0) {
    const names = crossContactAllergens.map(allergenLabel).join(", ");
    parts.push(`${names}을(를) 사용한 제품과 같은 제조시설에서 제조하고 있습니다.`);
  }
  return parts.join(" ");
}
